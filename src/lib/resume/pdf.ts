import type { ResumeBlock, ResumeDocument } from "./document";
import { encodeWinAnsi, textWidth, unsupportedCharacters } from "./pdfFont";

/**
 * A single-column PDF with a real text layer, written out by hand.
 *
 * The reason this exists at all is that the original file often cannot be fixed:
 * PDF is a fixed-layout format that records where marks sit on a page, so editing
 * a two-column resume into one column means re-flowing a document that has no
 * concept of flow. Generating a new one from the parse is the only version of
 * "fix my layout" that can be done reliably, and this file is deliberately blunt
 * about the difference — it produces a *new document*, and the UI says so.
 *
 * Written directly rather than with a renderer library for the same reason as the
 * DOCX: the output is text in one column with two fonts, the format's text model
 * is small, and the alternative is several hundred kilobytes of dependency
 * shipped to everyone who visits, in exchange for features this page does not
 * want. It uses only:
 *
 *   - the base-14 Helvetica faces, so nothing is embedded and no glyph can be
 *     missing at the reader's end;
 *   - one uncompressed content stream per page, which is what makes the text
 *     extractable by the crude parsers this whole feature is aimed at;
 *   - a plain cross-reference table, which every reader since 1993 accepts.
 *
 * What it does not do is anything a parser could misread: no columns, no tables,
 * no images, no annotations, no page headers or footers, and no text positioned
 * anywhere except in reading order, top to bottom.
 */

// US Letter in points. A4 would be a per-user preference; Letter is what US
// applicant tracking systems and every American recruiter expect, and the
// content is short enough that neither clips.
const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 54; // 0.75"
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

/** Hanging indent for bullets, wide enough for "• " at body size. */
const BULLET_INDENT = 12;

interface Style {
  size: number;
  bold: boolean;
  /** Grey level, 0 black to 1 white. */
  grey: number;
  /** Leading, as a multiple of the font size. */
  lineHeight: number;
  /** Blank space above and below the block, in points. */
  before: number;
  after: number;
  indent: number;
}

const BODY: Style = {
  size: 10.5,
  bold: false,
  grey: 0,
  lineHeight: 1.32,
  before: 0,
  after: 2,
  indent: 0,
};

function styleFor(block: ResumeBlock): Style {
  switch (block.kind) {
    case "name":
      return { ...BODY, size: 17, bold: true, lineHeight: 1.2, after: 3 };
    case "contact":
      return { ...BODY, size: 9.5, grey: 0.25, after: 4 };
    case "heading":
      return { ...BODY, size: 12, bold: true, before: 13, after: 4 };
    case "subheading":
      return { ...BODY, bold: true, before: 7, after: 1 };
    case "paragraph":
      return BODY;
    case "bullet":
      return { ...BODY, indent: BULLET_INDENT };
  }
}

/**
 * Greedy wrap on spaces, which is what a resume needs and all it needs.
 *
 * A word longer than the line — a URL with no break in it — is left to overflow
 * rather than being broken mid-token, because a link chopped across two lines is
 * unusable and a slightly long line is not.
 */
function wrap(text: string, width: number, size: number, bold: boolean): string[] {
  const words = text.split(/\s+/).filter((word) => word !== "");
  if (words.length === 0) return [];

  const lines: string[] = [];
  let line = words[0];

  for (const word of words.slice(1)) {
    const candidate = `${line} ${word}`;
    if (textWidth(candidate, size, bold) <= width) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
    }
  }
  lines.push(line);
  return lines;
}

/** One positioned line of text, ready to become content-stream operators. */
interface PlacedLine {
  text: string;
  x: number;
  y: number;
  size: number;
  bold: boolean;
  grey: number;
}

/**
 * Lay the blocks out into pages.
 *
 * Deliberately simple: no widow or orphan control, no keeping a heading with the
 * block beneath it. Both would be improvements to look at and neither changes
 * what a parser reads, so they are not worth the risk of a layout engine anyone
 * has to reason about. The one concession is that a heading landing at the very
 * bottom of a page starts the next one, since a heading alone above a page break
 * looks like a mistake in the file rather than in the resume.
 */
function paginate(blocks: ResumeBlock[]): PlacedLine[][] {
  const pages: PlacedLine[][] = [];
  let page: PlacedLine[] = [];
  let y = PAGE_HEIGHT - MARGIN;
  const bottom = MARGIN;

  const newPage = () => {
    pages.push(page);
    page = [];
    y = PAGE_HEIGHT - MARGIN;
  };

  for (const block of blocks) {
    const style = styleFor(block);
    const text = block.kind === "bullet" ? `• ${block.text}` : block.text;
    const leading = style.size * style.lineHeight;

    const firstWidth = CONTENT_WIDTH - style.indent;
    const lines = wrap(text, firstWidth, style.size, style.bold);
    if (lines.length === 0) continue;

    y -= style.before;

    // A heading needs its own first line plus one line of whatever follows to be
    // worth starting here at all.
    const needed = block.kind === "heading" ? leading * 2 : leading;
    if (y - needed < bottom && page.length > 0) newPage();

    lines.forEach((line, index) => {
      if (y - leading < bottom && page.length > 0) newPage();
      y -= leading;
      page.push({
        text: line,
        // Continuation lines of a bullet align under its text, not its marker.
        x: MARGIN + (index === 0 ? 0 : style.indent),
        y,
        size: style.size,
        bold: style.bold,
        grey: style.grey,
      });
    });

    y -= style.after;

    if (block.kind === "subheading" && block.meta) {
      const metaStyle = { ...BODY, size: 9.5, grey: 0.35 };
      const metaLeading = metaStyle.size * metaStyle.lineHeight;
      if (y - metaLeading < bottom && page.length > 0) newPage();
      y -= metaLeading;
      page.push({
        text: block.meta,
        x: MARGIN,
        y,
        size: metaStyle.size,
        bold: false,
        grey: metaStyle.grey,
      });
      y -= 2;
    }
  }

  pages.push(page);
  return pages;
}

/**
 * One text-showing operator per line, each with an absolute text matrix.
 *
 * Absolute positioning per line rather than relative `TD` offsets: it makes each
 * line independent, so a change to the layout cannot cause the rest of a page to
 * drift, and it costs a few bytes in a file that is already tiny.
 */
function contentStream(lines: PlacedLine[]): string {
  const operators: string[] = [];
  let currentGrey: number | null = null;

  for (const line of lines) {
    if (line.grey !== currentGrey) {
      // `rg` takes the colour itself, where 0 is black — so `grey` is written
      // straight through. Inverting it here paints body text white, which is
      // invisible on screen and still extracts perfectly, so nothing but
      // rendering the output catches it.
      const value = line.grey.toFixed(3);
      operators.push(`${value} ${value} ${value} rg`);
      currentGrey = line.grey;
    }
    const font = line.bold ? "/F2" : "/F1";
    operators.push(
      `BT ${font} ${line.size} Tf 1 0 0 1 ${line.x.toFixed(2)} ${
        line.y.toFixed(2)
      } Tm (${encodeWinAnsi(line.text)}) Tj ET`,
    );
  }

  return operators.join("\n");
}

/**
 * Latin-1 bytes from a string that is already known to be WinAnsi-encodable.
 *
 * The file is assembled as a string for readability and converted here, one byte
 * per code unit. A `TextEncoder` would emit UTF-8 and turn every byte above 127
 * into two, corrupting both the cross-reference offsets and the text.
 */
function latin1Bytes(text: string) {
  // Return type left to inference: annotating it as `Uint8Array` widens the
  // buffer to `ArrayBufferLike`, which `Blob` will not accept.
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i) & 0xff;
  return bytes;
}

/**
 * Anything in this document that a Helvetica PDF cannot represent.
 *
 * The UI calls this before offering the download, so a candidate whose name needs
 * a script WinAnsi has never heard of is told to take the DOCX rather than handed
 * a resume with holes in it.
 */
export function pdfUnsupportedCharacters(document: ResumeDocument): string[] {
  const text = document.blocks
    .map((block) => (block.kind === "subheading" ? `${block.text} ${block.meta}` : block.text))
    .join("\n");
  return unsupportedCharacters(text);
}

export function renderPdf(document: ResumeDocument): Blob {
  const pages = paginate(document.blocks).filter((page) => page.length > 0);
  const streams = pages.map(contentStream);

  // Object numbering, fixed up front so references can be written before the
  // objects themselves exist: 1 catalog, 2 page tree, 3 and 4 the two fonts,
  // then a page and a stream for each page.
  const catalog = 1;
  const pageTree = 2;
  const regularFont = 3;
  const boldFont = 4;
  const firstPage = 5;
  const pageNumber = (index: number) => firstPage + index * 2;
  const streamNumber = (index: number) => firstPage + index * 2 + 1;

  const objects: string[] = [];
  const push = (body: string) => objects.push(body);

  push(`<< /Type /Catalog /Pages ${pageTree} 0 R >>`);
  push(
    `<< /Type /Pages /Count ${pages.length} /Kids [${
      pages.map((_, i) => `${pageNumber(i)} 0 R`).join(" ")
    }] >>`,
  );
  push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");

  pages.forEach((_, index) => {
    push(
      `<< /Type /Page /Parent ${pageTree} 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
        `/Resources << /Font << /F1 ${regularFont} 0 R /F2 ${boldFont} 0 R >> >> ` +
        `/Contents ${streamNumber(index)} 0 R >>`,
    );
    const stream = streams[index];
    // Uncompressed on purpose: a resume's text is a couple of kilobytes, and an
    // extractable text layer is the entire point of the exercise.
    push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  });

  // The binary comment on line two marks the file as containing bytes above 127,
  // which stops a transport from treating it as text and rewriting line endings.
  let file = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
  const offsets: number[] = [];

  objects.forEach((body, index) => {
    offsets.push(file.length);
    file += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });

  const xrefOffset = file.length;
  file += `xref\n0 ${objects.length + 1}\n`;
  // The head of the free list, which the format requires to look exactly so.
  file += "0000000000 65535 f \n";
  for (const offset of offsets) {
    file += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  file += `trailer\n<< /Size ${
    objects.length + 1
  } /Root ${catalog} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return new Blob([latin1Bytes(file)], { type: "application/pdf" });
}
