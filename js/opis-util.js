// OPIS rating helpers shared by the Course Director pages.
//
// A rater can submit a second rating for the same candidate by ticking "I made a
// mistake with my first submission" on opis-rating.html. That saves the new
// rating with correctsPrevious = true. Nothing is edited or deleted: the earlier
// rating stays in the database, and these pages treat it as superseded.
//
// Rule: for each candidate and rater, the newest rating is the current one. If
// the newest rating is a correction, every earlier rating by that rater for that
// candidate is superseded. If it is not a correction (for example two separate
// ratings from before this feature), all of them count, as they always did.
(function (root) {
  function ts(r) { return r && r.submittedAt && r.submittedAt.toMillis ? r.submittedAt.toMillis() : 0; }

  // Sets _superseded and _isCorrection on every rating in the array.
  function markSuperseded(ratings) {
    const groups = {};
    ratings.forEach(r => {
      r._superseded = false;
      r._isCorrection = false;
      const key = (r.candidateId || (r.candidateEmail || "").toLowerCase()) + "|" + (r.submittedByUid || "");
      (groups[key] = groups[key] || []).push(r);
    });
    Object.values(groups).forEach(g => {
      g.sort((a, b) => ts(a) - ts(b));
      const latest = g[g.length - 1];
      if (latest.correctsPrevious === true) {
        latest._isCorrection = true;
        g.slice(0, -1).forEach(r => { r._superseded = true; });
      }
    });
    return ratings;
  }

  // A rating with a total of 8 or less is saved with concernFlag and a concern block
  // (reasons, how often, what the rater did, free text). Shown wherever ratings are shown.
  function escH(v) { return (v == null ? "" : String(v)).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  var OFTEN = { oneoff: "One-off", repeated: "Repeated across the course" };
  var DONE = { spoke: "Spoke to the candidate", willtell: "Confirmed they will tell RMD faculty" };
  function hasConcern(r) { return !!r && r.concernFlag === true && !!r.concern; }
  function concernHtml(r) {
    if (!hasConcern(r)) return "";
    var c = r.concern;
    var reasons = (c.reasonLabels && c.reasonLabels.length ? c.reasonLabels : c.reasons || []).map(escH).join("; ");
    var bits = [];
    if (c.often && OFTEN[c.often]) bits.push(OFTEN[c.often]);
    (c.done || []).forEach(function (d) { if (DONE[d]) bits.push(DONE[d]); });
    return '<div class="concern-note" style="margin:6px 0 2px;padding:8px 10px;background:#fce8e6;border-left:4px solid #b7410e;border-radius:0 6px 6px 0;font-size:12px;line-height:1.4;">' +
      '<b style="color:#8a2f08;">Concern raised</b>' + (reasons ? ': ' + reasons : '') +
      (bits.length ? '<div style="color:#5c2410;">' + bits.map(escH).join(" &middot; ") + '</div>' : '') +
      (c.text ? '<div style="margin-top:3px;white-space:pre-wrap;">' + escH(c.text) + '</div>' : '') + '</div>';
  }

  root.OPIS_UTIL = { markSuperseded: markSuperseded, hasConcern: hasConcern, concernHtml: concernHtml };
})(typeof window !== "undefined" ? window : globalThis);
