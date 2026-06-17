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
  DIRECTOR:   "director",
  FACULTY:    "faculty",
  INSTRUCTOR: "instructor",   // instructor candidate
  ASSESSOR:   "assessor",     // assessor candidate
  ITC:        "itc"           // instructor trainer candidate (rotates rooms)
};

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
