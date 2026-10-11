async function markNotExpected(personId) { return openAbsentSheet(personId); }

// ── "Not here" sheet (2026-10-11, per Jon) ───────────────────────────────
// One place to record why someone is not in the room today: not expected,
// known ill, or did not attend (with a reason). Stored per day beside the
// existing notExpected_<day> flag, which is still set for all three so the
// Outstanding count and every other page keep working unchanged.
const ABSENT_TYPES = { notexpected: "Not expected", ill: "Known ill", dna: "Did not attend" };
const DNA_REASONS = {
  contacted: "Contacted, not attending",
  forgot:    "Forgot",
  notatt:    "Not attending",
  nocontact: "No contact yet",
  other:     "Other"
};
let sheetState = null;

function absentLabel(rec) {
  const t = rec?.["absentType_" + currentDay] || "notexpected";
  let s = ABSENT_TYPES[t] || "Not expected";
  const r = rec?.["absentReason_" + currentDay];
  if (t === "dna" && r && DNA_REASONS[r]) s += " · " + DNA_REASONS[r];
  return s;
}

function openAbsentSheet(personId) {
  if (!canEdit) return;
  const person = allPeople.find(p => p.id === personId);
  sheetState = { kind: "absent", personId, type: "notexpected", reason: "", note: "" };
  drawSheet("Not here: " + (person?.name || "attendee"), absentSheetBody());
}
function absentSheetBody() {
  const s = sheetState;
  const typeBtns = Object.keys(ABSENT_TYPES).map(k =>
    `<button class="sh-opt ${s.type === k ? "on" : ""}" onclick="sheetPick('type','${k}')">${ABSENT_TYPES[k]}</button>`).join("");
  let reasons = "";
  if (s.type === "dna") {
    reasons = `<div class="sh-lbl">Reason</div><div class="sh-opts">` + Object.keys(DNA_REASONS).map(k =>
      `<button class="sh-opt ${s.reason === k ? "on" : ""}" onclick="sheetPick('reason','${k}')">${DNA_REASONS[k]}</button>`).join("") + `</div>`;
  }
  return `<div class="sh-lbl">Status for ${IW_DAY_LABELS[currentDay]}</div><div class="sh-opts">${typeBtns}</div>${reasons}
    <div class="sh-lbl">Note (optional)</div>
    <input class="sh-input" id="shNote" type="text" maxlength="200" placeholder="Anything useful, for example who you spoke to" value="${esc(s.note)}" oninput="sheetState.note=this.value">
    <div class="sh-actions"><button class="sh-cancel" onclick="closeSheet()">Cancel</button><button class="sh-save" onclick="saveAbsent()">Save</button></div>`;
}
function sheetPick(field, val) {
  sheetState[field] = val;
  if (field === "type" && val !== "dna") sheetState.reason = "";
  drawSheet(document.getElementById("shTitle").textContent, sheetState.kind === "absent" ? absentSheetBody() : leftSheetBody());
}
function drawSheet(title, body) {
  let el = document.getElementById("sheetWrap");
  if (!el) { el = document.createElement("div"); el.id = "sheetWrap"; document.body.appendChild(el); }
  el.innerHTML = `<div class="sh-scrim" onclick="closeSheet()"></div><div class="sh-card" role="dialog" aria-modal="true"><div class="sh-title" id="shTitle">${esc(title)}</div>${body}</div>`;
}
function closeSheet() { const el = document.getElementById("sheetWrap"); if (el) el.remove(); sheetState = null; }

async function saveAbsent() {
  const s = sheetState; if (!s) return;
  if (s.type === "dna" && !s.reason) { showToast("Choose a reason first", ""); return; }
  const d = currentDay;
  const data = {
    ["notExpected_" + d]: true,
    ["markedNotExpectedBy_" + d]: currentUser?.uid || "manual",
    ["markedNotExpectedAt_" + d]: firebase.firestore.FieldValue.serverTimestamp(),
    ["absentType_" + d]: s.type,
    ["absentReason_" + d]: s.reason || firebase.firestore.FieldValue.delete(),
    ["absentNote_" + d]: (s.note || "").trim() || firebase.firestore.FieldValue.delete()
  };
  const person = allPeople.find(p => p.id === s.personId);
  try {
    await db.collection(COLLECTIONS.attendance).doc(s.personId).set(data, { merge: true });
    attendance[s.personId] = { ...(attendance[s.personId] || {}), ["notExpected_" + d]: true, ["absentType_" + d]: s.type, ["absentReason_" + d]: s.reason, ["absentNote_" + d]: s.note };
    showToast(`${person?.name || "Attendee"}: ${ABSENT_TYPES[s.type].toLowerCase()}`, "");
  } catch (e) {
    showToast("Not saved: " + (e.code || e.message), "");
    return;
  }
  closeSheet(); renderList();
}

async function undoNotExpected(personId) {
  if (!canEdit) return;
  const d = currentDay, del = () => firebase.firestore.FieldValue.delete();
  try {
    // Field-level deletes only: the other day's data, and this day's
    // arrival, must stay intact.
    await db.collection(COLLECTIONS.attendance).doc(personId).set({
      ["notExpected_" + d]: del(), ["markedNotExpectedBy_" + d]: del(), ["markedNotExpectedAt_" + d]: del(),
      ["absentType_" + d]: del(), ["absentReason_" + d]: del(), ["absentNote_" + d]: del()
    }, { merge: true });
  } catch (e) { showToast("Not saved: " + (e.code || e.message), ""); return; }
  if (attendance[personId]) ["notExpected_", "absentType_", "absentReason_", "absentNote_"].forEach(k => delete attendance[personId][k + d]);
  renderList();
}

// ── Left during the course (2026-10-11, per Jon) ─────────────────────────
const LEFT_REASONS = { unwell: "Unwell", family: "Family or personal", clinical: "Called to work or clinical", transport: "Transport or travel", other: "Other" };
function openLeftSheet(personId) {
  if (!canEdit) return;
  const person = allPeople.find(p => p.id === personId);
  const now = new Date();
  sheetState = { kind: "left", personId, time: String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0"), reason: "", note: "" };
  drawSheet("Left early: " + (person?.name || "attendee"), leftSheetBody());
}
function leftSheetBody() {
  const s = sheetState;
  const reasons = Object.keys(LEFT_REASONS).map(k =>
    `<button class="sh-opt ${s.reason === k ? "on" : ""}" onclick="sheetPick('reason','${k}')">${LEFT_REASONS[k]}</button>`).join("");
  return `<div class="sh-lbl">Time they left</div>
    <input class="sh-input" id="shTime" type="time" value="${esc(s.time)}" oninput="sheetState.time=this.value">
    <div class="sh-lbl">Reason</div><div class="sh-opts">${reasons}</div>
    <div class="sh-lbl">Note (optional)</div>
    <input class="sh-input" id="shNote" type="text" maxlength="200" placeholder="For example: back on Sunday, will catch up" value="${esc(s.note)}" oninput="sheetState.note=this.value">
    <div class="sh-actions"><button class="sh-cancel" onclick="closeSheet()">Cancel</button><button class="sh-save" onclick="saveLeft()">Save</button></div>`;
}
async function saveLeft() {
  const s = sheetState; if (!s) return;
  if (!s.reason) { showToast("Choose a reason first", ""); return; }
  if (!/^\d{2}:\d{2}$/.test(s.time || "")) { showToast("Enter the time they left", ""); return; }
  const d = currentDay, base = IW_DATES[d];
  const when = new Date(base.getFullYear(), base.getMonth(), base.getDate(), Number(s.time.slice(0, 2)), Number(s.time.slice(3, 5)));
  const person = allPeople.find(p => p.id === s.personId);
  try {
    await db.collection(COLLECTIONS.attendance).doc(s.personId).set({
      ["left_" + d]: firebase.firestore.Timestamp.fromDate(when),
      ["leftReason_" + d]: s.reason,
      ["leftNote_" + d]: (s.note || "").trim() || firebase.firestore.FieldValue.delete(),
      ["leftBy_" + d]: currentUser?.uid || "manual"
    }, { merge: true });
    attendance[s.personId] = { ...(attendance[s.personId] || {}), ["left_" + d]: when, ["leftReason_" + d]: s.reason, ["leftNote_" + d]: s.note };
    showToast(`${person?.name || "Attendee"} left at ${s.time}`, "");
  } catch (e) { showToast("Not saved: " + (e.code || e.message), ""); return; }
  closeSheet(); renderList();
}
async function undoLeft(personId) {
  if (!canEdit) return;
  const d = currentDay, del = () => firebase.firestore.FieldValue.delete();
  try {
    await db.collection(COLLECTIONS.attendance).doc(personId).set({ ["left_" + d]: del(), ["leftReason_" + d]: del(), ["leftNote_" + d]: del(), ["leftBy_" + d]: del() }, { merge: true });
  } catch (e) { showToast("Not saved: " + (e.code || e.message), ""); return; }
  if (attendance[personId]) ["left_", "leftReason_", "leftNote_", "leftBy_"].forEach(k => delete attendance[personId][k + d]);
  renderList();
}

// ── Declined people (2026-10-11, per Jon) ────────────────────────────────
// People who told us they are not coming (declined on the IW registrations
// page or on the faculty form) should not sit in the Outstanding count.
// iw_registrations and faculty_responses can only be read by a Director, so
// a Director opening this page copies the result onto each person's
// attendance record as declinedIw, which everyone else can read. A person
// who arrives anyway is shown as arrived regardless.
function isDeclined(p) {
  const r = attendance[p.id];
  return !!r?.declinedIw && !r?.arrived_saturday && !r?.arrived_sunday;
}
async function syncDeclines() {
  try {
    const [regSnap, respSnap] = await Promise.all([
      db.collection(COLLECTIONS.iwRegistrations).get(),
      db.collection("faculty_responses").get()
    ]);
    const confirmed = new Set(), declinedE = new Set(), declinedN = new Set();
    const nm = r => (r.name || [r.firstName, r.lastName].filter(Boolean).join(" ")).trim().toLowerCase();
    regSnap.docs.forEach(d => {
      const r = d.data(), e = (r.email || "").trim().toLowerCase();
      if (r.status === "confirmed" && e) confirmed.add(e);
      if (r.status === "declined") { if (e) declinedE.add(e); else if (nm(r)) declinedN.add(nm(r)); }
    });
    respSnap.docs.forEach(d => {
      const r = d.data(), e = (r.email || d.id || "").trim().toLowerCase();
      if (r.attendanceStatus === "declined" && !confirmed.has(e)) { if (e) declinedE.add(e); else if (nm(r)) declinedN.add(nm(r)); }
    });
    const writes = [];
    allPeople.forEach(p => {
      const e = (p.email || "").trim().toLowerCase();
      const should = (e && declinedE.has(e) && !confirmed.has(e)) || (!e && declinedN.has((p.name || "").trim().toLowerCase()));
      const has = !!attendance[p.id]?.declinedIw;
      if (should && !has) writes.push([p.id, { declinedIw: true, declinedIwAt: firebase.firestore.FieldValue.serverTimestamp() }]);
      if (!should && has) writes.push([p.id, { declinedIw: firebase.firestore.FieldValue.delete(), declinedIwAt: firebase.firestore.FieldValue.delete() }]);
    });
    for (let i = 0; i < writes.length; i += 400) {
      const batch = db.batch();
      writes.slice(i, i + 400).forEach(w => batch.set(db.collection(COLLECTIONS.attendance).doc(w[0]), w[1], { merge: true }));
      await batch.commit();
    }
  } catch (e) { console.warn("Decline sync skipped:", e.message); }
}
