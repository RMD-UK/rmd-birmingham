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
 * sendMouReminders: on-demand (callable), director-only. Emails everyone on
 * mou_roster who hasn't yet submitted the current academic year's MOU — the
 * same "Outstanding" list admin-mou-dashboard.html already showed, this
 * automates the reminder send that page used to leave to a manual
 * copy-emails-and-send-yourself step. Full deploy note above that function.
 *
 * sendMouRemindersScheduled: scheduled (runs daily, no caller), automatic
 * version of sendMouReminders — only actually sends 1 June to 1 October
 * each year, fortnightly per person, no cap. Full deploy note above that
 * function.
 *
 * shiftProgrammeSession: on-demand (callable), director or assessor-faculty.
 * Cascading same-day, same-stream time shift for the live programme
 * (sessions collection — see admin-migrate-programme.html and timetable.html's
 * shift control). Single choke point for sessions writes — firestore.rules
 * does not allow clients to write sessions directly, only this function via
 * the Admin SDK. Full detail above the function itself, below.
 *
 * changePersonEmail: on-demand (callable), director-only. Changes a
 * person's Firebase Auth login email and every Firestore record that's
 * matched to them by email (people, mou_roster, faculty_responses,
 * iw_registrations, mou_responses, faculty_roster) — see the "Change
 * Someone's Account Email" card on admin-bulk-users.html. This is the fix
 * for the class of bug this project kept hitting (Laura Ann Smith, Jaimy
 * Sajit): a wrong/stale email in one collection while another has the real
 * one, producing duplicate accounts or false "never signed in" alerts.
 * Full detail above the function itself, below.
 *
 * changeMyEmail: on-demand (callable), any signed-in member, self-service.
 * Same mechanics as changePersonEmail, sharing the performEmailChange()
 * helper, but the "old email" always comes from the caller's own ID token,
 * never client input, so a member can only ever change their own account.
 * Powers the "change my email" button on my-account.html. Full detail
 * above the function itself, below.
 *
 * checkFacultyIdentityMatch: on-demand (callable), public, no sign-in.
 * Called by faculty-form.html at submit time — surname-matches the typed
 * name against people/mou_roster and, on a match under a different email,
 * tells the submitter so they can sign in on their real account instead of
 * creating a duplicate. Soft prompt, not a hard block. Full detail above
 * the function itself, below.
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
const { onSchedule } = require("firebase-functions/v2/scheduler");
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

  const dryRun = !!request.data?.dryRun;

  // Outside the annual review window (1 April – 1 July), nothing counts as
  // outstanding at all — see isWithinSfrReminderWindow above. This is the
  // fix for Jon's 2026-09-18 request: "do not consider senior faculty
  // review missing at this time, this year's done."
  if (!isWithinSfrReminderWindow(new Date())) {
    if (dryRun) {
      return { dryRun: true, outstanding: [], skipped: 0, skippedNoEmail: 0, sent: 0, failed: 0, failedEmails: [], outsideWindow: true };
    }
    return { sent: 0, failed: 0, skipped: 0, skippedNoEmail: 0, failedEmails: [], outsideWindow: true };
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
  let outstanding = rosterOutstanding.filter(m => m.email);

  const targetEmailB = (request.data?.email || "").trim().toLowerCase();
  if (targetEmailB) outstanding = outstanding.filter(m => (m.email || "").toLowerCase() === targetEmailB);

  if (dryRun) {
    return { dryRun: true, outstanding, skipped: responsesSnap.size, skippedNoEmail, sent: 0, failed: 0, failedEmails: [] };
  }

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

  const targetEmailA = (request.data?.email || "").trim().toLowerCase();
  const filteredEligible = targetEmailA ? eligible.filter(p => p.email.toLowerCase() === targetEmailA) : eligible;

  if (dryRun || !filteredEligible.length) {
    return { checked: authUsers.length, eligible: filteredEligible, sent: 0, failed: 0, failedEmails: [] };
  }

  const resend = new Resend(resendApiKey.value());

  let sent = 0;
  const failedEmails = [];

  for (const person of filteredEligible) {
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

  return { checked: authUsers.length, eligible: filteredEligible, sent, failed: failedEmails.length, failedEmails };
});

/**
 * sendDirectResetLink -- director-only.
 *
 * Firebase Auth's own sendPasswordResetEmail() sends from a generic
 * noreply@<project>.firebaseapp.com address, which several 2026-09
 * registrants (gmail.com, icloud.com, a .nl ISP) never received --
 * almost certainly spam-filtered, since the same people's Resend-sent
 * invites elsewhere on this platform haven't had this problem. This
 * function sidesteps Firebase's own send entirely: generatePasswordResetLink()
 * mints the real reset URL via the Admin SDK (the client SDK/REST API has
 * no equivalent -- it can only ask Firebase to email it, not hand back
 * the link), and we deliver it ourselves through the same verified
 * rmd.uk.com/Resend pipeline as every other platform email. The raw link
 * is also returned in the response, so it can be pasted into an email by
 * hand as a fallback if Resend fails too.
 *
 * Added 2026-09-17 at Jon's request, after Anne Sofie Besemer, Thijmen
 * van den Berg and Petra Schuffelen all reported never receiving a
 * Firebase reset email despite successful sendOobCode responses.
 */
exports.sendDirectResetLink = onCall({ secrets: [resendApiKey], region: "us-central1" }, async (request) => {
  const auth = request.auth;
  if (!auth) throw new HttpsError("unauthenticated", "Sign in required.");
  if (!(await callerIsDirector(auth))) {
    throw new HttpsError("permission-denied", "Course Directors only.");
  }

  const email = (request.data?.email || "").trim().toLowerCase();
  if (!email) throw new HttpsError("invalid-argument", "Email required.");

  let userRecord;
  try {
    userRecord = await admin.auth().getUserByEmail(email);
  } catch (e) {
    throw new HttpsError("not-found", `No Auth account for ${email}.`);
  }

  const link = await admin.auth().generatePasswordResetLink(email, {
    url: "https://rmd.uk.com/index.html",
    handleCodeInApp: false
  });

  // Name for the greeting -- same people/mou_roster lookup
  // sendAccountCreationReminders uses.
  const [personSnap, rosterSnap] = await Promise.all([
    db.collection("people").doc(userRecord.uid).get(),
    db.collection("mou_roster").where("email", "==", email).limit(1).get()
  ]);
  const name = (personSnap.exists && personSnap.data().name)
    || (rosterSnap.docs[0] && rosterSnap.docs[0].data().name)
    || "";
  const firstName = name.split(" ")[0] || "there";

  let emailSent = false;
  let emailError = null;
  try {
    const resend = new Resend(resendApiKey.value());
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      bcc: JON_BCC,
      replyTo: REPLY_TO,
      subject: "RMD Birmingham -- sign in to your account",
      text:
`Hi ${firstName},

Here's a fresh link to set your password and sign in to the RMD Birmingham platform:

${link}

This link is single-use and expires after a while -- if it's stopped working by the time you click it, just reply and we'll send another.

Thanks,
Jon`
    });
    if (error) throw new Error(error.message || JSON.stringify(error));
    emailSent = true;
  } catch (err) {
    console.error(`sendDirectResetLink: Resend send failed for ${email}`, err.message);
    emailError = err.message;
  }

  await db.collection("direct_reset_links_sent").add({
    email,
    uid: userRecord.uid,
    name,
    emailSent,
    emailError,
    sentAt: admin.firestore.FieldValue.serverTimestamp(),
    sentByUid: auth.uid,
    sentByEmail: (auth.token.email || "").toLowerCase()
  });

  return { email, uid: userRecord.uid, link, emailSent, emailError };
});

/**
 * mergePersonEmail — director-only.
 *
 * Fixes the "same person under two email addresses" problem: one address
 * has their real login (people/{uid}, Auth account) and history, the other
 * is a stray entry elsewhere (mou_roster, faculty_roster, etc.) with no
 * login of its own. Moves the REAL account (Auth email + every Firestore
 * record keyed to it) onto the new address, rather than creating a second
 * account or silently losing data on either side.
 *
 * Built 2026-09-18 for Cameron Parkes: his only real account/login was
 * under parkesc17@gmail.com (people doc, faculty_roster, faculty_responses,
 * iw_registrations), but c.d.parkes@bham.ac.uk already existed as a bare
 * mou_roster line with no login. Jon wants Cameron's one real account
 * moved onto the bham.ac.uk address, not deleted.
 *
 * oldEmail = the address with the real people/{uid} account (this is what
 * moves). newEmail = the address to move it to. Requires a people doc to
 * exist for oldEmail — if there's no account there, this is the wrong
 * tool (that's just a roster edit on whichever page owns that record).
 *
 * Call with { dryRun: true } first — returns exactly what would change,
 * per collection, without touching anything. Idempotent-ish: safe to
 * re-run if something failed partway, since every step first checks
 * whether it's already done.
 */
/**
 * deleteEmptyAuthAccount — director-only.
 *
 * Companion to mergePersonEmail: deletes an Auth account ONLY when it's
 * genuinely an empty shell — no people doc tied to it. Refuses to touch
 * anything if a people doc exists for that uid, so this can't accidentally
 * delete a real account. Built 2026-09-18 alongside mergePersonEmail for
 * exactly the case it exists to unblock: an email that already has its own
 * bare Auth login with nothing behind it, colliding with a real account
 * that needs to move onto that same email address.
 */
exports.deleteEmptyAuthAccount = onCall({ region: "us-central1" }, async (request) => {
  const auth = request.auth;
  if (!auth) throw new HttpsError("unauthenticated", "Sign in required.");
  if (!(await callerIsDirector(auth))) {
    throw new HttpsError("permission-denied", "Course Directors only.");
  }

  const email = (request.data?.email || "").trim().toLowerCase();
  if (!email || !email.includes("@")) throw new HttpsError("invalid-argument", "email required.");

  let userRecord;
  try {
    userRecord = await admin.auth().getUserByEmail(email);
  } catch (e) {
    throw new HttpsError("not-found", `No Auth account for ${email}.`);
  }

  const peopleSnap = await db.collection("people").doc(userRecord.uid).get();
  if (peopleSnap.exists) {
    throw new HttpsError("failed-precondition", `${email} (uid ${userRecord.uid}) has a people doc — this is not an empty shell, refusing to delete. Sort out manually which account should survive.`);
  }

  await admin.auth().deleteUser(userRecord.uid);
  return { deleted: true, email, uid: userRecord.uid };
});

exports.mergePersonEmail = onCall({ region: "us-central1" }, async (request) => {
  const auth = request.auth;
  if (!auth) throw new HttpsError("unauthenticated", "Sign in required.");
  if (!(await callerIsDirector(auth))) {
    throw new HttpsError("permission-denied", "Course Directors only.");
  }

  const oldEmail = (request.data?.oldEmail || "").trim().toLowerCase();
  const newEmail = (request.data?.newEmail || "").trim().toLowerCase();
  const dryRun = !!request.data?.dryRun;
  const adoptExisting = !!request.data?.adoptExisting;

  if (!oldEmail || !oldEmail.includes("@")) throw new HttpsError("invalid-argument", "oldEmail required.");
  if (!newEmail || !newEmail.includes("@")) throw new HttpsError("invalid-argument", "newEmail required.");
  if (oldEmail === newEmail) throw new HttpsError("invalid-argument", "oldEmail and newEmail are the same.");

  const peopleSnap = await db.collection("people").where("email", "==", oldEmail).get();
  if (peopleSnap.empty) {
    throw new HttpsError("not-found", `No account (people doc) found for ${oldEmail} — nothing to move. If the account is actually under ${newEmail}, you don't need this tool.`);
  }
  if (peopleSnap.size > 1) {
    throw new HttpsError("failed-precondition", `${peopleSnap.docs.length} accounts found for ${oldEmail} — that's unexpected, sort that out manually first.`);
  }
  const oldUid = peopleSnap.docs[0].id;
  const oldPeopleData = peopleSnap.docs[0].data();

  // Don't assume newEmail has no Auth account of its own — check, and if it
  // does, report on BOTH accounts rather than blindly erroring out. This
  // surfaced a real case (Cameron Parkes, 2026-09-18): bham.ac.uk already
  // had its own Auth account, actively used, with no people doc or any
  // other record behind it — not a stray shell to delete, but the account
  // to keep. See the "adopt" branch below.
  let newEmailAuthUser = null;
  try {
    newEmailAuthUser = await admin.auth().getUserByEmail(newEmail);
  } catch (e) { /* no existing Auth account under newEmail — the simple rename case */ }

  // Migration steps shared by both branches below — identical whether we're
  // renaming oldUid's own email onto a free address, or adopting an existing
  // Auth account at newEmail. Only the people-doc/Auth-account handling differs.
  const facRosterSnap = await db.collection("faculty_roster").where("email", "==", oldEmail).get();
  const iwRegSnap = await db.collection("iw_registrations").where("email", "==", oldEmail).get();
  const oldRespSnap = await db.collection("faculty_responses").doc(oldEmail).get();
  const newRespSnap = oldRespSnap.exists ? await db.collection("faculty_responses").doc(newEmail).get() : null;
  const oldMouSnap = await db.collection("mou_roster").doc(oldEmail).get();
  const newMouSnap = await db.collection("mou_roster").doc(newEmail).get();
  const oldMouRespSnap = await db.collection("mou_responses").doc(oldEmail).get();
  const newMouRespSnap = oldMouRespSnap.exists ? await db.collection("mou_responses").doc(newEmail).get() : null;

  function pushSharedSteps(steps) {
    facRosterSnap.forEach(d => steps.push({ collection: "faculty_roster", docId: d.id, action: "update email field" }));
    iwRegSnap.forEach(d => steps.push({ collection: "iw_registrations", docId: d.id, action: "update email field" }));
    if (oldRespSnap.exists) {
      steps.push(newRespSnap.exists
        ? { collection: "faculty_responses", action: `CONFLICT — a submission already exists under ${newEmail} too; the one under ${oldEmail} will be left alone, sort out manually which to keep` }
        : { collection: "faculty_responses", action: `move doc from ${oldEmail} to ${newEmail}` });
    }
    if (oldMouSnap.exists && !newMouSnap.exists) {
      steps.push({ collection: "mou_roster", action: `move doc from ${oldEmail} to ${newEmail}` });
    } else if (oldMouSnap.exists && newMouSnap.exists) {
      steps.push({ collection: "mou_roster", action: `${oldEmail} entry is now redundant (one already exists under ${newEmail}) — will be removed, the ${newEmail} entry is kept as-is` });
    }
    if (oldMouRespSnap.exists) {
      steps.push(newMouRespSnap.exists
        ? { collection: "mou_responses", action: `CONFLICT — a submission already exists under ${newEmail} too; the one under ${oldEmail} will be left alone` }
        : { collection: "mou_responses", action: `move doc from ${oldEmail} to ${newEmail}` });
    }
  }

  async function executeSharedSteps() {
    for (const d of facRosterSnap.docs) await d.ref.update({ email: newEmail });
    for (const d of iwRegSnap.docs) await d.ref.update({ email: newEmail });

    if (oldRespSnap.exists && !newRespSnap.exists) {
      const data = oldRespSnap.data();
      data.email = newEmail;
      await db.collection("faculty_responses").doc(newEmail).set(data);
      await db.collection("faculty_responses").doc(oldEmail).delete();
    }

    if (oldMouSnap.exists && !newMouSnap.exists) {
      const data = oldMouSnap.data();
      data.email = newEmail;
      await db.collection("mou_roster").doc(newEmail).set(data);
      await db.collection("mou_roster").doc(oldEmail).delete();
    } else if (oldMouSnap.exists && newMouSnap.exists) {
      await db.collection("mou_roster").doc(oldEmail).delete();
    }

    if (oldMouRespSnap.exists && !newMouRespSnap.exists) {
      const data = oldMouRespSnap.data();
      data.email = newEmail;
      await db.collection("mou_responses").doc(newEmail).set(data);
      await db.collection("mou_responses").doc(oldEmail).delete();
    }
  }

  if (newEmailAuthUser) {
    const newPeopleSnap = await db.collection("people").doc(newEmailAuthUser.uid).get();

    if (newPeopleSnap.exists) {
      // Two real accounts, both with profiles — not something to auto-resolve.
      return {
        dryRun: true,
        conflict: true,
        oldEmail, newEmail, oldUid,
        newEmailAuthUid: newEmailAuthUser.uid,
        newEmailCreatedAt: newEmailAuthUser.metadata.creationTime,
        newEmailLastSignIn: newEmailAuthUser.metadata.lastSignInTime || null,
        newEmailHasPeopleDoc: true,
        newEmailPeopleDoc: newPeopleSnap.data(),
        note: `${newEmail} has its own account WITH a people doc — this is two real accounts, not a stray shell. Sort out manually which is correct before merging.`
      };
    }

    // newEmail has an Auth login but no people doc — the "adopt" case.
    // e.g. Cameron Parkes, 2026-09-18: bham.ac.uk is his real, actively-used
    // login (people can't re-sign-in to a deleted account) but has no
    // profile behind it, while the profile and history all sit under his
    // old gmail account. Fix: keep the bham.ac.uk login, give it the
    // profile, retire the old Auth account and its people doc.
    const newUid = newEmailAuthUser.uid;
    const plan = {
      adopt: true,
      oldEmail, newEmail, oldUid, newUid,
      steps: [
        { collection: "people", action: `create people/${newUid} from ${oldEmail}'s profile data, email set to ${newEmail}` },
        { collection: "people", action: `delete old profile doc people/${oldUid}` },
        { collection: "Auth", action: `delete old Auth account (uid ${oldUid}, ${oldEmail}) — surviving login is ${newEmail} (uid ${newUid})` }
      ]
    };
    pushSharedSteps(plan.steps);

    if (dryRun) {
      return {
        dryRun: true,
        ...plan,
        newEmailCreatedAt: newEmailAuthUser.metadata.creationTime,
        newEmailLastSignIn: newEmailAuthUser.metadata.lastSignInTime || null,
        note: `${newEmail} is an active login with no profile — adopting it as the surviving account. Re-run with adoptExisting:true (and dryRun:false) to execute — this permanently deletes the ${oldEmail} Auth account.`
      };
    }

    if (!adoptExisting) {
      throw new HttpsError("failed-precondition", `Adopting ${newEmail} as the surviving login permanently deletes the ${oldEmail} Auth account. Re-run with adoptExisting:true to confirm.`);
    }

    const newPersonData = { ...oldPeopleData, email: newEmail };
    await db.collection("people").doc(newUid).set(newPersonData);
    await db.collection("people").doc(oldUid).delete();
    await admin.auth().deleteUser(oldUid);

    await executeSharedSteps();

    return { dryRun: false, ...plan, done: true };
  }

  // newEmail is completely free — simple rename of the existing account.
  const plan = {
    oldEmail, newEmail, uid: oldUid,
    steps: [{ collection: "people + Auth", action: `update email on account ${oldUid}` }]
  };
  pushSharedSteps(plan.steps);

  if (dryRun) {
    return { dryRun: true, ...plan };
  }

  await admin.auth().updateUser(oldUid, { email: newEmail });
  await db.collection("people").doc(oldUid).update({ email: newEmail });
  await executeSharedSteps();

  return { dryRun: false, ...plan, done: true };
});

/**
 * correctStaleRosterEmail — director-only.
 *
 * For the case found 2026-09-18 while cleaning up Cameron Parkes: a person's
 * faculty_roster / mou_roster entry carries a university email that was
 * never actually used (no Auth account, no people doc, no confirmed IW
 * registration, no submitted response under it), while their real activity
 * sits under a different address already recorded in faculty_roster's own
 * aliasEmails field (Ellen Murgatroyd, Juliette Horobin, Rosie Lilwall,
 * Theresa Brock). This is NOT an account merge (mergePersonEmail is for
 * that) — oldEmail here has no account to merge, it's just wrong contact
 * data. Refuses to run if oldEmail turns out to have a people doc or an
 * Auth account of its own, since that would mean it's actually live.
 */
exports.correctStaleRosterEmail = onCall({ region: "us-central1" }, async (request) => {
  const auth = request.auth;
  if (!auth) throw new HttpsError("unauthenticated", "Sign in required.");
  if (!(await callerIsDirector(auth))) {
    throw new HttpsError("permission-denied", "Course Directors only.");
  }

  const oldEmail = (request.data?.oldEmail || "").trim().toLowerCase();
  const newEmail = (request.data?.newEmail || "").trim().toLowerCase();
  const dryRun = !!request.data?.dryRun;

  if (!oldEmail || !oldEmail.includes("@")) throw new HttpsError("invalid-argument", "oldEmail required.");
  if (!newEmail || !newEmail.includes("@")) throw new HttpsError("invalid-argument", "newEmail required.");
  if (oldEmail === newEmail) throw new HttpsError("invalid-argument", "oldEmail and newEmail are the same.");

  // Safety: oldEmail must be genuinely dead — no people doc, no Auth account.
  const oldPeopleSnap = await db.collection("people").where("email", "==", oldEmail).get();
  if (!oldPeopleSnap.empty) {
    throw new HttpsError("failed-precondition", `${oldEmail} has its own people doc — this is a real account, not stale data. Use mergePersonEmail instead.`);
  }
  let oldAuthUser = null;
  try {
    oldAuthUser = await admin.auth().getUserByEmail(oldEmail);
  } catch (e) { /* good — no Auth account under oldEmail */ }
  if (oldAuthUser) {
    throw new HttpsError("failed-precondition", `${oldEmail} has an Auth login (uid ${oldAuthUser.uid}) — this is a real account, not stale data. Use mergePersonEmail or deleteEmptyAuthAccount instead.`);
  }

  const facRosterSnap = await db.collection("faculty_roster").where("email", "==", oldEmail).get();
  const iwRegSnap = await db.collection("iw_registrations").where("email", "==", oldEmail).get();
  const oldRespSnap = await db.collection("faculty_responses").doc(oldEmail).get();
  const newRespSnap = oldRespSnap.exists ? await db.collection("faculty_responses").doc(newEmail).get() : null;
  const oldMouSnap = await db.collection("mou_roster").doc(oldEmail).get();
  const newMouSnap = await db.collection("mou_roster").doc(newEmail).get();
  const oldMouRespSnap = await db.collection("mou_responses").doc(oldEmail).get();
  const newMouRespSnap = oldMouRespSnap.exists ? await db.collection("mou_responses").doc(newEmail).get() : null;
  const newIwSnap = await db.collection("iw_registrations").where("email", "==", newEmail).get();

  const steps = [];
  facRosterSnap.forEach(d => steps.push({ collection: "faculty_roster", docId: d.id, action: "update email field" }));

  iwRegSnap.forEach(d => {
    if (!newIwSnap.empty) {
      steps.push({ collection: "iw_registrations", docId: d.id, action: `SKIPPED — ${newEmail} already has a registration too; moving this would create a duplicate. Leaving both — sort out manually (see removeDuplicateRegistration).` });
    } else {
      steps.push({ collection: "iw_registrations", docId: d.id, action: "update email field" });
    }
  });

  if (oldRespSnap.exists) {
    steps.push(newRespSnap.exists
      ? { collection: "faculty_responses", action: `CONFLICT — a submission already exists under ${newEmail} too; the one under ${oldEmail} will be left alone, sort out manually which to keep` }
      : { collection: "faculty_responses", action: `move doc from ${oldEmail} to ${newEmail}` });
  }

  if (oldMouSnap.exists && !newMouSnap.exists) {
    steps.push({ collection: "mou_roster", action: `move doc from ${oldEmail} to ${newEmail}` });
  } else if (oldMouSnap.exists && newMouSnap.exists) {
    steps.push({ collection: "mou_roster", action: `${oldEmail} entry is now redundant (one already exists under ${newEmail}) — will be removed, the ${newEmail} entry is kept as-is` });
  }

  if (oldMouRespSnap.exists) {
    steps.push(newMouRespSnap.exists
      ? { collection: "mou_responses", action: `CONFLICT — a submission already exists under ${newEmail} too; the one under ${oldEmail} will be left alone` }
      : { collection: "mou_responses", action: `move doc from ${oldEmail} to ${newEmail}` });
  }

  if (dryRun) {
    return { dryRun: true, oldEmail, newEmail, steps };
  }

  for (const d of facRosterSnap.docs) await d.ref.update({ email: newEmail });

  if (newIwSnap.empty) {
    for (const d of iwRegSnap.docs) await d.ref.update({ email: newEmail });
  }

  if (oldRespSnap.exists && !newRespSnap.exists) {
    const data = oldRespSnap.data();
    data.email = newEmail;
    await db.collection("faculty_responses").doc(newEmail).set(data);
    await db.collection("faculty_responses").doc(oldEmail).delete();
  }

  if (oldMouSnap.exists && !newMouSnap.exists) {
    const data = oldMouSnap.data();
    data.email = newEmail;
    await db.collection("mou_roster").doc(newEmail).set(data);
    await db.collection("mou_roster").doc(oldEmail).delete();
  } else if (oldMouSnap.exists && newMouSnap.exists) {
    await db.collection("mou_roster").doc(oldEmail).delete();
  }

  if (oldMouRespSnap.exists && !newMouRespSnap.exists) {
    const data = oldMouRespSnap.data();
    data.email = newEmail;
    await db.collection("mou_responses").doc(newEmail).set(data);
    await db.collection("mou_responses").doc(oldEmail).delete();
  }

  return { dryRun: false, oldEmail, newEmail, steps, done: true };
});

/**
 * removeDuplicateRegistration — director-only.
 *
 * Deletes one iw_registrations doc, but only after confirming it's a real
 * duplicate: another confirmed registration under the same name must exist
 * at a different email. Built for the Chesca Harper case, 2026-09-18: she
 * registered for the Instructor Weekend twice, once under each of her two
 * emails.
 */
exports.removeDuplicateRegistration = onCall({ region: "us-central1" }, async (request) => {
  const auth = request.auth;
  if (!auth) throw new HttpsError("unauthenticated", "Sign in required.");
  if (!(await callerIsDirector(auth))) {
    throw new HttpsError("permission-denied", "Course Directors only.");
  }

  const docId = (request.data?.docId || "").trim();
  const dryRun = !!request.data?.dryRun;
  if (!docId) throw new HttpsError("invalid-argument", "docId required.");

  const targetSnap = await db.collection("iw_registrations").doc(docId).get();
  if (!targetSnap.exists) {
    throw new HttpsError("not-found", `No iw_registrations doc with id ${docId}.`);
  }
  const target = targetSnap.data();
  const norm = (s) => (s || "").toLowerCase().replace(/[^a-z]/g, "");
  const targetName = norm(target.name);

  const allSnap = await db.collection("iw_registrations").get();
  const others = [];
  allSnap.forEach(d => {
    if (d.id === docId) return;
    if (norm(d.data().name) === targetName) {
      others.push({ docId: d.id, ...d.data() });
    }
  });

  if (!others.length) {
    throw new HttpsError("failed-precondition", `No other registration found under the name "${target.name}" — this doesn't look like a duplicate. Refusing to delete.`);
  }

  if (dryRun) {
    return { dryRun: true, docId, toDelete: target, keeping: others };
  }

  await db.collection("iw_registrations").doc(docId).delete();
  return { dryRun: false, docId, deleted: target, kept: others, done: true };
});

/**
 * sendMouReminders / sendMouRemindersScheduled — share one core batch
 * helper (runMouReminderBatch below). Both email everyone currently on
 * mou_roster who hasn't yet submitted this academic year's MOU — the same
 * "Outstanding" list admin-mou-dashboard.html's Outstanding tab already
 * computes client-side (rosterWithStatus() there).
 *
 * sendMouReminders: on-demand (callable), director-only, fired by the
 * "Send MOU reminders" button on admin-mou-dashboard.html. Sends to
 * everyone outstanding, no matter how recently they were last reminded —
 * a director clicking the button is a deliberate one-off nudge. Added
 * 2026-09-15 at Jon's request.
 *
 * sendMouRemindersScheduled: runs automatically, no button. Only sends
 * between 1 June and 1 October each year (the MOU collection window
 * around Instructor Weekend), and only to people not reminded in the
 * last 14 days — so the effective cadence is fortnightly per person
 * regardless of how often the underlying schedule fires. No cap on total
 * reminders: keeps nudging every cycle until they submit or are taken off
 * the roster. Runs daily so the window/cooldown logic in code is the
 * single source of truth (cron month/day ranges are coarser and easy to
 * get wrong at the boundaries) — a day outside the window is a free
 * no-op, no Firestore reads. Added 2026-09-16 at Jon's request.
 *
 * CURRENT_MOU_YEAR below is a second copy of the client-side constant of
 * the same name in js/firebase-config.js — Cloud Functions run in a
 * separate Node runtime with no shared import between client and server
 * code, so this can't just reference that one. If submissions ever look
 * outstanding here when admin-mou-dashboard.html says otherwise (or vice
 * versa), check the two values still match before assuming a data bug.
 *
 * Deploy: same as sendAccountCreationReminders (RESEND_API_KEY secret
 * already shared, no new secret needed):
 *   firebase deploy --only functions
 */

const MOU_REMINDERS_COLLECTION = "mou_reminders";
const CURRENT_MOU_YEAR_SERVER  = "2026/27"; // keep in sync with js/firebase-config.js's CURRENT_MOU_YEAR
const MOU_FORM_URL             = "https://rmd.uk.com/mou-form.html";

// Fortnightly cooldown for the automatic send only — the manual button
// passes minDaysSinceLastReminder: null and always sends to everyone
// outstanding.
const AUTO_REMINDER_COOLDOWN_DAYS = 14;

// 1 June – 1 October inclusive, any year. Compared as month*100+day so the
// range check is one line and doesn't need a year. Cloud Functions' clock
// is UTC; the schedule below fires at 08:00 Europe/London, which is at
// most an hour off UTC, so a plain UTC Date is safe for a check this
// coarse (month/day only) — it can never cross a whole calendar day.
function isWithinMouReminderWindow(date) {
  const md    = (date.getUTCMonth() + 1) * 100 + date.getUTCDate();
  const start = 6 * 100 + 1;  // 1 June
  const end   = 10 * 100 + 1; // 1 October
  return md >= start && md <= end;
}

// 1 April – 1 July inclusive, any year — the senior faculty review's actual
// annual cycle, per Jon 2026-09-18: "want people to complete it after April
// 1 each year & before July 1, after July 1 it's late." Outside this
// window (e.g. right now, September, once that year's cycle is already
// wrapped up) sendSeniorFacultyReminders should not show or send anything
// — the roster shouldn't be nagged year-round just because SFR_CYCLE_YEAR
// has already been bumped forward to next year's cycle. Same month*100+day
// comparison style as isWithinMouReminderWindow above.
function isWithinSfrReminderWindow(date) {
  const md    = (date.getUTCMonth() + 1) * 100 + date.getUTCDate();
  const start = 4 * 100 + 1; // 1 April
  const end   = 7 * 100 + 1; // 1 July
  return md >= start && md <= end;
}

async function runMouReminderBatch({ dryRun, minDaysSinceLastReminder, email }) {
  const [rosterSnap, submissionsSnap, remindersSnap] = await Promise.all([
    db.collection("mou_roster").get(),
    db.collection("mou_responses").where("academicYear", "==", CURRENT_MOU_YEAR_SERVER).get(),
    db.collection(MOU_REMINDERS_COLLECTION).get()
  ]);

  const roster = rosterSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const submittedEmails = new Set(
    submissionsSnap.docs.map(d => (d.data().email || "").toLowerCase()).filter(Boolean)
  );
  const remindersByDocId = new Map(remindersSnap.docs.map(d => [d.id, d.data()]));

  const targetEmailE = (email || "").trim().toLowerCase();
  const outstanding = roster.filter(m => m.email && !submittedEmails.has(m.email.toLowerCase()) && (!targetEmailE || m.email.toLowerCase() === targetEmailE));

  if (!outstanding.length) {
    return { checked: roster.length, eligible: [], sent: 0, failed: 0, failedEmails: [] };
  }

  const now = Date.now();
  const eligible = outstanding
    .map(m => {
      const record = remindersByDocId.get(m.id) || { remindersSent: 0, lastReminderAt: null };
      return { m, record };
    })
    .filter(({ record }) => {
      if (minDaysSinceLastReminder == null) return true; // manual send — no cooldown
      if (!record.lastReminderAt) return true; // never reminded — always eligible
      const daysSince = (now - record.lastReminderAt.toMillis()) / (1000 * 60 * 60 * 24);
      return daysSince >= minDaysSinceLastReminder;
    })
    .map(({ m, record }) => ({
      docId: m.id,
      email: m.email,
      name: m.name || m.email.split("@")[0],
      role: m.role || "",
      reminderNumber: (record.remindersSent || 0) + 1
    }));

  if (dryRun) {
    return { checked: roster.length, eligible, sent: 0, failed: 0, failedEmails: [] };
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
        subject: `RMD Birmingham — please complete your ${CURRENT_MOU_YEAR_SERVER} MOU`,
        text:
`Hi ${firstName},

We don't yet have your Memorandum of Understanding on file for ${CURRENT_MOU_YEAR_SERVER}. Please take a few minutes to complete it, sign in with your existing RMD account first:

${MOU_FORM_URL}

If you've already submitted this and are getting this by mistake, just reply and let us know.

Thanks,
RMD Birmingham`
      });
      if (error) throw new Error(error.message || JSON.stringify(error));
      sent++;
      await db.collection(MOU_REMINDERS_COLLECTION).doc(person.docId).set({
        remindersSent:  person.reminderNumber,
        lastReminderAt: admin.firestore.FieldValue.serverTimestamp(),
        email:          person.email
      }, { merge: true });
    } catch (err) {
      console.error(`sendMouReminders: failed to send to ${person.email}`, err.message);
      failedEmails.push(person.email);
    }
  }

  return { checked: roster.length, eligible, sent, failed: failedEmails.length, failedEmails };
}

exports.sendMouReminders = onCall({ secrets: [resendApiKey], region: "us-central1" }, async (request) => {
  const auth = request.auth;
  if (!auth) throw new HttpsError("unauthenticated", "Sign in required.");
  if (!(await callerIsDirector(auth))) {
    throw new HttpsError("permission-denied", "Course Directors only.");
  }

  const dryRun = !!(request.data && request.data.dryRun);
  const emailFilter = request.data?.email || null;
  return runMouReminderBatch({ dryRun, minDaysSinceLastReminder: null, email: emailFilter });
});

exports.sendMouRemindersScheduled = onSchedule(
  { schedule: "0 8 * * *", timeZone: "Europe/London", secrets: [resendApiKey], region: "us-central1" },
  async () => {
    if (!isWithinMouReminderWindow(new Date())) return;
    const result = await runMouReminderBatch({ dryRun: false, minDaysSinceLastReminder: AUTO_REMINDER_COOLDOWN_DAYS });
    console.log(`sendMouRemindersScheduled: checked ${result.checked}, sent ${result.sent}, failed ${result.failed}`);
  }
);

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

// A person's email is used as the match key across several collections
// (see the doc comment above). Any collection added here later that also
// keys on email should be added to this list too.
const EMAIL_KEYED_COLLECTIONS = [
  "people", "mou_roster", "faculty_responses", "iw_registrations", "mou_responses", "faculty_roster"
];

// performEmailChange — shared by changePersonEmail (director, any account)
// and changeMyEmail (self-service, own account only). Pulled out 2026-09-15
// when changeMyEmail was added, so the two callers can't drift apart on the
// actual mechanics of a change — same Auth update, same
// EMAIL_KEYED_COLLECTIONS propagation, same retired_emails record either
// way. Callers are responsible for their own auth/permission checks and for
// deciding what oldEmailRaw is allowed to be before calling this — this
// function itself trusts whatever oldEmailRaw it's given.
async function performEmailChange(oldEmailRaw, newEmailRaw, changedByEmail) {
  oldEmailRaw = String(oldEmailRaw || "").trim();
  newEmailRaw = String(newEmailRaw || "").trim();
  const oldEmail = oldEmailRaw.toLowerCase();
  const newEmail = newEmailRaw.toLowerCase();

  if (!oldEmailRaw || !newEmailRaw) throw new HttpsError("invalid-argument", "Both the current and new email are required.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) throw new HttpsError("invalid-argument", "That doesn't look like a valid email address.");
  if (oldEmail === newEmail) throw new HttpsError("invalid-argument", "New email is the same as the current one.");

  let userRecord;
  try {
    userRecord = await admin.auth().getUserByEmail(oldEmailRaw);
  } catch (e) {
    throw new HttpsError("not-found", `No account found for ${oldEmailRaw}.`);
  }

  let newEmailTaken = true;
  try {
    await admin.auth().getUserByEmail(newEmailRaw);
  } catch (e) {
    if (e && e.code === "auth/user-not-found") {
      newEmailTaken = false;
    } else {
      throw new HttpsError("internal", "Could not verify the new email address: " + e.message);
    }
  }
  if (newEmailTaken) throw new HttpsError("already-exists", `${newEmailRaw} is already in use by another account.`);

  const uid = userRecord.uid;

  // 1) The Firebase Auth login credential itself.
  await admin.auth().updateUser(uid, { email: newEmailRaw, emailVerified: false });

  // 2) Every Firestore record matched to this person by email.
  const updatedCollections = {};
  for (const coll of EMAIL_KEYED_COLLECTIONS) {
    const seen = new Map();
    for (const candidate of new Set([oldEmailRaw, oldEmail])) {
      const snap = await db.collection(coll).where("email", "==", candidate).get();
      snap.docs.forEach(d => seen.set(d.id, d.ref));
    }
    if (!seen.size) continue;
    const batch = db.batch();
    seen.forEach(ref => batch.update(ref, { email: newEmailRaw }));
    await batch.commit();
    updatedCollections[coll] = seen.size;
  }

  // 3) Record the retirement so admin-bulk-users.html can warn a director
  //    before a future account-creation run reuses this address for an
  //    unrelated person without anyone noticing — Firebase Auth itself
  //    frees the old address for reuse the moment updateUser() above runs.
  await db.collection("retired_emails").doc(oldEmail).set({
    previousUid: uid,
    newEmail: newEmailRaw,
    changedBy: changedByEmail || null,
    changedAt: admin.firestore.FieldValue.serverTimestamp()
  });

  return { uid, updatedCollections };
}

/**
 * checkFacultyIdentityMatch — public, no sign-in required. Called by
 * faculty-form.html at submit time to catch the specific failure mode that
 * created this year's email-mismatch mess: someone who already has an
 * account (a people doc, or a mou_roster entry) fills in the open
 * faculty-form.html with a different email, quietly creating a second
 * identity instead of using their existing one.
 *
 * Deliberately narrow: matches on SURNAME only (normalized last word of
 * the stored name), not the full name — first names vary too much for the
 * same person (Tess/Theresa, Becca/Rebecca) to be a reliable signal, but
 * surnames essentially never do. This is a soft "is this you?" prompt, not
 * a hard block — faculty-form.html always lets the submission through if
 * the person says no, so a coincidental surname match between two
 * different people never actually locks anyone out, it just asks one
 * extra question.
 *
 * people docs aren't guaranteed to have a plain `name` field — some only
 * have passportFirstName/passportMiddleName/passportLastName (seen for
 * real 2026-09-15, Theresa "Tess" Brock's record is exactly this shape),
 * so candidate names fall back to those before falling back to
 * preferredName. mou_roster doesn't have this problem, it's always a
 * single combined `name` field.
 *
 * No auth required, and deliberately returns as little as possible: a
 * boolean, the matched display name, and a MASKED email (first couple of
 * characters + domain) — enough for a genuine match to recognise
 * themselves, not enough for this open endpoint to be usable to scrape
 * the full roster's real email addresses one guess at a time.
 *
 * Deploy: same as the other functions above, no new secret needed:
 *   firebase deploy --only functions
 */
function normSurname(fullName) {
  const parts = String(fullName || "").trim().split(/\s+/).filter(Boolean);
  return parts.length ? parts[parts.length - 1].toLowerCase() : "";
}

function candidateName(p) {
  if (p.name) return p.name;
  const passport = [p.passportFirstName, p.passportMiddleName, p.passportLastName].filter(Boolean).join(" ");
  return passport || p.preferredName || "";
}

function maskEmail(email) {
  const s = String(email || "");
  const at = s.indexOf("@");
  if (at <= 0) return "***";
  const local = s.slice(0, at);
  const domain = s.slice(at);
  const shown = local.length <= 2 ? (local[0] || "") : local.slice(0, 2);
  return `${shown}***${domain}`;
}

exports.checkFacultyIdentityMatch = onCall({ region: "us-central1" }, async (request) => {
  const lastName = String((request.data && request.data.lastName) || "").trim();
  const submittedEmail = String((request.data && request.data.email) || "").trim().toLowerCase();

  const targetSurname = normSurname(lastName);
  if (!targetSurname) return { matchFound: false };

  const [peopleSnap, rosterSnap] = await Promise.all([
    db.collection("people").get(),
    db.collection("mou_roster").get()
  ]);

  const candidates = [
    ...peopleSnap.docs.map(d => d.data()),
    ...rosterSnap.docs.map(d => d.data())
  ];

  const match = candidates.find(p => {
    const email = String(p.email || "").trim().toLowerCase();
    if (!email || (submittedEmail && email === submittedEmail)) return false; // no email, or same email — not a mismatch
    return normSurname(candidateName(p)) === targetSurname;
  });

  if (!match) return { matchFound: false };

  return {
    matchFound: true,
    name: candidateName(match),
    maskedEmail: maskEmail(match.email)
  };
});

exports.changePersonEmail = onCall({ region: "us-central1" }, async (request) => {
  const auth = request.auth;
  if (!auth) throw new HttpsError("unauthenticated", "Sign in required.");
  if (!(await callerIsDirector(auth))) throw new HttpsError("permission-denied", "Director access required.");

  const oldEmailRaw = String((request.data && request.data.oldEmail) || "").trim();
  const newEmailRaw = String((request.data && request.data.newEmail) || "").trim();

  return performEmailChange(oldEmailRaw, newEmailRaw, auth.token.email || null);
});

/**
 * changeMyEmail — any signed-in member, self-service only. Same mechanics
 * as changePersonEmail (Auth login + every EMAIL_KEYED_COLLECTIONS record +
 * retired_emails), but the "old email" is always taken from the caller's
 * own verified ID token (auth.token.email), never from client-supplied
 * data — that's what makes this safe to expose to non-directors. There is
 * no path in this function for a signed-in member to change anyone's email
 * but their own. Built 2026-09-15 for my-account.html's "change my email"
 * button, so a person moving on from their university address (graduating,
 * changing job) updates their one account instead of a fresh form
 * submission quietly creating a second one — see [[rmd-uk]] memory note on
 * the faculty-form.html email-mismatch root cause this is meant to close.
 *
 * Deploy: same as changePersonEmail (no new secret needed):
 *   firebase deploy --only functions
 */
exports.changeMyEmail = onCall({ region: "us-central1" }, async (request) => {
  const auth = request.auth;
  if (!auth) throw new HttpsError("unauthenticated", "Sign in required.");
  const oldEmailRaw = auth.token.email;
  if (!oldEmailRaw) throw new HttpsError("failed-precondition", "Your account has no email on file — contact a director.");

  const newEmailRaw = String((request.data && request.data.newEmail) || "").trim();

  return performEmailChange(oldEmailRaw, newEmailRaw, oldEmailRaw);
});

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

    // Resolve the person's real Auth UID so the doc is keyed the way
    // resolveRole() looks it up (people/{uid}) — an auto-ID doc is
    // invisible to a live sign-in's role resolution even though the data
    // looks correct on inspection. (Root cause fixed 2026-09-04 — see
    // rmd_website_iw_account_role_sync_bug project memory note.)
    let uid = null;
    try {
      uid = (await admin.auth().getUserByEmail(email)).uid;
    } catch (err) {
      if (err.code !== "auth/user-not-found") throw err;
    }

    if (uid) {
      const existingDoc = await db.collection("people").doc(uid).get();
      if (existingDoc.exists) {
        if (after.syncFlag) await regRef.update({ syncFlag: admin.firestore.FieldValue.delete() });
        return; // already has a correctly UID-keyed doc — never overwrite
      }
      await db.collection("people").doc(uid).set({
        name: after.name || "",
        email,
        role: mappedRole,
        syncedFrom: "iw_registrations",
        syncedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      if (after.syncFlag) await regRef.update({ syncFlag: admin.firestore.FieldValue.delete() });
      return;
    }

    // No Auth account yet — nothing to key by. Same fallback as before
    // (an orphan auto-ID doc); whoever creates their account later will
    // need to re-run this sync (or the manual button) to pick up the fix.
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
  let outstanding = all.filter(p => p.email);
  const skippedNoEmail = all.length - outstanding.length;

  const targetEmailC = (request.data?.email || "").trim().toLowerCase();
  if (targetEmailC) outstanding = outstanding.filter(p => (p.email || "").toLowerCase() === targetEmailC);

  const dryRun = !!request.data?.dryRun;
  if (dryRun) {
    return { dryRun: true, outstanding, skippedNoEmail, total: all.length };
  }

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

/**
 * sendFacultyFormInvites — director-only.
 *
 * Emails RMD Senior Faculty and/or RMD Student Faculty on mou_roster a
 * personalised link to faculty-form.html carrying their own email address
 * as a URL param (?email=...), so the form arrives with the email field
 * already filled in — most of these people are already known to us from a
 * prior year's mou_roster or faculty_responses submission. For anyone who
 * has submitted faculty-form.html before under that address, the page's
 * existing checkExistingSubmission() logic then reloads their whole prior
 * submission automatically, exactly as it would if they'd typed the email
 * themselves — see the "Personalised invite prefill" block at the bottom of
 * faculty-form.html.
 *
 * Deliberately scoped to mou_roster roles "RMD Senior Faculty" and
 * "RMD Student Faculty" only (see FACULTY_FORM_INVITE_ROLES) — every other
 * mou_roster role (Instructor, Assessor, Senior Instructor) is a course
 * candidate/assessor tracked through iw_registrations instead, with its own
 * separate invite flow (see importFromRoster in admin-iw-registrations.html
 * and sendIwRsvpInvites above). Never point this at those roles — they'd
 * end up with two different, conflicting invites for the same weekend.
 *
 * Trust model: same as every other RSVP-style link in this codebase (see
 * sendIwRsvpInvites above) — the email address in the URL is the only
 * "credential"; anyone who gets hold of the link could submit as that
 * person. Low-stakes (an attendance/logistics form, not an account) and
 * consistent with existing precedent; the email field stays editable on the
 * page so a forwarded link can be corrected rather than silently misused.
 *
 * Deploy: same as the other reminder functions — RESEND_API_KEY secret is
 * shared, no new secret needed.
 *
 * Call with { dryRun: true } (roles optional, same default) to compute and
 * return exactly who this would email — name, email, role — without
 * sending anything or writing to faculty_form_invites. Use this to verify
 * a fresh deploy actually works before the button is used for real,
 * especially useful the first time this runs a year after being built,
 * and any time it might otherwise land on top of another invite already
 * going out for the same weekend.
 */

const FACULTY_FORM_URL          = "https://rmd.uk.com/faculty-form.html";
const FACULTY_FORM_INVITE_ROLES = ["RMD Senior Faculty", "RMD Student Faculty"];
const FACULTY_FORM_INVITES_COLLECTION = "faculty_form_invites";

exports.sendFacultyFormInvites = onCall({ secrets: [resendApiKey], region: "us-central1" }, async (request) => {
  const auth = request.auth;
  if (!auth) throw new HttpsError("unauthenticated", "Sign in required.");
  if (!(await callerIsDirector(auth))) {
    throw new HttpsError("permission-denied", "Course Directors only.");
  }

  const requestedRoles = Array.isArray(request.data?.roles) && request.data.roles.length
    ? request.data.roles
    : FACULTY_FORM_INVITE_ROLES;
  const roles = requestedRoles.filter(r => FACULTY_FORM_INVITE_ROLES.includes(r));
  if (!roles.length) {
    throw new HttpsError("invalid-argument", "No valid roles requested — must be RMD Senior Faculty and/or RMD Student Faculty.");
  }

  const dryRun = !!request.data?.dryRun;

  // 2026-09-18 fix: this used to list everyone on the roster in scope,
  // full stop — it never checked who had actually submitted, so the
  // "outstanding" list (and the Reminder Hub's "Faculty form incomplete"
  // chip) included plenty of people who'd already responded. Now it
  // excludes anyone with a faculty_responses doc, same pattern as
  // runMouReminderBatch's submittedEmails check above.
  const [snap, responsesSnap] = await Promise.all([
    db.collection("mou_roster").get(),
    db.collection("faculty_responses").get()
  ]);
  const submittedEmails = new Set(
    responsesSnap.docs.map(d => (d.data().email || "").toLowerCase()).filter(Boolean)
  );
  const all = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(m => roles.includes(m.role));
  let outstanding = all.filter(m => m.email && !submittedEmails.has(m.email.toLowerCase()));
  const skippedNoEmail = all.filter(m => !m.email).length;

  const targetEmailD = (request.data?.email || "").trim().toLowerCase();
  if (targetEmailD) outstanding = outstanding.filter(m => (m.email || "").toLowerCase() === targetEmailD);

  if (dryRun) {
    return {
      dryRun: true,
      roles,
      total: all.length,
      skippedNoEmail,
      wouldSend: outstanding.map(p => ({ name: p.name || "", email: p.email, role: p.role }))
    };
  }

  if (!outstanding.length) {
    return { sent: 0, failed: 0, failedEmails: [], skippedNoEmail, total: all.length };
  }

  const resend = new Resend(resendApiKey.value());

  let sent = 0;
  const failedEmails = [];
  const sentTo = [];

  for (const person of outstanding) {
    const firstName = (person.name || "").split(" ")[0] || "there";
    // No ?code= needed — a personalised link (own email in the URL) is
    // self-authorising against faculty-form.html's link gate. See the
    // "hasEmailParam" note in that file's gate script.
    const link = `${FACULTY_FORM_URL}?email=${encodeURIComponent(person.email)}`;
    try {
      const { error } = await resend.emails.send({
        from: FROM_EMAIL,
        to: person.email,
        bcc: JON_BCC,
        replyTo: REPLY_TO,
        subject: "RMD Instructor Weekend — your details",
        text:
`Hi ${firstName},

Please confirm your attendance and details for the RMD Instructor Weekend using the link below — it already has your email address filled in, so you shouldn't need to retype it:

${link}

You can confirm, submit as pending and update later (but we then know who to follow up if we haven't heard), or let us know that you won't be there. Whichever it is, please do submit a reply.

If you've done so already, thank you.

Best wishes

Jon`
      });
      if (error) throw new Error(error.message || JSON.stringify(error));
      sent++;
      sentTo.push(person.email);
    } catch (err) {
      console.error(`sendFacultyFormInvites: failed to send to ${person.email}`, err.message);
      failedEmails.push(person.email);
    }
  }

  await db.collection(FACULTY_FORM_INVITES_COLLECTION).add({
    roles,
    sentTo,
    failedEmails,
    sentAt: admin.firestore.FieldValue.serverTimestamp(),
    sentByUid: auth.uid,
    sentByEmail: (auth.token.email || "").toLowerCase()
  });

  return { sent, failed: failedEmails.length, failedEmails, skippedNoEmail, total: all.length };
});


/**
 * syncIwRegistrationsToPeople — director-only.
 *
 * Backs the "Sync to People" button on admin-iw-registrations.html
 * (backup-only manual re-run of what syncIwRegistrationToPeople normally
 * does automatically on confirm). Moved server-side specifically so it can
 * resolve each person's real Auth UID via admin.auth().getUserByEmail() —
 * the client SDK has no equivalent, so the old client-side version could
 * only ever db.collection("people").add() an auto-ID doc, which is
 * invisible to resolveRole()'s people/{uid} lookup. Same root-cause fix as
 * syncIwRegistrationToPeople above (2026-09-04) — keep both in sync if this
 * logic changes again.
 *
 * Call with { dryRun: true } to preview without writing (mirrors the
 * pattern used by sendFacultyFormInvites/sendAccountCreationReminders).
 */
exports.syncIwRegistrationsToPeople = onCall({ region: "us-central1" }, async (request) => {
  const auth = request.auth;
  if (!auth) throw new HttpsError("unauthenticated", "Sign in required.");
  if (!(await callerIsDirector(auth))) {
    throw new HttpsError("permission-denied", "Course Directors only.");
  }

  const dryRun = !!request.data?.dryRun;

  const regSnap = await db.collection(IW_COLL).where("status", "==", "confirmed").get();
  const confirmed = regSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  const results = { synced: [], alreadySynced: [], unresolvedRole: [], noAuthAccount: [] };

  for (const person of confirmed) {
    const email = (person.email || "").toLowerCase().trim();
    const mappedRole = IW_TO_PEOPLE_ROLE[person.role];

    if (!email || !mappedRole) {
      results.unresolvedRole.push({ name: person.name, email: person.email, role: person.role });
      continue;
    }

    let uid = null;
    try {
      uid = (await admin.auth().getUserByEmail(email)).uid;
    } catch (err) {
      if (err.code !== "auth/user-not-found") throw err;
    }

    if (!uid) {
      results.noAuthAccount.push({ name: person.name, email });
      continue;
    }

    const existingDoc = await db.collection("people").doc(uid).get();
    if (existingDoc.exists) {
      results.alreadySynced.push({ name: person.name, email });
      continue;
    }

    if (!dryRun) {
      await db.collection("people").doc(uid).set({
        name: person.name || "",
        email,
        role: mappedRole,
        roleLabel: person.role,
        syncedFrom: "iw_registrations",
        syncedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }
    results.synced.push({ name: person.name, email, role: mappedRole });
  }

  return { dryRun, ...results };
});
