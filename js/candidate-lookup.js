/**
 * candidate-lookup.js (2026-10-05, Jon) - shared helpers so every Stage 1
 * candidate lookup behaves like the candidate-facing "Find your course and
 * room" tool: you do NOT need to know the course; search by name, email or
 * degree (optionally narrowed to a course) and the result says which course
 * (with its date), which room, and the assessment slot.
 * Used by course-roster-view.html, admin-stage1-assessment-allocation.html
 * and admin-stage1-candidates.html. Pure functions, no Firebase.
 */
(function (root) {
  "use strict";

  function norm(s) {
    return String(s == null ? "" : s).toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");
  }

  // Every space-separated word of the query must appear somewhere in the
  // candidate's name, email, degree, course or room. "sam medicine" finds Sam
  // on a Medicine degree; word order does not matter.
  function matches(c, query) {
    const words = norm(query).split(/\s+/).filter(Boolean);
    if (!words.length) return false;
    const hay = norm([c.name, c.email, c.degree, c.course, c.room].join(" "));
    return words.every(w => hay.includes(w));
  }

  // config/stage1_course_dates courses[] -> { "Course 1": "2026-10-12" }
  function dateMap(courses) {
    const m = {};
    (courses || []).forEach(c => { if (c && c.name) m[c.name] = c.date || ""; });
    return m;
  }

  // "2026-10-19" -> "Mon 19 Oct 2026" (stored value returned if unparseable)
  function formatDate(d) {
    if (!d) return "";
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d));
    if (!m) return String(d);
    const dt = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][dt.getUTCDay()];
    const mon = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][dt.getUTCMonth()];
    return `${day} ${dt.getUTCDate()} ${mon} ${dt.getUTCFullYear()}`;
  }

  // "Course 2 (Mon 19 Oct 2026)" or "Course 2" or "Not on a course yet"
  function courseText(c, dates) {
    if (!c.course) return "Not on a course yet";
    const d = formatDate((dates || {})[c.course]);
    return d ? `${c.course} (${d})` : c.course;
  }

  function roomText(c) {
    return c.course ? (c.room ? `Room ${c.room}` : "room not yet assigned") : "";
  }

  function assessmentText(c) {
    if (c.assessmentAbsent === true) return "Assessment: marked unable to attend";
    if (c.firstTimeAssessment === false) return "Assessment: repeat, managed separately by faculty";
    if (c.assessmentRoom && c.assessmentSlot) return `Assessment: ${c.assessmentRoom} at ${c.assessmentSlot}`;
    return "Assessment: not yet allocated";
  }

  const api = { matches, dateMap, formatDate, courseText, roomText, assessmentText, norm };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.RMD_CAND_LOOKUP = api;
})(typeof window !== "undefined" ? window : globalThis);
