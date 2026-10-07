// RCUK "BLS Instructor Potential (IP)" form filler — RMD Birmingham.
//
// Takes the genuine RCUK PDF (assets/rcuk-bls-ip-form-v1.2.pdf, pilot, June 2026,
// V1.2) and types text onto it at fixed positions, so the output IS the RCUK
// form, not a look-alike. That PDF declares an AcroForm but contains no actual
// fields, so overlaying text is the only way to fill it.
//
// If RCUK issue a new version: drop the new PDF into assets/, point
// TEMPLATE_URL (admin-ip-forms.html) at it, and re-check the positions in FIELDS
// below (all measured in pixels on a 110 dpi render of the A4 page, origin top
// left, then converted to PDF points by px()/py()).
//
// Never writes a signature or date: the Course Director signs and dates.
// Box 1.A (registering body / number) is left blank deliberately.
//
// Works in the browser (window.RMD_IP_FORM) and in node (module.exports), so
// the logic can be tested without Firebase. pdf-lib is passed in, not imported.
(function (root) {
  "use strict";

  const PAGE_W = 594.96, PAGE_H = 842.04;
  const S = 72 / 110;                       // 110 dpi px -> pt
  const px = v => v * S;
  const py = v => PAGE_H - v * S;           // measured from the top of the page

  // Positions (110 dpi px). Baselines were checked against a rendered test fill.
  const FIELDS = {
    name:        { x: 305, y: 302, w: 555, size: 10.5 },
    centre:      { x: 305, y: 336, w: 555, size: 10.5 },
    courseDate:  { x: 305, y: 369, w: 555, size: 10.5 },
    nominatedBy: { x: 305, y: 401, w: 555, size: 10.5 },
    director:    { x: 305, y: 434, w: 555, size: 10.5 },
    email:       { x: 403, y: 467, w: 455, size: 10.5 },
    phone:       { x: 403, y: 499, w: 455, size: 10.5 },
    // 1.B boxes: university + course (two lines) and year of study
    uniLine1:    { x: 231, y: 727, w: 222, size: 8.5 },
    uniLine2:    { x: 231, y: 741, w: 222, size: 8.5 },
    year:        { x: 578, y: 735, w: 205, size: 10.5 },
    // Supporting statement: up to 4 lines inside the box
    statement:   { x: 50, y: 1030, w: 810, lineStep: 17 }
  };

  // The "Suitable" box (300 dpi measurement: outer edges 899-975 x 2985-3062).
  // We fill the whole square solid black, as asked ("fill in block, not a tick").
  const SUITABLE_BOX = { x: 899 * 72 / 300, yTop: 2985 * 72 / 300, w: 77 * 72 / 300, h: 78 * 72 / 300 };

  // ── Statement (descriptive words reflecting OPIS, never the numbers) ─────
  // Each rating's scores are 1-3. Average each criterion across all ratings.
  const PHRASES = [
    ["communication",        "communicates clearly",                    "communicates clearly and confidently"],
    ["teamMember",           "works well as a team member",             "an excellent team member"],
    ["confidentAdaptable",   "confident, flexible and adaptable",       "notably confident, flexible and adaptable"],
    ["interactiveSupportive","interactive, supportive and enthusiastic","consistently interactive, supportive and enthusiastic"],
    // Older-form ratings (before 2026-10-07) used these keys instead:
    ["attitudeEngagement",   "engaged and interested",                  "very engaged and interested"],
    ["takingFeedback",       "receptive to feedback",                   "highly receptive to feedback"],
    ["givingFeedback",       "willing to give feedback",                "gives excellent feedback"],
    ["punctuality",          "reliable and punctual",                   "always punctual and reliable"]
  ];
  const STRONG_AT = 2.5, GOOD_AT = 1.75;

  // Items can contain "and" / commas themselves, so join with semicolons.
  function joinList(items) {
    if (items.length <= 1) return items.join("");
    return items.slice(0, -1).join("; ") + "; and " + items[items.length - 1];
  }

  // ratings: [{scores:{...}, outstandingTeachingPotential:bool}, ...]
  // returns { text, warnings[], ratingCount }
  function composeStatement(ratings) {
    const list = (ratings || []).filter(r => r && r.scores);
    const warnings = [];
    const opening = "Passed the RMD BLS and automated external defibrillator (AED) assessment and performed well on the course, as rated by RMD instructors and assessing teams";
    if (!list.length) {
      warnings.push("No OPIS ratings found for this candidate, so the statement has no descriptive detail.");
      return { text: opening + ". Supported as an Instructor Potential.", warnings, ratingCount: 0 };
    }
    const phrases = [];
    PHRASES.forEach(([key, good, strong]) => {
      const vals = list.map(r => r.scores[key]).filter(v => typeof v === "number");
      if (!vals.length) return;
      const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
      if (avg >= STRONG_AT) phrases.push(strong);
      else if (avg >= GOOD_AT) phrases.push(good);
      else warnings.push(key + " averaged below adequate across raters, so it is left out of the wording. Check this candidate before generating.");
    });
    let text = opening + (phrases.length ? ": " + joinList(phrases) : "") + ".";
    if (list.some(r => r.outstandingTeachingPotential === true)) {
      text += " Potential outstanding teaching ability was noted.";
    }
    text += " Supported as an Instructor Potential.";
    return { text, warnings, ratingCount: list.length };
  }

  // ── Text helpers ─────────────────────────────────────────────────────────
  function safeText(font, s) {
    s = String(s == null ? "" : s).normalize("NFC").replace(/[\r\n\t]+/g, " ");
    let out = "";
    for (const ch of s) {
      try { font.encodeText(ch); out += ch; } catch (e) {
        const base = ch.normalize("NFD").replace(/[̀-ͯ]/g, "");
        try { font.encodeText(base); out += base; } catch (e2) { out += "?"; }
      }
    }
    return out;
  }

  function fitSize(font, text, maxW, size, minSize) {
    let sz = size;
    while (sz > minSize && font.widthOfTextAtSize(text, sz) > maxW) sz -= 0.25;
    return sz;
  }

  function wrapLines(font, text, size, maxW) {
    const words = text.split(/\s+/).filter(Boolean);
    const lines = []; let cur = "";
    words.forEach(w => {
      const t = cur ? cur + " " + w : w;
      if (font.widthOfTextAtSize(t, size) <= maxW) cur = t;
      else { if (cur) lines.push(cur); cur = w; }
    });
    if (cur) lines.push(cur);
    return lines;
  }

  // Draw one candidate's form onto `page`. `embedded` is the template embedded
  // once in the output document; `font` is Helvetica embedded in it too.
  // Returns warnings[] for anything that did not fit cleanly.
  function drawForm(PDFLib, page, embedded, font, d) {
    const { rgb } = PDFLib;
    const black = rgb(0, 0, 0);
    const warn = [];
    page.drawPage(embedded, { x: 0, y: 0, width: PAGE_W, height: PAGE_H });

    const put = (key, text) => {
      const f = FIELDS[key];
      const t = safeText(font, text);
      if (!t) return;
      const wpt = f.w * S;
      const sz = fitSize(font, t, wpt, f.size, 7);
      if (font.widthOfTextAtSize(t, sz) > wpt) warn.push(key + " is too long to fit and may run over the edge.");
      page.drawText(t, { x: px(f.x), y: py(f.y), size: sz, font, color: black });
    };

    put("name", d.name);
    put("centre", d.centre);
    put("courseDate", d.courseDate);
    put("nominatedBy", d.nominatedBy);
    put("director", d.director);
    put("email", d.email);
    put("phone", d.phone);
    put("uniLine1", d.university);
    // Degree: shrink to fit; if still too wide, wrap onto line 2 (line 1 is the university)
    const course = safeText(font, d.course || "");
    if (course) {
      const f2 = FIELDS.uniLine2;
      if (font.widthOfTextAtSize(course, 6.75) <= f2.w * S) {
        put("uniLine2", course);
      } else {
        warn.push("Degree name is long; shown in small type.");
        const sz = 6;
        const lines = wrapLines(font, course, sz, f2.w * S).slice(0, 2);
        lines.forEach((ln, i) => page.drawText(ln, { x: px(f2.x), y: py(f2.y) - i * 7, size: sz, font, color: black }));
      }
    }
    put("year", d.year);

    // Supporting statement: biggest size that fits in 4 lines
    const st = safeText(font, d.statement || "");
    const sf = FIELDS.statement;
    let used = false;
    for (const sz of [9.5, 9, 8.5, 8, 7.5, 7]) {
      const lines = wrapLines(font, st, sz, sf.w * S);
      if (lines.length <= 4) {
        lines.forEach((ln, i) => page.drawText(ln, { x: px(sf.x), y: py(sf.y + i * sf.lineStep), size: sz, font, color: black }));
        used = true; break;
      }
    }
    if (!used) {
      warn.push("Supporting statement is too long for the box. Shorten it.");
      wrapLines(font, st, 7, sf.w * S).slice(0, 4).forEach((ln, i) => page.drawText(ln, { x: px(sf.x), y: py(sf.y + i * sf.lineStep), size: 7, font, color: black }));
    }

    // Overall recommendation: solid block in the Suitable box
    if (d.suitable !== false) {
      page.drawRectangle({
        x: SUITABLE_BOX.x, y: PAGE_H - SUITABLE_BOX.yTop - SUITABLE_BOX.h,
        width: SUITABLE_BOX.w, height: SUITABLE_BOX.h, color: black
      });
    }
    return warn;
  }

  // entries: [{ data: {...fields...} }]  -> { bytes, warnings: [[...],...] }
  async function buildPdf(PDFLib, templateBytes, entries) {
    const { PDFDocument, StandardFonts } = PDFLib;
    const out = await PDFDocument.create();
    out.setTitle("BLS Instructor Potential (IP) forms");
    out.setCreator("RMD Birmingham");
    out.setProducer("RMD Birmingham");
    const font = await out.embedFont(StandardFonts.Helvetica);
    const [embedded] = await out.embedPdf(templateBytes, [0]);
    const warnings = [];
    for (const e of entries) {
      const page = out.addPage([PAGE_W, PAGE_H]);
      warnings.push(drawForm(PDFLib, page, embedded, font, e.data));
    }
    return { bytes: await out.save(), warnings };
  }

  const api = { composeStatement, buildPdf, drawForm, FIELDS, SUITABLE_BOX };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.RMD_IP_FORM = api;
})(typeof window !== "undefined" ? window : globalThis);
