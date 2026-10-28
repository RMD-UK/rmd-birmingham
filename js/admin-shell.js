/* Tab strip for admin pages that use the hub look (28 Oct 2026, Jon).
 *   ADMIN_TABS.start({ bar: element, tabs: [{ id, label, count?, warn?, onShow? }], def: "id" })
 * Panels are elements with class "tabpanel" and data-tab="<id>". The tab is kept in the URL hash (#id) so Back works and links can point at a tab.
 * setCount(id, n, warn) updates the little number on a tab. */
(function (root) {
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  function start(o) {
    var tabs = o.tabs, bar = o.bar, shown = {};
    function cur() { var k = (location.hash || "").replace(/^#/, ""); return tabs.some(function (t) { return t.id === k; }) ? k : (o.def || tabs[0].id); }
    function draw() {
      var k = cur();
      bar.innerHTML = tabs.map(function (t) { return '<button type="button" data-tab="' + esc(t.id) + '" class="' + (t.id === k ? "on" : "") + '">' + esc(t.label) + (t.count != null ? '<span class="n' + (t.warn ? " warn" : "") + '">' + esc(t.count) + "</span>" : "") + "</button>"; }).join("");
      bar.querySelectorAll("button").forEach(function (b) { b.onclick = function () { location.hash = b.dataset.tab; }; });
      document.querySelectorAll(".tabpanel").forEach(function (p) { p.classList.toggle("on", p.dataset.tab === k); });
      var t = tabs.filter(function (x) { return x.id === k; })[0];
      if (t && t.onShow && !shown[k]) { shown[k] = true; t.onShow(); }
    }
    root.addEventListener("hashchange", function () { draw(); root.scrollTo(0, 0); });
    draw();
    return {
      setCount: function (id, n, warn) { var t = tabs.filter(function (x) { return x.id === id; })[0]; if (t) { t.count = n; t.warn = !!warn; draw(); } },
      show: function (id) { location.hash = id; }
    };
  }
  root.ADMIN_TABS = { start: start };
})(window);
