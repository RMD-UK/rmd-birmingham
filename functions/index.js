/**
 * RMD Instructor Weekend — Cloud Functions
 *
 * generateItcSummary: on-demand (callable), director-only.
 * Reads every itc_observations doc for one ITC (collated from blind,
 * independent Instructor Trainer ratings — see itc-observations.html and
 * firestore.rules), asks Claude Haiku 4.5 to synthesise an end-of-course
 * summary, and writes the result to itc_summaries/{itcEmail} for display
 * on cd-dashboard.html.
 *
 * sendSeniorFacultyReminders: on-demand (callable), director-only.
 * Emails everyone with senior faculty role who hasn't yet submitted the
 * current senior_faculty_review cycle — see senior-faculty-review.html and
 * admin-senior-faculty-review.html. Full deploy note above that function.
 *
 * sendAccountCreationReminders: on-demand (callable), director-only.
 * Emails anyone with a Firebase Auth login (created via admin-bulk-users.html)
 * who has never signed in. See admin-account-reminders.html. Full deploy note
 * above that function.
 *
 * shiftProgrammeSession: on-demand (callable), director or assessor-faculty.
 * Cascading same-day, same-stream time shift for the live programme
 * (sessions collection — see admin-migrate-programme.html and timetable.html's
 * shift control). Single choke point for sessions writes — firestore.rules
 * does not allow clients to write sessions directly, only this function via
 * the Admin SDK. Full detail above the function itself, below.
 *
 * syncIwRegistrationToPeople: Firestore trigger (not callable), fires on
 * every write to iw_registrations/{docId}. Automates the "Sync to People"
 * button in admin-iw-registrations.html — same dedupe-by-email, same role
 * map, never overwrites an existing person doc. Unresolved roles are
 * flagged back onto the registration doc instead of silently dropped. Full
 * detail above the function itself, below.
 *
 * sendIwRsvpInvites: on-demand (callable), director-only. Emails every
 * Pending Assessor/Senior Instructor on iw_registrations a link to
 * iw-rsvp-confirm.html to confirm or decline attendance. See
 * admin-iw-registrations.html's "Send RSVP invites" button. Full deploy
 * note above the function itself, below.
 *
 * iwRsvpRespond: on-demand (callable), public — no sign-in, since Assessors
 * and Senior Instructors have no RMD account. Backs iw-rsvp-confirm.html:
 * looks up a registration by its own doc ID and records a Yes/No answer.
 * Full detail above the function itself, below.
 *
 * Deploy (from the RMD website repo root, Jon's own machine — this cannot
 * be run from a Cowork sandbox, no network route to *.googleapis.com):
 *   cd functions && npm install
 *   firebase functions:secrets:set ANTHROPIC_API_KEY
 *   firebase functions:secrets:set RESEND_API_KEY
 *   firebase deploy --only functions
 *
 * Requires the Blaze plan (done 2026-07-09), a funded Anthropic API console
 * account (console.anthropic.com — separate from Claude.ai billing), and a
 * Resend account with the rmd.uk.com domain verified (see FROM_EMAIL below).
 *
 * Switched from SendGrid to Resend 2026-07-28: SendGrid free-tier signups hit
 * an automated risk-review hold ("You are not authorized to access this
 * account") that blocked dashboard access with no fast resolution. Resend has
 * no such gate, but it also has no SendGrid-style "single sender" option — it
 * requires verifying a whole domain via DNS before it will send anything.
 * Since Jon already owns rmd.uk.com's DNS (used for the GitHub Pages custom
 * domain), FROM_EMAIL below sends as reminders@rmd.uk.com with replyTo set to
 * the monitored rmdbirmingham@googlemail.com inbox — verified sending
 * infrastructure plus a reply address a person actually reads.
 */

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const Anthropic = require("@anthropic-ai/sdk");
const { Resend } = require("resend");

admin.initializeApp();
const db = admin.firestore();

const anthropicApiKey = defineSecret("ANTHROPIC_API_KEY");
const resendApiKey    = defineSecret("RESEND_API_KEY");

// Mirrors the DIMENSIONS/SCALE_LABELS constants in itc-observations.html.
const DIMENSIONS = [
  { key: "clarity",    label: "Clarity of instruction" },
  { key: "engagement", label: "Candidate engagement" },
  { key: "accuracy",   label: "Technical accuracy" },
  { key: "space",      label: "Management of teaching space" },
  { key: "response",   label: "Response to difficulty or questions" }
];
const SCALE_LABELS = ["Needs development", "Developing", "Meeting expectations", "Exceeding expectations"];

// No hardcoded email list (removed 2026-07-29 — personal emails should not
// live in a public repo). Mirrors isDirector() in firestore.rules.
async function callerIsDirector(auth) {
  const email = (auth.token.email || "").toLowerCase();
  try {
    const cfg = await db.collection("config").doc("platform").get();
    const extra = cfg.exists ? (cfg.data().directors || []) : [];
    if (extra.map(x => String(x).toLowerCase()).includes(email)) return true;
  } catch (e) { /* fall through */ }
  try {
    const person = await db.collection("people").doc(auth.uid).get();
    if (person.exists && person.data().role === "director") return true;
  } catch (e) { /* fall through */ }
  return false;
}


exports.generateItcSummary = onCall({ secrets: [anthropicApiKey], region: "us-central1" }, async (request) => {
  const auth = request.auth;
  if (!auth) throw new HttpsError("unauthenticated", "Sign in required.");
  if (!(await callerIsDirector(auth))) {
    throw new HttpsError("permission-denied", "Course Directors only.");
  }

  const itcEmail = String(request.data?.itcEmail || "").toLowerCase().trim();
  if (!itcEmail) throw new HttpsError("invalid-argument", "itcEmail is required.");

  const obsSnap = await db.collection("itc_observations")
    .where("itcEmail", "==", itcEmail)
    .get();

  if (obsSnap.empty) {
    throw new HttpsError("not-found", "No observations recorded for this ITC yet.");
  }

  const observations = obsSnap.docs.map(d => d.data());
  const itcName = observations[0].itcName || itcEmail;

  const lines = observations.map((o, i) => {
    const dimStr = DIMENSIONS.map(d => {
      const v = (o.dims || {})[d.key];
      return `${d.label}: ${v ? SCALE_LABELS[v - 1] : "not rated"}`;
    }).join("; ");
    return `Observer ${i + 1} (session ${o.sessionId || "unknown"}, room ${o.roomId || "unknown"}):\n  ${dimStr}\n  Comment: ${o.comment || "(none)"}`;
  }).join("\n\n");

  const prompt = `You are helping a BLS Instructor course director prepare for an end-of-course faculty meeting.

Below are blind, independent observations of one Instructor Trainer Candidate (ITC) — "${itcName}" — made by different Instructor Trainers across the weekend's rotation blocks. Each observer rated 5 competency dimensions on a 4-point scale (Needs development / Developing / Meeting expectations / Exceeding expectations) and left a free-text comment. Observers could not see each other's ratings.

${lines}

Write a concise end-of-course summary for the director covering:
1. Overall themes across observers
2. Per-dimension trajectory or consistency (where observers agree or disagree)
3. Any flagged concerns needing discussion
4. A brief chronological narrative if a pattern emerges across sessions
5. Inter-rater consistency notes (do observers broadly agree with each other?)

Ground every claim only in what's provided above — do not invent details or assume information not given. Aim for 200-300 words, plain prose (no headers or bullet points), suitable to be read aloud at a faculty meeting.`;

  const anthropic = new Anthropic({ apiKey: anthropicApiKey.value() });
  const msg = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 800,
    messages: [{ role: "user", content: prompt }]
  });

  const summaryText = (msg.content || [])
    .filter(b => b.type === "text")
    .map(b => b.text)
    .join("\n")
    .trim();

  const docId = itcEmail.replace(/[^a-z0-9]/g, "_");
  await db.collection("itc_summaries").doc(docId).set({
    itcEmail,
    itcName,
    summary: summaryText,
    observationCount: observations.length,
    generatedAt: admin.firestore.FieldValue.serverTimestamp(),
    generatedByUid: auth.uid,
    model: "claude-haiku-4-5-20251001"
  });

  return { summary: summaryText, observationCount: observations.length, itcName };
});

/**
 * sendSeniorFacultyReminders — director-only.
 *
 * Real automated email reminders for the annual senior faculty review
 * (see senior-faculty-review.html + admin-senior-faculty-review.html).
 * Deliberately recomputes the outstanding list server-side from
 * `faculty_roster` (group == "senior") and `senior_faculty_review` rather
 * than trusting a list from the caller — this means a stale dashboard tab
 * can never re-email someone who has since responded. Roster entries with
 * no email on file (see admin-faculty-roster.html) are silently skipped
 * here — they're counted in skippedNoEmail so the dashboard can surface
 * them for manual follow-up instead.
 *
 * Requires a Resend account with the rmd.uk.com domain verified (free tier:
 * 3,000 emails/month, plenty for this). FROM_EMAIL below sends as
 * reminders@rmd.uk.com — that address only works once rmd.uk.com's DNS has
 * Resend's verification records added, or every send fails.
 *
 * Deploy (from Jon's own machine — see header note above, same reason):
 *   cd functions && npm install
 *   firebase functions:secrets:set RESEND_API_KEY
 *   firebase deploy --only functions
 */

// Mirrors js/firebase-config.js — keep in sync if these ever change.
const SFR_CYCLE_YEAR   = "2027";
const FACULTY_ROSTER_COLLECTION = "faculty_roster";
const SFR_RESPONSES_COLLECTION  = "senior_faculty_review";
const SFR_REMINDERS_COLLECTION  = "senior_faculty_review_reminders";

// Changed 2026-07-28: was colmds-c-rmdbirmingham@adf.bham.ac.uk (a university
// system address), then briefly rmdbirmingham@googlemail.com sent directly
// via SendGrid's single-sender option. Now sends as reminders@rmd.uk.com
// (Resend requires a verified domain, not a bare Gmail address) with replies
// routed to the monitored RMD Birmingham inbox via replyTo. Shared with
// sendAccountCreationReminders below — one verified domain for all
// automated reminders.
const FROM_EMAIL  = "RMD Birmingham <reminders@rmd.uk.com>"; // requires rmd.uk.com verified in Resend — see deploy note above
const REPLY_TO     = "rmdbirmingham@googlemail.com";
const JON_BCC      = "j.hulme.1@bham.ac.uk"; // Jon wants a copy of every IW RSVP invite sent (2026-08-27) — see sendIwRsvpInvites
const FORM_URL   = "https://rmd.uk.com/senior-faculty-review.html";

exports.sendSeniorFacultyReminders = onCall({ secrets: [resendApiKey], region: "us-central1" }, async (request) => {
  const auth = request.auth;
  if (!auth) throw new HttpsError("unauthenticated", "Sign in required.");
  if (!(await callerIsDirector(auth))) {
    throw new HttpsError("permission-denied", "Course Directors only.");
  }

  const [rosterSnap, responsesSnap] = await Promise.all([
    db.collection(FACULTY_ROSTER_COLLECTION).where("group", "==", "senior").get(),
    db.collection(SFR_RESPONSES_COLLECTION).where("cycleYear", "==", SFR_CYCLE_YEAR).get()
  ]);

  const responded = new Set(responsesSnap.docs.map(d => (d.data().email || "").toLowerCase()));
  const rosterOutstanding = rosterSnap.docs
    .map(d => d.data())
    .filter(m => !responded.has((m.email || "").toLowerCase()));
  const skippedNoEmail = rosterOutstanding.filter(m => !m.email).length;
  const outstanding = rosterOutstanding.filter(m => m.email);

  if (!outstanding.length) {
    return { sent: 0, failed: 0, skipped: responsesSnap.size, skippedNoEmail, failedEmails: [] };
  }

  const resend = new Resend(resendApiKey.value());

  let sent = 0;
  const failedEmails = [];
  const sentTo = [];

  for (const person of outstanding) {
    const firstName = (person.name || "").split(" ")[0] || "there";
    try {
      const { error } = await resend.emails.send({
        from: FROM_EMAIL,
        to: person.email,
        replyTo: REPLY_TO,
        subject: "RMD Senior Faculty — review & future plans (reminder)",
        text:
`Hi ${firstName},

Just a reminder — I haven't yet had your response to the RMD senior faculty annual review. It only takes a couple of minutes:

${FORM_URL}

If you've already submitted this and are seeing this message anyway, sorry — let me know and I'll check what's happened.

Thanks,
Jon`
      });
      if (error) throw new Error(error.message || JSON.stringify(error));
      sent++;
      sentTo.push(person.email);
    } catch (err) {
      console.error(`sendSeniorFacultyReminders: failed to send to ${person.email}`, err.message);
      failedEmails.push(person.email);
    }
  }

  await db.collection(SFR_REMINDERS_COLLECTION).add({
    cycleYear: SFR_CYCLE_YEAR,
    sentTo,
    failedEmails,
    sentAt: admin.firestore.FieldValue.serverTimestamp(),
    sentByUid: auth.uid,
    sentByEmail: (auth.token.email || "").toLowerCase()
  });

  return { sent, failed: failedEmails.length, skipped: responsesSnap.size, skippedNoEmail, failedEmails };
});

/**
 * sendAccountCreationReminders — director-only.
 *
 * Reminds anyone with a Firebase Auth login (created via admin-bulk-users.html
 * — either "Add Faculty Accounts", which also writes a people/{uid} doc, or
 * "Provision MOU Roster Accounts", which deliberately does NOT write a people
 * doc) who has never actually signed in.
 *
 * Detection uses Firebase Auth's own account metadata (creationTime /
 * lastSignInTime) rather than a new Firestore flag — Auth already tracks this
 * for free, so nothing changes in admin-bulk-users.html or the sign-in flow.
 *
 * IMPORTANT — verify before trusting at scale: accounts:signUp (used by
 * admin-bulk-users.html to create the login) appears to set lastSignInTime
 * equal to creationTime at creation time itself. This function treats
 * lastSignInTime === creationTime as "never really signed in" — a real
 * subsequent sign-in is what moves lastSignInTime away from creationTime.
 * Before the first real send, create one throwaway test account, check its
 * metadata in Firebase Console → Authentication, sign in once as that user,
 * and confirm lastSignInTime updates — don't assume this holds without
 * checking.
 *
 * Cadence: none — every never-signed-in account is eligible every time this
 * is run, with no minimum gap since account creation, no minimum gap between
 * reminders, and no cap on reminders per person (removed 2026-07-31 at Jon's
 * request). account_reminders/{uid} (remindersSent, lastReminderAt) is still
 * written after each send purely as a record of reminderNumber/last-sent-time
 * for the admin-account-reminders.html display — it no longer gates sending.
 * Running this repeatedly (e.g. daily) will re-email everyone who still
 * hasn't signed in, every time.
 *
 * Call with { dryRun: true } to compute and return the eligible list without
 * sending or recording anything — this is what the "Load overdue list"
 * button on admin-account-reminders.html uses before the real "Send
 * reminders" call (dryRun: false / omitted).
 *
 * Requires rmd.uk.com to be verified as a domain in Resend before the first
 * real send, or every send fails. Shares FROM_EMAIL/REPLY_TO with
 * sendSeniorFacultyReminders above — one verified domain covers every
 * automated reminder; replies still land in the monitored RMD Birmingham
 * Gmail inbox via replyTo, not in the rmd.uk.com mailbox (which isn't a real
 * inbox anyone checks).
 *
 * Deploy: same as sendSeniorFacultyReminders (RESEND_API_KEY secret is
 * shared — no new secret needed for this function).
 */

const ACCOUNT_REMINDERS_COLLECTION = "account_reminders";

const SIGNIN_URL = "https://rmd.uk.com/signin.html";

exports.sendAccountCreationReminders = onCall({ secrets: [resendApiKey], region: "us-central1" }, async (request) => {
  const auth = request.auth;
  if (!auth) throw new HttpsError("unauthenticated", "Sign in required.");
  if (!(await callerIsDirector(auth))) {
    throw new HttpsError("permission-denied", "Course Directors only.");
  }

  const dryRun = !!request.data?.dryRun;

  // Pull every Auth user (paginated — this project has ~150 people, so one
  // page, but handle pagination properly regardless).
  let authUsers = [];
  let pageToken;
  do {
    const page = await admin.auth().listUsers(1000, pageToken);
    authUsers = authUsers.concat(page.users);
    pageToken = page.pageToken;
  } while (pageToken);

  const neverSignedIn = authUsers.filter(u => {
    const created = u.metadata.creationTime;
    const lastSignIn = u.metadata.lastSignInTime;
    return created && (!lastSignIn || lastSignIn === created);
  });

  if (!neverSignedIn.length) {
    return { checked: authUsers.length, eligible: [], sent: 0, failed: 0, failedEmails: [] };
  }

  // Cross-reference people (faculty/instructor/assessor accounts) and
  // mou_roster (MOU-only accounts, no people doc by design) for name/source.
  const [peopleSnap, rosterSnap, remindersSnap] = await Promise.all([
    db.collection("people").get(),
    db.collection("mou_roster").get(),
    db.collection(ACCOUNT_REMINDERS_COLLECTION).get()
  ]);

  const peopleByUid   = new Map(peopleSnap.docs.map(d => [d.id, d.data()]));
  const rosterByEmail = new Map(rosterSnap.docs.map(d => [(d.data().email || "").toLowerCase(), d.data()]));
  const remindersByUid = new Map(remindersSnap.docs.map(d => [d.id, d.data()]));

  const now = Date.now();
  const eligible = [];

  for (const u of neverSignedIn) {
    const email = u.email;
    if (!email) continue; // no email on file — shouldn't happen, skip defensively

    const person = peopleByUid.get(u.uid);
    const roster = rosterByEmail.get(email.toLowerCase());
    const name   = (person && person.name) || (roster && roster.name) || email.split("@")[0];
    const source = person ? "faculty" : (roster ? "mou" : "unknown");

    const createdMs = new Date(u.metadata.creationTime).getTime();
    const daysSinceCreation = (now - createdMs) / 86400000;

    // No cadence gating: every never-signed-in account is eligible every
    // time this runs (time/cap limits removed 2026-07-31 at Jon's request).
    const record = remindersByUid.get(u.uid) || { remindersSent: 0, lastReminderAt: null };

    eligible.push({
      uid: u.uid,
      email,
      name,
      source,
      daysSinceCreation: Math.floor(daysSinceCreation),
      reminderNumber: record.remindersSent + 1
    });
  }

  if (dryRun || !eligible.length) {
    return { checked: authUsers.length, eligible, sent: 0, failed: 0, failedEmails: [] };
  }

  const resend = new Resend(resendApiKey.value());

  let sent = 0;
  const failedEmails = [];

  for (const person of eligible) {
    const firstName = (person.name || "").split(" ")[0] || "there";
    try {
      const { error } = await resend.emails.send({
        from: FROM_EMAIL,
        to: person.email,
        replyTo: REPLY_TO,
        subject: "RMD Birmingham — finish setting up your account",
        text:
`Hi ${firstName},

An RMD Birmingham platform account was set up for you a little while ago, but it looks like you haven't signed in yet.

You'll need this account for the course platform (assessments, timetable, room info, and more). Sign in here — you'll be prompted to set a password the first time:

${SIGNIN_URL}

If you've already sorted this, or aren't sure why you're getting this, just reply and let us know.

Thanks,
RMD Birmingham`
      });
      if (error) throw new Error(error.message || JSON.stringify(error));
      sent++;
      await db.collection(ACCOUNT_REMINDERS_COLLECTION).doc(person.uid).set({
        remindersSent:  person.reminderNumber,
        lastReminderAt: admin.firestore.FieldValue.serverTimestamp(),
        email:          person.email,
        source:         person.source
      }, { merge: true });
    } catch (err) {
      console.error(`sendAccountCreationReminders: failed to send to ${person.email}`, err.message);
      failedEmails.push(person.email);
    }
  }

  return { checked: authUsers.length, eligible, sent, failed: failedEmails.length, failedEmails };
});

/**
 * shiftProgrammeSession — director or assessor-faculty only.
 *
 * Cascading same-day, same-stream time shift for the live programme
 * (sessions collection — seeded once via admin-migrate-programme.html,
 * read live by timetable.html). Given a session id and a delta in minutes,
 * shifts that session and every later session the same day, within the
 * same stream (instructor vs assessor, derived from the "assessor-stream"
 * tag), by that many minutes. The two streams share Saturday morning
 * through the 11:45 break (and the 16:45 Whole Course Photo) as the same
 * real event duplicated across both stream tabs — those pairs are linked
 * via a `pairWith` field set during migration, and a shifted session's
 * paired twin is always shifted by the same delta too, even though it's
 * nominally in the other stream, so both tabs stay truthful to the one
 * real event. Everywhere else the two streams move independently, per
 * Jon's 2026-08-06 confirmation.
 *
 * This is the only path that may write to `sessions` — firestore.rules
 * denies direct client writes to that collection, so the shift control in
 * timetable.html calls this function rather than writing Firestore itself.
 * Every call is logged to programme_shift_log with the affected session
 * ids and their before/after start times, so any live edit during the
 * actual course weekend is traceable to who did it and when.
 *
 * No reset-to-original option (dropped 2026-08-06 at Jon's request) — a
 * shift is a plain, permanent edit, undoable only by shifting back.
 *
 * Deploy: same as the functions above (no new secret needed):
 *   firebase deploy --only functions
 */

const SESSIONS_COLLECTION  = "sessions";
const SHIFT_LOG_COLLECTION = "programme_shift_log";
const MAX_SHIFT_MINUTES    = 240; // 4 hours — sanity cap, not a real expected use case

function timeToMins(t) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function shiftTimeString(start, deltaMinutes) {
  const total = timeToMins(start) + deltaMinutes;
  const hh = Math.floor(total / 60).toString().padStart(2, "0");
  const mm = (total % 60).toString().padStart(2, "0");
  return `${hh}:${mm}`;
}

function streamOf(session) {
  return (session.tags || []).includes("assessor-stream") ? "assessor" : "instructor";
}

exports.shiftProgrammeSession = onCall({ region: "us-central1" }, async (request) => {
  const auth = request.auth;
  if (!auth) throw new HttpsError("unauthenticated", "Sign in required.");
  const isDirector = await callerIsDirector(auth);
  const isAssessorFaculty = !isDirector && await (async () => {
    try {
      const person = await db.collection("people").doc(auth.uid).get();
      return person.exists && person.data().role === "assessor-faculty";
    } catch (e) { return false; }
  })();
  if (!isDirector && !isAssessorFaculty) {
    throw new HttpsError("permission-denied", "Course Directors and Assessor Faculty only.");
  }

  const sessionId = String(request.data?.sessionId || "").trim();
  const deltaMinutes = Number(request.data?.deltaMinutes);
  if (!sessionId) throw new HttpsError("invalid-argument", "sessionId is required.");
  if (!Number.isInteger(deltaMinutes) || deltaMinutes === 0) {
    throw new HttpsError("invalid-argument", "deltaMinutes must be a non-zero whole number of minutes.");
  }
  if (Math.abs(deltaMinutes) > MAX_SHIFT_MINUTES) {
    throw new HttpsError("invalid-argument", `Shifts are limited to ${MAX_SHIFT_MINUTES} minutes at a time.`);
  }

  const anchorDoc = await db.collection(SESSIONS_COLLECTION).doc(sessionId).get();
  if (!anchorDoc.exists) throw new HttpsError("not-found", `No session with id "${sessionId}".`);
  const anchor = anchorDoc.data();
  const day = anchor.day;
  const anchorStream = streamOf(anchor);

  // Assessor Faculty may only shift the assessor-stream programme — same
  // scoping already applied to their noticeboard message target in
  // firestore.rules (assessor-stream only, never "all"/"faculty"/
  // "instructor-stream"). Directors can shift either stream.
  if (!isDirector && anchorStream !== "assessor") {
    throw new HttpsError("permission-denied", "Assessor Faculty can only shift the assessor-stream programme.");
  }

  const daySnap = await db.collection(SESSIONS_COLLECTION).where("day", "==", day).get();
  const daySessions = daySnap.docs.map(d => ({ id: d.id, ...d.data() }));

  // Same stream as the anchor, ordered exactly as timetable.html renders
  // it: start time, then original array position for same-time ties (the
  // Sunday placeholder stack).
  const streamSessions = daySessions
    .filter(s => streamOf(s) === anchorStream)
    .sort((a, b) => timeToMins(a.start) - timeToMins(b.start) || ((a.order ?? 0) - (b.order ?? 0)));

  const anchorIndex = streamSessions.findIndex(s => s.id === sessionId);
  if (anchorIndex === -1) {
    throw new HttpsError("internal", "Session not found in its own day/stream list — data inconsistency.");
  }

  // Cascade forward only: the anchor session and everything later that day,
  // in this stream. Nothing earlier moves, nothing crosses into another day.
  const toShift = streamSessions.slice(anchorIndex);

  for (const s of toShift) {
    const newStart = timeToMins(s.start) + deltaMinutes;
    if (newStart < 0 || newStart >= 24 * 60) {
      throw new HttpsError("failed-precondition",
        `Shifting "${s.title}" (currently ${s.start}) by ${deltaMinutes} minutes would push it outside the same day.`);
    }
  }

  // Full write set: the cascaded sessions, plus each one's pairWith twin
  // (same real event, other stream's tab) shifted by the same delta.
  const writes = new Map(); // id -> { ref, before, after }

  for (const s of toShift) {
    if (!writes.has(s.id)) {
      writes.set(s.id, {
        ref: db.collection(SESSIONS_COLLECTION).doc(s.id),
        before: s.start,
        after: shiftTimeString(s.start, deltaMinutes)
      });
    }
    if (s.pairWith && !writes.has(s.pairWith)) {
      const twin = daySessions.find(x => x.id === s.pairWith);
      if (twin) {
        writes.set(twin.id, {
          ref: db.collection(SESSIONS_COLLECTION).doc(twin.id),
          before: twin.start,
          after: shiftTimeString(twin.start, deltaMinutes)
        });
      }
    }
  }

  const batch = db.batch();
  writes.forEach(w => batch.update(w.ref, { start: w.after }));
  await batch.commit();

  const affected = Array.from(writes.entries()).map(([id, w]) => ({ id, before: w.before, after: w.after }));

  await db.collection(SHIFT_LOG_COLLECTION).add({
    day,
    stream: anchorStream,
    anchorSessionId: sessionId,
    deltaMinutes,
    affected,
    appliedAt: admin.firestore.FieldValue.serverTimestamp(),
    appliedByUid: auth.uid,
    appliedByEmail: (auth.token.email || "").toLowerCase()
  });

  return { day, stream: anchorStream, deltaMinutes, affected };
});

/**
 * syncIwRegistrationToPeople: Firestore trigger (v2, onDocumentWritten),
 * iw_registrations/{docId}. Automates the "Sync to People" button in
 * admin-iw-registrations.html — mirrors that file's IW_TO_PEOPLE_ROLE map
 * and syncToPeople() function exactly. Runs automatically whenever a
 * registration's status becomes "confirmed", so a director no longer has
 * to remember to click Sync before course day.
 *
 * Mirrors the manual button's logic:
 *   - dedupes by email (case-insensitive) against the existing `people`
 *     collection — never updates or overwrites an existing person doc.
 *   - role mapped via IW_TO_PEOPLE_ROLE (duplicated here — keep in sync
 *     with admin-iw-registrations.html and js/firebase-config.js ROLES if
 *     either changes).
 *   - unresolved roles are skipped (not guessed at). Since no human
 *     reviews a preview panel before this runs, the skip is written back
 *     onto the registration doc as `syncFlag` so admin-iw-registrations.html
 *     shows a "Needs attention" indicator instead of the gap only
 *     surfacing at check-in.
 *
 * The manual Sync to People button is left in place as an on-demand
 * backstop (e.g. to re-check after fixing a flagged role) — this trigger
 * makes it redundant in the common case, not obsolete.
 *
 * First deploy note: v2 Firestore triggers provision via Eventarc — if
 * this is the first Firestore trigger in the project, the initial deploy
 * can take a few minutes longer while the Eventarc/Cloud Build APIs spin
 * up. Normal, not a failure.
 */
const IW_TO_PEOPLE_ROLE = {
  "Instructor Candidate":          "instructor",
  "Assessor / Senior Instructor":  "assessor",
  "Faculty":                       "faculty",
  "Instructor Trainer Candidate":  "itc",
  "Instructor Trainer":            "full-instructor",
  "Assessor Faculty":              "assessor-faculty",
  "Director":                      "director",
  "RMD Student Faculty":           "faculty"
};

exports.syncIwRegistrationToPeople = onDocumentWritten(
  { document: "iw_registrations/{docId}", region: "us-central1" },
  async (event) => {
    const after = event.data?.after?.exists ? event.data.after.data() : null;
    if (!after || after.status !== "confirmed") return; // deleted, or not (yet) confirmed

    // Skip re-running when nothing relevant changed since the last pass
    // (e.g. an edit to notes on an already-confirmed, already-synced row).
    const before = event.data?.before?.exists ? event.data.before.data() : null;
    const alreadyHandled = before
      && before.status === "confirmed"
      && before.email === after.email
      && before.role === after.role;
    if (alreadyHandled) return;

    const regRef = event.data.after.ref;
    const email = (after.email || "").toLowerCase().trim();
    const mappedRole = IW_TO_PEOPLE_ROLE[after.role];

    if (!email || !mappedRole) {
      await regRef.update({
        syncFlag: {
          status: "unresolved_role",
          role: after.role || null,
          flaggedAt: admin.firestore.FieldValue.serverTimestamp()
        }
      });
      return;
    }

    // Same full-collection scan the manual button does — fine at current
    // scale (people collection is low hundreds of docs). If that grows
    // enough to matter, switch to a stored lowercase-email field and query
    // on it instead of scanning + filtering client-side.
    const peopleSnap = await db.collection("people").get();
    const exists = peopleSnap.docs.some(d => (d.data().email || "").toLowerCase() === email);

    if (exists) {
      if (after.syncFlag) await regRef.update({ syncFlag: admin.firestore.FieldValue.delete() });
      return; // already synced (manually or by an earlier run) — never overwrite
    }

    await db.collection("people").add({
      name: after.name || "",
      email,
      role: mappedRole,
      syncedFrom: "iw_registrations",
      syncedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    if (after.syncFlag) await regRef.update({ syncFlag: admin.firestore.FieldValue.delete() });
  }
);

/**
 * sendIwRsvpInvites — director-only.
 *
 * Emails every Assessor/Senior Instructor on iw_registrations who is still
 * Pending, each with a link to iw-rsvp-confirm.html carrying their own
 * registration doc ID. That page shows their name and a Yes/No choice;
 * answering there calls iwRsvpRespond (below) directly — no sign-in, since
 * Assessors/Senior Instructors don't have RMD accounts. The doc ID (a
 * random Firestore auto-ID) is the only "token" — same trust model as a
 * mailing-list unsubscribe link, which is appropriate for a low-stakes
 * attendance RSVP but worth knowing: anyone who gets hold of the link can
 * answer as that person.
 *
 * Deliberately a landing-page link rather than a one-click action link:
 * university/NHS mail systems commonly run link-prefetching security
 * scanners that open every URL in an incoming email before the recipient
 * does — a one-click link that instantly flips status risks being tripped
 * by the scanner itself, not the person. Requiring an explicit Yes/No click
 * on iw-rsvp-confirm.html avoids that.
 *
 * Recomputes the outstanding (Pending) list server-side rather than trusting
 * the caller, same reasoning as sendSeniorFacultyReminders above — a stale
 * admin tab can't re-invite someone who has since been confirmed/declined
 * (by email-reply-and-manual-click, or by this RSVP flow) since the page
 * was last loaded. Only Pending rows are queried — already Confirmed/
 * Declined people are not re-emailed by this function; re-run it after a
 * fresh roster import to catch anyone newly added.
 *
 * Requires the same rmd.uk.com-verified Resend setup as the other reminder
 * functions above — no new secret needed.
 *
 * Deploy: same as sendSeniorFacultyReminders (RESEND_API_KEY secret is
 * shared — no new secret needed for this function).
 */

const IW_COLL                     = "iw_registrations";
const ASSESSOR_ROLE               = "Assessor / Senior Instructor";
const IW_RSVP_URL                 = "https://rmd.uk.com/iw-rsvp-confirm.html";
const IW_RSVP_INVITES_COLLECTION  = "iw_rsvp_invites";

exports.sendIwRsvpInvites = onCall({ secrets: [resendApiKey], region: "us-central1" }, async (request) => {
  const auth = request.auth;
  if (!auth) throw new HttpsError("unauthenticated", "Sign in required.");
  if (!(await callerIsDirector(auth))) {
    throw new HttpsError("permission-denied", "Course Directors only.");
  }

  const snap = await db.collection(IW_COLL)
    .where("role", "==", ASSESSOR_ROLE)
    .where("status", "==", "pending")
    .get();

  const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  const outstanding = all.filter(p => p.email);
  const skippedNoEmail = all.length - outstanding.length;

  if (!outstanding.length) {
    return { sent: 0, failed: 0, failedEmails: [], skippedNoEmail, total: all.length };
  }

  const resend = new Resend(resendApiKey.value());

  let sent = 0;
  const failedEmails = [];
  const sentTo = [];

  for (const person of outstanding) {
    const firstName = (person.name || "").split(" ")[0] || "there";
    const link = `${IW_RSVP_URL}?id=${person.id}`;
    try {
      const { error } = await resend.emails.send({
        from: FROM_EMAIL,
        to: person.email,
        bcc: JON_BCC,
        replyTo: REPLY_TO,
        subject: "RMD Instructor Weekend — will you be attending?",
        text:
`Hi ${firstName},

The annual instructor weekend is a core part of the RMD year. As you are one of the more senior members of the RMD Birmingham team, and have a key role in maintaining the standards of the course, we hope to see you there.

Please let us know here:

${link}

Birmingham Medical School
10 - 11 October 2026

If you've already told us, or you think you received this by mistake, just reply and let us know.

Thanks
Jon & Naveed`
      });
      if (error) throw new Error(error.message || JSON.stringify(error));
      sent++;
      sentTo.push(person.email);
    } catch (err) {
      console.error(`sendIwRsvpInvites: failed to send to ${person.email}`, err.message);
      failedEmails.push(person.email);
    }
  }

  await db.collection(IW_RSVP_INVITES_COLLECTION).add({
    sentTo,
    failedEmails,
    sentAt: admin.firestore.FieldValue.serverTimestamp(),
    sentByUid: auth.uid,
    sentByEmail: (auth.token.email || "").toLowerCase()
  });

  return { sent, failed: failedEmails.length, failedEmails, skippedNoEmail, total: all.length };
});

/**
 * iwRsvpRespond — public, no sign-in required (Assessors/Senior Instructors
 * have no RMD account). Backs iw-rsvp-confirm.html.
 *
 * Called twice per visit:
 *   1. { id } only, on page load — looks up the registration doc and
 *      returns { name, status } so the page can greet them by name and,
 *      if they've already responded (including via the admin ✓/✗ buttons),
 *      show that answer instead of asking again.
 *   2. { id, response: "yes" | "no" }, when they click a button — updates
 *      status to confirmed/declined and returns the same shape.
 *
 * The registration doc's own ID is the only credential (see the trust-model
 * note on sendIwRsvpInvites above). firestore.rules keeps iw_registrations
 * director-only for direct client reads/writes; this function runs under
 * the Admin SDK, which isn't subject to those rules, so it's the one public
 * entry point into that collection.
 *
 * Deliberately does not gate on current status — if Jon already set
 * something manually, or the person is re-visiting an old link to change
 * their mind, their latest answer here wins. Writing status via the Admin
 * SDK fires syncIwRegistrationToPeople exactly as a manual confirm would,
 * so a "yes" here syncs to People the same way a click on ✓ does.
 */
exports.iwRsvpRespond = onCall({ region: "us-central1" }, async (request) => {
  const id = request.data?.id;
  if (!id || typeof id !== "string") {
    throw new HttpsError("invalid-argument", "Missing registration id.");
  }

  const ref = db.collection(IW_COLL).doc(id);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new HttpsError("not-found", "This RSVP link is no longer valid — please contact Jon directly.");
  }

  const data = snap.data();
  if (data.role !== ASSESSOR_ROLE) {
    throw new HttpsError("failed-precondition", "This link isn't valid for an RSVP.");
  }

  const response = request.data?.response;
  if (response === undefined || response === null) {
    return { name: data.name || "", status: data.status || "pending" };
  }

  if (response !== "yes" && response !== "no") {
    throw new HttpsError("invalid-argument", 'Response must be "yes" or "no".');
  }

  const status = response === "yes" ? "confirmed" : "declined";
  await ref.update({
    status,
    statusUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
    statusSource: "rsvp-link"
  });

  return { name: data.name || "", status };
});
