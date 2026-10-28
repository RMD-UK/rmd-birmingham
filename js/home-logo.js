/* RMD logo = way back to the welcome page (2026-10-11, per Jon).
 * Every signed-in page shows the RMD logo, and clicking it returns to the
 * welcome page (member-menu.html). Loaded by js/firebase-config.js, so no
 * individual page needs editing and any new signed-in page gets it for free.
 *
 *  - A page that already has a logo link: the link is pointed at the welcome page.
 *  - A page with no logo link: a small logo is added at the left of its top bar
 *    (or fixed in the top-left corner if the page has no bar).
 *  - Public pages, sign-in, forms and display screens are skipped on purpose.
 * Fails silently: if anything here goes wrong the page itself is unaffected. */
(function () {
  try {
    if (window.self !== window.top) return;                        // not inside iframes
    var HOME = "member-menu.html";
    var path = (location.pathname.split("/").pop() || "index.html").toLowerCase();
    var skip = /^(index|about|sites|news|research|resources|for-institutions|faculty|faculty-directory|join|join-mou|join-thanks|rmd-[a-z-]+|signin|reset-password|member-menu|timetable-screen|iw-[a-z-]+|faculty-form|mou-form|mou-account-setup|instructor-eoi|summer-meeting-dietary|participant-feedback|candidate-resources|pre-course-candidates|pre-course-faculty|site-info|debug-connectivity|auth-check|admin-account-reminders|assessment-gateway)\.html$/;
    if (skip.test(path)) return;

    var ID = "rmdHomeLogo";
    var BARS = ".top-bar,.top,.cra-toolbar,.ra-toolbar,.rr-header,.page-header,header";

    function isGate(el) {                                          // logos on sign-in cards are not navigation
      return !!(el.closest && el.closest("#authOverlay,.auth-overlay,.gate,.login,.login-card,.signin"));
    }

    function run() {
      if (!document.body || document.getElementById(ID)) return;
      var linked = false;
      var logos = document.querySelectorAll('img[src*="rmd-logo"]');
      for (var i = 0; i < logos.length; i++) {
        var a = logos[i].closest("a");
        if (isGate(logos[i])) continue;
        if (!a && logos[i].closest(BARS)) {                        // a logo already in the top bar but not linked: link it, do not add a second logo
          a = document.createElement("a");
          a.href = HOME;
          a.style.cssText = "display:inline-flex;align-items:center;flex:0 0 auto;text-decoration:none;line-height:0";
          logos[i].parentNode.insertBefore(a, logos[i]);
          a.appendChild(logos[i]);
        }
        if (!a) continue;
        if ((a.getAttribute("href") || "") !== HOME) a.setAttribute("href", HOME);
        a.title = a.title || "Back to the welcome page";
        linked = true;
      }
      if (linked) return;

      var a2 = document.createElement("a");
      a2.id = ID;
      a2.href = HOME;
      a2.title = "Back to the welcome page";
      a2.setAttribute("aria-label", "RMD logo: back to the welcome page");
      var img = document.createElement("img");
      img.src = "/assets/rmd-logo.png";
      img.alt = "RMD";
      a2.appendChild(img);

      var bar = null, cands = document.querySelectorAll(BARS);
      for (var j = 0; j < cands.length; j++) {
        if (!isGate(cands[j]) && !cands[j].closest("#authOverlay,.auth-overlay")) { bar = cands[j]; break; }
      }
      var st = document.createElement("style");
      st.textContent =
        "#" + ID + "{display:inline-flex;align-items:center;flex:0 0 auto;text-decoration:none;line-height:0}" +
        "#" + ID + " img{height:34px;width:34px;border-radius:50%;background:#fff;padding:2px;box-sizing:border-box;display:block}" +
        "#" + ID + ":hover img,#" + ID + ":focus-visible img{box-shadow:0 0 0 2px #fff,0 0 0 4px #5b3a9d}" +
        "#" + ID + ".rmd-fixed{position:fixed;top:6px;left:8px;z-index:2147482000;filter:drop-shadow(0 1px 3px rgba(0,0,0,.35))}";
      document.head.appendChild(st);
      if (bar) { bar.insertBefore(a2, bar.firstChild); }
      else { a2.className = "rmd-fixed"; document.body.appendChild(a2); }
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run); else run();
    // Pages that build their top bar after sign-in: look again briefly, then stop.
    var tries = 0, t = setInterval(function () { run(); if (document.getElementById(ID) || ++tries > 20) clearInterval(t); }, 500);
  } catch (e) { /* never break the page */ }
})();
