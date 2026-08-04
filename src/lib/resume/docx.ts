import { zipSync, type ZipEntry } from "./zip";
import type { ResumeBlock, ResumeDocument } from "./document";

/**
 * WordprocessingML for a resume built to be read by software.
 *
 * Everything a parser trips over is absent by construction, which is the point
 * of generating the markup here rather than restyling someone's existing file:
 * there are no tables, no text boxes, no columns, no images, no headers or
 * footers, and no content anywhere except a single flat run of paragraphs. It is
 * hard to accidentally reintroduce a two-column layout when the writer has no
 * way to express one.
 *
 * Bullets are the character "•" inside the paragraph text with a hanging indent,
 * not a numbering definition. A real list would need `numbering.xml` and a style
 * reference, and would extract as an unmarked line anyway — the character
 * survives every extractor, including the ones that ignore list formatting.
 *
 * DOCX rather than PDF first because it is the format the candidate can keep
 * editing, it is accepted by every major job portal, and Word or Google Docs will
 * export a faithful PDF from it in one step.
 */

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

/** Twips: 1/20 pt, so 1440 to the inch. Half-inch margins would look cramped. */
const MARGIN = 1080; // 0.75"
const PAGE_WIDTH = 12240; // US Letter, 8.5"
const PAGE_HEIGHT = 15840; // 11"

/** Half-points, the unit `w:sz` uses. 21 is 10.5pt body text. */
const SIZE = {
  name: 32,
  contact: 19,
  heading: 24,
  body: 21,
  meta: 19,
} as const;

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

interface RunOptions {
  bold?: boolean;
  size?: number;
  /** A grey, for the date line under a role. Six hex digits, no hash. */
  color?: string;
}

/**
 * `xml:space="preserve"` on every run: without it a leading or trailing space in
 * the candidate's own text is silently dropped, and this file copies their text
 * verbatim or it has failed at its one job.
 */
function run(text: string, options: RunOptions = {}): string {
  const properties = [
    options.bold ? "<w:b/>" : "",
    `<w:sz w:val="${options.size ?? SIZE.body}"/>`,
    `<w:szCs w:val="${options.size ?? SIZE.body}"/>`,
    options.color ? `<w:color w:val="${options.color}"/>` : "",
  ].join("");

  return `<w:r><w:rPr>${properties}</w:rPr><w:t xml:space="preserve">${
    escapeXml(text)
  }</w:t></w:r>`;
}

interface ParagraphOptions extends RunOptions {
  /** Space above, in twips. */
  before?: number;
  after?: number;
  /** Left indent and hanging indent, for bullets. */
  indent?: number;
  hanging?: number;
  center?: boolean;
}

function paragraph(text: string, options: ParagraphOptions = {}): string {
  const spacing = `<w:spacing w:before="${options.before ?? 0}" w:after="${
    options.after ?? 0
  }" w:line="264" w:lineRule="auto"/>`;
  const indent = options.indent
    ? `<w:ind w:left="${options.indent}" w:hanging="${options.hanging ?? 0}"/>`
    : "";
  const alignment = options.center ? '<w:jc w:val="center"/>' : "";

  return `<w:p><w:pPr>${spacing}${indent}${alignment}</w:pPr>${
    run(text, options)
  }</w:p>`;
}

function blockXml(block: ResumeBlock): string {
  switch (block.kind) {
    case "name":
      return paragraph(block.text, { size: SIZE.name, bold: true, after: 40 });

    case "contact":
      return paragraph(block.text, { size: SIZE.contact, color: "404040", after: 60 });

    case "heading":
      // Generous space above and little below, so the heading reads as attached
      // to what follows it rather than floating between two sections.
      return paragraph(block.text, {
        size: SIZE.heading,
        bold: true,
        before: 260,
        after: 60,
      });

    case "subheading":
      return (
        paragraph(block.text, { bold: true, before: 120 }) +
        (block.meta ? paragraph(block.meta, { size: SIZE.meta, color: "595959" }) : "")
      );

    case "paragraph":
      return paragraph(block.text, { after: 40 });

    case "bullet":
      // 220 twips of hanging indent puts the wrap under the text, not under the
      // bullet, which is the only thing the indent is for.
      return paragraph(`• ${block.text}`, { indent: 220, hanging: 220, after: 40 });
  }
}

function documentXml(blocks: ResumeBlock[]): string {
  const body = blocks.map(blockXml).join("");
  const section =
    `<w:sectPr><w:pgSz w:w="${PAGE_WIDTH}" w:h="${PAGE_HEIGHT}"/><w:pgMar w:top="${MARGIN}" w:right="${MARGIN}" w:bottom="${MARGIN}" w:left="${MARGIN}" w:header="0" w:footer="0" w:gutter="0"/><w:cols w:space="0" w:num="1"/></w:sectPr>`;

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="${W}"><w:body>${body}${section}</w:body></w:document>`;
}

/**
 * One default font for the whole document.
 *
 * Arial because it is metrically present on every platform that opens this, so
 * the file does not reflow into three pages on a machine that has never heard of
 * the font the original template used.
 */
const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="${W}"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:sz w:val="${SIZE.body}"/><w:szCs w:val="${SIZE.body}"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults></w:styles>`;

const CONTENT_TYPES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`;

const PACKAGE_RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;

const DOCUMENT_RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;

/**
 * The five parts Word needs, in the order it expects to find them.
 *
 * `[Content_Types].xml` is first because the specification requires the content
 * types part to precede the parts it describes.
 */
export function renderDocx(document: ResumeDocument): Blob {
  const entries: ZipEntry[] = [
    { path: "[Content_Types].xml", text: CONTENT_TYPES_XML },
    { path: "_rels/.rels", text: PACKAGE_RELS_XML },
    { path: "word/_rels/document.xml.rels", text: DOCUMENT_RELS_XML },
    { path: "word/document.xml", text: documentXml(document.blocks) },
    { path: "word/styles.xml", text: STYLES_XML },
  ];
  return zipSync(entries);
}
