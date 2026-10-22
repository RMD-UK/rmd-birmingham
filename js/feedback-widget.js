/* Site feedback tab (2026-10-19, per Jon).
 * A small "Feedback" tab on the right edge of every signed-in page. Tapping it opens
 * feedback.html already filled in with the page the person was on (and, where the page
 * offers it, the part of the page: window.__fbCtx() returns a short text). Loaded by
 * js/firebase-config.js so no individual page needs editing. Fails silently: if anything
 * here goes wrong the page itself is unaffected. */
(function () {
  try {
    if (window.self !== window.top) return;                       // not inside iframes
    var path = (location.pathname.split("/").pop() || "index.html").toLowerCase();
    var skip = /^(feedback|admin-feedback|signin|reset-password|index|about|news|research|sites|for-institutions|join|cd-dashboard-print|register-live|assessment-live|assessment-flow|timetable-screen|iw-checkin|iw-join|iw-rsvp-confirm|faculty-form|mou-form|mou-account-setup|instructor-eoi|summer-meeting-dietary|debug-connectivity|auth-check|rmd-logo-loop|iw-checkin-poster|iw-badges)\.html$/;
    if (skip.test(path) || path === "") return;

    var ID = "rmdFeedbackTab";
    function target() {
      var ctx = "";
      try { if (typeof window.__fbCtx === "function") ctx = String(window.__fbCtx() || ""); } catch (e) {}
      var p = (location.pathname.split("/").pop() || "index.html") + (location.search || "") + (location.hash || "");
      var q = "p=" + encodeURIComponent(p.slice(0, 200)) + "&t=" + encodeURIComponent((document.title || "").slice(0, 120));
      if (ctx) q += "&c=" + encodeURIComponent(ctx.slice(0, 200));
      return "feedback.html?" + q;
    }
    function show() {
      if (document.getElementById(ID)) return;
      if (!document.body) { document.addEventListener("DOMContentLoaded", show); return; }
      var a = document.createElement("a");
      a.id = ID;
      a.href = "feedback.html";
      a.title = "Tell us what to fix or add on this page";
      a.setAttribute("aria-label", "Send feedback about this page");
      a.textContent = "Feedback";
      // Work out the address at the moment of the tap, so it reflects the page as it is then.
      a.addEventListener("click", function () { a.href = target(); });
      a.addEventListener("focus", function () { a.href = target(); });
      a.addEventListener("mouseover", function () { a.href = target(); });
      a.addEventListener("touchstart", function () { a.href = target(); }, { passive: true });
      var st = document.createElement("style");
      st.textContent =
        "#" + ID + "{position:fixed;right:0;bottom:96px;z-index:2147482000;" +
        "background:#44247C;color:#fff;font:700 12px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;" +
        "padding:9px 8px;border-radius:10px 0 0 10px;text-decoration:none;letter-spacing:.04em;" +
        "writing-mode:vertical-rl;transform:rotate(180deg);box-shadow:-2px 0 6px rgba(0,0,0,.25);opacity:.85;white-space:nowrap}" +
        "#" + ID + ":hover,#" + ID + ":focus-visible{opacity:1;background:#0067A4;outline:2px solid #fff;outline-offset:-3px}" +
        "@media print{#" + ID + "{display:none}}";
      document.head.appendChild(st);
      document.body.appendChild(a);
    }
    function hide() { var e = document.getElementById(ID); if (e) e.remove(); }

    var cacheKey = "rmd_fb_tab";
    var cached = null;
    try { cached = sessionStorage.getItem(cacheKey); } catch (e) {}
    if (cached === "1") show();                                   // instant on repeat pages

    var tries = 0;
    (function wait() {
      try {
        if (typeof auth !== "undefined" && auth) {
          auth.onAuthStateChanged(function (u) {
            if (!u) { hide(); try { sessionStorage.removeItem(cacheKey); } catch (e) {} return; }
            try { sessionStorage.setItem(cacheKey, "1"); } catch (e) {}
            show();
          });
        } else if (++tries < 80) {
          setTimeout(wait, 250);                                  // wait for the page's initFirebase()
        }
      } catch (e) {}
    })();
  } catch (e) { /* never break the host page */ }
})();
