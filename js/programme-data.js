/**
 * RMD Instructor Weekend 2026 — Programme Data
 *
 * Source: 2025 programme (xlsx). Update timings/sessions for 2026.
 * Assessor/Senior Instructor stream (Saturday + Sunday) — added 2026-07-18 from Jon's
 * draft deck ("BLS assessor course 2026.pptx"). Locations mostly TBC pending Naveed's
 * confirmation; timings and session content are as specified in the deck.
 *
 * Session roles:
 *   "all"        — everyone sees this
 *   "director"   — course director only
 *   "faculty"    — faculty (including director)
 *   "instructor" — instructor candidates
 *   "assessor"   — assessor candidates
 *
 * Resource links: replace Google Doc URLs with platform-hosted paths once uploaded.
 */

const PROGRAMME = {

  friday: {
    label: "Friday 9 Oct",
    date: "Friday 9 October 2026",
    sessions: [
      {
        id: "fri-1",
        start: "18:00",
        duration: 60,
        title: "Faculty Arrival",
        location: "TBC",
        lead: "",
        roles: ["faculty", "director"],
        notes: "Arrival and informal networking before the meeting.",
        resources: [],
        tags: []
      },
      {
        id: "fri-2",
        start: "19:00",
        duration: 120,
        title: "Faculty Meeting & Dinner",
        location: "TBC",
        lead: "Jon",
        roles: ["faculty", "director"],
        notes: "Briefing for the weekend. Includes catered meal — headcount confirmed pre-course.",
        resources: [],
        tags: ["faculty-only"]
      }
    ]
  },

  saturday: {
    label: "Saturday 10 Oct",
    date: "Saturday 10 October 2026",
    sessions: [
      {
        id: "sat-0",
        start: "07:45",
        duration: 15,
        title: "Faculty Meeting",
        location: "WF15",
        lead: "Jon",
        roles: ["faculty", "director"],
        notes: "Pre-course briefing for faculty before candidates arrive.",
        resources: [],
        tags: ["faculty-only"]
      },
      {
        id: "sat-1",
        start: "08:00",
        duration: 45,
        title: "Registration",
        location: "ATH",
        lead: "Student faculty",
        roles: ["all"],
        notes: "Report to the registration desk on arrival.",
        resources: [],
        tags: []
      },
      {
        id: "sat-2",
        start: "08:45",
        duration: 30,
        title: "Plenary Introduction & Welcome",
        location: "ATH",
        lead: "Jon",
        roles: ["all"],
        notes: "",
        resources: [
          { title: "Intro slides", path: "resources/1-intro-to-weekend.html", icon: "📊" }
        ],
        tags: []
      },
      {
        id: "sat-3",
        start: "09:15",
        duration: 20,
        title: "Equipment Demonstration",
        location: "ATH",
        lead: "",
        roles: ["all"],
        notes: "",
        resources: [
          { title: "QCPR App", url: "https://laerdal.com/gb/products/simulation-training/resuscitation-training/qcpr-app/", icon: "📱" }
        ],
        tags: []
      },
      {
        id: "sat-4",
        start: "09:35",
        duration: 30,
        title: "Equipment Practice",
        location: "Teaching rooms",
        lead: "Room faculty lead",
        roles: ["all"],
        notes: "",
        resources: [],
        tags: []
      },
      {
        id: "sat-6",
        start: "10:10",
        duration: 20,
        title: "Plenary Lecture: BLS/AED",
        location: "ATH",
        lead: "",
        roles: ["instructor", "faculty", "director"],
        notes: "",
        resources: [
          { title: "BLS/AED slides", path: "resources/2-bls-aed-lecture.html", icon: "📊" }
        ],
        tags: []
      },
      {
        id: "sat-7",
        start: "10:30",
        duration: 15,
        title: "Plenary Demonstration: BLS/AED",
        location: "ATH",
        lead: "",
        roles: ["instructor", "faculty", "director"],
        notes: "",
        resources: [],
        tags: []
      },
      {
        id: "sat-8",
        start: "10:45",
        duration: 60,
        title: "Group Practice: BLS/AED",
        subtitle: "Including: Closing the Gender Gap",
        location: "Teaching rooms",
        lead: "Room faculty lead",
        roles: ["instructor", "faculty", "director"],
        notes: "Small group practice. ⚠ Gateway assessment: all Instructor Candidates must pass the BLS/AED competency check by 12:00 noon. Candidates who have not passed by noon cannot progress to the afternoon instructor development sessions.",
        resources: [
          { title: "Session guide", path: "resources/provider/3-bls-aed-practice.html", icon: "📄" }
        ],
        tags: ["gateway-deadline"]
      },
      {
        id: "sat-9",
        start: "11:45",
        duration: 15,
        title: "Break",
        location: "",
        lead: "",
        roles: ["all"],
        notes: "",
        resources: [],
        tags: ["break", "gateway-deadline"]
      },
      {
        id: "sat-10",
        start: "12:00",
        duration: 30,
        title: "Plenary Lecture: First Aid",
        location: "ATH",
        lead: "",
        roles: ["instructor", "faculty", "director"],
        notes: "",
        resources: [
          { title: "First Aid slides", path: "resources/3-first-aid.html", icon: "📊" },
          { title: "Catastrophic haemorrhage slides", path: "resources/3a-catastrophic-haemorrhage.html", icon: "📊" }
        ],
        tags: []
      },
      {
        id: "sat-11",
        start: "12:30",
        duration: 60,
        title: "Group Practice: First Aid & Catastrophic Haemorrhage",
        location: "Teaching rooms",
        lead: "Room faculty lead",
        roles: ["instructor", "faculty", "director"],
        notes: "To include: Choking, Bleeding, Recovery position, Drowning, Paediatrics.",
        resources: [
          { title: "Session guide", path: "resources/provider/5-first-aid-practice.html", icon: "📄" }
        ],
        tags: []
      },
      {
        id: "sat-12",
        start: "13:30",
        duration: 45,
        title: "Lunch",
        location: "WF19",
        lead: "Logistics team",
        roles: ["all"],
        notes: "Faculty meeting in WF15 during lunch — gateway results reviewed and confirmed.",
        resources: [],
        tags: ["break"]
      },

      // ── Assessor / Senior Instructor stream (Saturday) — from draft deck, 2026-07-18 ──
      {
        id: "sat-assessor-1",
        start: "09:30",
        duration: 30,
        title: "Assessor Course Introduction",
        location: "WF15",
        lead: "Naveed",
        roles: ["assessor", "faculty", "director"],
        notes: "For assessor candidates and senior instructors.",
        resources: [],
        tags: ["assessor-stream"]
      },
      {
        id: "sat-assessor-2",
        start: "10:00",
        duration: 120,
        title: "BLS Provider Recertification",
        location: "TBC",
        lead: "",
        roles: ["assessor", "faculty", "director"],
        notes: "",
        resources: [],
        tags: ["assessor-stream"]
      },
      {
        id: "sat-assessor-3",
        start: "12:00",
        duration: 30,
        title: "Introduction to Examining a BLS Candidate",
        location: "TBC",
        lead: "",
        roles: ["assessor", "faculty", "director"],
        notes: "",
        resources: [],
        tags: ["assessor-stream"]
      },
      {
        id: "sat-assessor-4",
        start: "12:30",
        duration: 60,
        title: "Lunch",
        location: "TBC",
        lead: "",
        roles: ["assessor", "faculty", "director"],
        notes: "Assessor/SI stream breaks for lunch an hour earlier than the instructor stream (12:30, not 13:30).",
        resources: [],
        tags: ["assessor-stream", "break"]
      },
      {
        id: "sat-assessor-5",
        start: "13:30",
        duration: 45,
        title: "Examination of the Successful Candidate",
        location: "TBC",
        lead: "",
        roles: ["assessor", "faculty", "director"],
        notes: "Introduction, making the candidate feel at ease, observing, delivering the verdict, learning conversation, closure — followed by group sessions.",
        resources: [],
        tags: ["assessor-stream"]
      },
      {
        id: "sat-assessor-6",
        start: "14:15",
        duration: 60,
        title: "Examination of the Unsuccessful Candidate",
        location: "TBC",
        lead: "",
        roles: ["assessor", "faculty", "director"],
        notes: "Delivering the verdict, being direct, learning conversation, re-sits, avoiding confrontation/debate — followed by group sessions.",
        resources: [],
        tags: ["assessor-stream"]
      },
      {
        id: "sat-assessor-7",
        start: "15:15",
        duration: 15,
        title: "Coffee Break",
        location: "",
        lead: "",
        roles: ["assessor", "faculty", "director"],
        notes: "",
        resources: [],
        tags: ["assessor-stream", "break"]
      },
      {
        id: "sat-assessor-8",
        start: "15:30",
        duration: 90,
        title: "Grey Areas & the Borderline Candidate",
        location: "TBC",
        lead: "",
        roles: ["assessor", "faculty", "director"],
        notes: "Standardisation, common issues from previous examinations, and fail-point criteria (approach, 999 call, chest compressions, rescue breaths, AED).",
        resources: [],
        tags: ["assessor-stream"]
      },
      {
        id: "sat-assessor-9",
        start: "17:00",
        duration: 30,
        title: "Feedback & Course Closure",
        location: "",
        lead: "",
        roles: ["assessor", "faculty", "director"],
        notes: "Assessor candidate training concludes here. Senior Instructors continue with an additional session Sunday morning.",
        resources: [],
        tags: ["assessor-stream"]
      },

      // ── Instructor development (Saturday afternoon) ──
      {
        id: "sat-13",
        start: "14:15",
        duration: 10,
        title: "BLS/AED/First Aid: Q&A & Feedback",
        location: "ATH",
        lead: "",
        roles: ["instructor", "faculty", "director"],
        notes: "",
        resources: [],
        tags: []
      },
      {
        id: "sat-14",
        start: "14:25",
        duration: 20,
        title: "Life Support & Real Life",
        location: "ATH",
        lead: "",
        roles: ["instructor", "faculty", "director"],
        notes: "",
        resources: [
          { title: "Life Support & Real Life", embedUrl: "https://www.youtube.com/embed/LSEfAfSGRY0", icon: "🎬" }
        ],
        tags: []
      },
      {
        id: "sat-15",
        start: "14:45",
        duration: 5,
        title: "Welcome & Goals of the BLS Instructor Course",
        location: "ATH",
        lead: "",
        roles: ["instructor", "faculty", "director"],
        notes: "",
        resources: [],
        tags: []
      },
      {
        id: "sat-16",
        start: "14:50",
        duration: 20,
        title: "Plenary Lecture: Principles of Adult Learning & Teaching",
        location: "ATH",
        lead: "",
        roles: ["instructor", "faculty", "director"],
        notes: "",
        resources: [
          { title: "Teaching Adults CPR slides", path: "resources/4-teaching-adults-cpr-aed.html", icon: "📊" }
        ],
        tags: []
      },
      {
        id: "sat-17",
        start: "15:10",
        duration: 15,
        title: "Effective Teaching: 5-Minute Presentation",
        location: "ATH",
        lead: "",
        roles: ["instructor", "faculty", "director"],
        notes: "",
        resources: [
          { title: "Slides (to be uploaded)", path: "", icon: "📊" },
          { title: "Session guide", path: "resources/instructor/2-five-minute-lecture-summary.html", icon: "📄" }
        ],
        tags: []
      },
      {
        id: "sat-18",
        start: "15:25",
        duration: 20,
        title: "Debrief: 5-Minute Presentation",
        location: "ATH",
        lead: "",
        roles: ["instructor", "faculty", "director"],
        notes: "",
        resources: [
          { title: "Session guide", path: "resources/instructor/3-debrief-5-min-presentation.html", icon: "📄" }
        ],
        tags: []
      },
      {
        id: "sat-19",
        start: "15:45",
        duration: 15,
        title: "Plenary Lecture: The Learning Conversation",
        location: "ATH",
        lead: "",
        roles: ["instructor", "faculty", "director"],
        notes: "",
        resources: [
          { title: "Learning conversation slides", path: "resources/5-learning-conversation.html", icon: "📊" }
        ],
        tags: []
      },
      {
        id: "sat-20",
        start: "16:00",
        duration: 45,
        title: "Group Practice: The Learning Conversation",
        location: "Teaching rooms",
        lead: "Room faculty lead",
        roles: ["instructor", "faculty", "director"],
        notes: "",
        resources: [
          { title: "Session guide", path: "resources/instructor/4-learning-conversation-group-practice.html", icon: "📄" }
        ],
        tags: ["itc-observation"]
      },
      {
        id: "sat-21",
        start: "16:45",
        duration: 30,
        title: "Whole Course Photo",
        location: "Medical School steps",
        lead: "",
        roles: ["all"],
        notes: "All groups please. Wear your course polo shirts.",
        resources: [],
        tags: []
      }
    ]
  },

  sunday: {
    label: "Sunday 11 Oct",
    date: "Sunday 11 October 2026",
    sessions: [
      // ── Senior Instructor stream (Sunday) — from draft deck, 2026-07-18 ──
      // Assessor candidates do not return Sunday — this is for Senior Instructors only,
      // shown under the combined "Assessor / Senior Instructor" role per Jon's confirmation.
      {
        id: "sun-assessor-1",
        start: "09:30",
        duration: 15,
        title: "Senior Instructor Registration & Arrival",
        location: "TBC",
        lead: "",
        roles: ["assessor", "faculty", "director"],
        notes: "Senior Instructors only — assessor candidates do not return Sunday.",
        resources: [],
        tags: ["assessor-stream"]
      },
      {
        id: "sun-assessor-2",
        start: "09:45",
        duration: 195,
        title: "Senior Instructor Role Briefing",
        location: "TBC",
        lead: "",
        roles: ["assessor", "faculty", "director"],
        notes: "Covers: role on Monday evenings; grey areas from the assessor course and navigating them with instructors/common questions; Reasonable Adjustment Plan (RAP) students (teaching and assessing); kit issues and troubleshooting; difficult students; research opportunities and wider RMD involvement. After lunch, Senior Instructors rejoin the instructor group to explain their Monday-evening role.",
        resources: [],
        tags: ["assessor-stream"]
      },
      {
        id: "sun-1",
        start: "09:30",
        duration: 15,
        title: "Registration",
        location: "Foyer",
        lead: "RMD student faculty",
        roles: ["instructor", "faculty", "director"],
        notes: "Instructor candidates only. QR login required.",
        resources: [],
        tags: []
      },
      {
        id: "sun-2",
        start: "09:45",
        duration: 15,
        title: "Learning",
        location: "WF15",
        lead: "Room faculty lead",
        roles: ["instructor", "faculty", "director"],
        notes: "",
        resources: [
          { title: "Learning slides", path: "resources/6-learning.html", icon: "📊" },
          { title: "Session guide", path: "resources/instructor/5-learning-lecture.html", icon: "📄" }
        ],
        tags: []
      },
      {
        id: "sun-3",
        start: "10:00",
        duration: 30,
        title: "Plenary Demonstration: Skills Teaching (BLS/AED)",
        location: "WF15",
        lead: "",
        roles: ["instructor", "faculty", "director"],
        notes: "",
        resources: [
          { title: "Session guide", path: "resources/instructor/6-skills-teaching-demonstration.html", icon: "📄" }
        ],
        tags: []
      },
      {
        id: "sun-4",
        start: "10:30",
        duration: 90,
        title: "Group Practice: Teaching",
        location: "Teaching rooms",
        lead: "Room faculty lead",
        roles: ["instructor", "faculty", "director"],
        notes: "",
        resources: [
          { title: "Session guide", path: "resources/instructor/7-skills-teaching-practical.html", icon: "📄" }
        ],
        tags: ["itc-observation"]
      },
      {
        id: "sun-5",
        start: "12:00",
        duration: 15,
        title: "Course Update and Information",
        location: "WF15",
        lead: "RMD faculty",
        roles: ["instructor", "faculty", "director"],
        notes: "",
        resources: [],
        tags: []
      },
      {
        id: "sun-6",
        start: "12:15",
        duration: 20,
        title: "Plenary Lecture: Assessing",
        location: "WF15",
        lead: "",
        roles: ["instructor", "faculty", "director"],
        notes: "",
        resources: [
          { title: "Assessing slides", path: "resources/7-assessing.html", icon: "📊" },
          { title: "Session guide", path: "resources/instructor/8-how-to-assess-lecture-and-demo.html", icon: "📄" }
        ],
        tags: []
      },
      {
        id: "sun-7",
        start: "12:35",
        duration: 15,
        title: "Plenary Demonstration: Assessing",
        location: "WF15",
        lead: "",
        roles: ["instructor", "faculty", "director"],
        notes: "",
        resources: [],
        tags: []
      },
      {
        id: "sun-8",
        start: "12:50",
        duration: 10,
        title: "RMD Reasonable Adjustments Pathway",
        location: "WF15",
        lead: "",
        roles: ["instructor", "faculty", "director"],
        notes: "",
        resources: [
          { title: "RMD Reasonable Adjustments Pathway", embedUrl: "https://www.youtube.com/embed/tXgnppcnPOM", icon: "🎬" }
        ],
        tags: []
      },
      {
        id: "sun-9",
        start: "13:00",
        duration: 30,
        title: "Lunch",
        location: "Atrium",
        lead: "",
        roles: ["instructor", "assessor", "faculty", "director"],
        notes: "",
        resources: [],
        tags: ["break"]
      },
      {
        id: "sun-10",
        start: "13:30",
        duration: 90,
        title: "Group Practice: Continuous Assessment",
        location: "Teaching rooms",
        lead: "Room faculty lead",
        roles: ["instructor", "faculty", "director"],
        notes: "",
        resources: [
          { title: "Session guide", path: "resources/instructor/9-skills-assessing-practical.html", icon: "📄" }
        ],
        tags: ["itc-observation"]
      },
      {
        id: "sun-11",
        start: "15:00",
        duration: 15,
        title: "Break",
        location: "",
        lead: "",
        roles: ["instructor", "faculty", "director"],
        notes: "",
        resources: [],
        tags: ["break"]
      },
      {
        id: "sun-12",
        start: "15:15",
        duration: 15,
        title: "Course Logistics & Briefing",
        location: "WF15",
        lead: "RMD student faculty",
        roles: ["instructor", "faculty", "director"],
        notes: "",
        resources: [],
        tags: []
      },
      {
        id: "sun-13",
        start: "15:30",
        duration: 30,
        title: "Food for Thought",
        location: "WF15",
        lead: "",
        roles: ["instructor", "faculty", "director"],
        notes: "",
        resources: [
          { title: "Food for Thought", embedUrl: "https://www.youtube.com/embed/UCtEHo9-Ck4", icon: "🎬" }
        ],
        tags: []
      },
      {
        id: "sun-14",
        start: "16:00",
        duration: 15,
        title: "Summary Plenary & End of Course",
        location: "WF15",
        lead: "",
        roles: ["instructor", "faculty", "director"],
        notes: "",
        resources: [],
        tags: []
      },
      {
        id: "sun-15",
        start: "16:15",
        duration: 45,
        title: "Faculty Meeting",
        location: "WF19",
        lead: "",
        roles: ["faculty", "director"],
        notes: "",
        resources: [],
        tags: ["faculty-only"]
      }
    ]
  }
};

/**
 * Parse "HH:MM" to total minutes since midnight
 */
function timeToMinutes(t) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

/**
 * Get end time string from start + duration
 */
function sessionEndTime(session) {
  const start = timeToMinutes(session.start);
  const end = start + session.duration;
  const h = Math.floor(end / 60).toString().padStart(2, "0");
  const m = (end % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

/**
 * Returns true if the session is currently live
 */
function isSessionCurrent(session) {
  const now = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const start = timeToMinutes(session.start);
  const end = start + session.duration;
  return nowMins >= start && nowMins < end;
}

/**
 * Returns true if session is in the past
 */
function isSessionPast(session) {
  const now = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const end = timeToMinutes(session.start) + session.duration;
  return nowMins >= end;
}

/**
 * Some sign-in roles aren't distinct programme tracks in their own right —
 * they just need the same session visibility as one of the core tracks
 * ("director", "faculty", "instructor", "assessor") used in each session's
 * `roles` array above. Rather than repeating every role name in every
 * session object (fragile — easy to miss one when adding a session), map
 * those roles here to the track they should see.
 *
 *   assessor-faculty  — faculty running the assessor stream; sees both
 *                       programmes (same content access as "faculty")
 *   logistics         — course logistics team; sees both programmes
 *   full-instructor   — Instructor Trainer; instructor programme only
 *   itc               — Instructor Trainer Candidate; instructor programme only
 */
const ROLE_CONTENT_ALIAS = {
  "assessor-faculty": "faculty",
  "logistics":        "faculty",
  "full-instructor":  "instructor",
  "itc":              "instructor"
};

/**
 * Filter sessions for a given role
 */
function sessionsForRole(day, role) {
  const effectiveRole = ROLE_CONTENT_ALIAS[role] || role;
  return PROGRAMME[day].sessions.filter(s =>
    s.roles.includes("all") || s.roles.includes(effectiveRole)
  );
}
