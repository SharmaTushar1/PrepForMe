/**
 * The two things this function needs from a PDF before it sends one: a base64
 * string, and a rough page count to refuse an obviously oversized document
 * with.
 */

/** Every PDF starts with this, whatever the upload claimed its type was. */
const PDF_MAGIC = "%PDF-";

export function looksLikePdf(bytes: Uint8Array): boolean {
  if (bytes.length < PDF_MAGIC.length) return false;
  for (let i = 0; i < PDF_MAGIC.length; i++) {
    if (bytes[i] !== PDF_MAGIC.charCodeAt(i)) return false;
  }
  return true;
}

/**
 * Base64 for the `document` content block.
 *
 * `btoa` needs a binary string and `String.fromCharCode` takes its input as
 * arguments, so a whole multi-megabyte file spread into one call overflows the
 * argument limit and takes the isolate with it. The chunk is bounded well under
 * that limit and is a multiple of 3, which is what lets the encoded segments be
 * concatenated: an input length divisible by 3 encodes without padding, so no
 * `=` ever lands in the middle of the result.
 */
export function encodeBase64(bytes: Uint8Array): string {
  const CHUNK = 32_760;
  const parts: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += CHUNK) {
    const chunk = bytes.subarray(offset, offset + CHUNK);
    parts.push(btoa(String.fromCharCode(...chunk)));
  }
  return parts.join("");
}

/**
 * A cheap page-count estimate, read straight out of the file's bytes.
 *
 * This is a heuristic and it is only trusted in one direction. It scans for the
 * page tree's `/Count` and for `/Type /Page` objects, both of which sit in
 * plain text in a simple PDF. In a PDF 1.5+ file that packs its object tree
 * into compressed object streams, neither marker is visible without
 * decompressing, and this returns null.
 *
 * That failure mode is deliberate: an undercount or a null lets a document
 * through to a model that charges per page, which costs cents, while an
 * overcount refuses a resume the candidate is entitled to analyze. So a null
 * means "no opinion" and the caller lets it pass. Properly counting pages would
 * mean a PDF parser in the bundle, which this project decided against.
 */
export function estimatePageCount(bytes: Uint8Array): number | null {
  // latin1 maps every byte to exactly one character, so the ASCII markers below
  // survive intact. Decoding as UTF-8 would let a stray high byte swallow the
  // character after it, including a leading `/`.
  const text = new TextDecoder("latin1").decode(bytes);

  let best = 0;

  // The root of the page tree carries the real total; nested nodes carry their
  // own subtotals, so the largest is the one that counts.
  for (const match of text.matchAll(/\/Count\s+(\d+)/g)) {
    const value = Number.parseInt(match[1], 10);
    if (Number.isFinite(value) && value > best) best = value;
  }

  // Independent signal: one `/Type /Page` object per page. The lookahead keeps
  // this from also matching the `/Type /Pages` tree nodes.
  const pageObjects = text.match(/\/Type\s*\/Page(?![a-zA-Z])/g)?.length ?? 0;
  if (pageObjects > best) best = pageObjects;

  return best > 0 ? best : null;
}
