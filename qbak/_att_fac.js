
// ── Faculty lookup mode (2026-10-11, per Jon) ─────────────────────────────
// Open this page as iw-checkin.html?mode=faculty. For faculty, trainers and
// directors who are signed in: the names are loaded as soon as the page opens
// (and kept on the phone, so they appear straight away next time even on poor
// signal), search is instant and local, and a check-in that cannot be sent is
// kept on the phone and sent when the signal returns. The candidate kiosk
// above is unchanged apart from loading names on arrival and explaining a
// failure instead of showing nothing.
const MODE = new URLSearchParams(location.search).get("mode") === "faculty" ? "faculty" : "kiosk";
const PEOPLE_CACHE_KEY = "iwPeopleCache_v1";
const QUEUE_KEY = "iwCheckinQueue_v1";
function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } }
let facultyUser = null, attToday = {}, listState = "loading", listErr = "";

function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((_, rej) => setTimeout(() => rej({ code: "timeout", message: "timed out" }), ms))]);
}

async function loadPeopleList() {
  const [snap] = await withTimeout(Promise.all([db.collection(COLLECTIONS.people).get(), ensureIwAssignmentsCache()]), 20000);
  allPeopleCache = snap.docs.map(d => { const x = d.data(); return { id: d.id, name: x.name || "", role: x.role || "", roleLabel: x.roleLabel || "", group: x.group || "" }; });
  lsSet(PEOPLE_CACHE_KEY, JSON.stringify({ at: Date.now(), people: allPeopleCache, assign: iwAssignmentsCache || {} }));
}

if (MODE === "faculty") (function startFacultyMode() {
  document.body.classList.add("faculty-mode");
  document.getElementById("searchWrap").classList.add("hidden");
  document.getElementById("facultyWrap").classList.remove("hidden");
  document.getElementById("hdrSub").textContent = "Faculty lookup: find someone and check them in";
  document.getElementById("modeLink").innerHTML = '<a href="iw-checkin.html">Candidate kiosk</a>';
  if (!IW_DAY) { document.getElementById("facultyWrap").classList.add("hidden"); return; }

  // Names saved on this phone appear immediately
  try {
    const c = JSON.parse(lsGet(PEOPLE_CACHE_KEY) || "null");
    if (c && c.people && c.people.length) { allPeopleCache = c.people; iwAssignmentsCache = c.assign || {}; listState = "cached"; }
  } catch (e) { /* ignore */ }
  fRender();

  auth.onAuthStateChanged(async user => {
    if (!user) { window.location.href = "signin.html"; return; }
    facultyUser = user;
    try { await loadPeopleList(); listState = "live"; listErr = ""; }
    catch (e) {
      listErr = (e && (e.code || e.message)) || "unknown";
      if (!allPeopleCache) listState = "error"; else listState = "cached";
    }
    fRender();
    try {
      db.collection(COLLECTIONS.attendance).onSnapshot(snap => {
        attToday = {}; snap.docs.forEach(d => { attToday[d.id] = d.data(); });
        fRender();
      }, () => { /* status badges simply stay as they were */ });
    } catch (e) { /* ignore */ }
    flushQueue();
  });
  window.addEventListener("online", flushQueue);
  setTimeout(() => { const i = document.getElementById("fInput"); if (i) i.focus(); }, 300);
})();

function fRoleLabel(p) { const r = effectiveRole(p, iwAssignmentsCache); return customRoleLabel(p.roleLabel) || ROLE_LABELS[r] || r || ""; }
function getQueue() { try { return JSON.parse(lsGet(QUEUE_KEY) || "[]"); } catch (e) { return []; } }
function setQueue(q) { lsSet(QUEUE_KEY, JSON.stringify(q)); }

function fRender() {
  if (MODE !== "faculty") return;
  const q = (document.getElementById("fInput")?.value || "").trim().toLowerCase();
  const words = q.split(/\s+/).filter(Boolean);
  const people = allPeopleCache || [];
  const arrived = people.filter(p => attToday[p.id]?.["arrived_" + IW_DAY]).length;
  const st = document.getElementById("fStatus");
  if (listState === "loading") st.textContent = "Loading names...";
  else if (listState === "error") st.innerHTML = 'The name list could not be loaded (' + esc(listErr) + '). Check you are signed in as faculty, a trainer or a director, then <a href="#" onclick="location.reload();return false;" style="color:#fff;">try again</a>.';
  else st.textContent = people.length + " names ready" + (arrived ? " · " + arrived + " checked in today" : "") + (listState === "cached" ? " · using the list saved on this phone" : "");

  const pend = getQueue();
  const pb = document.getElementById("fPending");
  pb.classList.toggle("hidden", !pend.length);
  pb.innerHTML = pend.length ? pend.length + " check-in" + (pend.length > 1 ? "s" : "") + " waiting to send. They will go as soon as there is signal. <button onclick=\"flushQueue()\">Send now</button>" : "";

  const res = document.getElementById("fResults");
  if (!words.length) { res.innerHTML = ""; return; }
  const matches = people.filter(p => { const n = (p.name || "").toLowerCase(); return words.every(w => n.includes(w)); }).slice(0, 12);
  if (!matches.length) { res.innerHTML = '<div class="f-none">No one found. Try fewer letters, or the other spelling.</div>'; return; }
  res.innerHTML = matches.map(p => {
    const rec = attToday[p.id] || {};
    const a = rec["arrived_" + IW_DAY];
    const pending = pend.some(x => x.id === p.id && x.day === IW_DAY);
    let t = "";
    if (a) { const d = a.toDate ? a.toDate() : new Date(a); t = String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); }
    const badge = a ? '<div class="f-done">✓ Checked in ' + t + '</div>'
      : pending ? '<div class="f-pend">Saved, sending...</div>'
      : '<button class="f-go" onclick="checkInFaculty(\'' + esc(p.id) + '\')">' + (rec.declinedIw ? 'Check in anyway' : 'Check in') + '</button>';
    return '<div class="f-card ' + (a ? "is-in" : "") + '"><div><div class="f-name">' + esc(p.name) + '</div><div class="f-sub">' +
      esc([fRoleLabel(p), p.group].filter(Boolean).join(" · ")) + (rec.declinedIw && !a ? ' · <b>declined on registration</b>' : '') + '</div></div>' + badge + '</div>';
  }).join("");
}

function checkInPayload(ms) {
  const del = () => firebase.firestore.FieldValue.delete();
  return {
    ["arrived_" + IW_DAY]: ms ? firebase.firestore.Timestamp.fromMillis(ms) : firebase.firestore.FieldValue.serverTimestamp(),
    ["checkedInBy_" + IW_DAY]: "faculty:" + (facultyUser ? facultyUser.uid : "unknown"),
    ["notExpected_" + IW_DAY]: del(), ["markedNotExpectedBy_" + IW_DAY]: del(), ["markedNotExpectedAt_" + IW_DAY]: del(),
    ["absentType_" + IW_DAY]: del(), ["absentReason_" + IW_DAY]: del(), ["absentNote_" + IW_DAY]: del()
  };
}
async function checkInFaculty(id) {
  if (!IW_DAY || !facultyUser) return;
  const p = (allPeopleCache || []).find(x => x.id === id);
  const q = getQueue();
  if (q.some(x => x.id === id && x.day === IW_DAY)) return;
  const at = Date.now();
  try {
    await withTimeout(db.collection(COLLECTIONS.attendance).doc(id).set(checkInPayload(null), { merge: true }), 6000);
    toastF((p ? p.name : "Checked in") + " checked in ✓");
  } catch (e) {
    q.push({ id, day: IW_DAY, at }); setQueue(q);
    toastF("No signal. Saved on this phone, will send soon");
  }
  fRender();
}
let flushing = false;
async function flushQueue() {
  if (flushing || !facultyUser) return;
  let q = getQueue(); if (!q.length) return;
  flushing = true;
  const left = [];
  for (const item of q) {
    try { await withTimeout(db.collection(COLLECTIONS.attendance).doc(item.id).set(Object.assign(checkInPayload(item.at), {}), { merge: true }), 8000); }
    catch (e) { left.push(item); }
  }
  setQueue(left); flushing = false; fRender();
  if (q.length && !left.length) toastF("All waiting check-ins sent ✓");
}
let toastT;
function toastF(msg) { const t = document.getElementById("fToast"); t.textContent = msg; t.classList.add("show"); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("show"), 2600); }
