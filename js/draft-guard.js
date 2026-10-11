/* Draft protection for rating / feedback pages (2026-10-10, per Jon: scrolling and
 * reloading the page wiped entries).
 *   - stops pull-to-refresh from reloading the page mid-scroll (overscroll-behavior)
 *   - keeps a copy of everything typed or tapped on this device (localStorage) until the
 *     server has confirmed it, so a reload puts it back
 *   - warns before leaving or reloading while anything is unsaved
 *   - shows a "you have submitted" banner that survives reloads
 * Everything is wrapped in try/catch: storage can be blocked (private windows, in-app
 * browsers) and the page must still work without it. */
(function () {
  var st = document.createElement("style");
  st.textContent = "html,body{overscroll-behavior-y:contain}" +
    ".dg-banner{display:flex;align-items:center;gap:8px;padding:8px 14px;font-size:13px;font-weight:700;border-bottom:1px solid #b5d9bc;background:#e6f4ea;color:#1a6e31}" +
    ".dg-banner.warn{background:#fff3cd;color:#8a5a00;border-color:#f0d58a}" +
    ".dg-banner.err{background:#fde8e4;color:#b7410e;border-color:#f4bfb6}" +
    ".dg-banner small{font-weight:600;opacity:.85}" +
    ".dg-tick{display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:800;color:#1a6e31;background:#e6f4ea;border:1px solid #b5d9bc;border-radius:999px;padding:1px 8px;white-space:nowrap}";
  (document.head || document.documentElement).appendChild(st);

  var dirty = {};
  window.DraftGuard = {
    write: function (key, obj) { try { localStorage.setItem(key, JSON.stringify(obj)); } catch (e) {} },
    read: function (key) { try { return JSON.parse(localStorage.getItem(key) || "null"); } catch (e) { return null; } },
    clear: function (key) { try { localStorage.removeItem(key); } catch (e) {} },
    markDirty: function (id, v) { if (v === false) delete dirty[id]; else dirty[id] = true; },
    anyDirty: function () { for (var k in dirty) return true; return false; },
    /* Draw or update a banner. anchorId = id of an element to insert AFTER. kind: "", "warn", "err". */
    banner: function (id, anchorId, html, kind) {
      var el = document.getElementById(id);
      if (!html) { if (el) el.remove(); return; }
      if (!el) {
        el = document.createElement("div"); el.id = id; el.setAttribute("role", "status");
        var anchor = document.getElementById(anchorId);
        if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(el, anchor.nextSibling);
        else document.body.insertBefore(el, document.body.firstChild);
      }
      el.className = "dg-banner" + (kind ? " " + kind : "");
      el.innerHTML = html;
    },
    hhmm: function (ms) { var d = new Date(ms || Date.now()); return ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2); }
  };
  window.addEventListener("beforeunload", function (e) {
    if (window.DraftGuard.anyDirty()) { e.preventDefault(); e.returnValue = "Your last changes are still saving."; return e.returnValue; }
  });
})();
