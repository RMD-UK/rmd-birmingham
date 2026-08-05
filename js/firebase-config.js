/**
 * RMD Platform — Firebase Configuration
 *
 * Replace the placeholder values below with your actual Firebase project credentials.
 * To get these: Firebase Console → Project Settings → Your apps → SDK setup and configuration
 *
 * IMPORTANT: Do NOT commit real API keys to a public GitHub repository.
 * Use GitHub Actions secrets or a .env file excluded via .gitignore for production.
 * Firebase API keys for web apps can be restricted by domain in the Firebase console.
 */

const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyA-JnvJ3cwpIRs_JKnfCgN0CqC-qO7YisM",
  authDomain:        "rmd-instructor-weekend.firebaseapp.com",
  projectId:         "rmd-instructor-weekend",
  storageBucket:     "rmd-instructor-weekend.firebasestorage.app",
  messagingSenderId: "564697857052",
  appId:             "1:564697857052:web:28364d4b41c18e76c5b3d9",
  measurementId:     "G-SM9M69ZM9J"
};

// ── Firestore collection names ──────────────────────────────────────────────
const COLLECTIONS = {
  people:      "people",        // all participants (candidates + faculty)
  attendance:  "attendance",    // arrival timestamps
  sessions:    "sessions",      // programme sessions (if managed via Firestore)
  assessments: "assessments",   // candidate assessment records
  messages:    "messages",      // broadcast messages (room screens + noticeboard)
  rooms:       "rooms",         // room state (timer, current message)
  feedback:    "feedback",      // faculty voice feedback (transcripts)
  itcObs:      "itc_observations", // ITC observation records
  groups:      "groups",         // room assignments: IT + candidates + ITC rotation
  mouResponses: "mou_responses", // annual Memorandum of Understanding submissions
  mouRoster:    "mou_roster",    // expected RMD Birmingham member roster (for MOU completion tracking)
  sfrResponses: "senior_faculty_review",           // annual senior faculty review & future-plans submissions
  sfrReminders: "senior_faculty_review_reminders", // log of reminder email batches sent by admin-senior-faculty-review.html
  facultyRoster:    "faculty_roster",    // director-only annual roster (name, email, group, team, role) — see below
  facultyDirectory: "faculty_directory", // public display copy of the same roster, no email — feeds faculty.html
  iwRegistrations:  "iw_registrations",  // director-managed Instructor Weekend attendee list — see admin-iw-registrations.html
  iwAssessorRsvp:   "iw_assessor_rsvp"   // self-service Y/N attendance RSVP for Assessors/Senior Instructors — see iw-rsvp.html
};

// ── Memorandum of Understanding ─────────────────────────────────────────────
// Bump this every academic year — drives the form's locked "year" field and
// the dashboard's completion matching. Nothing else needs to change annually.
const CURRENT_MOU_YEAR = "2026/27";

// ── Senior faculty annual review & future plans ─────────────────────────────
// Built 2026-07-27 for first live use in the June/July 2027 review cycle
// (Jon ran the 2026 round via a Google Form). Bump SFR_CYCLE_YEAR and
// SFR_NEXT_ACADEMIC_YEAR every June/July before that year's round opens —
// nothing else needs to change annually.
//
// Roster comes from faculty_roster (group == "senior") — see below —
// deliberately NOT derived from people.role. The "senior faculty" shown on
// faculty.html?group=senior (Course Director, Finance, Research, Guidelines,
// Assessors, etc.) is a broader/different set than people docs with role
// full-instructor/assessor-faculty — several named individuals (e.g.
// Finance, Research) have no teaching role at all and likely no people doc
// to match against.
const SFR_CYCLE_YEAR        = "2027";     // the calendar year this review round runs in (June/July 2027)
const SFR_NEXT_ACADEMIC_YEAR = "2027/28"; // the academic year the form is asking people to plan for

// ── Annual faculty roster (single source for both faculty.html groups) ─────
// Built 2026-07-27: one bulk paste on admin-faculty-roster.html each year
// replaces both collections below, replacing the old approach of a
// hand-edited FACULTY object baked into faculty.html and a separately
// pasted senior_faculty_roster. Split into two collections because one of
// them holds email addresses and must NOT be publicly readable:
//   - faculty_roster    (director-only): name, email, group ("student"/
//     "senior"), team, role, photo, order. Feeds admin-senior-faculty-review.html
//     and the reminder Cloud Function.
//   - faculty_directory (public, read: true): same minus email. Feeds the
//     public faculty.html page. Never add an email field here.
// "order" is the row's position in the pasted list, preserved so faculty.html
// can group by team in the order Jon pasted them, same as the old hardcoded
// object's insertion order.

// ── Rooms ───────────────────────────────────────────────────────────────────
const INSTRUCTOR_ROOMS = ["CM01","CM02","CM03","CM04","CM13","CM14","CM15","CM16"];

// ── Roles ───────────────────────────────────────────────────────────────────
const ROLES = {
  DIRECTOR:        "director",
  FACULTY:         "faculty",
  INSTRUCTOR:      "instructor",       // instructor candidate
  ASSESSOR:        "assessor",         // assessor / senior instructor candidate
  ITC:             "itc",              // instructor trainer candidate (rotates rooms)
  FULL_INSTRUCTOR: "full-instructor",  // instructor trainer (senior tier)
  ASSESSOR_FACULTY: "assessor-faculty" // assessor faculty (senior tier, mirrors full-instructor)
};

// ── Stream-scoped message audiences ─────────────────────────────────────────
// Which roles receive a "messages" doc sent with target "instructor-stream" /
// "assessor-stream" (timetable.html noticeboard listener + room screens).
// Decided 2026-07-21: candidates (instructor/assessor roles) are never
// included in either stream; each stream also excludes the other stream's
// dedicated faculty. Mirrored in firestore.rules for the write side —
// keep both in sync if these change.
const INSTRUCTOR_STREAM_RECIPIENTS = ["director", "faculty", "full-instructor", "itc", "logistics"];
const ASSESSOR_STREAM_RECIPIENTS   = ["director", "assessor-faculty", "logistics"];

// ── Director access ─────────────────────────────────────────────────────────
// No hardcoded emails (removed 2026-07-29 — personal emails should not live
// in a public repo). Director status now comes solely from
// config/platform.directors or people/{uid}.role. Any page that gates on
// director role should use resolveRole() / requireDirector() from this file.
// config/platform.directors already contains all current directors as of
// 2026-07-29 — confirmed before this change shipped.
//
// DIRECTOR_EMAILS is kept as an empty array purely so pages that still
// reference it directly (assessment-gateway.html, admin-faculty-responses.html,
// admin-mou-dashboard.html, signin.html, admin-room-allocation.html) don't
// throw ReferenceError. Those pages should be migrated to read
// config/platform.directors directly, same as resolveRole() below, then this
// can be deleted.
const DIRECTOR_EMAILS = [];

// resolveRole(uid, email) → role string or null
// 1. Checks config/platform directors array
// 2. Falls back to people/{uid} in Firestore for role field
// db must be initialised before calling.
async function resolveRole(uid, email) {
  const el = (email || "").toLowerCase();
  try {
    const cfg = await db.collection("config").doc("platform").get();
    const extra = cfg.exists ? (cfg.data().directors || []) : [];
    if (extra.map(x => x.toLowerCase()).includes(el)) return ROLES.DIRECTOR;
  } catch(e) {}
  try {
    const snap = await db.collection(COLLECTIONS.people).doc(uid).get();
    if (snap.exists && snap.data().role) return snap.data().role;
  } catch(e) {}
  return null;
}

// requireDirector() — call on director-only pages instead of writing auth
// logic inline. Waits for auth state, resolves role, redirects if not director.
// ── Self-service password reset ─────────────────────────────────────────────
// Sends a Firebase "reset your password" email directly via the REST API —
// works whether or not the caller is currently signed in. Deliberately
// swallows EMAIL_NOT_FOUND so callers always show the same generic outcome
// message rather than letting a page reveal which emails have accounts.
// continueUrl controls where the "back to site" link on the reset
// confirmation page points afterward (defaults to the site root).
//
// 2026-07-23 incident: continueUrl pointing at rmd.uk.com made every request
// fail with "UNAUTHORIZED_DOMAIN" because rmd.uk.com wasn't yet in Firebase
// Console → Authentication → Settings → Authorized domains — this silently
// broke password resets for real members (Anisha, Amelie, Isabel, Bonheur
// all reported it the same evening). Jon added rmd.uk.com to Authorized
// domains same day; confirmed fixed via a live test call before restoring
// continueUrl here. If this ever breaks again, test with/without continueUrl
// via a raw fetch to isolate it before assuming it's an account-specific
// problem — see [[project_mou]] for the full diagnosis.
async function requestPasswordReset(email, continueUrl) {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${FIREBASE_CONFIG.apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requestType: "PASSWORD_RESET",
        email,
        continueUrl: continueUrl || (window.location.origin + "/index.html"),
        canHandleCodeInApp: false
      })
    }
  );
  const data = await res.json();
  if (data.error && data.error.message !== "EMAIL_NOT_FOUND") {
    throw new Error(data.error.message);
  }
}

// Usage:
//   initFirebase();
//   requireDirector().then(user => { /* load page content */ });
//
// Expects an element with id="authMsg" for the rejection message (optional).
function requireDirector(redirectTo) {
  redirectTo = redirectTo || "timetable.html";
  return new Promise(function(resolve) {
    auth.onAuthStateChanged(async function(user) {
      if (!user) { window.location.href = "signin.html"; return; }
      const role = await resolveRole(user.uid, user.email || "");
      if (role !== ROLES.DIRECTOR) {
        var msg = document.getElementById("authMsg");
        if (msg) msg.textContent = "Course Directors only.";
        setTimeout(function() { window.location.href = redirectTo; }, 1500);
        return;
      }
      resolve(user);
    });
  });
}

// ── Firebase initialisation (loaded after firebase SDK scripts) ──────────────
let db, auth, storage;

// App Check — reCAPTCHA v3 site key (public value, safe to commit; the
// matching secret key lives in the Google reCAPTCHA admin console, never here).
// Registered 2026-07-30. Enforcement is left OFF in the Firebase console
// initially (monitor mode) — flip Firestore/Functions to "Enforced" only after
// confirming real traffic isn't being blocked.
const APP_CHECK_SITE_KEY = "6LcPHG0tAAAAAANZP4xynIbIc3h8dtwKZrtGpc0G";

function initFirebase() {
  if (typeof firebase === "undefined") {
    console.warn("Firebase SDK not loaded — running in offline/demo mode.");
    return false;
  }
  firebase.initializeApp(FIREBASE_CONFIG);
  // 2026-08-05: App Check activation disabled as a stopgap — the reCAPTCHA
  // v3 site key's domain list doesn't include rmd.uk.com (or is owned by an
  // account we couldn't locate), so the token-fetch call was 400ing and
  // throttling, which cascaded into breaking unrelated Firestore reads on
  // pages like faculty.html. Firestore enforcement was already left in
  // "monitor mode" (off) in the Firebase console, so this shouldn't change
  // what's actually enforced — re-enable once the domain/account issue is
  // fixed and confirmed working. See [[rmd-appcheck-recaptcha-stopgap]].
  if (false && firebase.appCheck) {
    firebase.appCheck().activate(APP_CHECK_SITE_KEY, true);
  } else {
    // Page didn't load firebase-app-check-compat.js — requests from it won't
    // carry an App Check token. Fine while enforcement is off; must be fixed
    // on every page before enforcement is turned on.
    console.warn("Firebase App Check SDK not loaded on this page.");
  }
  db      = firebase.firestore();
  auth    = firebase.auth();
  storage = firebase.storage ? firebase.storage() : null;
  console.log("Firebase initialised.");
  return true;
}
