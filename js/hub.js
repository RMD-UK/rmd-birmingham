/* Hub engine (28 Oct 2026, Jon): home screen of group tiles, then one page per group, with the
 * browser Back button working through the URL hash (#people, #tools ...). Same pattern as member-menu.html.
 *
 *   HUB.start({
 *     root: element, groups: [{ id, name, line }], items: [...], ctx: {...},
 *     homeTop: ctx => html           optional, shown above the tiles (search box, notes)
 *     onHome: root => {}             optional, called after the home screen is drawn
 *     homeLabel: "Everything"        optional heading above the tiles
 *     foot: html
 *   })
 *
 * An item is a link card { id, g, sub, icon, title, text, href(ctx), target, tag(ctx), admin, show(ctx) }
 * or a settings panel { id, g, sub, panel(ctx) -> html, mount() } where mount runs after the panel is on screen.
 * show defaults to "everyone". A group with no visible items is not shown. */
(function (root) {
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var val = function (v, c) { return typeof v === "function" ? v(c) : v; };

  function start(o) {
    var ctx = o.ctx, groups = o.groups, items = o.items, el = o.root;
    var visible = function (k) { return !k.show || k.show(ctx); };
    var itemsFor = function (gid) { return items.filter(function (k) { return k.g === gid && visible(k); }); };
    var shownGroups = function () { return groups.filter(function (g) { return itemsFor(g.id).length; }); };

    function cardHtml(k) {
      var tag = k.tag ? k.tag(ctx) : "";
      return '<div class="card' + (k.pin ? " pin" : "") + '" id="' + esc(k.id) + '"><a class="card-main" href="' + esc(k.href(ctx)) + '"' + (k.target ? ' target="' + k.target + '" rel="noopener"' : "") + '>' +
        '<div class="card-icon">' + k.icon + '</div><div class="card-text"><div class="card-title">' + esc(k.title) + (tag ? ' <span class="tag">' + esc(tag) + "</span>" : "") + '</div>' +
        '<div class="card-sub">' + esc(val(k.text, ctx)) + '</div></div><div class="card-arrow">' + (k.target ? "&#8599;" : "&rsaquo;") + "</div></a></div>";
    }
    function blockHtml(list) {
      var one = function (l) { return l.map(function (k) { return k.panel ? k.panel(ctx) : ""; }).join("") + (l.some(function (k) { return !k.panel; }) ? '<div class="cards">' + l.filter(function (k) { return !k.panel; }).map(cardHtml).join("") + "</div>" : ""); };
      if (!list.some(function (k) { return k.sub; })) return one(list);
      var subs = []; list.forEach(function (k) { if (k.sub && subs.indexOf(k.sub) < 0) subs.push(k.sub); });
      var plain = list.filter(function (k) { return !k.sub; });
      return (plain.length ? one(plain) : "") + subs.map(function (s) { return '<p class="subhead">' + esc(s) + "</p>" + one(list.filter(function (k) { return k.sub === s; })); }).join("");
    }

    function render() {
      var vis = shownGroups(), key = (location.hash || "").replace(/^#/, ""), g = vis.filter(function (x) { return x.id === key; })[0];
      if (!g) {
        var pins = items.filter(function (k) { return k.pin && visible(k) && !k.panel; });
        el.innerHTML = (o.homeTop ? o.homeTop(ctx) : "") + '<div id="hubHome">' +
          (pins.length ? '<div class="section-label">Use most</div><div class="cards">' + pins.map(cardHtml).join("") + "</div>" : "") +
          '<div class="section-label">' + esc(o.homeLabel || "Everything") + '</div><div class="tiles">' +
          vis.map(function (x) { return '<a class="tile" href="#' + x.id + '" id="tile-' + x.id + '"><b><em>' + esc(x.name) + '</em><small class="n">' + itemsFor(x.id).length + "</small></b><span>" + esc(x.line) + "</span></a>"; }).join("") +
          "</div></div>" + (o.foot || "");
        if (o.onHome) o.onHome(el);
        return;
      }
      el.innerHTML = '<div class="crumb"><button type="button" class="back" id="backBtn">&lsaquo; ' + esc(o.backLabel || "Back") + "</button><h2>" + esc(g.name) + '</h2></div><p class="group-line">' + esc(g.line) + "</p>" + blockHtml(itemsFor(g.id)) + (o.foot || "");
      document.getElementById("backBtn").onclick = function () { location.hash = ""; };
      itemsFor(g.id).forEach(function (k) { if (k.panel && k.mount) k.mount(); });
    }
    root.addEventListener("hashchange", function () { render(); root.scrollTo(0, 0); });
    render();
    return { render: render };
  }
  root.HUB = { start: start, esc: esc };
})(window);
