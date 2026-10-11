/* Standard red / amber / green wording for every rating page (2026-10-10, per Jon).
 *   Green: no concerns.   Amber: some concerns.   Red: serious concerns.
 * "Notably strong" / "Notably weak" are the two stand-out flags (they also set green / red).
 * Put <div data-rag-key></div> (or data-rag-key="flags" to add the strong/weak line)
 * where the key should appear; this script fills it in. */
(function () {
  var WORDS = { green: "no concerns", amber: "some concerns", red: "serious concerns" };
  window.RAG = {
    words: WORDS,
    title: function (c) { return c.charAt(0).toUpperCase() + c.slice(1) + ": " + WORDS[c]; },
    keyHtml: function (withFlags) {
      var chip = function (c) {
        return '<span class="ragk-i"><i class="ragk-dot ragk-' + c + '"></i><b>' + c.charAt(0).toUpperCase() + c.slice(1) + '</b> ' + WORDS[c] + '</span>';
      };
      return '<div class="ragk-row">' + chip("green") + chip("amber") + chip("red") + '</div>' +
        (withFlags ? '<div class="ragk-sub"><b>Notably strong</b> (sets green) and <b>Notably weak</b> (sets red) are for someone who clearly stands out either way. Red needs a comment.</div>' : '');
    }
  };
  var css = ".ragk{background:#fff;border-bottom:1px solid #dce3ea;padding:7px 14px;font-size:12px;color:#4a5a68;line-height:1.35}" +
    ".ragk-row{display:flex;flex-wrap:wrap;gap:4px 14px;align-items:center}" +
    ".ragk-i{display:inline-flex;align-items:center;gap:5px;white-space:nowrap}" +
    ".ragk-i b{color:#002B5C}" +
    ".ragk-dot{width:11px;height:11px;border-radius:50%;display:inline-block;flex:none}" +
    ".ragk-green{background:#1a6e31}.ragk-amber{background:#c17a00}.ragk-red{background:#b7410e}" +
    ".ragk-sub{margin-top:3px;font-size:11px;color:#6b7b88}.ragk-sub b{color:#002B5C;font-weight:700}";
  function fill() {
    var nodes = document.querySelectorAll("[data-rag-key]");
    if (!nodes.length) return;
    var st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].className = (nodes[i].className ? nodes[i].className + " " : "") + "ragk";
      nodes[i].innerHTML = window.RAG.keyHtml(nodes[i].getAttribute("data-rag-key") === "flags");
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fill); else fill();
})();
