// RMD fuzzy search helper - shared by the admin pages with a search box.
//
// Why: plain substring matching fails for "georgina james" when the record is
// stored as "James, Georgina", "Georgina M James", "Gina James" or has a typo.
//
// How a query is matched against a record:
//   1. Text is lower-cased, accents removed, punctuation turned into spaces.
//   2. The query is split into words. EVERY query word must match SOMETHING in
//      the record (word order does not matter, extra words in the record are fine).
//   3. A query word matches a record word if it is: identical, a prefix of it,
//      contained in it, or within a small typo distance of it (1 edit for words
//      of 4-6 letters, 2 for 7+; a swap of two neighbouring letters counts as 1).
//      Short words (1-3 letters) must be exact or a prefix - no typos.
//   4. Emails are also split into words (local part and domain), and the whole
//      email string is checked for substring so "jsmith@" still works.
//   5. Results are ranked best first (exact > prefix > contains > typo).
//
// Usage:
//   const hits = RMD_FUZZY.filter(items, query, item => [item.name, item.email, ...]);
//   // hits = items in best-first order; [] when nothing is close enough.
//   RMD_FUZZY.score(query, [fieldStrings]) -> number (0 = no match; higher = better)
//
// Works in the browser (window.RMD_FUZZY) and in node (module.exports).
(function (root) {
  "use strict";

  function norm(s) {
    return String(s == null ? "" : s)
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9@.]+/g, " ")   // keep @ and . so emails stay searchable
      .trim();
  }

  function words(s) {
    // split on spaces, and also split emails on @ and . so "jsmith" finds jsmith@x.ac.uk
    return norm(s).split(/[\s@.]+/).filter(Boolean);
  }

  // Damerau-Levenshtein (optimal string alignment), bailing out early once the
  // distance is certain to exceed `max`.
  function distance(a, b, max) {
    if (a === b) return 0;
    const la = a.length, lb = b.length;
    if (Math.abs(la - lb) > max) return max + 1;
    let prev2 = null;
    let prev = new Array(lb + 1);
    for (let j = 0; j <= lb; j++) prev[j] = j;
    for (let i = 1; i <= la; i++) {
      const cur = new Array(lb + 1);
      cur[0] = i;
      let rowMin = cur[0];
      for (let j = 1; j <= lb; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
        if (prev2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
          v = Math.min(v, prev2[j - 2] + 1);
        }
        cur[j] = v;
        if (v < rowMin) rowMin = v;
      }
      if (rowMin > max) return max + 1;
      prev2 = prev; prev = cur;
    }
    return prev[lb];
  }

  function allowedTypos(len) { return len <= 3 ? 0 : len <= 6 ? 1 : 2; }

  // Score one query word against one record word. 0 = no match.
  function wordScore(q, w) {
    if (q === w) return 100;
    if (w.startsWith(q)) return 80;
    if (q.length >= 3 && w.includes(q)) return 60;
    const max = allowedTypos(q.length);
    if (max > 0) {
      const d = distance(q, w, max);
      if (d <= max) return 50 - d * 10;
      // typo in the typed text that is still a prefix of the record word
      // ("georgna" vs "georgina" is caught above; "georgin" vs "georgina" is a prefix)
      if (w.length > q.length) {
        const d2 = distance(q, w.slice(0, q.length), max);
        if (d2 <= max) return 40 - d2 * 10;
      }
    }
    return 0;
  }

  // fields: array of strings (name, email, alternative names...). Returns 0 if
  // any query word has no match, otherwise the sum of best word scores.
  function score(query, fields) {
    const qw = norm(query).split(/[\s]+/).filter(Boolean);
    if (!qw.length) return 0;
    const joined = norm((fields || []).join(" "));
    const rw = [];
    (fields || []).forEach(f => words(f).forEach(w => rw.push(w)));
    let total = 0;
    for (const q of qw) {
      let best = 0;
      // whole-string substring (handles partial emails like "jsmith@bham")
      if (q.length >= 2 && joined.includes(q)) best = Math.max(best, 55);
      for (const w of rw) {
        const s = wordScore(q, w);
        if (s > best) best = s;
        if (best === 100) break;
      }
      if (best === 0) return 0;
      total += best;
    }
    return total / qw.length;
  }

  // items -> matching items, best first (stable for equal scores).
  function filter(items, query, getFields) {
    if (!norm(query)) return items.slice();
    const scored = [];
    items.forEach((it, idx) => {
      const s = score(query, getFields(it));
      if (s > 0) scored.push({ it, s, idx });
    });
    scored.sort((a, b) => b.s - a.s || a.idx - b.idx);
    return scored.map(x => x.it);
  }

  const api = { score, filter, norm, distance };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.RMD_FUZZY = api;
})(typeof window !== "undefined" ? window : globalThis);
