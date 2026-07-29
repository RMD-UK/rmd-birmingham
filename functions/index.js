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
 * Cadence: first reminder 3 days after creation, then every 7 days, capped at
 * 3 reminders total per person. Tracked in account_reminders/{uid}
 * (remindersSent, lastReminderAt) — written only by this function.
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
const FIRST_REMINDER_DAYS  = 3;
const REPEAT_REMINDER_DAYS = 7;
const MAX_REMINDERS        = 3;

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

    const record = remindersByUid.get(u.uid) || { remindersSent: 0, lastReminderAt: null };
    if (record.remindersSent >= MAX_REMINDERS) continue;

    let due;
    if (record.remindersSent === 0) {
      due = daysSinceCreation >= FIRST_REMINDER_DAYS;
    } else {
      const lastMs = record.lastReminderAt ? record.lastReminderAt.toMillis() : 0;
      due = (now - lastMs) / 86400000 >= REPEAT_REMINDER_DAYS;
    }
    if (!due) continue;

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
