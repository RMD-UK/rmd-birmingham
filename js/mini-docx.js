/**
 * mini-docx.js (2026-10) - a small, dependency-free writer for real .docx files,
 * used by the Course Report export in cd-dashboard.html (Jon: the first report
 * was HTML saved as .doc, not a true .docx). Takes the block model from
 * RMD_COURSE_REPORT.buildReportModel() and returns a Uint8Array containing a
 * valid OOXML package in a "stored" (uncompressed) ZIP.
 *
 * Blocks: {t:"h1"|"h2"|"h3", text}  {t:"p", runs:[{text,bold}]}
 *         {t:"ul", items:[text]}    {t:"table", headers, rows, weights}
 * Landscape A4. Works in browsers and node (TextEncoder is global in both).
 */
(function (root) {
  "use strict";

  const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
             'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
  const NAVY = "003B71";
  const PAGE_W = 16838, PAGE_H = 11906, MARGIN = 720;     // A4 landscape, 0.5 inch margins
  const CONTENT_W = PAGE_W - 2 * MARGIN;

  // XML 1.0 forbids most control characters; drop them rather than corrupt the file.
  function clean(v) {
    return (v == null ? "" : String(v)).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "");
  }
  function x(v) {
    return clean(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  // A run of text; "\n" becomes a line break.
  function run(text, o) {
    o = o || {};
    const rpr = (o.bold ? "<w:b/>" : "") + (o.color ? `<w:color w:val="${o.color}"/>` : "");
    const parts = clean(text).split("\n");
    const inner = parts.map((t, i) => (i ? "<w:br/>" : "") + `<w:t xml:space="preserve">${x(t)}</w:t>`).join("");
    return `<w:r>${rpr ? `<w:rPr>${rpr}</w:rPr>` : ""}${inner}</w:r>`;
  }

  function para(runsXml, o) {
    o = o || {};
    const ppr = (o.style ? `<w:pStyle w:val="${o.style}"/>` : "") + (o.num ? '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>' : "");
    return `<w:p>${ppr ? `<w:pPr>${ppr}</w:pPr>` : ""}${runsXml}</w:p>`;
  }

  function cell(text, width, o) {
    o = o || {};
    const shd = o.header ? `<w:shd w:val="clear" w:color="auto" w:fill="${NAVY}"/>` : "";
    const body = para(run(text, { bold: o.header, color: o.header ? "FFFFFF" : null }), { style: "TableText" });
    return `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${shd}</w:tcPr>${body}</w:tc>`;
  }

  function table(blk) {
    const n = blk.headers.length;
    const weights = (blk.weights && blk.weights.length === n) ? blk.weights : blk.headers.map(() => 1);
    const total = weights.reduce((a, b) => a + b, 0);
    const widths = weights.map(w => Math.floor(CONTENT_W * w / total));
    widths[n - 1] += CONTENT_W - widths.reduce((a, b) => a + b, 0);   // absorb rounding so the sum is exact
    const border = '<w:top w:val="single" w:sz="4" w:space="0" w:color="9AA7B5"/><w:left w:val="single" w:sz="4" w:space="0" w:color="9AA7B5"/>' +
      '<w:bottom w:val="single" w:sz="4" w:space="0" w:color="9AA7B5"/><w:right w:val="single" w:sz="4" w:space="0" w:color="9AA7B5"/>' +
      '<w:insideH w:val="single" w:sz="4" w:space="0" w:color="9AA7B5"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="9AA7B5"/>';
    let xml = `<w:tbl><w:tblPr><w:tblW w:w="${CONTENT_W}" w:type="dxa"/><w:tblBorders>${border}</w:tblBorders><w:tblLayout w:type="fixed"/>` +
      '<w:tblCellMar><w:top w:w="40" w:type="dxa"/><w:left w:w="80" w:type="dxa"/><w:bottom w:w="40" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr>' +
      `<w:tblGrid>${widths.map(w => `<w:gridCol w:w="${w}"/>`).join("")}</w:tblGrid>`;
    xml += `<w:tr><w:trPr><w:cantSplit/><w:tblHeader/></w:trPr>${blk.headers.map((h, i) => cell(h, widths[i], { header: true })).join("")}</w:tr>`;
    blk.rows.forEach(r => {
      xml += `<w:tr><w:trPr><w:cantSplit/></w:trPr>${r.map((c, i) => cell(c, widths[i])).join("")}</w:tr>`;
    });
    xml += "</w:tbl>" + para("", { style: "Spacer" });   // a paragraph must follow a table
    return xml;
  }

  function documentXml(blocks) {
    const body = blocks.map(b => {
      if (b.t === "h1") return para(run(b.text), { style: "Heading1" });
      if (b.t === "h2") return para(run(b.text), { style: "Heading2" });
      if (b.t === "h3") return para(run(b.text), { style: "Heading3" });
      if (b.t === "p")  return para(b.runs.map(r => run(r.text, { bold: r.bold })).join(""));
      if (b.t === "ul") return b.items.map(t => para(run(t), { style: "ListParagraph", num: true })).join("");
      if (b.t === "table") return table(b);
      return "";
    }).join("");
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${NS}><w:body>${body}` +
      `<w:sectPr><w:pgSz w:w="${PAGE_W}" w:h="${PAGE_H}" w:orient="landscape"/>` +
      `<w:pgMar w:top="${MARGIN}" w:right="${MARGIN}" w:bottom="${MARGIN}" w:left="${MARGIN}" w:header="360" w:footer="360" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  }

  const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles ${NS}>
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri" w:cs="Calibri"/><w:sz w:val="21"/><w:szCs w:val="21"/><w:lang w:val="en-GB"/></w:rPr></w:rPrDefault>
<w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="259" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="0" w:after="160"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:color w:val="${NAVY}"/><w:sz w:val="40"/><w:szCs w:val="40"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="320" w:after="100"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:color w:val="${NAVY}"/><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="200" w:after="60"/><w:outlineLvl w:val="2"/></w:pPr><w:rPr><w:b/><w:sz w:val="23"/><w:szCs w:val="23"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="60"/><w:ind w:left="720"/></w:pPr></w:style>
<w:style w:type="paragraph" w:customStyle="1" w:styleId="TableText"><w:name w:val="Table Text"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:rPr><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr></w:style>
<w:style w:type="paragraph" w:customStyle="1" w:styleId="Spacer"><w:name w:val="Spacer"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="0" w:line="120" w:lineRule="exact"/></w:pPr><w:rPr><w:sz w:val="8"/></w:rPr></w:style>
</w:styles>`;

  const NUMBERING = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering ${NS}>
<w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="hybridMultilevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="&#8226;"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/></w:rPr></w:lvl></w:abstractNum>
<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>`;

  const CONTENT_TYPES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
    '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
    '<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>' +
    '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>';

  const ROOT_RELS = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>';

  const DOC_RELS = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/></Relationships>';

  function coreXml(title, when) {
    const iso = (when || new Date()).toISOString().replace(/\.\d+Z$/, "Z");
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ' +
      'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
      `<dc:title>${x(title)}</dc:title><dc:creator>RMD Birmingham</dc:creator>` +
      `<dcterms:created xsi:type="dcterms:W3CDTF">${iso}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${iso}</dcterms:modified></cp:coreProperties>`;
  }

  // ── ZIP (stored, no compression) ──────────────────────────────────────────
  let CRC_TABLE = null;
  function crc32(bytes) {
    if (!CRC_TABLE) {
      CRC_TABLE = new Uint32Array(256);
      for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); CRC_TABLE[n] = c >>> 0; }
    }
    let c = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  function zip(files, when) {
    const enc = new TextEncoder();
    const d = when || new Date();
    const dosTime = ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xFFFF;
    const dosDate = ((((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate())) & 0xFFFF;
    const chunks = [], central = [];
    let offset = 0;
    const u16 = v => [v & 0xFF, (v >>> 8) & 0xFF];
    const u32 = v => [v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF];
    files.forEach(f => {
      const name = enc.encode(f.name), data = enc.encode(f.data), crc = crc32(data);
      const local = new Uint8Array([0x50, 0x4B, 0x03, 0x04, ...u16(20), ...u16(0x0800), ...u16(0), ...u16(dosTime), ...u16(dosDate),
        ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0)]);
      chunks.push(local, name, data);
      central.push({ name, crc, size: data.length, offset });
      offset += local.length + name.length + data.length;
    });
    const cdStart = offset;
    central.forEach(e => {
      const hdr = new Uint8Array([0x50, 0x4B, 0x01, 0x02, ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(dosTime), ...u16(dosDate),
        ...u32(e.crc), ...u32(e.size), ...u32(e.size), ...u16(e.name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(e.offset)]);
      chunks.push(hdr, e.name);
      offset += hdr.length + e.name.length;
    });
    const eocd = new Uint8Array([0x50, 0x4B, 0x05, 0x06, ...u16(0), ...u16(0), ...u16(central.length), ...u16(central.length),
      ...u32(offset - cdStart), ...u32(cdStart), ...u16(0)]);
    chunks.push(eocd);
    const out = new Uint8Array(offset + eocd.length);
    let p = 0;
    chunks.forEach(c => { out.set(c, p); p += c.length; });
    return out;
  }

  function build(blocks, opts) {
    opts = opts || {};
    const title = opts.title || "Report";
    return zip([
      { name: "[Content_Types].xml", data: CONTENT_TYPES },
      { name: "_rels/.rels", data: ROOT_RELS },
      { name: "word/document.xml", data: documentXml(blocks) },
      { name: "word/_rels/document.xml.rels", data: DOC_RELS },
      { name: "word/styles.xml", data: STYLES },
      { name: "word/numbering.xml", data: NUMBERING },
      { name: "docProps/core.xml", data: coreXml(title, opts.when) }
    ], opts.when);
  }

  const api = { build, crc32, documentXml };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.RMD_MINIDOCX = api;
})(typeof window !== "undefined" ? window : globalThis);
