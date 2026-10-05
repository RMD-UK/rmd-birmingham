/**
 * course-report.js (2026-10, per Jon) - builds the Instructor Weekend course
 * report for the University of Birmingham SharePoint record: a Word-compatible
 * document (HTML saved as .doc, which Word opens natively) and a CSV results
 * table. Pure functions, no Firebase, so they can be tested with node.
 * Used by cd-dashboard.html ("Course Report" section).
 */
(function (root) {
  "use strict";

  const CP_ORDER = [
    ["sat-teach", "Sat Teach"], ["sat-debrief", "Sat Debrief"], ["sun-teach", "Sun Teach"],
    ["sun-itc", "Sun ITC obs"], ["sun-final", "Sun Final"]
  ];
  const RAG = { green: "Green", amber: "Amber", red: "Red" };

  function esc(v) {
    return (v == null ? "" : String(v)).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function gatewayText(g) {
    g = g || {};
    if (!g.outcome) return { text: "Not recorded", signed: false };
    const signed = !!(g.cdConfirmedBy && g.cdConfirmedOutcome === g.outcome);
    return { text: g.outcome === "pass" ? "PASS" : "FAIL", signed };
  }

  /**
   * One row per Instructor Candidate.
   * opts: { candidates, devMap, fbMap, gatewayMap, storedMap, autoFn, effFn, sessionTitle, includeComments }
   */
  function buildResultRows(opts) {
    const { candidates, devMap = {}, fbMap = {}, gatewayMap = {}, storedMap = {}, autoFn, effFn, includeComments } = opts;
    const sessionTitle = opts.sessionTitle || (id => id || "");
    return candidates.map(c => {
      const dev = devMap[c.id] || {};
      const fb  = fbMap[c.id] || [];
      const g   = gatewayMap[c.id] || {};
      const auto = autoFn({ dev, feedback: fb, gateway: g });
      const eff  = effFn(auto, storedMap[c.id]);
      const gw   = gatewayText(g);
      const count = r => fb.filter(f => f.rating === r).length;
      const ratings = dev.ratings || {};
      const flags   = dev.flags || {};
      const redComments = fb.filter(f => f.rating === "red" && f.comment)
        .map(f => sessionTitle(f.sessionId) + ": " + f.comment);
      const row = {
        name: c.name || "", email: c.email || "", group: c.group || "",
        gateway: gw.text, gatewaySigned: gw.signed ? "Yes" : (gw.text === "Not recorded" ? "" : "No"),
        recommended: eff.result === "pass" ? "PASS" : "FAIL",
        source: eff.source === "cd" ? "Set by Course Director" : "Automatic default",
        concerns: auto.reasons.join("; "),
        green: count("green"), amber: count("amber"), red: count("red"),
        strong: fb.filter(f => f.strong).length, weak: fb.filter(f => f.weak).length,
        checkpoints: CP_ORDER.map(([id]) => ratings[id] ? RAG[ratings[id]] : ""),
        overall: dev.overallOverride ? RAG[dev.overallOverride] + " (set)" : deriveOverall(ratings),
        concernFlag: flags.concern ? "Yes" : "", standoutFlag: flags.standout ? "Yes" : "",
        notes: includeComments ? (dev.notes || "") : "",
        redComments: includeComments ? redComments.join(" | ") : ""
      };
      return row;
    }).sort((a, b) => (a.group || "~").localeCompare(b.group || "~", undefined, { numeric: true }) || a.name.localeCompare(b.name));
  }

  function deriveOverall(ratings) {
    const v = Object.values(ratings || {});
    if (!v.length) return "";
    return v.includes("red") ? "Red" : v.includes("amber") ? "Amber" : "Green";
  }

  const CSV_HEAD = ["Name", "Email", "Group", "Gateway result", "Gateway signed off", "Recommended course result",
    "Result source", "Concerns", "Sessions green", "Sessions amber", "Sessions red", "Notably strong", "Notably weak"]
    .concat(CP_ORDER.map(c => c[1])).concat(["Development overall", "Concern flag", "Standout flag", "Development notes", "Red session comments"]);

  function csvCell(v) {
    let s = v == null ? "" : String(v);
    // Neutralise spreadsheet formula injection from free-text fields.
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function toCsv(rows) {
    const lines = [CSV_HEAD.map(csvCell).join(",")];
    rows.forEach(r => {
      lines.push([r.name, r.email, r.group, r.gateway, r.gatewaySigned, r.recommended, r.source, r.concerns,
        r.green, r.amber, r.red, r.strong, r.weak, ...r.checkpoints, r.overall, r.concernFlag, r.standoutFlag, r.notes, r.redComments]
        .map(csvCell).join(","));
    });
    return "﻿" + lines.join("\r\n");   // BOM so Excel reads UTF-8
  }

  function summariseFeedback(items) {
    items = items || [];
    if (!items.length) return null;
    const keys = ["precourse", "organisation", "venue", "faculty", "methods", "practice", "feedback", "relevance", "confidence"];
    const mean = arr => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length * 10) / 10 : null;
    const perKey = {};
    keys.forEach(k => { perKey[k] = mean(items.map(i => i.likert && Number(i.likert[k])).filter(n => n > 0)); });
    const rec = {};
    items.forEach(i => { if (i.recommend) rec[i.recommend] = (rec[i.recommend] || 0) + 1; });
    return {
      n: items.length,
      overall: mean(items.map(i => Number(i.averageScore)).filter(n => n > 0)),
      perKey, recommend: rec,
      valuable: items.map(i => i.valuable).filter(Boolean),
      suggestions: items.map(i => i.suggestions).filter(Boolean)
    };
  }

  function table(headers, rows) {
    return `<table border="1" cellspacing="0" cellpadding="4" style="border-collapse:collapse;font-size:9pt;width:100%;">
      <tr style="background:#003B71;color:#fff;">${headers.map(h => `<th align="left">${esc(h)}</th>`).join("")}</tr>
      ${rows.map(r => `<tr>${r.map(c => `<td valign="top">${esc(c)}</td>`).join("")}</tr>`).join("")}
    </table>`;
  }

  /**
   * data: { year, venue, generatedAt:Date, narrative:{label:text}, attendance:{arrived,total},
   *   rows, assessorRows:[{name, summary}], itcRows:[{name, summary}], feedback, includeComments }
   */
  function buildReportHtml(data) {
    const gen = data.generatedAt ? data.generatedAt.toLocaleString("en-GB") : "";
    const passN = data.rows.filter(r => r.recommended === "PASS").length;
    const failN = data.rows.length - passN;
    const gwSigned = data.rows.filter(r => r.gatewaySigned === "Yes").length;
    const parts = [];
    parts.push(`<h1 style="color:#003B71;">RMD Instructor Weekend ${esc(data.year)}: Course Report</h1>
      <p>${esc(data.venue || "Birmingham Medical School, University of Birmingham")}<br>Generated ${esc(gen)}${data.attendance ? `<br>Attendance recorded: ${esc(data.attendance.arrived)} arrived` : ""}</p>`);

    Object.entries(data.narrative || {}).forEach(([label, text]) => {
      if (text && String(text).trim()) parts.push(`<h2 style="color:#003B71;">${esc(label)}</h2><p>${esc(text).replace(/\n/g, "<br>")}</p>`);
    });

    parts.push(`<h2 style="color:#003B71;">Instructor Candidate results</h2>
      <p>${data.rows.length} Instructor Candidates. Recommended overall course result: ${passN} PASS, ${failN} FAIL.
      BLS/AED gateway results signed off by the Course Director: ${gwSigned} of ${data.rows.length}.
      The recommended result defaults to PASS, or FAIL where a concern was rated on any session or overall, a concern was flagged, or the gateway was not passed; the Course Director may override it.</p>`);
    parts.push(table(["Name", "Group", "Gateway", "Recommended", "Basis", "Concerns", "G/A/R (sessions)", "Dev. overall"],
      data.rows.map(r => [r.name, r.group, r.gateway + (r.gatewaySigned === "Yes" ? " (signed off)" : ""), r.recommended, r.source, r.concerns || "None", `${r.green}/${r.amber}/${r.red}`, r.overall])));

    if (data.includeComments) {
      const withText = data.rows.filter(r => r.notes || r.redComments);
      if (withText.length) {
        parts.push(`<h2 style="color:#003B71;">Faculty comments</h2>`);
        withText.forEach(r => {
          parts.push(`<h3>${esc(r.name)}</h3>`);
          if (r.redComments) parts.push(`<p><b>Red session comments:</b> ${esc(r.redComments)}</p>`);
          if (r.notes) parts.push(`<p><b>Development notes:</b> ${esc(r.notes)}</p>`);
        });
      }
    }

    if (data.assessorRows && data.assessorRows.length) {
      parts.push(`<h2 style="color:#003B71;">Assessor / Senior Instructor candidates</h2>`);
      parts.push(table(["Name", "Summary of ratings"], data.assessorRows.map(r => [r.name, r.summary])));
    }
    if (data.itcRows && data.itcRows.length) {
      parts.push(`<h2 style="color:#003B71;">Instructor Trainer Candidates</h2>`);
      parts.push(table(["Name", "Observation summary"], data.itcRows.map(r => [r.name, r.summary])));
    }
    const f = data.feedback;
    parts.push(`<h2 style="color:#003B71;">Participant feedback</h2>`);
    if (!f) parts.push(`<p>No participant feedback recorded.</p>`);
    else {
      parts.push(`<p>${f.n} response${f.n === 1 ? "" : "s"}. Mean score ${f.overall == null ? "n/a" : f.overall} (scale 1 to 5). Would recommend: ${["Definitely yes","Probably yes","Unsure","No"].map(k => `${k} ${f.recommend[k] || 0}`).join(", ")}.</p>`);
      parts.push(table(["Area", "Mean"], Object.entries(f.perKey).map(([k, v]) => [k, v == null ? "n/a" : v])));
      if (f.valuable.length) parts.push(`<h3>Most valuable</h3><ul>${f.valuable.map(t => `<li>${esc(t)}</li>`).join("")}</ul>`);
      if (f.suggestions.length) parts.push(`<h3>Suggestions</h3><ul>${f.suggestions.map(t => `<li>${esc(t)}</li>`).join("")}</ul>`);
    }

    return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><title>RMD Instructor Weekend ${esc(data.year)} Course Report</title>
<style>
@page WordSection1 { size: 841.9pt 595.3pt; mso-page-orientation: landscape; margin: 36pt; }
div.WordSection1 { page: WordSection1; }
body { font-family: Calibri, Arial, sans-serif; font-size: 10.5pt; }
h1 { font-size: 20pt; } h2 { font-size: 14pt; margin-top: 18pt; } h3 { font-size: 11pt; }
</style></head><body><div class="WordSection1">${parts.join("\n")}</div></body></html>`;
  }

  const api = { buildResultRows, toCsv, buildReportHtml, summariseFeedback, CSV_HEAD };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.RMD_COURSE_REPORT = api;
})(typeof window !== "undefined" ? window : globalThis);
