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
 * Deploy (from the RMD website repo root, Jon's own machine — this cannot
 * be run from a Cowork sandbox, no network route to *.googleapis.com):
 *   cd functions && npm install
 *   firebase functions:secrets:set ANTHROPIC_API_KEY
 *   firebase deploy --only functions
 *
 * Requires the Blaze plan (done 2026-07-09) and a funded Anthropic API
 * console account (console.anthropic.com — separate from Claude.ai billing).
 */

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const Anthropic = require("@anthropic-ai/sdk");

admin.initializeApp();
const db = admin.firestore();

const anthropicApiKey = defineSecret("ANTHROPIC_API_KEY");

// Mirrors DIRECTOR_EMAILS in js/firebase-config.js and firestore.rules —
// keep these three in sync if the director list ever changes.
const DIRECTOR_EMAILS = [
  "console_brews.6f@icloud.com",
  "j.hulme.1@bham.ac.uk"
];

// Mirrors the DIMENSIONS/SCALE_LABELS constants in itc-observations.html.
const DIMENSIONS = [
  { key: "clarity",    label: "Clarity of instruction" },
  { key: "engagement", label: "Candidate engagement" },
  { key: "accuracy",   label: "Technical accuracy" },
  { key: "space",      label: "Management of teaching space" },
  { key: "response",   label: "Response to difficulty or questions" }
];
const SCALE_LABELS = ["Needs development", "Developing", "Meeting expectations", "Exceeding expectations"];

async function callerIsDirector(auth) {
  const email = (auth.token.email || "").toLowerCase();
  if (DIRECTOR_EMAILS.includes(email)) return true;
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
