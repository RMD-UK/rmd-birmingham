/* Moved on after the assessment night (28 Oct 2026, Jon).
 * Once a course's assessment night has passed, the evening-course roster also lists people who were on that course for the night
 * but were then moved to a later course: they did not pass, or were not there. They show greyed and read-only, in their original
 * teaching room when one was saved on the move (previousCourses[].room), otherwise in a "Moved on after the night" group.
 * Moves made before 27 Oct 2026 saved no room, so those people always go in the group. */
(function (root) {
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  function addDays(iso, n) { var d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
  // cands: all stage1_candidates; assess: { id: stage1_assessments doc }; dates: { course: "YYYY-MM-DD" } (the assessment night); rooms: teaching room ids
  function forCourse(cands, assess, dates, course, rooms) {
    var date = dates[course] || "", out = [];
    if (!date) return out;
    var today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/London" });
    if (today <= date) return out;                   // only once the assessment night is over
    var endIso = addDays(date, 1) + "T06:00";        // results saved up to 6am next morning belong to the night
    (cands || []).forEach(function (c) {
      if (c.course === course) return;
      var m = null; (Array.isArray(c.previousCourses) ? c.previousCourses : []).forEach(function (x) { if (x && x.course === course && String(x.at || "").slice(0, 10) >= date) m = x; });
      if (!m) return;                                // left the course before the night (teaching-week absence): not shown
      var a = ((assess[c.id] || {}).attempts) || {}, k = 0;
      Object.keys(a).forEach(function (n) { var r = a[n], at = String((r && r.at) || ""); if (r && r.outcome && at >= date && at < endIso && +n > k) k = +n; });
      var kind, label;
      if (k && a[k].outcome === "refer") { kind = "fail"; label = "Did not pass (attempt " + k + ")"; }
      else if (k) { kind = "pass"; label = "Passed, moved later"; }
      else { kind = "absent"; label = "Not there on the night"; }
      out.push({ id: c.id, c: c, name: c.name || "(no name)", room: rooms.indexOf(m.room) >= 0 ? m.room : null, kind: kind, label: label, now: c.course ? "now on " + c.course : "now waiting for a course" });
    });
    out.sort(function (x, y) { return String(x.name).localeCompare(String(y.name), "en"); });
    return out;
  }
  function card(m) {
    return '<div class="pcard moved-on" title="' + esc(m.name + " - " + m.label + ", " + m.now) + '"><span class="role-pip pip-moved">Moved</span><div class="pcard-main"><span class="pcard-name">' + esc(m.name) + '</span><span class="pcard-sub">' + esc(m.label + ", " + m.now) + '</span></div></div>';
  }
  function group(list) {   // for people without a saved room: did not pass first, then not there
    var order = [["fail", "Did not pass"], ["absent", "Not there"], ["pass", "Passed, moved later"]], h = "";
    order.forEach(function (o) { var l = list.filter(function (m) { return m.kind === o[0]; }); if (l.length) h += '<div class="room-sec-label" style="margin:8px 0 3px">' + o[1] + " (" + l.length + ")</div>" + l.map(card).join(""); });
    return h;
  }
  var st = document.createElement("style");
  st.textContent = ".pcard.moved-on{opacity:.88;background:#f1f1f6;border-style:dashed}.pip-moved{background:#ececf3;color:#5f6f96}.moved-wrap{margin:0 12px 12px}.moved-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:3px 8px;align-items:start}.moved-grid .room-sec-label{grid-column:1/-1}";
  document.head.appendChild(st);
  root.RMD_MOVED = { forCourse: forCourse, card: card, group: group };
})(window);
