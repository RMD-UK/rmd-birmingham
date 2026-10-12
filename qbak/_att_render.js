let currentGroup = "all";      // "all" or a group name
let groupView = false;         // false = Candidates / Faculty split, true = one section per group
const NO_GROUP = "(No group)";
const groupOf = p => (p.group || "").toString().trim() || NO_GROUP;

function visiblePeople() { return allPeople.filter(p => !isDeclined(p)); }
function dayRec(p) { return attendance[p.id] || {}; }
function hasArrived(p) { return !!dayRec(p)["arrived_" + currentDay]; }
function isAbsent(p) { return !hasArrived(p) && !!dayRec(p)["notExpected_" + currentDay]; }
function hasLeft(p) { return hasArrived(p) && !!dayRec(p)["left_" + currentDay]; }

function renderList() {
  updateStats();
  const wrap = document.getElementById("listWrap");
  const search = currentFilter.toLowerCase();
  const matchName = p => !search || (p.name || "").toLowerCase().includes(search);

  // Course-type filter first, so the group chips below show counts for it.
  let base = visiblePeople().filter(matchName);
  if (currentCourseType === "instructor") base = base.filter(p => effectiveRole(p) === "instructor");
  if (currentCourseType === "assessor")   base = base.filter(p => effectiveRole(p) === "assessor");
  renderGroupFilter(base);

  let people = base;
  if (currentGroup !== "all") people = people.filter(p => groupOf(p) === currentGroup);
  if (currentTab === "arrived")     people = people.filter(hasArrived);
  if (currentTab === "outstanding") people = people.filter(p => !hasArrived(p) && !isAbsent(p));

  const declined = allPeople.filter(isDeclined).filter(matchName);
  const declinedHtml = declined.length ? `<details class="declined-box"><summary>Not attending: declined on registration (${declined.length})</summary>` +
    declined.map(p => `<div class="declined-row"><span>${esc(p.name)} <small>${esc(ROLE_LABELS[effectiveRole(p)] || effectiveRole(p) || "")}</small></span>` +
      (canEdit && dayIsOpen(currentDay) ? `<button class="btn-undo" onclick="checkIn('${esc(p.id)}')">Arrived anyway</button>` : "") + `</div>`).join("") +
    `<p class="declined-note">These people are left out of the counts above. Change their answer on the IW registrations page if this is wrong.</p></details>` : "";

  if (!people.length) {
    wrap.innerHTML = `<div class="empty-state"><h3>${currentFilter ? "No results" : "Nobody here"}</h3><p>${currentFilter ? "Try a different name." : "Nobody matches these filters."}</p></div>` + declinedHtml;
    return;
  }

  const summary = list => {
    const a = list.filter(hasArrived).length;
    return `${list.length} · ${a} arrived`;
  };
  const rank = p => (["instructor", "assessor"].includes(effectiveRole(p)) ? 0 : 1);
  let html = "";

  if (groupView) {
    const byGroup = {};
    people.forEach(p => { (byGroup[groupOf(p)] = byGroup[groupOf(p)] || []).push(p); });
    Object.keys(byGroup).sort((a, b) => a === NO_GROUP ? 1 : b === NO_GROUP ? -1 : a.localeCompare(b, undefined, { numeric: true })).forEach(g => {
      const list = byGroup[g].sort((a, b) => rank(a) - rank(b));
      html += `<div class="list-heading">${esc(g)} (${summary(list)})</div>` + list.map(personRow).join("");
    });
  } else if (currentCourseType !== "all") {
    const heading = currentCourseType === "instructor" ? "Instructor Candidates" : "Assessors & Senior Instructors";
    html += `<div class="list-heading">${heading} (${summary(people)})</div>` + people.map(personRow).join("");
  } else {
    const candidates = people.filter(p => ["instructor", "assessor"].includes(effectiveRole(p)));
    const faculty    = people.filter(p => ["faculty", "full-instructor", "itc", "director", "assessor-faculty"].includes(effectiveRole(p)));
    if (candidates.length) html += `<div class="list-heading">Candidates (${summary(candidates)})</div>` + candidates.map(personRow).join("");
    if (faculty.length)    html += `<div class="list-heading">Faculty &amp; Team (${summary(faculty)})</div>` + faculty.map(personRow).join("");
  }
  wrap.innerHTML = html + declinedHtml;
}

function renderGroupFilter(base) {
  const el = document.getElementById("groupFilter");
  if (!el) return;
  const counts = {};
  base.forEach(p => { counts[groupOf(p)] = (counts[groupOf(p)] || 0) + 1; });
  const names = Object.keys(counts).sort((a, b) => a === NO_GROUP ? 1 : b === NO_GROUP ? -1 : a.localeCompare(b, undefined, { numeric: true }));
  if (currentGroup !== "all" && !counts[currentGroup]) currentGroup = "all";
  el.innerHTML = `<div class="gf-lbl">Group</div>` +
    `<div class="cf-btn ${currentGroup === "all" ? "active" : ""}" onclick="setGroup('all')">All (${base.length})</div>` +
    names.map(n => `<div class="cf-btn ${currentGroup === n ? "active" : ""}" onclick="setGroup(this.dataset.g)" data-g="${esc(n)}">${esc(n)} (${counts[n]})</div>`).join("") +
    `<div class="cf-btn gv ${groupView ? "active" : ""}" onclick="toggleGroupView()">${groupView ? "Grouped by group" : "Group the list"}</div>`;
}
function setGroup(g) { currentGroup = g; renderList(); }
function toggleGroupView() { groupView = !groupView; renderList(); }

function personRow(p) {
  const rec         = attendance[p.id];
  const arrived     = hasArrived(p);
  const absent      = isAbsent(p);
  const left        = hasLeft(p);
  const initials = (p.name || "?").split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
  const role    = effectiveRole(p);
  const colour  = arrived ? (left ? "avatar-muted" : "avatar-green") : (ROLE_COLOURS[role] || "avatar-muted");
  const label   = customRoleLabel(p.roleLabel) || ROLE_LABELS[role] || role;
  const sub     = [label, p.group].filter(Boolean).join(" · ");

  const fmtT = raw => { const d = raw.toDate ? raw.toDate() : new Date(raw); return String(d.getHours()).padStart(2,"0") + ":" + String(d.getMinutes()).padStart(2,"0"); };
  const timeStr = arrived ? fmtT(rec["arrived_" + currentDay]) : "";
  const leftStr = left ? fmtT(rec["left_" + currentDay]) : "";
  const leftWhy = left ? (LEFT_REASONS[rec["leftReason_" + currentDay]] || "") : "";
  const note = absent ? (rec["absentNote_" + currentDay] || "") : (left ? (rec["leftNote_" + currentDay] || "") : "");

  const rowClass = arrived ? (left ? "arrived left" : "arrived") : (absent ? "not-expected" : "not-here");
  const dayOpen = dayIsOpen(currentDay);
  const notHereBtn = `<button class="btn-not-expected" onclick="openAbsentSheet('${esc(p.id)}')">Not here</button>`;
  let statusHtml;
  if (canEdit) {
    if (arrived) {
      statusHtml = `<div class="arrived-time">✓ ${timeStr}</div>` +
        (left ? `<div class="left-label">Left ${leftStr}${leftWhy ? " · " + esc(leftWhy) : ""}</div><button class="btn-undo" onclick="undoLeft('${esc(p.id)}')">Undo left</button>`
              : `<button class="btn-undo" onclick="undoCheckIn('${esc(p.id)}')">Undo</button> <button class="btn-not-expected" onclick="openLeftSheet('${esc(p.id)}')">Left early</button>`);
    } else if (absent) {
      statusHtml = `<div class="not-expected-label">${esc(absentLabel(rec))}</div>` + (note ? `<div class="status-note">${esc(note)}</div>` : "") +
                 `<button class="btn-undo" onclick="undoNotExpected('${esc(p.id)}')">Undo</button>`;
    } else if (!dayOpen) {
      statusHtml = `<div class="arrived-time" style="opacity:.5;">Opens ${IW_DAY_LABELS[currentDay]}</div>${notHereBtn}`;
    } else {
      statusHtml = `<button class="btn-checkin" onclick="checkIn('${esc(p.id)}')">Check in</button>${notHereBtn}`;
    }
  } else {
    if (arrived) {
      statusHtml = `<div class="arrived-time">✓ ${timeStr}</div>` + (left ? `<div class="left-label">Left ${leftStr}${leftWhy ? " · " + esc(leftWhy) : ""}</div>` : "");
    } else if (absent) {
      statusHtml = `<div class="not-expected-label">${esc(absentLabel(rec))}</div>`;
    } else {
      statusHtml = `<div class="arrived-time" style="opacity:.5;">Not yet arrived</div>`;
    }
  }

  return `
    <div class="person-row ${rowClass}" id="row-${esc(p.id)}">
      <div class="person-avatar ${colour}">${esc(initials)}</div>
      <div class="person-info">
        <div class="person-name">${esc(p.name)}</div>
        <div class="person-sub">${esc(sub)}</div>
      </div>
      <div class="person-status">
        ${statusHtml}
      </div>
    </div>`;
}

function updateStats() {
  const people      = visiblePeople();
  const total       = people.length;
  const arrived     = people.filter(hasArrived).length;
  const absent      = people.filter(isAbsent);
  const outstand    = people.filter(p => !hasArrived(p) && !isAbsent(p)).length;
  const pct         = total ? Math.round(arrived / total * 100) : 0;
  const ill         = absent.filter(p => dayRec(p)["absentType_" + currentDay] === "ill").length;
  const dna         = absent.filter(p => dayRec(p)["absentType_" + currentDay] === "dna").length;
  const left        = people.filter(hasLeft).length;
  const declined    = allPeople.filter(isDeclined).length;

  document.getElementById("statArrived").textContent    = arrived;
  document.getElementById("statOutstanding").textContent = outstand;
  document.getElementById("statTotal").textContent       = total;
  document.getElementById("statPct").textContent         = pct + "%";
  const bits = [];
  if (absent.length - ill - dna > 0) bits.push((absent.length - ill - dna) + " not expected");
  if (ill) bits.push(ill + " known ill");
  if (dna) bits.push(dna + " did not attend");
  if (left) bits.push(left + " left early");
  if (declined) bits.push(declined + " declined (left out)");
  const line = document.getElementById("statLine");
  if (line) { line.textContent = bits.join("  ·  "); line.classList.toggle("hidden", !bits.length); }
}
