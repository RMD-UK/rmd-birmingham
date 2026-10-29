// Instructor selection ranking (Jon, 29 Oct 2026).
// Pure functions, no page code, so the same rules can be tested outside the browser.
//
// Defaults confirmed by Jon 29 Oct 2026: outstanding +1.0, Excellent +0.5, late -2.0, floor 10, margin 1.5, share = everyone taught.
// Score (all on the OPIS scale, out of 15):
//   average OPIS total across current raters
//   + outstanding-potential bonus x (share of raters who ticked it)
//   + excellent-pass bonus (if an assessor recorded an Excellent pass)
//   - late-pass penalty (passed at attempt 3 or 4; passing at attempt 1 or 2 ranks the same)
// A person is eligible only with a pass, at least one OPIS rating, and a score at or above the floor.
//
// Places: when a cap is set, degree groups get places in proportion to how many
// candidates we taught from each (largest remainder). A degree place may only go to
// someone whose score is within "margin" points of the pure-merit cut-off and above the
// floor, so representation never lowers the standard by more than the margin. Places a
// degree cannot fill go to the best remaining eligible people. Margin 0 = pure merit.
(function (root) {
  var DEFAULTS = { places: null, bonusOutstanding: 1.0, bonusExcellent: 0.5, penaltyLate: 2.0, floor: 10, margin: 1.5, excludeUnsat: false, basis: "taught" };

  function num(v, d) { var n = parseFloat(v); return isFinite(n) ? n : d; }
  function settingsFrom(o) {
    o = o || {};
    var s = {};
    Object.keys(DEFAULTS).forEach(function (k) { s[k] = o[k] !== undefined && o[k] !== null && o[k] !== "" ? o[k] : DEFAULTS[k]; });
    ["bonusOutstanding", "bonusExcellent", "penaltyLate", "floor", "margin"].forEach(function (k) { s[k] = num(s[k], DEFAULTS[k]); });
    s.places = (o.places === null || o.places === undefined || o.places === "" || !(parseInt(o.places, 10) > 0)) ? null : parseInt(o.places, 10);
    s.excludeUnsat = s.excludeUnsat === true;
    s.basis = s.basis === "applicants" ? "applicants" : "taught";
    return s;
  }

  // First attempt number with a pass on a record's assessment, or null.
  function passAttemptOf(assess) {
    var at = (assess && assess.attempts) || {};
    var keys = Object.keys(at).map(Number).filter(function (n) { return n > 0; }).sort(function (a, b) { return a - b; });
    for (var i = 0; i < keys.length; i++) if (at[keys[i]] && at[keys[i]].outcome === "pass") return keys[i];
    return null;
  }

  // input: { eois, candidatesByEmail, ratingsByEmail (current only), assessById, groupOf(degreeText) }
  function analyse(eoi, input, S) {
    var email = (eoi.email || "").toLowerCase();
    var records = input.candidatesByEmail[email] || [];
    var passedRecs = records.filter(function (c) { return c.outcome === "Passed"; });
    var rec = passedRecs.length ? passedRecs[passedRecs.length - 1] : null;
    var ratings = (input.ratingsByEmail[email] || []).filter(function (r) { return !r._superseded; });
    var n = ratings.length;
    var mean = n ? ratings.reduce(function (s, r) { return s + (Number(r.total) || 0); }, 0) / n : 0;
    var ticks = ratings.filter(function (r) { return r.outstandingTeachingPotential === true; }).length;
    var share = n ? ticks / n : 0;
    var anyUnsat = ratings.some(function (r) {
      var sc = r.scores || {};
      return Object.keys(sc).some(function (k) { return Number(sc[k]) === 1; });
    });
    var excellent = false;
    records.forEach(function (c) {
      var a = input.assessById[c.id]; var at = (a && a.attempts) || {};
      Object.keys(at).forEach(function (k) { if (at[k] && at[k].excellent === true && at[k].outcome === "pass") excellent = true; });
    });
    var attempt = null, attemptInferred = false;
    if (rec) {
      attempt = passAttemptOf(input.assessById[rec.id]);
      if (attempt === null && rec.neededMoreThanTwoAttempts === true) { attempt = 3; attemptInferred = true; }
    }
    var late = attempt !== null && attempt >= 3;
    var score = mean + S.bonusOutstanding * share + (excellent ? S.bonusExcellent : 0) - (late ? S.penaltyLate : 0);
    var group = input.groupOf((rec && rec.degree) || eoi.degree || "") || "Other";
    return {
      email: email, name: eoi.name || email, group: group, degree: (rec && rec.degree) || eoi.degree || "",
      passed: !!rec, hasRecord: records.length > 0, recordIds: records.map(function (c) { return c.id; }),
      chosenNow: records.some(function (c) { return c.chosenInstructor === true; }),
      n: n, mean: mean, ticks: ticks, share: share, anyUnsat: anyUnsat, excellent: excellent,
      attempt: attempt, attemptInferred: attemptInferred, late: late, score: score,
      rankable: !!rec && n > 0
    };
  }

  function cmp(a, b) {
    return (b.score - a.score) || (b.share - a.share) || ((b.excellent ? 1 : 0) - (a.excellent ? 1 : 0)) || (b.n - a.n) || String(a.name).localeCompare(String(b.name));
  }

  // Largest-remainder places per group.
  function quotas(places, counts) {
    var groups = Object.keys(counts).filter(function (g) { return counts[g] > 0; });
    var total = groups.reduce(function (s, g) { return s + counts[g]; }, 0);
    var out = {}; var parts = []; var used = 0;
    groups.forEach(function (g) { out[g] = 0; });
    if (!total) return out;
    groups.forEach(function (g) {
      var q = places * counts[g] / total, f = Math.floor(q);
      out[g] = f; used += f; parts.push([g, q - f]);
    });
    parts.sort(function (a, b) { return (b[1] - a[1]) || a[0].localeCompare(b[0]); });
    for (var i = 0; i < places - used; i++) out[parts[i % parts.length][0]]++;
    return out;
  }

  function build(input, settings) {
    var S = settingsFrom(settings);
    var rows = input.eois.map(function (e) { return analyse(e, input, S); });
    var eligible = rows.filter(function (r) {
      return r.rankable && r.score >= S.floor && !(S.excludeUnsat && r.anyUnsat);
    }).sort(cmp);
    var eligSet = {}; eligible.forEach(function (r) { eligSet[r.email] = true; });

    // Counts used for degree places.
    var counts = {};
    if (S.basis === "applicants") eligible.forEach(function (r) { counts[r.group] = (counts[r.group] || 0) + 1; });
    else Object.keys(input.taughtByGroup || {}).forEach(function (g) { counts[g] = input.taughtByGroup[g]; });

    var res = { settings: S, rows: rows, eligible: eligible, selected: [], reserve: [], groups: [], cutoff: null, bar: null };
    rows.forEach(function (r) {
      if (!r.passed) r.status = "notpassed";
      else if (!r.rankable) r.status = "unrated";
      else if (!eligSet[r.email]) r.status = "below";
      else r.status = "notselected";
      r.reason = "";
    });
    var N = S.places;
    var meritIds = {};
    if (N) {
      var merit = eligible.slice(0, N);
      merit.forEach(function (r) { meritIds[r.email] = true; });
      var C = eligible.length >= N ? eligible[N - 1].score : S.floor;
      var bar = eligible.length <= N ? -Infinity : Math.max(S.floor, C - S.margin);
      res.cutoff = C; res.bar = bar;
      var pool = eligible.filter(function (r) { return r.score >= bar; });
      var q = quotas(N, counts);
      var chosen = {}; var count = 0;
      Object.keys(q).forEach(function (g) {
        pool.filter(function (r) { return r.group === g; }).slice(0, q[g]).forEach(function (r) { if (!chosen[r.email]) { chosen[r.email] = "degree"; count++; } });
      });
      pool.forEach(function (r) { if (count < N && !chosen[r.email]) { chosen[r.email] = "rest"; count++; } });
      eligible.forEach(function (r) {
        if (chosen[r.email]) {
          r.status = "selected";
          r.reason = meritIds[r.email] ? "On score" : "Added for degree representation";
          res.selected.push(r);
        } else if (meritIds[r.email]) {
          r.status = "notselected"; r.reason = "In the top " + N + " on score, but a degree place went to someone within the margin";
        }
      });
      var rest = eligible.filter(function (r) { return !chosen[r.email]; });
      res.reserve = rest.slice(0, 5);
      res.reserve.forEach(function (r) { r.status = "reserve"; });
      // Group comparison table.
      var total = Object.keys(counts).reduce(function (s, g) { return s + counts[g]; }, 0);
      var allGroups = {}; Object.keys(counts).forEach(function (g) { allGroups[g] = true; }); rows.forEach(function (r) { allGroups[r.group] = true; });
      res.groups = Object.keys(allGroups).sort().map(function (g) {
        return {
          group: g, count: counts[g] || 0, pct: total ? 100 * (counts[g] || 0) / total : 0, quota: q[g] || 0,
          applicants: rows.filter(function (r) { return r.group === g; }).length,
          eligible: eligible.filter(function (r) { return r.group === g; }).length,
          selected: res.selected.filter(function (r) { return r.group === g; }).length,
          merit: merit.filter(function (r) { return r.group === g; }).length
        };
      });
    }
    rows.filter(function (r) { return r.rankable; }).sort(cmp).forEach(function (r, i) { r.rank = i + 1; });
    res.rankedRows = rows.slice().sort(function (a, b) {
      var order = { selected: 0, reserve: 1, notselected: 2, below: 3, unrated: 4, notpassed: 5 };
      return (order[a.status] - order[b.status]) || cmp(a, b);
    });
    return res;
  }

  root.RMD_RANK = { DEFAULTS: DEFAULTS, settingsFrom: settingsFrom, build: build, quotas: quotas, passAttemptOf: passAttemptOf };
})(typeof window !== "undefined" ? window : module.exports);
