// ── Stage 1 master Google Sheet: keep it in step with the website ────────────
// Rewritten 2026-10-11 (Jon): "make this whole process for keeping the Google
// Sheet always synced and correct". The website is the single source of
// truth; the sheet is a mirror. Four layers, so one failing never leaves it
// wrong for long:
//   1. reconcileStage1Sheet() — ONE read of the sheet + ONE read of the
//      candidates, then at most a handful of batched writes however many
//      people are involved. Does everything: course/room (G:H), appends
//      candidates who are on the website but not in the sheet (flagged as
//      added after the bulk set-up), strikes through people removed from
//      the website, and un-strikes anyone who has been put back.
//   2. backfillStage1CourseToSheet — director callable wrapper around (1);
//      the website calls it right after imports, deletions, allocations and
//      room moves, and from the Push-to-sheet button.
//   3. reconcileStage1SheetScheduled — runs (1) every 30 minutes as a safety
//      net, so anything a trigger or a rate-limited burst missed is repaired
//      without anyone remembering to press anything.
//   4. syncStage1CourseToSheet — per-document trigger for instant updates of
//      course/room/email edits, and durable recording of removals
//      (stage1_sheet_removals/{email}, applied:false until the strike-through
//      has actually landed in the sheet; (1) retries any that are pending).
// "Added after the bulk set-up" is defined by the sheet itself: anyone on the
// website with no row in the sheet is, by definition, not part of the
// original list. They get a new row at the bottom, tinted amber, with a note
// in column J ("Added after bulk import (date)").
const STAGE1_SHEET_NOTE_COL = "J"; // 10th column — "Website note"; A–I are the team's own columns
const STAGE1_SHEET_NOTE_HEADER = "Website note";
const STAGE1_REMOVED_RE = /(?:\s*\|\s*)?Removed from website[^|]*/;

function stage1Today() {
  return new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" });
}
function stage1NoteWithRemoval(note, today) {
  const base = String(note || "").replace(STAGE1_REMOVED_RE, "").trim();
  return (base ? base + " | " : "") + `Removed from website ${today}`;
}
function stage1NoteWithoutRemoval(note) {
  return String(note || "").replace(STAGE1_REMOVED_RE, "").trim();
}
// firstName/surname are stored separately on candidates imported from
// 2026-10-11; older records only have the combined name, split on the last
// space as a best guess (compound surnames may need a manual fix in the sheet).
function stage1SplitName(c) {
  let first = String(c.firstName || "").trim();
  let last = String(c.surname || "").trim();
  if (!first && !last) {
    const parts = String(c.name || "").trim().split(/\s+/).filter(Boolean);
    if (parts.length > 1) { last = parts.pop(); first = parts.join(" "); }
    else first = parts[0] || "";
  }
  return { first, last };
}
function stage1NewSheetRow(c, today) {
  const { first, last } = stage1SplitName(c);
  const course = c.course || "";
  return [last, first, String(c.email).trim(), c.degree || "", c.studentId || "", c.yearOfStudy || "",
    course, course ? (c.room || "") : "", "", `Added after bulk import (${today})`];
}

let stage1SheetNumericId = null;
async function stage1SheetsNumericId() {
  if (stage1SheetNumericId !== null) return stage1SheetNumericId;
  const meta = await stage1SheetsApiFetch(`?fields=sheets.properties(sheetId,title)`);
  const tab = (meta.sheets || []).map(s => s.properties).find(p => p.title === STAGE1_SHEET_TAB);
  if (!tab) throw new Error(`Tab "${STAGE1_SHEET_TAB}" not found in the master sheet.`);
  stage1SheetNumericId = tab.sheetId;
  return stage1SheetNumericId;
}
function stage1FormatRequest(sheetId, row, kind) {
  const range = { sheetId, startRowIndex: row - 1, endRowIndex: row, startColumnIndex: 0, endColumnIndex: 10 };
  if (kind === "late") {
    return { repeatCell: { range, cell: { userEnteredFormat: { backgroundColor: { red: 1, green: 0.949, blue: 0.8 } } }, fields: "userEnteredFormat.backgroundColor" } };
  }
  const struck = kind === "struck";
  return { repeatCell: { range,
    cell: { userEnteredFormat: { textFormat: { strikethrough: struck, foregroundColor: struck ? { red: 0.6, green: 0.6, blue: 0.6 } : { red: 0, green: 0, blue: 0 } } } },
    fields: "userEnteredFormat.textFormat.strikethrough,userEnteredFormat.textFormat.foregroundColor" } };
}
async function stage1WriteValues(updates) {
  const CHUNK = 500;
  for (let i = 0; i < updates.length; i += CHUNK) {
    await stage1SheetsApiFetch(`/values:batchUpdate`, {
      method: "POST",
      body: JSON.stringify({ valueInputOption: "RAW", data: updates.slice(i, i + CHUNK) }),
    });
  }
}
async function stage1WriteFormats(fmt) {
  if (!fmt.length) return;
  const sheetId = await stage1SheetsNumericId();
  const CHUNK = 400;
  for (let i = 0; i < fmt.length; i += CHUNK) {
    await stage1SheetsApiFetch(`:batchUpdate`, {
      method: "POST",
      body: JSON.stringify({ requests: fmt.slice(i, i + CHUNK).map(f => stage1FormatRequest(sheetId, f.row, f.kind)) }),
    });
  }
}

async function reconcileStage1Sheet({ dryRun = false, strikeMissing = false } = {}) {
  const tab = encodeURIComponent(STAGE1_SHEET_TAB);
  const [snap, removalsSnap, sheetData, headerData] = await Promise.all([
    db.collection("stage1_candidates").get(),
    db.collection("stage1_sheet_removals").where("applied", "==", false).get(),
    stage1SheetsApiFetch(`/values/${tab}!A2:J`),
    stage1SheetsApiFetch(`/values/${tab}!${STAGE1_SHEET_NOTE_COL}1`),
  ]);

  const cands = [];
  const siteEmails = new Set();
  snap.docs.forEach(d => {
    const c = d.data();
    const e = String(c.email || "").trim().toLowerCase();
    if (!e || siteEmails.has(e)) return;
    siteEmails.add(e);
    cands.push({ ...c, _email: e });
  });

  const rows = sheetData.values || [];
  const rowByEmail = new Map();
  const duplicates = [];
  rows.forEach((r, i) => {
    const e = String(r[2] || "").trim().toLowerCase();
    if (!e) return;
    if (rowByEmail.has(e)) duplicates.push(e); else rowByEmail.set(e, i + 2); // +1 header, +1 for 1-indexing
  });

  const today = stage1Today();
  const valueUpdates = [];
  const fmt = [];
  const struckRows = new Set();
  const added = [], restored = [], struck = [], notOnWebsite = [];
  let courseRoomUpdates = 0;

  for (const c of cands) {
    const row = rowByEmail.get(c._email);
    if (!row) { added.push(c); continue; }
    const cur = rows[row - 2] || [];
    const wantCourse = c.course || "";
    const wantRoom = c.course ? (c.room || "") : "";
    if ((cur[6] || "") !== wantCourse || (cur[7] || "") !== wantRoom) {
      valueUpdates.push({ range: `${STAGE1_SHEET_TAB}!${STAGE1_SHEET_COURSE_COL}${row}:${STAGE1_SHEET_ROOM_COL}${row}`, values: [[wantCourse, wantRoom]] });
      courseRoomUpdates++;
    }
    const note = cur[9] || "";
    if (STAGE1_REMOVED_RE.test(note)) { // put back on the website after being removed
      valueUpdates.push({ range: `${STAGE1_SHEET_TAB}!${STAGE1_SHEET_NOTE_COL}${row}`, values: [[stage1NoteWithoutRemoval(note)]] });
      fmt.push({ row, kind: "unstruck" });
      restored.push(c);
    }
  }

  const strikeRow = (row, email, name) => {
    const note = (rows[row - 2] || [])[9] || "";
    if (STAGE1_REMOVED_RE.test(note) || struckRows.has(row)) return;
    valueUpdates.push({ range: `${STAGE1_SHEET_TAB}!${STAGE1_SHEET_NOTE_COL}${row}`, values: [[stage1NoteWithRemoval(note, today)]] });
    fmt.push({ row, kind: "struck" });
    struckRows.add(row);
    struck.push({ email, name });
  };

  // Removals recorded when someone was deleted from the website.
  const removalRefsApplied = [], removalRefsCancelled = [];
  for (const d of removalsSnap.docs) {
    const p = d.data();
    const e = String(p.email || "").trim().toLowerCase();
    if (!e) { removalRefsApplied.push(d.ref); continue; }
    if (siteEmails.has(e)) { removalRefsCancelled.push(d.ref); continue; } // since re-added
    const row = rowByEmail.get(e);
    if (row) strikeRow(row, e, p.name || "");
    removalRefsApplied.push(d.ref);
  }

  // Rows in the sheet with no matching website record and no recorded removal.
  for (const [e, row] of rowByEmail) {
    if (siteEmails.has(e)) continue;
    const cur = rows[row - 2] || [];
    if (STAGE1_REMOVED_RE.test(cur[9] || "") || struckRows.has(row)) continue;
    const name = `${cur[1] || ""} ${cur[0] || ""}`.trim();
    notOnWebsite.push({ email: e, name, row });
    if (strikeMissing) strikeRow(row, e, name);
  }

  let next = rows.length + 2;
  added.forEach(c => {
    valueUpdates.push({ range: `${STAGE1_SHEET_TAB}!A${next}:${STAGE1_SHEET_NOTE_COL}${next}`, values: [stage1NewSheetRow(c, today)] });
    fmt.push({ row: next, kind: "late" });
    next++;
  });
  const needHeader = !((headerData.values || [])[0] || [])[0];
  if (needHeader && (added.length || struck.length || restored.length)) {
    valueUpdates.push({ range: `${STAGE1_SHEET_TAB}!${STAGE1_SHEET_NOTE_COL}1`, values: [[STAGE1_SHEET_NOTE_HEADER]] });
  }

  const summary = {
    checked: cands.length,
    added: added.length,
    addedNames: added.map(c => c.name || c.email),
    restored: restored.length,
    struck: struck.length,
    struckNames: struck.map(s => s.name || s.email),
    notOnWebsite: notOnWebsite.map(n => ({ email: n.email, name: n.name })),
    duplicatesInSheet: duplicates,
    // legacy keys read by the allocation page's dry-run summary
    notFound: added.length,
    notFoundEmails: added.map(c => c.email),
  };

  if (dryRun) return { dryRun: true, wouldUpdate: courseRoomUpdates, ...summary };

  await stage1WriteValues(valueUpdates);
  let formatError = null;
  try { await stage1WriteFormats(fmt); } catch (err) { formatError = err.message; console.error("reconcileStage1Sheet: values written but formatting failed:", err.message); }

  const batch = db.batch();
  removalRefsApplied.forEach(ref => batch.set(ref, { applied: true, appliedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true }));
  removalRefsCancelled.forEach(ref => batch.delete(ref));
  if (removalRefsApplied.length || removalRefsCancelled.length) await batch.commit();

  return { dryRun: false, updated: courseRoomUpdates, formatError, ...summary };
}

exports.backfillStage1CourseToSheet = onCall({ region: "us-central1" }, async (request) => {
  const auth = request.auth;
  if (!auth) throw new HttpsError("unauthenticated", "Sign in required.");
  if (!(await callerIsDirector(auth))) {
    throw new HttpsError("permission-denied", "Course Directors only.");
  }
  return reconcileStage1Sheet({ dryRun: !!request.data?.dryRun, strikeMissing: !!request.data?.strikeMissing });
});

exports.reconcileStage1SheetScheduled = onSchedule(
  { schedule: "every 30 minutes", region: "us-central1", timeZone: "Europe/London" },
  async () => {
    try {
      const r = await reconcileStage1Sheet({ dryRun: false });
      console.log(`reconcileStage1SheetScheduled: checked ${r.checked}, course/room fixed ${r.updated}, added ${r.added}, struck ${r.struck}, restored ${r.restored}, not on website ${r.notOnWebsite.length}.`);
    } catch (err) {
      console.error("reconcileStage1SheetScheduled failed:", err.message);
    }
  }
);

exports.syncStage1CourseToSheet = onDocumentWritten(
  { document: "stage1_candidates/{candidateId}", region: "us-central1" },
  async (event) => {
    const before = event.data?.before?.exists ? event.data.before.data() : null;
    const after = event.data?.after?.exists ? event.data.after.data() : null;
    const emailOf = c => String(c?.email || "").trim().toLowerCase();

    try {
      // Removed from the website: record it durably, then try to strike the
      // row through straight away. If the Sheets call fails (rate limit,
      // outage) the record stays applied:false and the next reconcile does it.
      if (!after) {
        const email = emailOf(before);
        if (!email) return;
        const ref = db.collection("stage1_sheet_removals").doc(email);
        await ref.set({ email, name: before.name || "", removedAt: admin.firestore.FieldValue.serverTimestamp(), applied: false });
        const rows = ((await stage1SheetsApiFetch(`/values/${encodeURIComponent(STAGE1_SHEET_TAB)}!A2:J`)).values) || [];
        const idx = rows.findIndex(r => String(r[2] || "").trim().toLowerCase() === email);
        if (idx !== -1) {
          const row = idx + 2;
          const note = rows[idx][9] || "";
          if (!STAGE1_REMOVED_RE.test(note)) {
            await stage1WriteValues([{ range: `${STAGE1_SHEET_TAB}!${STAGE1_SHEET_NOTE_COL}${row}`, values: [[stage1NoteWithRemoval(note, stage1Today())]] }]);
            await stage1WriteFormats([{ row, kind: "struck" }]);
          }
        }
        await ref.set({ applied: true, appliedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
        console.log(`syncStage1CourseToSheet: struck through ${email}.`);
        return;
      }

      const email = emailOf(after);
      if (!email) return;

      // Newly created (or re-created): adding the row / lifting a strike-through
      // is done by reconcileStage1Sheet (called by the website right after an
      // import, and every 30 minutes) — a single writer, so a 230-person paste
      // can't race itself into duplicate rows. Just drop any stale removal note.
      if (!before) {
        await db.collection("stage1_sheet_removals").doc(email).delete().catch(() => {});
        return;
      }

      const courseNow = after.course || "";
      const roomNow = courseNow ? (after.room || "") : "";
      const courseWas = before.course || "";
      const roomWas = courseWas ? (before.room || "") : "";
      const emailWas = emailOf(before);
      if (courseWas === courseNow && roomWas === roomNow && emailWas === email) return; // nothing the sheet shows has changed

      const tab = encodeURIComponent(STAGE1_SHEET_TAB);
      const rows = ((await stage1SheetsApiFetch(`/values/${tab}!A2:J`)).values) || [];
      const find = e => rows.findIndex(r => String(r[2] || "").trim().toLowerCase() === e);
      let idx = find(email);
      if (idx === -1 && emailWas && emailWas !== email) {
        // the email was corrected on the website: carry the existing row over
        const oldIdx = find(emailWas);
        if (oldIdx !== -1) {
          await stage1WriteValues([{ range: `${STAGE1_SHEET_TAB}!C${oldIdx + 2}`, values: [[String(after.email).trim()]] }]);
          idx = oldIdx;
        }
      }
      if (idx === -1) {
        console.log(`syncStage1CourseToSheet: no row for ${email} yet — the next reconcile will add it.`);
        return;
      }
      const row = idx + 2;
      await stage1WriteValues([{ range: `${STAGE1_SHEET_TAB}!${STAGE1_SHEET_COURSE_COL}${row}:${STAGE1_SHEET_ROOM_COL}${row}`, values: [[courseNow, roomNow]] }]);
      console.log(`syncStage1CourseToSheet: wrote "${courseNow}" / "${roomNow}" for ${email} at row ${row}.`);
    } catch (err) {
      console.error(`syncStage1CourseToSheet: failed (${emailOf(after || before)}) — the scheduled reconcile will repair it.`, err.message);
    }
  }
);

