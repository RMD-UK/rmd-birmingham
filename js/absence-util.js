/* Shared helpers for the instructor absence notice (instructor-absence.html) and the review page
 * (admin-absences.html). 29 Oct 2026 (Jon). Teaching evenings come from config/stage1_course_dates:
 * the stored date is the assessment night; the two teaching nights are 14 and 7 days before it
 * (same rule as the member menu "This week" line). Test courses are ignored. */
(function () {
  function pad(n) { return String(n).padStart(2, "0"); }
  function iso(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function parseIso(s) { var p = String(s || "").split("-").map(Number); return (p.length === 3 && p[0]) ? new Date(p[0], p[1] - 1, p[2]) : null; }
  var LABELS = [[-14, "First teaching night"], [-7, "Second teaching night"], [0, "Assessment night"]];
  // courses = config/stage1_course_dates .courses. Returns every evening, oldest first:
  // { date: "YYYY-MM-DD", course, label, kind: "teaching"|"assessment" }
  function absenceNights(courses) {
    var out = [];
    (courses || []).forEach(function (c) {
      if (!c || !c.name || !c.date || /^test/i.test(c.name)) return;
      var base = parseIso(c.date); if (!base) return;
      LABELS.forEach(function (l) {
        var d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + l[0]);
        out.push({ date: iso(d), course: c.name, label: l[1], kind: l[0] === 0 ? "assessment" : "teaching" });
      });
    });
    out.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    return out;
  }
  function niceDate(s) { var d = parseIso(s); return d ? d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }) : String(s || ""); }
  // The evening is taken to start at 18:00 local time.
  function nightStart(s) { var d = parseIso(s); if (!d) return null; d.setHours(18, 0, 0, 0); return d; }
  // Hours of notice between sending the form and the start of that evening (negative if after).
  function noticeHours(sentAt, nightDate) { var st = nightStart(nightDate); if (!st || !sentAt) return null; return (st.getTime() - sentAt.getTime()) / 36e5; }
  window.RMD_ABS = { iso: iso, parseIso: parseIso, absenceNights: absenceNights, niceDate: niceDate, nightStart: nightStart, noticeHours: noticeHours, SHORT_NOTICE_HOURS: 48, REPEAT_AT: 3 };
})();
