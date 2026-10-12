/* Course Director quick link (2026-10-10, per Jon).
 * A small tab fixed to the top centre of every signed-in page, shown only to
 * Course Directors, linking to cd-dashboard.html. Loaded by js/firebase-config.js
 * so no individual page needs editing. Fails silently: if anything here goes
 * wrong the page itself is unaffected. */
(function () {
  try {
    if (window.self !== window.top) return;                       // not inside iframes
    var path = (location.pathname.split("/").pop() || "index.html").toLowerCase();
    var skip = /^(cd-dashboard|signin|reset-password|timetable-screen|iw-checkin|iw-join|iw-rsvp-confirm|faculty-form|mou-form|mou-account-setup|instructor-eoi|summer-meeting-dietary|debug-connectivity|auth-check)\.html$/;
    if (skip.test(path)) return;

    var ID = "cdQuickLink";
    function show() {
      if (document.getElementById(ID)) return;
      if (!document.body) { document.addEventListener("DOMContentLoaded", show); return; }
      var a = document.createElement("a");
      a.id = ID;
      a.href = "cd-dashboard.html";
      a.title = "Open the Course Director dashboard";
      a.setAttribute("aria-label", "Course Director dashboard");
      a.innerHTML = '<span class="cdq-long">Course Director dashboard</span><span class="cdq-short">CD dashboard</span>';
      var st = document.createElement("style");
      st.textContent =
        "#" + ID + "{position:fixed;top:0;left:50%;transform:translateX(-50%);z-index:2147483000;" +
        "background:#002B5C;color:#fff;font:700 12px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;" +
        "padding:6px 14px 7px;border-radius:0 0 10px 10px;text-decoration:none;letter-spacing:.02em;" +
        "box-shadow:0 2px 6px rgba(0,0,0,.25);opacity:.92;white-space:nowrap}" +
        "#" + ID + ":hover,#" + ID + ":focus-visible{opacity:1;background:#003d82;outline:2px solid #fff;outline-offset:-3px}" +
        "#" + ID + " .cdq-short{display:none}" +
        "@media (max-width:640px){#" + ID + " .cdq-long{display:none}#" + ID + " .cdq-short{display:inline}}" +
        "@media print{#" + ID + "{display:none}}";
      document.head.appendChild(st);
      document.body.appendChild(a);
    }
    function hide() { var e = document.getElementById(ID); if (e) e.remove(); }

    var cacheKey = "rmd_cd_quicklink";
    var cached = null;
    try { cached = JSON.parse(sessionStorage.getItem(cacheKey) || "null"); } catch (e) {}
    if (cached && cached.v === 1) show();                         // instant on repeat pages

    var tries = 0;
    (function wait() {
      try {
        if (typeof auth !== "undefined" && auth && typeof resolveRole === "function") {
          auth.onAuthStateChanged(function (u) {
            if (!u) { hide(); try { sessionStorage.removeItem(cacheKey); } catch (e) {} return; }
            if (cached && cached.uid === u.uid) { cached.v === 1 ? show() : hide(); return; }
            resolveRole(u.uid, u.email).then(function (r) {
              var isDir = r === "director";
              try { sessionStorage.setItem(cacheKey, JSON.stringify({ uid: u.uid, v: isDir ? 1 : 0 })); } catch (e) {}
              isDir ? show() : hide();
            }).catch(function () {});
          });
        } else if (++tries < 80) {
          setTimeout(wait, 250);                                  // wait for the page's initFirebase()
        }
      } catch (e) {}
    })();
  } catch (e) { /* never break the host page */ }
})();
