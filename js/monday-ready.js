/**
 * monday-ready.js (2026-10-06, Jon) - the checking logic behind
 * admin-iw-monday-ready.html. Pure functions, no Firebase and no DOM, so the
 * same code can be tested offline against made-up data. The page does all
 * reading and writing; nothing in here touches the database.
 *
 * Background: people.role holds both a person's permanent role and their
 * Instructor Weekend job. The Monday teaching pool in
 * admin-course-room-allocation.html is people where role == "instructor".
 * OPIS rating access depends on a candidate's saved instructorTeamUids
 * containing the signed-in user's ID, so a team member whose people record
 * has an auto-generated ID (not a real sign-in ID) can never use OPIS.
 */
(function (root) {
  "use strict";

  const UID_LEN = 28;                 // Firebase Auth user IDs are 28 characters; auto-IDs are 20
  const ROOM_RESTORE_NOT_BEFORE = "2026-10-12"; // restoring roles before Monday would stop weekend raters rating
  const FACULTY_SIDE = ["faculty", "full-instructor", "assessor-faculty"];
  const EXPECTED_ROLE = {
    "Instructor Candidate":         "instructor",
    "Assessor / Senior Instructor": "assessor",
    "Faculty":                      "faculty",
    "Instructor Trainer Candidate": "itc",
    "Instructor Trainer":           "full-instructor",
    "Assessor Faculty":             "assessor-faculty",
    "Director":                     "director",
    "RMD Student Faculty":          "faculty"
  };

  const norm = s => String(s == null ? "" : s).trim().toLowerCase();
  const looksLikeUid = id => typeof id === "string" && id.length === UID_LEN;
  const label = p => (p && (p.name || p.email || p.id)) || "(unknown)";
  const byName = (a, b) => String(a.name || a.email || "").localeCompare(String(b.name || b.email || ""));

  // Same test-name rule as admin-iw-test-cleanup.html / admin-iw-preflight.html.
  function isTestName(name) {
    const n = norm(name);
    return n.startsWith("iw test") || n === "instructor trainer test" || n === "instructor trainer candidate test";
  }
  function docDisplayName(d) {
    if (!d) return "";
    if (d.name) return d.name;
    return [d.firstName, d.lastName].filter(Boolean).join(" ");
  }
  const isTestDoc = d => isTestName(docDisplayName(d));

  function platformAdminSet(cfg) {
    cfg = cfg || {};
    return new Set([].concat(cfg.directors || [], cfg.superUsers || []).map(norm));
  }
  function isDirectorLike(person, admins) {
    return norm(person.role) === "director" || (admins && admins.has(norm(person.email)));
  }

  // ── The Monday teaching pool ──────────────────────────────────────────────
  // Mirrors admin-course-room-allocation.html's loadData(): people where role
  // is "instructor", leaving out anyone marked "not teaching this term", plus
  // role "assessor" only when the optional switch is on.
  function inPool(person, opts) {
    opts = opts || {};
    if (person.notTeachingThisTerm === true) return false;
    const r = norm(person.role);
    if (r === "instructor") return true;
    if (opts.includeAssessors && r === "assessor") return true;
    return false;
  }
  function poolOf(people, opts) { return (people || []).filter(p => inPool(p, opts)); }

  // ── 1. Weekend ratings complete ──────────────────────────────────────────
  // rated = has iwRatingSummary with at least one rating (written server-side
  // by recomputeInstructorIwScore). Raters = faculty-side attendees on the
  // registration list; "submitted" = at least one session_feedback or
  // assessor_feedback doc with their ID in submittedByUid.
  function computeRatings(input) {
    const people = input.people || [], regs = input.regs || [];
    const attendeeEmails = new Set(regs.filter(r => r.status !== "declined").map(r => norm(r.email)).filter(Boolean));
    const pool = poolOf(people, input.poolOpts).filter(p => !isTestDoc(p));
    const rows = pool.map(p => {
      const s = p.iwRatingSummary;
      const count = s && typeof s.count === "number" ? s.count : (s ? 1 : 0);
      return {
        id: p.id, name: label(p), email: p.email || "", role: p.role,
        attended: attendeeEmails.has(norm(p.email)),
        rated: !!s && count > 0, count, tier: s ? s.tier : null
      };
    }).sort(byName);
    const rated = rows.filter(r => r.rated);
    const unratedAtWeekend = rows.filter(r => !r.rated && r.attended);
    const unratedOther = rows.filter(r => !r.rated && !r.attended);

    const submitters = new Map();
    (input.sessionFb || []).concat(input.assessorFb || []).forEach(f => {
      if (f && f.submittedByUid) submitters.set(f.submittedByUid, (submitters.get(f.submittedByUid) || 0) + 1);
    });
    const peopleByEmail = new Map();
    people.forEach(p => { const e = norm(p.email); if (e && !peopleByEmail.has(e)) peopleByEmail.set(e, p); });
    const sync = input.sync || null;
    const raters = (regs || []).filter(r => r.status !== "declined" && !isTestDoc(r))
      .map(r => ({ r, expected: EXPECTED_ROLE[r.role] || null }))
      .filter(x => x.expected && FACULTY_SIDE.includes(x.expected))
      .map(x => {
        const p = peopleByEmail.get(norm(x.r.email)) || null;
        const n = p ? (submitters.get(p.id) || 0) : 0;
        let why = "";
        if (!p) why = "no people record at this email";
        else if (sync && sync.noAuth && sync.noAuth.has(norm(x.r.email))) why = "no sign-in at this email";
        return { name: x.r.name || label(p), email: x.r.email || "", role: x.expected, id: p ? p.id : null, submitted: n, why };
      }).sort(byName);
    return {
      poolSize: rows.length, rated, unratedAtWeekend, unratedOther,
      raters, ratersMissing: raters.filter(x => x.submitted === 0),
      ready: unratedAtWeekend.length === 0 && raters.every(x => x.submitted > 0)
    };
  }

  // ── 2. Restore temporary roles ───────────────────────────────────────────
  // admin-iw-preflight.html's "Set role to X" stores the previous role in
  // roleFixedFrom. Rows are everyone who has that field.
  function streamFor(role) { return role === "faculty" ? "faculty" : role; } // same rule as admin-bulk-users / preflight
  function computeRestore(input) {
    const people = input.people || [];
    const admins = input.admins || new Set();
    const assigns = input.assigns || {};
    const rows = people.filter(p => Object.prototype.hasOwnProperty.call(p, "roleFixedFrom")).map(p => {
      const prev = p.roleFixedFrom == null ? "" : String(p.roleFixedFrom);
      const cur = p.role || "";
      let skip = "", caution = "", info = "";
      if (isDirectorLike(p, admins)) skip = "Director or super-user: never changed here.";
      else if (!prev) skip = "Previous role was blank, so there is nothing to restore to. Set this by hand if needed.";
      else if (norm(prev) === "director") skip = "Previous role was director: never granted here.";
      else if (prev === cur) skip = "Already back at " + prev + ".";
      if (!skip) {
        const fn = assigns[p.id];
        if (fn && fn !== cur) caution = "Weekend job record says \"" + fn + "\" but people.role is \"" + cur + "\", so someone changed it after the preflight fix. Check before restoring.";
        if (norm(prev) === "instructor") info = "Will join the Monday teaching pool.";
        if (!looksLikeUid(p.id)) caution = (caution ? caution + " " : "") + "Record ID is not a sign-in ID, so this role may not be what the rules see.";
      }
      return {
        id: p.id, name: label(p), email: p.email || "", current: cur, restoreTo: prev,
        fixedAt: p.roleFixedAt || null, fixedBy: p.roleFixedBy || "", skip, caution, info,
        canRestore: !skip
      };
    }).sort(byName);
    return { rows, restorable: rows.filter(r => r.canRestore), skipped: rows.filter(r => !r.canRestore && !/^Already back/.test(r.skip)), done: rows.filter(r => /^Already back/.test(r.skip)) };
  }
  // The exact fields written for one restore. FV = { serverTimestamp(), delete() } from firebase.firestore.FieldValue.
  function restoreUpdate(row, byEmail, FV) {
    return {
      role: row.restoreTo,
      stream: streamFor(row.restoreTo),
      roleRestoredFrom: row.current,
      roleRestoredTo: row.restoreTo,
      roleRestoredAt: FV.serverTimestamp(),
      roleRestoredBy: byEmail || null,
      roleFixedFrom: FV.delete(), roleFixedAt: FV.delete(), roleFixedBy: FV.delete(), roleFixedVia: FV.delete()
    };
  }
  function restoreTooEarly(nowMs) {
    return new Date(nowMs).getTime() < new Date(ROOM_RESTORE_NOT_BEFORE + "T00:00:00").getTime();
  }

  // ── 3. Instructors who did not pass ──────────────────────────────────────
  // People with role "instructor" and no open "Instructor" roleHistory period.
  // Split: on this year's registration list as an Instructor Candidate (so
  // probably did not pass, or has not been confirmed) versus not on the list
  // (probably an older instructor whose history was never recorded, so run
  // the MoU ratify tool in admin-role-history.html first).
  function hasOpenInstructor(p) {
    const h = Array.isArray(p.roleHistory) ? p.roleHistory : [];
    return h.some(x => x && x.role === "Instructor" && (x.to === null || x.to === undefined));
  }
  function computeNotPassed(input) {
    const people = input.people || [], regs = input.regs || [];
    const candEmails = new Set(regs.filter(r => r.status !== "declined" && EXPECTED_ROLE[r.role] === "instructor").map(r => norm(r.email)).filter(Boolean));
    const admins = input.admins || new Set();
    const base = people.filter(p => norm(p.role) === "instructor" && !isDirectorLike(p, admins) && !isTestDoc(p));
    const noPeriod = base.filter(p => !hasOpenInstructor(p));
    const row = p => ({ id: p.id, name: label(p), email: p.email || "", marked: p.notTeachingThisTerm === true, onWeekendList: candEmails.has(norm(p.email)) });
    const onList = noPeriod.filter(p => candEmails.has(norm(p.email))).map(row).sort(byName);
    const notOnList = noPeriod.filter(p => !candEmails.has(norm(p.email))).map(row).sort(byName);
    // Anyone marked who does now have an Instructor period (changed their mind) is still shown so it can be cleared.
    const markedButPassed = base.filter(p => p.notTeachingThisTerm === true && hasOpenInstructor(p)).map(row).sort(byName);
    return { onList, notOnList, markedButPassed, withPeriod: base.length - noPeriod.length, total: base.length };
  }
  function markUpdate(marked, byEmail, FV) {
    return marked
      ? { notTeachingThisTerm: true, notTeachingSetAt: FV.serverTimestamp(), notTeachingSetBy: byEmail || null }
      : { notTeachingThisTerm: FV.delete(), notTeachingSetAt: FV.delete(), notTeachingSetBy: FV.delete() };
  }

  // ── 4. Sign-in check for the teaching pool ───────────────────────────────
  // sync = { already, toSync, noAuth } sets of lowercase emails from the
  // read-only dry run of syncIwRegistrationsToPeople. That only covers
  // confirmed Instructor Weekend registrants; for anyone else the only clue
  // is the shape of the record ID, which is an inference, not proof.
  function computeSignin(input) {
    const pool = poolOf(input.people || [], input.poolOpts).filter(p => !isTestDoc(p));
    const sync = input.sync || null;
    const rows = pool.map(p => {
      const e = norm(p.email);
      let status, why;
      if (!e) { status = "noemail"; why = "No email on the record."; }
      else if (sync && sync.noAuth.has(e)) { status = "none"; why = "The sync check found no sign-in at this email."; }
      else if (sync && (sync.already.has(e) || sync.toSync.has(e))) {
        if (looksLikeUid(p.id)) { status = "ok"; why = "Has a sign-in and a matching record."; }
        else { status = "idmismatch"; why = "Has a sign-in, but this record has an auto-generated ID, so the sign-in does not match it. OPIS and rating checks will not recognise them."; }
      }
      else if (looksLikeUid(p.id)) { status = "likely"; why = "Not on this year's registration list, so the sync check cannot see them. The record ID is sign-in shaped, so a sign-in probably exists (inference)."; }
      else { status = "unknown"; why = "Not on this year's registration list and the record ID is an auto-generated one, so they probably have no sign-in (inference)."; }
      return { id: p.id, name: label(p), email: p.email || "", status, why };
    }).sort(byName);
    const count = s => rows.filter(r => r.status === s).length;
    return {
      rows, syncAvailable: !!sync,
      counts: { ok: count("ok"), likely: count("likely"), none: count("none"), idmismatch: count("idmismatch"), unknown: count("unknown"), noemail: count("noemail") },
      needLogin: rows.filter(r => ["none", "idmismatch", "unknown"].includes(r.status) && r.email)
    };
  }

  // ── 5. Test data ─────────────────────────────────────────────────────────
  function countTestData(input) {
    const people = (input.people || []).filter(isTestDoc);
    const poolTest = poolOf(input.people || [], input.poolOpts).filter(isTestDoc);
    const regs = (input.regs || []).filter(isTestDoc);
    const fac = (input.facultyResponses || []).filter(isTestDoc);
    const mou = (input.mouRoster || []).filter(isTestDoc);
    return { people: people.length, regs: regs.length, facultyResponses: fac.length, mouRoster: mou.length, inPool: poolTest.length, total: people.length + regs.length + fac.length + mou.length, poolTestNames: poolTest.map(label) };
  }

  // ── 6. Allocation check ──────────────────────────────────────────────────
  function slugify(s) { return (s || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "course"; }
  const sameSet = (a, b) => { const x = new Set(a || []), y = new Set(b || []); return x.size === y.size && [...x].every(v => y.has(v)); };
  function computeAllocation(input) {
    const course = input.course;
    const rooms = input.rooms || [];
    const people = input.people || [];
    const peopleById = new Map(people.map(p => [p.id, p]));
    const sync = input.sync || null;
    const cands = (input.candidates || []).filter(c => c.course === course);
    const noRoom = cands.filter(c => !c.room || (rooms.length && !rooms.includes(c.room))).map(c => ({ id: c.id, name: c.name || "(no name)", email: c.email || "", had: c.room || "" }));
    const own = (input.allocDocs || []).find(d => d.id === slugify(course) || d.course === course) || null;
    const def = input.defaultDoc && input.defaultDoc.instructorTeams ? input.defaultDoc : null;
    const source = own && own.instructorTeams ? "saved" : (def ? "default" : "none");
    const teams = source === "saved" ? own.instructorTeams : (source === "default" ? def.instructorTeams : {});
    const badMembers = [];
    const seen = new Set();
    Object.keys(teams || {}).forEach(room => {
      (teams[room] || []).forEach(uid => {
        const key = room + "|" + uid;
        if (seen.has(key)) return; seen.add(key);
        const p = peopleById.get(uid);
        let problem = "";
        if (!p) problem = "No people record has this ID.";
        else if (!looksLikeUid(uid)) problem = "Auto-generated ID, not a sign-in ID: this person cannot use OPIS.";
        else if (sync && sync.noAuth.has(norm(p.email))) problem = "ID looks like a sign-in but the sync check found no sign-in at their email.";
        if (problem) badMembers.push({ room, uid, name: p ? label(p) : uid, problem });
      });
    });
    // OPIS reads each candidate's own flat copy (instructorTeamUids), written only when the allocation is saved.
    const stale = cands.filter(c => {
      if (!c.room) return false;
      const want = (source === "saved" ? (teams[c.room] || []) : []);
      return !sameSet(want, c.instructorTeamUids || []);
    }).map(c => ({ id: c.id, name: c.name || "(no name)", room: c.room, has: (c.instructorTeamUids || []).length, wants: source === "saved" ? (teams[c.room] || []).length : 0 }));
    const roomsWithoutTeam = rooms.filter(r => !(teams[r] && teams[r].length) && cands.some(c => c.room === r));
    const warnings = [];
    if (source === "default") warnings.push("This course has no allocation of its own saved, only the default. OPIS reads the copy saved with the allocation, so until it is saved here nobody can use OPIS for this course.");
    if (source === "none") warnings.push("No allocation exists for this course yet.");
    if (stale.length && source === "saved") warnings.push(stale.length + " candidate(s) carry a team list that differs from the saved allocation. Save the allocation again so OPIS access is up to date.");
    if (badMembers.length) warnings.push(badMembers.length + " team member(s) have an ID that will not give OPIS access.");
    return {
      course, candidateCount: cands.length, noRoom, source, badMembers, stale, roomsWithoutTeam, warnings,
      ready: cands.length > 0 && noRoom.length === 0 && source === "saved" && badMembers.length === 0 && stale.length === 0
    };
  }
  // Which course runs on a given date (config/stage1_course_dates courses[] = {name, date:"YYYY-MM-DD"}).
  function courseOnDate(courses, iso) {
    const hit = (courses || []).find(c => c && c.date && String(c.date).slice(0, 10) === iso);
    return hit ? hit.name : null;
  }

  root.RMD_MONDAY = {
    UID_LEN, ROOM_RESTORE_NOT_BEFORE, EXPECTED_ROLE, FACULTY_SIDE,
    norm, looksLikeUid, isTestName, isTestDoc, platformAdminSet, isDirectorLike,
    inPool, poolOf, computeRatings, computeRestore, restoreUpdate, restoreTooEarly, streamFor,
    hasOpenInstructor, computeNotPassed, markUpdate, computeSignin, countTestData,
    slugify, computeAllocation, courseOnDate
  };
  if (typeof module !== "undefined" && module.exports) module.exports = root.RMD_MONDAY;
})(typeof window !== "undefined" ? window : globalThis);
