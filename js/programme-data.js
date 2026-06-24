/**
 * RMD Instructor Weekend 2026 — Programme Data
 *
 * Source: 2025 programme (xlsx). Update timings/sessions for 2026.
 * Assessor stream (Saturday) is a placeholder — Naveed to confirm.
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
        notes: "Self-scan QR code on arrival. Timetable opens automatically on scan.",
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
        location: "CM01 CM02 CM03 CM04 CM13 CM14 CM15 CM16",
        lead: "Room faculty lead",
        roles: ["all"],
        notes: "",
        resources: [],
        tags: []
      },
      {
        id: "sat-5",
        start: "10:05",
        duration: 5,
        title: "Recognition of a Heart Attack",
        location: "ATH",
        lead: "",
        roles: ["instructor", "faculty", "director"],
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
        location: "CM01 CM02 CM03 CM04 CM13 CM14 CM15 CM16",
        lead: "Room faculty lead",
        roles: ["instructor", "faculty", "director"],
        notes: "Small group practice. Formal gateway assessment of BLS/AED competency must be completed before the morning break (11:45).",
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
        notes: "Gateway assessment must be complete before this break.",
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
        location: "CM01 CM02 CM03 CM04 CM13 CM14 CM15 CM16",
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

      // ── Instructor development (Saturday afternoon) ──
      {
        id: "sat-13",
        start: "14:15",
        duration: 10,
        title: "BLS/AED/First Aid: Q&A & Feedback",
        location: "ATH",
        lead: "",
        roles: ["instructor", "faculty", "director"],
        notes: "Show agonal breathing video as supplementary material.",
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
        resources: [],
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
        location: "CM01 CM02 CM03 CM04 CM13 CM14 CM15 CM16",
        lead: "Room faculty lead",
        roles: ["instructor", "faculty", "director"],
        notes: "ITC observation session — ITC will be assigned to a specific breakout room for this block.",
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
        location: "CM01 CM02 CM03 CM04 CM13 CM14 CM15 CM16",
        lead: "Room faculty lead",
        roles: ["instructor", "faculty", "director"],
        notes: "ITC observation sessions take place during this block.",
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
        resources: [],
        tags: []
      },
      {
        id: "sun-9",
        start: "13:00",
        duration: 30,
        title: "Lunch",
        location: "Atrium",
        lead: "",
        roles: ["instructor", "faculty", "director"],
        notes: "",
        resources: [],
        tags: ["break"]
      },
      {
        id: "sun-10",
        start: "13:30",
        duration: 90,
        title: "Group Practice: Continuous Assessment",
        location: "CM01 CM02 CM03 CM04 CM13 CM14 CM15 CM16",
        lead: "Room faculty lead",
        roles: ["instructor", "faculty", "director"],
        notes: "ITC observation sessions take place during this block.",
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
        resources: [],
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
        notes: "End-of-course debrief. ITC outcomes discussed.",
        resources: [],
        tags: ["faculty-only"]
      }
    ]
  }
};

/**
 * RMD Assessor Course 2026 — Programme Data
 *
 * Runs in parallel with the Instructor Weekend on Saturday 10 Oct.
 * Assessor candidates attend Saturday only.
 * Programme to be confirmed by Naveed.
 */

const ASSESSOR_PROGRAMME = {

  friday: {
    label: "Friday 9 Oct",
    date: "Friday 9 October 2026",
    sessions: [
      {
        id: "afri-1",
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
        id: "afri-2",
        start: "19:00",
        duration: 120,
        title: "Faculty Meeting & Dinner",
        location: "TBC",
        lead: "Jon",
        roles: ["faculty", "director"],
        notes: "Briefing for the weekend.",
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
        id: "asat-0",
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
        id: "asat-1",
        start: "08:00",
        duration: 45,
        title: "Registration",
        location: "ATH",
        lead: "Student faculty",
        roles: ["all"],
        notes: "Self-scan QR code on arrival.",
        resources: [],
        tags: []
      },
      {
        id: "asat-2",
        start: "08:45",
        duration: 30,
        title: "Plenary Introduction & Welcome",
        location: "ATH",
        lead: "Jon",
        roles: ["all"],
        notes: "",
        resources: [],
        tags: []
      },
      {
        id: "asat-3",
        start: "09:35",
        duration: 235,
        title: "Assessor Training (Morning)",
        location: "TBC",
        lead: "Naveed",
        roles: ["assessor", "faculty", "director"],
        notes: "Programme to be confirmed by Naveed. Runs parallel to instructor candidate morning sessions.",
        resources: [],
        tags: ["placeholder"]
      },
      {
        id: "asat-4",
        start: "13:30",
        duration: 210,
        title: "Assessor Training (Afternoon)",
        location: "TBC",
        lead: "Naveed",
        roles: ["assessor", "faculty", "director"],
        notes: "Assessor training concludes Saturday. Assessor candidates do not return Sunday.",
        resources: [],
        tags: ["placeholder"]
      },
      {
        id: "asat-5",
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
      {
        id: "asun-1",
        start: "09:00",
        duration: 15,
        title: "No sessions Sunday",
        location: "",
        lead: "",
        roles: ["assessor"],
        notes: "Assessor candidates do not attend Sunday. Thank you for completing the course.",
        resources: [],
        tags: []
      },
      {
        id: "asun-2",
        start: "16:15",
        duration: 45,
        title: "Faculty Meeting",
        location: "WF19",
        lead: "",
        roles: ["faculty", "director"],
        notes: "End-of-course debrief.",
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
 * Filter sessions for a given role
 */
function sessionsForRole(day, role) {
  return PROGRAMME[day].sessions.filter(s =>
    s.roles.includes("all") || s.roles.includes(role)
  );
}
