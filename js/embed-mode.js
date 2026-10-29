// Embed mode: when a page is opened inside the Instructor application review hub
// (?embed=1 inside an iframe) hide its own top bar and report its height to the hub.
(function () {
  var EMBED = /[?&]embed=1/.test(location.search) && window.self !== window.top;
  if (!EMBED) return;
  var st = document.createElement("style");
  st.textContent =
    "html,body{background:transparent!important;min-height:0!important;height:auto!important}" +
    "body{padding:0!important;margin:0!important}" +
    ".top-bar{display:none!important}" +
    ".page,.wrap{max-width:none!important;padding-top:0!important;padding-left:0!important;padding-right:0!important;margin:0!important}";
  document.head.appendChild(st);
  document.body.classList.add("embed");
  var last = 0;
  function tell() {
    var h = Math.ceil(document.body.getBoundingClientRect().height) + 8;
    if (Math.abs(h - last) < 2) return;
    last = h;
    try { parent.postMessage({ rmdEmbedHeight: h, src: location.pathname.split("/").pop() }, location.origin); } catch (e) {}
  }
  if (window.ResizeObserver) new ResizeObserver(tell).observe(document.body);
  else setInterval(tell, 800);
  tell();
  // Links to the sibling pages switch the hub tab; any other link leaves the hub.
  var TABS = { "admin-instructor-review.html": "eoi", "opis-review.html": "opis", "admin-instructor-ranking.html": "rank", "admin-ip-forms.html": "ip" };
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("a[href]");
    if (!a || a.target === "_blank") return;
    var f = (a.getAttribute("href") || "").split("#")[0].split("?")[0];
    if (TABS[f]) { e.preventDefault(); try { parent.postMessage({ rmdEmbedGo: TABS[f] }, location.origin); } catch (x) {} }
    else if (f && !/^(javascript:|mailto:)/.test(f)) a.target = "_top";
  }, true);
})();
