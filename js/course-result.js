/**
 * course-result.js (2026-10, per Jon) - shared "recommended overall course
 * result" logic for Instructor Candidates, used by assessment-development.html
 * (where the Course Director sets/toggles it) and admin-iw-pass-confirmation.html
 * (which pulls it through as the default PASS/FAIL).
 *
 * Rule (Jon): everyone defaults to PASS. The default flips to FAIL if there is
 * a rated concern (a RED) on one or more sessions, or on the overall rating.
 * We also treat a recorded gateway FAIL and a "concern" flag as concerns,
 * because a candidate who failed the gateway or was explicitly flagged should
 * never default to PASS. The Course Director can always override either way;
 * an override is stored in cd_course_results/{candidateId} and wins.
 *
 * Pure functions, no Firebase, so they can be unit-tested with node.
 */
(function (root) {
  "use strict";

  /**
   * @param {object} input
   *   dev      : development_assessments doc {ratings:{cp:'green'|'amber'|'red'}, flags:{concern}, overallOverride}
   *   feedback : array of session_feedback docs for this candidate [{rating, sessionId}]
   *   gateway  : gateway_assessments doc {outcome, cdConfirmedBy, cdConfirmedOutcome}
   * @returns {{result:'pass'|'fail', reasons:string[]}}
   */
  function autoCourseResult(input) {
    const dev      = (input && input.dev) || {};
    const feedback = (input && input.feedback) || [];
    const gateway  = (input && input.gateway) || {};
    const reasons  = [];

    if (gateway.outcome === "fail") {
      const signed = gateway.cdConfirmedBy && gateway.cdConfirmedOutcome === "fail";
      reasons.push(signed ? "Gateway FAIL (signed off)" : "Gateway FAIL (not yet signed off)");
    }

    const ratings = dev.ratings || {};
    const redCps  = Object.keys(ratings).filter(k => ratings[k] === "red");
    if (redCps.length) reasons.push("Red on " + redCps.length + " development checkpoint" + (redCps.length > 1 ? "s" : ""));

    if (dev.overallOverride === "red") reasons.push("Overall rating set to red");
    if (dev.flags && dev.flags.concern) reasons.push("Concern flagged");

    const redSessions = new Set(feedback.filter(f => f && f.rating === "red").map(f => f.sessionId || "?"));
    if (redSessions.size) reasons.push("Red on " + redSessions.size + " session rating" + (redSessions.size > 1 ? "s" : ""));

    return { result: reasons.length ? "fail" : "pass", reasons };
  }

  /**
   * Combine the automatic default with a stored Course Director choice.
   * @param {{result:string, reasons:string[]}} auto
   * @param {object|null} stored  cd_course_results doc {result:'pass'|'fail', ...}
   * @returns {{result:'pass'|'fail', source:'cd'|'auto', auto:object, differs:boolean}}
   */
  function effectiveCourseResult(auto, stored) {
    const s = stored && (stored.result === "pass" || stored.result === "fail") ? stored.result : null;
    if (s) return { result: s, source: "cd", auto, differs: s !== auto.result };
    return { result: auto.result, source: "auto", auto, differs: false };
  }

  const api = { autoCourseResult, effectiveCourseResult };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.RMD_COURSE_RESULT = api;
})(typeof window !== "undefined" ? window : globalThis);
