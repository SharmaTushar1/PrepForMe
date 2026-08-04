/**
 * Helvetica metrics, and the encoding a PDF viewer will read our bytes with.
 *
 * Helvetica is one of the fourteen faces every PDF reader is required to provide,
 * so nothing has to be embedded — which is what keeps a generated resume at a few
 * kilobytes and removes any question of font licensing. The cost is the metrics:
 * line wrapping needs to know how wide a string will be, and with no embedded
 * font there is no table in the file to ask. So the widths live here, taken from
 * the Adobe Font Metrics for Helvetica and Helvetica-Bold, in units of 1/1000 em.
 *
 * They are also why the PDF is offered conditionally. These faces are encoded
 * with WinAnsi, an 8-bit encoding covering Latin-1 and common punctuation and
 * nothing else. A name in Devanagari or Han cannot be written in it at all, and
 * substituting question marks into someone's name is not an acceptable way to
 * hand them a resume — so `unsupportedCharacters` reports the problem and the UI
 * offers only the DOCX, which is Unicode throughout.
 */

/** Widths for codes 32–126, the ASCII range, in order. */
const REGULAR_ASCII = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
  556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];

const BOLD_ASCII = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611,
  975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556,
  333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611,
  611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
];

/**
 * The characters a resume actually contains beyond ASCII, mapped to their
 * WinAnsi byte. Typographic punctuation dominates because word processors insert
 * it silently: a hyphen typed between two years becomes an en dash, and a
 * straight apostrophe becomes a curly one.
 */
const WINANSI_PUNCTUATION: Record<string, number> = {
  "\u2018": 0x91, // left single quote
  "\u2019": 0x92, // right single quote / apostrophe
  "\u201c": 0x93, // left double quote
  "\u201d": 0x94, // right double quote
  "\u2022": 0x95, // bullet
  "\u2013": 0x96, // en dash
  "\u2014": 0x97, // em dash
  "\u2026": 0x85, // ellipsis
  "\u2020": 0x86, // dagger
  "\u00a0": 0x20, // non-breaking space, written as a plain one
  "\u2011": 0x2d, // non-breaking hyphen
  "\u00ad": 0x2d, // soft hyphen
  "\u2212": 0x2d, // minus sign
  "\u00b7": 0xb7, // middle dot
  "\u20ac": 0x80, // euro
  "\u2122": 0x99, // trademark
};

/** Widths for the punctuation above, which the ASCII table does not cover. */
const PUNCTUATION_WIDTHS: Record<number, { regular: number; bold: number }> = {
  0x85: { regular: 1000, bold: 1000 },
  0x86: { regular: 556, bold: 556 },
  0x91: { regular: 222, bold: 278 },
  0x92: { regular: 222, bold: 278 },
  0x93: { regular: 333, bold: 500 },
  0x94: { regular: 333, bold: 500 },
  0x95: { regular: 350, bold: 350 },
  0x96: { regular: 556, bold: 556 },
  0x97: { regular: 1000, bold: 1000 },
  0x99: { regular: 1000, bold: 1000 },
  0x80: { regular: 556, bold: 556 },
  0xb7: { regular: 278, bold: 278 },
};

/**
 * A character's WinAnsi byte, or null if the encoding cannot express it.
 *
 * Latin-1 above the punctuation block maps to itself, which covers every accented
 * character used in European names. The gap between 0x80 and 0x9f is where WinAnsi
 * differs from Latin-1 and holds the punctuation table above.
 */
function winAnsiByte(character: string): number | null {
  const mapped = WINANSI_PUNCTUATION[character];
  if (mapped !== undefined) return mapped;

  const code = character.codePointAt(0) ?? 0;
  if (code >= 0x20 && code <= 0x7e) return code;
  if (code >= 0xa0 && code <= 0xff) return code;
  return null;
}

/**
 * Every distinct character in `text` that a PDF using these fonts cannot show.
 *
 * Returned rather than substituted: the caller's only honest options are to fix
 * the text or to not offer the PDF, and quietly dropping a character from
 * somebody's name is neither.
 */
export function unsupportedCharacters(text: string): string[] {
  const found = new Set<string>();
  for (const character of text) {
    // Tabs and newlines are handled by the layout, not the encoder.
    if (character === "\n" || character === "\t") continue;
    if (winAnsiByte(character) === null) found.add(character);
  }
  return [...found];
}

/**
 * WinAnsi bytes for a PDF literal string, with the three characters that would
 * otherwise end or nest the string escaped.
 *
 * Unsupported characters are dropped here, having already been reported by
 * `unsupportedCharacters` — reaching this point with any is a caller that ignored
 * the check, and a malformed string would be worse than a missing glyph.
 */
export function encodeWinAnsi(text: string): string {
  let out = "";
  for (const character of text) {
    const byte = winAnsiByte(character);
    if (byte === null) continue;
    const encoded = String.fromCharCode(byte);
    if (encoded === "(" || encoded === ")" || encoded === "\\") out += "\\";
    out += encoded;
  }
  return out;
}

/** Width of `text` in points at `size`, for the regular or bold face. */
export function textWidth(text: string, size: number, bold: boolean): number {
  const ascii = bold ? BOLD_ASCII : REGULAR_ASCII;
  let thousandths = 0;

  for (const character of text) {
    const byte = winAnsiByte(character);
    if (byte === null) continue;
    if (byte >= 0x20 && byte <= 0x7e) {
      thousandths += ascii[byte - 0x20];
      continue;
    }
    const punctuation = PUNCTUATION_WIDTHS[byte];
    if (punctuation) {
      thousandths += bold ? punctuation.bold : punctuation.regular;
      continue;
    }
    // An accented Latin-1 letter, whose width matches its unaccented base
    // closely enough that a wrapped line lands in the same place.
    thousandths += bold ? 611 : 556;
  }

  return (thousandths / 1000) * size;
}
