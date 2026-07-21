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
  mouRoster:    "mou_roster"     // expected RMD Birmingham member roster (for MOU completion tracking)
};

// ── Memorandum of Understanding ─────────────────────────────────────────────
// Bump this every academic year — drives the form's locked "year" field and
// the dashboard's completion matching. Nothing else needs to change annually.
const CURRENT_MOU_YEAR = "2026/27";

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
// Canonical list of director emails. Any page that gates on director role
// should use resolveRole() / requireDirector() from this file rather than
// maintaining its own copy of this list.
const DIRECTOR_EMAILS = [
  "console_brews.6f@icloud.com",
  "j.hulme.1@bham.ac.uk"
];

// resolveRole(uid, email) → role string or null
// 1. Checks DIRECTOR_EMAILS (hardcoded directors)
// 2. Falls back to config/platform directors array
// 3. Falls back to people/{uid} in Firestore for role field
// db must be initialised before calling.
//
// Director checks run FIRST and win outright. This is deliberate: director
// status granted via config/platform.directors (e.g. the "Make director"
// button in admin-faculty-responses.html) must work even for someone who
// already has a people/{uid} record with an unrelated role (faculty,
// instructor, etc. — true for most bulk-imported staff). Checking people/{uid}
// first, as this used to, silently masked director promotion for anyone
// already in the people collection.
async function resolveRole(uid, email) {
  const el = (email || "").toLowerCase();
  if (DIRECTOR_EMAILS.map(x => x.toLowerCase()).includes(el)) return ROLES.DIRECTOR;
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

function initFirebase() {
  if (typeof firebase === "undefined") {
    console.warn("Firebase SDK not loaded — running in offline/demo mode.");
    return false;
  }
  firebase.initializeApp(FIREBASE_CONFIG);
  db      = firebase.firestore();
  auth    = firebase.auth();
  storage = firebase.storage ? firebase.storage() : null;
  console.log("Firebase initialised.");
  return true;
}
