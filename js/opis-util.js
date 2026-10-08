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

  root.OPIS_UTIL = { markSuperseded: markSuperseded };
})(typeof window !== "undefined" ? window : globalThis);
