/* Roster tags and filters (2026-10-12, Jon).
 * Shared by course-roster-view.html, course-roster-edit.html and OPIS.
 *  - RAP = RMD Reasonable Adjustments Pathway (red cross), stored as stage1_candidates.rap
 *  - Two-plus attempt (lightbulb), stored as stage1_candidates.twoPlusAssessments
 * These are the same two fields as the "Set tags" mode on Course Allocation and
 * columns I and J of the Master sheet, so a tag set anywhere shows everywhere.
 * Also holds the filter bar (degree course + tags) used by both roster pages. */
(function () {
  var CROSS = '<svg class="rtag-svg" viewBox="0 0 10 10" width="14" height="14" aria-hidden="true"><path d="M3.4 0h3.2v3.4H10v3.2H6.6V10H3.4V6.6H0V3.4h3.4z" fill="#d11a2a"/></svg>';
  var BULB = '<span class="rtag-bulb" aria-hidden="true">💡</span>';
  var DEFS = [
    { key: "rap",                label: "RMD Reasonable Adjustments Pathway", short: "RAP",      icon: CROSS, cls: "t-rap" },
    { key: "twoPlusAssessments", label: "Two or more assessment attempts",     short: "Two-plus", icon: BULB,  cls: "t-two" }
  ];
  var state = { degrees: {}, degOpen: false, tags: {} };

  var css =
    ".rtag{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:6px;flex:0 0 auto}" +
    ".t-rap.rtag{background:#fde8ea}.t-two.rtag{background:#fff3cd}" +
    ".rtag-bulb{font-size:13px;line-height:1}" +
    ".pcard-tags{display:flex;gap:4px;flex:0 0 auto;align-items:center}" +
    ".rtag-btn{appearance:none;border:1.5px solid #d0d5e0;background:#fff;border-radius:7px;width:28px;height:28px;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;padding:0;filter:grayscale(1);opacity:.45}" +
    ".rtag-btn:hover{opacity:.9;filter:none}" +
    ".rtag-btn.on{filter:none;opacity:1}" +
    ".rtag-btn.on.t-rap{border-color:#d11a2a;background:#fde8ea}.rtag-btn.on.t-two{border-color:#e0a800;background:#fff3cd}" +
    ".rtag-btn:focus-visible{outline:2px solid #5b3a9d;outline-offset:1px}" +
    ".filter-bar{background:#fff;border-bottom:2px solid #e0e4ee;padding:10px 14px;display:flex;flex-wrap:wrap;gap:10px 14px;align-items:center;font-size:13px}" +
    ".filter-bar label{display:flex;align-items:center;gap:6px;font-weight:700;color:#1f2540}" +
    ".fb-deg{position:relative}" +
    ".fb-deg-btn{appearance:none;display:inline-flex;align-items:center;gap:8px;padding:7px 12px;border:1.5px solid #d0d5e0;border-radius:7px;background:#fff;font-size:13px;font-family:inherit;color:#1f2540;cursor:pointer;max-width:100%}" +
    ".fb-deg-btn.has{border-color:#1f2a5c;background:#eef1fb;font-weight:700}" +
    ".fb-deg-panel{position:absolute;left:0;top:calc(100% + 4px);min-width:260px;max-width:90vw;background:#fff;border:1.5px solid #d0d5e0;border-radius:10px;box-shadow:0 6px 18px rgba(0,0,0,.18);padding:6px;z-index:500;max-height:320px;overflow:auto}" +
    ".fb-deg-opt{display:flex;align-items:center;gap:8px;padding:7px 8px;border-radius:6px;cursor:pointer;font-weight:600;font-size:13px}" +
    ".fb-deg-opt:hover{background:#f4f6fb}" +
    ".fb-deg-opt input{width:16px;height:16px;margin:0}" +
    ".fb-deg-opt .fb-n{margin-left:auto;color:#5a6b8c;font-weight:600}" +
    ".fb-deg-foot{border-top:1px solid #eef1f8;margin-top:4px;padding:6px 8px 2px;display:flex;justify-content:space-between}" +
    ".fb-chip{appearance:none;display:inline-flex;align-items:center;gap:6px;border:1.5px solid #d0d5e0;background:#f4f6fb;border-radius:20px;padding:5px 12px;font-size:13px;font-weight:700;color:#1f2540;cursor:pointer;font-family:inherit}" +
    ".fb-chip.on{background:#1f2a5c;border-color:#1f2a5c;color:#fff}" +
    ".fb-chip .fb-n{opacity:.7;font-weight:600}" +
    ".fb-count{margin-left:auto;color:#5a6b8c;font-weight:600}" +
    ".fb-clear{appearance:none;border:none;background:none;color:#1a56a8;font-weight:700;cursor:pointer;font-family:inherit;font-size:13px;text-decoration:underline}" +
    ".rt-toast{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);background:#1f2540;color:#fff;padding:9px 16px;border-radius:10px;font-size:13px;font-weight:600;z-index:3000;box-shadow:0 4px 14px rgba(0,0,0,.3)}" +
    ".rt-toast.err{background:#b3261e}";
  var st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]; }); }

  function badges(c) {
    return DEFS.filter(function (d) { return c && c[d.key] === true; }).map(function (d) {
      return '<span class="rtag ' + d.cls + '" title="' + esc(d.label) + '" aria-label="' + esc(d.label) + '">' + d.icon + "</span>";
    }).join("");
  }
  function toggles(c) {
    return DEFS.map(function (d) {
      var on = c && c[d.key] === true;
      return '<button type="button" class="rtag-btn ' + d.cls + (on ? " on" : "") + '" data-rtag="' + d.key + '" data-cid="' + esc(c.id) + '" aria-pressed="' + (on ? "true" : "false") + '" title="' + esc((on ? "Remove: " : "Add: ") + d.label) + '" aria-label="' + esc(d.label) + '">' + d.icon + "</button>";
    }).join("");
  }
  function degKey(c) { return c.degree || "__none"; }
  function degreesSelected() { return Object.keys(state.degrees).some(function (k) { return state.degrees[k]; }); }
  function anyTagSelected() { return DEFS.some(function (d) { return state.tags[d.key]; }); }
  function passes(c) {
    if (degreesSelected() && !state.degrees[degKey(c)]) return false;
    if (anyTagSelected() && !DEFS.some(function (d) { return state.tags[d.key] && c[d.key] === true; })) return false;
    return true;
  }
  function active() { return degreesSelected() || anyTagSelected(); }

  // Draws the filter bar into el for the given course's candidates; onChange re-renders the roster.
  function renderFilterBar(el, candidates, onChange) {
    var degs = {};
    candidates.forEach(function (c) { var k = degKey(c); degs[k] = (degs[k] || 0) + 1; });
    Object.keys(state.degrees).forEach(function (k) { if (!degs[k]) delete state.degrees[k]; });   // not on this course
    var keys = Object.keys(degs).sort(function (a, b) { return (a === "__none" ? "~" : a).localeCompare(b === "__none" ? "~" : b, "en", { numeric: true }); });
    var picked = keys.filter(function (k) { return state.degrees[k]; });
    var shown = candidates.filter(passes).length;
    var degLabel = !picked.length ? "All degree courses (" + candidates.length + ")"
      : picked.length === 1 ? (picked[0] === "__none" ? "(no degree listed)" : picked[0]) + " (" + degs[picked[0]] + ")"
      : picked.length + " degree courses selected";
    var html = '<span style="display:flex;align-items:center;gap:6px;font-weight:700;color:#1f2540">Degree course ' +
      '<span class="fb-deg"><button type="button" class="fb-deg-btn' + (picked.length ? " has" : "") + '" id="fbDegBtn" aria-haspopup="true" aria-expanded="' + (state.degOpen ? "true" : "false") + '">' + esc(degLabel) + ' <span aria-hidden="true">\u25BE</span></button>' +
      (state.degOpen ? '<div class="fb-deg-panel" id="fbDegPanel">' +
        keys.map(function (k) { return '<label class="fb-deg-opt"><input type="checkbox" data-fbdeg="' + esc(k) + '"' + (state.degrees[k] ? " checked" : "") + '> ' + esc(k === "__none" ? "(no degree listed)" : k) + ' <span class="fb-n">(' + degs[k] + ")</span></label>"; }).join("") +
        '<div class="fb-deg-foot"><button type="button" class="fb-clear" id="fbDegClear">Select none</button><button type="button" class="fb-clear" id="fbDegDone">Done</button></div></div>' : "") +
      "</span></span>" +
      '<span style="display:inline-flex;gap:6px;flex-wrap:wrap;align-items:center"><span style="font-weight:700;color:#1f2540">Tags</span>' +
      DEFS.map(function (d) {
        var n = candidates.filter(function (c) { return c[d.key] === true; }).length;
        return '<button type="button" class="fb-chip' + (state.tags[d.key] ? " on" : "") + '" data-fbtag="' + d.key + '" aria-pressed="' + (state.tags[d.key] ? "true" : "false") + '" title="' + esc(d.label) + '">' + d.icon + " " + esc(d.short) + ' <span class="fb-n">(' + n + ")</span></button>";
      }).join("") + "</span>" +
      '<span class="fb-count">' + (active() ? "Showing " + shown + " of " + candidates.length : candidates.length + " candidates") + "</span>" +
      (active() ? '<button type="button" class="fb-clear" id="fbClear">Clear filters</button>' : "");
    el.innerHTML = html; el.style.display = "";
    el.querySelector("#fbDegBtn").onclick = function () { state.degOpen = !state.degOpen; onChange(); };
    Array.prototype.forEach.call(el.querySelectorAll("[data-fbdeg]"), function (cb) {
      cb.onchange = function () { state.degrees[cb.dataset.fbdeg] = cb.checked; onChange(); };
    });
    var dn = el.querySelector("#fbDegDone"); if (dn) dn.onclick = function () { state.degOpen = false; onChange(); };
    var dc = el.querySelector("#fbDegClear"); if (dc) dc.onclick = function () { state.degrees = {}; onChange(); };
    Array.prototype.forEach.call(el.querySelectorAll("[data-fbtag]"), function (b) {
      b.onclick = function () { state.tags[b.dataset.fbtag] = !state.tags[b.dataset.fbtag]; onChange(); };
    });
    var clr = el.querySelector("#fbClear");
    if (clr) clr.onclick = function () { state.degrees = {}; state.tags = {}; onChange(); };
    return { passes: passes, active: active() };
  }

  var toastTimer = null;
  function toast(msg, isErr) {
    var t = document.getElementById("rtToast");
    if (!t) { t = document.createElement("div"); t.id = "rtToast"; document.body.appendChild(t); }
    t.className = "rt-toast" + (isErr ? " err" : ""); t.textContent = msg; t.style.display = "";
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.style.display = "none"; }, isErr ? 6000 : 2200);
  }

  document.addEventListener("click", function (e) {
    if (state.degOpen && !(e.target.closest && e.target.closest(".fb-deg"))) {
      state.degOpen = false;
      var btn = document.getElementById("fbDegBtn"), panel = document.getElementById("fbDegPanel");
      if (panel) panel.remove(); if (btn) btn.setAttribute("aria-expanded", "false");
    }
  });

  window.RMD_TAGS = { DEFS: DEFS, badges: badges, toggles: toggles, passes: passes, active: active, renderFilterBar: renderFilterBar, toast: toast };
})();
