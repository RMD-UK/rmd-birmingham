/* High priority issues engine (29 Oct 2026, Jon). Used by admin-priority-issues.html and the Monday hub (phase1.html),
 * so the count on the hub tab and the list on the page always agree.
 *
 * What counts as an issue (each is pending until it is sorted out or someone records an outcome):
 *   concern    An OPIS rating with a total of 8 or less, which the rater explained. Needs an outcome (actions, university form
 *              recommendation, note) from RMD faculty. Needs OPIS_UTIL (js/opis-util.js).
 *   absent     Still on the course they were absent from in teaching week 1 or 2, not passed, no Director eligibility override.
 *   noshow     Assessment night has passed and they did not attend (marked unable to attend) or have no result recorded.
 *   repeat     Absent on two or more courses (counting earlier courses on their record) and not already shown as absent.
 *   final      Failed the final attempt (attempt 4), or marked Failed. Needs a plan.
 *   instabs    An instructor absence notice for an evening still to come with short notice or a repeat count, cover not arranged.
 *   reggap     One item per course and teaching week (1 or 2) when people have no register mark (not here, late or absent) and the
 *              week is over (the next day, or from 8pm London time on the night itself). Course must have some register marks at all.
 *   noopis     One item per course: candidates with no OPIS rating from anyone, once teaching week 2 is over (same timing as reggap).
 *              Uses opis_coverage (readable by all members). Skips people absent both teaching weeks and second-attempt retesters.
 *   cconcern   A candidate flagged as a concern by RMD faculty (candidate_concerns). Open until closed with an outcome. No review
 *              date or snooze (candidates are only here for a short time). Picker lists candidates on the scanned courses.
 *   iconcern   An instructor flagged as a concern by RMD faculty (instructor_concerns). Open until closed with an outcome; "Keep under
 *              review" hides the red flag until its review date. Review log kept on the record.
 * Only the two most recent real courses that have started are scanned for candidate issues, to keep reads small.
 * Outcomes live in priority_followups/{key}. Absent and no-show items disappear by themselves when the person is reallocated
 * (their course changes) or passes.
 */
(function () {
  var SCAN_COURSES = 2;
  var SHORT_NOTICE_HOURS = 48, REPEAT_AT = 3;

  function pad(n) { return String(n).padStart(2, "0"); }
  function londonHour() {
    var h = 0; new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", hour12: false }).formatToParts(new Date()).forEach(function (x) { if (x.type === "hour") h = parseInt(x.value, 10) % 24; });
    return h;
  }
  function londonToday() {
    var p = {};
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date()).forEach(function (x) { p[x.type] = x.value; });
    return p.year + "-" + p.month + "-" + p.day;
  }
  function addDays(iso, n) { var d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
  function isTest(c) { return !!c && (c.test === true || /^TEST\b/i.test(c.name || "")); }
  function isCatchup(c) { return !!c && (c.catchup === true || /^catch-?up/i.test(c.name || "")); }
  function fkey(k) { return String(k).replace(/[\/]/g, "_"); }
  function ts(v) { return v && v.toDate ? v.toDate() : (v ? new Date(v) : null); }
  function docs(snap) { var out = []; snap.forEach(function (d) { out.push(Object.assign({ id: d.id }, d.data())); }); return out; }
  function passedAttemptOrNone(a) { var at = (a && a.attempts) || {}; return Object.keys(at).some(function (k) { return at[k] && at[k].outcome === "pass"; }); }

  // Paste the university concern form web address here (between the quotes) to show an "Open the university form" button.
  var UNI_FORM_URL = "https://forms.cloud.microsoft/pages/responsepage.aspx?id=z8oksN7eQUKhXDyX1VPp83Pj_-7oQS5MjggTXX3za89UQVNZR0k5T1hKMDlERkVJRFJGODVMWUozOCQlQCN0PWcu&route=shorturl";
  var REVIEW_DAYS = 28;
  var INSTR_SOURCES = [["iw", "Instructor Weekend"], ["teaching", "A teaching night"], ["assessment", "An assessment night"], ["other", "Somewhere else"]];
  var INSTR_REASONS = [
    ["conduct", "Conduct or professionalism (for example disrespect, not taking feedback, phone use)"],
    ["clinical", "Resuscitation knowledge, technique or safety concern"],
    ["teaching", "Teaching standard (not following the RMD approach or acting on feedback)"],
    ["support", "May need extra support (wellbeing, personal or learning needs)"],
    ["other", "Other"]
  ];
  var CAND_REASONS = [
    ["conduct", "Conduct or professionalism (for example disrespect, not taking feedback, phone use)"],
    ["attendance", "Attendance or engagement (repeated lateness, absence or switching off)"],
    ["support", "Wellbeing or may need extra support (personal, health or learning needs)"],
    ["other", "Other"]
  ];
  var CAND_OUTCOMES = [["noconcern", "No concern anymore"], ["support", "Resolved, support in place"], ["referred", "Referred to programme lead or university"], ["form", "Concern form submitted"]];
  var INSTR_OUTCOMES = [["noconcern", "No concern anymore"], ["removed", "Removed from the course"], ["support", "Resolved, support in place"]];

  var CONCERN_ACTIONS = [
    ["spoke", "I spoke to the candidate"],
    ["tutor", "Told their programme lead or personal tutor"],
    ["support", "Offered or pointed them to support"],
    ["monitor", "Agreed to keep an eye on them on later courses"],
    ["director", "Told the Course Director"],
    ["none", "No action needed (explain in the note)"]
  ];
  var GENERIC_ACTIONS = [
    ["spoke", "Spoke to the candidate"],
    ["email", "Emailed the candidate"],
    ["tutor", "Told their programme lead or personal tutor"],
    ["director", "Told the Course Director"],
    ["moved", "Moved or reallocated them"],
    ["none", "No action needed (explain in the note)"]
  ];

  async function load(db, opts) {
    opts = opts || {};
    var today = londonToday(), hour = opts.hour != null ? opts.hour : londonHour(), items = [], errs = [], allCands = [], seenCand = {};
    var OU = window.OPIS_UTIL;

    // ── Courses ──
    var courses = [];
    try {
      var cfg = await db.collection("config").doc("stage1_course_dates").get();
      courses = (cfg.exists ? (cfg.data().courses || []) : []).filter(function (c) { return c && c.name && c.date && !isTest(c) && !isCatchup(c); });
    } catch (e) { errs.push("Could not read the course dates: " + (e.message || e)); }
    var started = courses.filter(function (c) { return addDays(c.date, -14) <= today; }).sort(function (a, b) { return a.date < b.date ? 1 : -1; }).slice(0, SCAN_COURSES);

    // ── Follow-ups already recorded ──
    var follow = {};
    try { docs(await db.collection("priority_followups").get()).forEach(function (f) { follow[f.key || f.id] = f; }); }
    catch (e) { errs.push("Could not read recorded outcomes: " + (e.message || e)); }
    function add(it) { var f = follow[it.key] || follow[fkey(it.key)]; it.followup = f || null; it.closed = !!(f && f.status === "closed"); items.push(it); }

    // ── Candidate issues, per scanned course ──
    for (var i = 0; i < started.length; i++) {
      var course = started[i], cname = course.name;
      var cands = [], reg = {}, assess = {};
      try { cands = docs(await db.collection("stage1_candidates").where("course", "==", cname).get()); } catch (e) { errs.push("Could not read candidates on " + cname + ": " + (e.message || e)); continue; }
      cands.forEach(function (c) { if (c.isTest === true || seenCand[c.id]) return; seenCand[c.id] = true; allCands.push({ id: c.id, name: c.name || "", email: c.email || "", course: cname, degree: c.degree || "" }); });
      try { docs(await db.collection("stage1_register").where("course", "==", cname).get()).forEach(function (r) { reg[r.id] = r; }); } catch (e) { errs.push("Could not read the register for " + cname + ": " + (e.message || e)); }
      try { docs(await db.collection("stage1_assessments").where("course", "==", cname).get()).forEach(function (r) { assess[r.id] = r; }); } catch (e) { errs.push("Could not read results for " + cname + ": " + (e.message || e)); }
      var cov = {}, covOk = true;
      try { docs(await db.collection("opis_coverage").where("course", "==", cname).get()).forEach(function (r) { cov[r.id] = r; }); }
      catch (e) { covOk = false; errs.push("Could not read OPIS rater counts for " + cname + ": " + (e.message || e)); }
      var w1 = addDays(course.date, -14), w2 = addDays(course.date, -7), night = course.date;
      var shown = {}, gaps = { 1: [], 2: [] }, noOpis = [];
      var weekOver = function (n) { var d = n === 1 ? w1 : w2; return today > d || (today === d && hour >= 20); };
      cands.forEach(function (c) {
        if (c.isTest === true) return;
        var passed = c.outcome === "Passed" || passedAttemptOrNone(assess[c.id]);
        var r = reg[c.id] || {};
        var att = typeof c.assessmentAttempt === "number" ? c.assessmentAttempt : ((c.firstTimeAssessment === false || c.twoPlusAssessments === true) ? 3 : 1);
        var needsAttend = att === 1 || att >= 3;   // a second attempt (same-night retest) has no attendance rule
        var abWeeks = [];
        if (r.w1 && r.w1.status === "absent" && w1 <= today) abWeeks.push(1);
        if (r.w2 && r.w2.status === "absent" && w2 <= today) abWeeks.push(2);
        var ov = c.eligibilityOverride && c.eligibilityOverride.by;
        var prevAbs = (Array.isArray(c.previousCourses) ? c.previousCourses : []).filter(function (p) { return p && (p.w1 === "absent" || p.w2 === "absent"); }).length;
        // register gap: no mark at all for a week that is over (people already marked absent are shown under "absent")
        if (!passed && needsAttend && !ov && !abWeeks.length && !(r.w1 && r.w1.status === "absent") && !(r.w2 && r.w2.status === "absent")) {
          [1, 2].forEach(function (n) { var st = (r["w" + n] || {}).status; if (weekOver(n) && st !== "here" && st !== "late" && st !== "absent") gaps[n].push(c.name || c.id); });
        }
        // no OPIS rating from anyone, once the last teaching night is over
        if (covOk && needsAttend && weekOver(2) && !(r.w1 && r.w1.status === "absent" && r.w2 && r.w2.status === "absent")) {
          var cv = cov[c.id] || {};
          if (!(cv.raters || []).length) noOpis.push({ name: c.name || c.id, skipped: (cv.skippers || []).length });
        }
        var base = { candidateId: c.id, name: c.name || "", course: cname, degree: c.degree || "", email: c.email || "" };

        // absent from teaching weeks, not reallocated
        if (!passed && needsAttend && abWeeks.length && !ov) {
          var tags = ["Absent week " + abWeeks.join(" and ")];
          var why = abWeeks.map(function (n) { return (r["w" + n] || {}).absentReason; }).filter(Boolean);
          var rep = prevAbs + 1;
          if (prevAbs) tags.push("Also absent on " + prevAbs + " earlier course" + (prevAbs === 1 ? "" : "s"));
          if (abWeeks.length === 2) tags.push("Absent both weeks");
          shown[c.id] = true;
          add(Object.assign({ key: "a|" + c.id + "|" + cname, type: "absent", title: c.name, sub: cname + (c.room ? " / " + c.room : "") + " - still on this course, not reallocated", tags: tags, reasons: why, repeat: rep >= 2 || abWeeks.length === 2, kind: "generic" }, base));
        }
        // did not attend the assessment night, or no result
        if (!passed && night < today) {
          var a = assess[c.id], hasAtt = a && a.attempts && Object.keys(a.attempts).length > 0;
          var flagged = c.assessmentAbsent === true;
          if (flagged || (!hasAtt && !abWeeks.length && !ov)) {
            shown[c.id] = true;
            add(Object.assign({ key: "m|" + c.id + "|" + cname, type: "noshow", title: c.name, sub: cname + " - " + (flagged ? "did not attend the assessment night" : "no assessment result recorded") + ", not reallocated", tags: [flagged ? "Marked unable to attend" : "No result"], kind: "generic" }, base));
          }
        }
        // repeat absentees not already shown as absent
        if (!passed && !shown[c.id] && (prevAbs + (abWeeks.length ? 1 : 0)) >= 2) {
          add(Object.assign({ key: "r|" + c.id, type: "repeat", title: c.name, sub: cname + " - absent from " + prevAbs + " earlier courses", tags: ["Repeat absences"], kind: "generic" }, base));
        }
        // failed final attempt
        var at = (assess[c.id] && assess[c.id].attempts) || {};
        var failedFinal = Object.keys(at).some(function (k) { return Number(k) >= 4 && at[k] && at[k].outcome === "refer"; }) && !passedAttemptOrNone(assess[c.id]);
        if (failedFinal || c.outcome === "Failed") {
          add(Object.assign({ key: "f|" + c.id, type: "final", title: c.name, sub: cname + " - " + (failedFinal ? "did not pass the final attempt" : "marked Failed"), tags: [failedFinal ? "Final attempt" : "Failed"], kind: "generic" }, base));
        }
      });
      // one item per course and week, only when the course has any register marks at all
      if (Object.keys(reg).length) [1, 2].forEach(function (n) {
        var names = gaps[n]; if (!names.length) return;
        items.push({ key: "g|" + cname + "|" + n, type: "reggap", kind: "link", title: cname + ", teaching week " + n, closed: false,
          sub: names.length + " " + (names.length === 1 ? "person has" : "people have") + " no register mark for this night: " + names.slice(0, 12).join(", ") + (names.length > 12 ? " and " + (names.length - 12) + " more" : ""),
          tags: ["Register not complete"], href: "phase1.html?course=" + encodeURIComponent(cname) + "#register", hrefLabel: "Open the register and mark them", top: true, followup: null });
      });
      if (noOpis.length) {
        var nCov = Object.keys(cov).length, shownN = noOpis.slice(0, 12).map(function (x) { return x.name + (x.skipped ? " (" + x.skipped + " said not enough time)" : ""); });
        items.push({ key: "o|" + cname, type: "noopis", kind: "link", title: cname + ", no OPIS rating yet", closed: false,
          sub: noOpis.length + " " + (noOpis.length === 1 ? "candidate has" : "candidates have") + " no OPIS rating from anyone: " + shownN.join(", ") + (noOpis.length > 12 ? " and " + (noOpis.length - 12) + " more" : "") +
            (nCov === 0 ? ". No rater counts are recorded for this course at all - if ratings were made before 29 Oct, run Fix rater counts on the OPIS review page first." : ""),
          tags: ["No OPIS rating"], href: "opis-rating.html?course=" + encodeURIComponent(cname), hrefLabel: "Open OPIS rating for this course", followup: null });
      }
    }

    // ── OPIS concerns (all courses) ──
    var rated = [];
    try { rated = docs(await db.collection("opis_ratings").where("concernFlag", "==", true).get()); }
    catch (e) { errs.push("Could not read OPIS concerns: " + (e.message || e)); }
    if (rated.length && OU) {
      var fixes = [];
      try { fixes = docs(await db.collection("opis_ratings").where("correctsPrevious", "==", true).get()); } catch (e) { /* Student Faculty cannot read other ratings; a corrected concern can be dealt with by hand */ }
      var all = rated.concat(fixes.filter(function (x) { return !x.concernFlag; }));
      OU.markSuperseded(all);
      rated.filter(function (r) { return !r._superseded && OU.hasConcern(r); }).forEach(function (r) {
        var sub = ts(r.submittedAt);
        add({ key: "c|" + r.id, type: "concern", kind: "concern", ratingId: r.id, candidateId: r.candidateId || "", title: r.candidateName || "Candidate", name: r.candidateName || "",
          sub: (r.course || "") + (r.room ? " / " + r.room : "") + " - rated " + (r.total != null ? r.total : "?") + " of 15 by " + (r.submittedByName || "an instructor"),
          tags: ["OPIS " + r.total + "/15"], concern: r.concern, rater: r.submittedByName || "", at: sub, course: r.course || "" });
      });
    }

    // ── Instructor absences still to come ──
    try {
      var notices = docs(await db.collection("instructor_absences").get()).filter(function (n) { return n.status !== "withdrawn"; });
      var totals = {};
      notices.forEach(function (n) {
        var key = n.uid || n.email, t = ts(n.submittedAt) || 0, cur = totals[key];
        if (!cur || t > cur.t) totals[key] = { t: t, total: (Number(n.priorAbsences) || 0) + (n.nights || []).length };
      });
      notices.forEach(function (n) {
        if (n.covered) return;
        var future = (n.nightDates || []).filter(function (d) { return d >= today; });
        if (!future.length) return;
        var sent = ts(n.submittedAt), short = false, tags = [];
        if (sent) future.forEach(function (d) { var st = new Date(d + "T18:00:00"); if ((st.getTime() - sent.getTime()) / 36e5 < SHORT_NOTICE_HOURS) short = true; });
        var tot = (totals[n.uid || n.email] || {}).total || 0;
        if (short) tags.push("Short notice");
        if (tot >= REPEAT_AT) tags.push(tot + " absences");
        if (!tags.length) return;
        add({ key: "i|" + n.id, type: "instabs", kind: "link", title: n.name || "Instructor", sub: (n.role || "") + " - out on " + future.join(", ") + ", cover not arranged", tags: tags, reason: n.reason || "", href: "admin-absences.html", hrefLabel: "Open instructor absences to arrange cover" });
      });
    } catch (e) { errs.push("Could not read instructor absences: " + (e.message || e)); }

    // ── Instructors flagged as a concern ──
    try {
      docs(await db.collection("instructor_concerns").get()).forEach(function (c) {
        var status = c.status || "open", closed = status === "closed";
        var snoozed = status === "review" && !!c.reviewDate && c.reviewDate > today;
        var due = status === "review" && !snoozed;
        var tags = [];
        if (closed) tags.push("Closed"); else if (snoozed) tags.push("Under review until " + c.reviewDate); else if (due) tags.push("Review due"); else tags.push("Open");
        var srcL = (INSTR_SOURCES.filter(function (x) { return x[0] === c.source; })[0] || [0, "Other"])[1];
        items.push({ key: "ic|" + c.id, type: "iconcern", kind: "iconcern", id: c.id, title: c.instructorName || "Instructor", name: c.instructorName || "", rec: c,
          sub: (c.instructorRoleLabel || "Instructor") + " - raised at: " + srcL + " - flagged by " + (c.createdByName || "RMD faculty"),
          tags: tags, snoozed: snoozed, due: due, closed: closed });
      });
    } catch (e) { errs.push("Could not read instructor concerns: " + (e.message || e)); }

    // ── Candidates flagged as a concern ──
    try {
      docs(await db.collection("candidate_concerns").get()).forEach(function (c) {
        var closed = c.status === "closed";
        items.push({ key: "cc|" + c.id, type: "cconcern", kind: "cconcern", id: c.id, title: c.candidateName || "Candidate", name: c.candidateName || "", rec: c,
          sub: (c.course || "") + (c.degree ? " - " + c.degree : "") + " - flagged by " + (c.createdByName || "RMD faculty"),
          tags: [closed ? "Closed" : "Open"], closed: closed });
      });
    } catch (e) { errs.push("Could not read candidate concerns: " + (e.message || e)); }

    var pending = items.filter(function (x) { return !x.closed && !x.snoozed; });
    return { items: items, pending: pending, count: pending.length, errs: errs, cands: allCands, scanned: started.map(function (c) { return c.name; }), today: today };
  }

  async function saveFollowup(db, item, who, data) {
    var rec = {
      key: item.key, type: item.type, status: "closed", candidateId: item.candidateId || null, candidateName: item.name || item.title || "", course: item.course || null,
      actions: data.actions || [], note: String(data.note || "").trim(), closedByUid: who.uid, closedByName: who.name || "", closedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    if (item.type === "concern") { rec.ratingId = item.ratingId || null; rec.uniForm = data.uniForm; rec.uniSubmitted = false; }
    await db.collection("priority_followups").doc(fkey(item.key)).set(rec);
    return rec;
  }

  // ── Instructor concerns: picker list, flag, update ──
  // Everyone with an instructor or assessor role; with more=true also instructor trainers, ITCs, assessor faculty and faculty.
  // Each role is read on its own, so one refused read does not hide the rest. Errors are returned on list.errs.
  async function loadInstructors(db, more) {
    var R_ = (typeof ROLES !== "undefined") ? ROLES : {};
    var defs = [[R_.INSTRUCTOR || "instructor", "Instructor"], [R_.ASSESSOR || "assessor", "Assessor / Senior Instructor"]];
    if (more) defs = defs.concat([[R_.FULL_INSTRUCTOR || "full-instructor", "Instructor Trainer"], [R_.ITC || "itc", "Instructor Trainer Candidate"], [R_.ASSESSOR_FACULTY || "assessor-faculty", "Assessor Faculty"], [R_.FACULTY || "faculty", "Faculty"]]);
    var out = [], seen = {}, errs = [];
    for (var i = 0; i < defs.length; i++) {
      try {
        var snap = await db.collection("people").where("role", "==", defs[i][0]).get();
        snap.forEach(function (d) {
          if (seen[d.id]) return; seen[d.id] = true; var x = d.data();
          var nm = x.name || ((x.preferredName || "") + " " + (x.passportLastName || "")).trim() || x.email || "";
          out.push({ id: d.id, name: nm, email: x.email || "", role: x.role, roleLabel: defs[i][1] });
        });
      } catch (e) { errs.push(defs[i][1] + " list: " + (e.code || e.message || "error")); }
    }
    // The MOU roster lists every instructor, including candidates who have no login or people record. Directors only (others are refused, ignored).
    try {
      var have = {}; out.forEach(function (p) { if (p.email) have[p.email.toLowerCase()] = true; });
      var okRoles = more ? null : { "instructor": 1, "senior instructor": 1, "assessor": 1 };
      var rs = await db.collection("mou_roster").get();
      rs.forEach(function (d) {
        var x = d.data(), em = String(x.email || d.id || "").toLowerCase(), rl = String(x.role || "").toLowerCase();
        if (!em || have[em] || !x.name) return;
        if (okRoles && !okRoles[rl]) return;
        have[em] = true;
        out.push({ id: "roster:" + em, name: x.name, email: em, role: "roster", roleLabel: x.role || "Instructor" });
      });
    } catch (e) { /* not a Director: the people list alone is used */ }
    out.sort(function (a, b) { return a.name.localeCompare(b.name); });
    out.errs = errs;
    return out;
  }
  function isoNow() { return new Date().toISOString(); }
  async function flagInstructor(db, who, person, data) {
    var labs = data.reasons.map(function (k) { return (INSTR_REASONS.filter(function (r) { return r[0] === k; })[0] || [k, k])[1]; });
    var ts = firebase.firestore.FieldValue.serverTimestamp();
    var rec = { instructorId: person.id, instructorName: person.name, instructorEmail: person.email || "", instructorRoleLabel: person.roleLabel || "Instructor",
      source: data.source, reasons: data.reasons, reasonLabels: labs, note: String(data.note || "").trim(),
      status: "open", reviewDate: null, outcome: null, degreeLeadsUpdated: false, formSubmitted: false,
      log: [{ at: isoNow(), by: who.name || "", uid: who.uid, action: "Flagged", note: String(data.note || "").trim() }],
      createdByUid: who.uid, createdByName: who.name || "", createdAt: ts, updatedAt: ts };
    var ref = await db.collection("instructor_concerns").add(rec);
    return ref;
  }
  async function updateInstructorConcern(db, id, who, change, entry) {
    var upd = Object.assign({}, change, { updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      log: firebase.firestore.FieldValue.arrayUnion(Object.assign({ at: isoNow(), by: who.name || "", uid: who.uid }, entry)) });
    await db.collection("instructor_concerns").doc(id).update(upd);
  }

  async function flagCandidate(db, who, cand, data) {
    var labs = data.reasons.map(function (k) { return (CAND_REASONS.filter(function (r) { return r[0] === k; })[0] || [k, k])[1]; });
    var ts = firebase.firestore.FieldValue.serverTimestamp();
    var rec = { candidateId: cand.id, candidateName: cand.name, candidateEmail: cand.email || "", course: cand.course || "", degree: cand.degree || "",
      reasons: data.reasons, reasonLabels: labs, note: String(data.note || "").trim(),
      status: "open", outcome: null, degreeLeadsUpdated: false, formSubmitted: false,
      log: [{ at: isoNow(), by: who.name || "", uid: who.uid, action: "Flagged", note: String(data.note || "").trim() }],
      createdByUid: who.uid, createdByName: who.name || "", createdAt: ts, updatedAt: ts };
    return await db.collection("candidate_concerns").add(rec);
  }
  async function updateCandidateConcern(db, id, who, change, entry) {
    var upd = Object.assign({}, change, { updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      log: firebase.firestore.FieldValue.arrayUnion(Object.assign({ at: isoNow(), by: who.name || "", uid: who.uid }, entry)) });
    await db.collection("candidate_concerns").doc(id).update(upd);
  }

  window.RMD_PRIORITY = { flagCandidate: flagCandidate, updateCandidateConcern: updateCandidateConcern, CAND_REASONS: CAND_REASONS, CAND_OUTCOMES: CAND_OUTCOMES, load: load, loadInstructors: loadInstructors, flagInstructor: flagInstructor, updateInstructorConcern: updateInstructorConcern, INSTR_SOURCES: INSTR_SOURCES, INSTR_REASONS: INSTR_REASONS, INSTR_OUTCOMES: INSTR_OUTCOMES, UNI_FORM_URL: UNI_FORM_URL, REVIEW_DAYS: REVIEW_DAYS, saveFollowup: saveFollowup, CONCERN_ACTIONS: CONCERN_ACTIONS, GENERIC_ACTIONS: GENERIC_ACTIONS, fkey: fkey, SCAN_COURSES: SCAN_COURSES };
})();
