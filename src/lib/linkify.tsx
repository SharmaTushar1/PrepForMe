import type { ReactNode } from "react";

/**
 * Turn bare URLs and common domains in plain text into clickable anchors.
 * No markdown — prep chat answers are plain text with occasional URLs.
 */
const LINK_RE =
  /\b((?:https?:\/\/|www\.)[^\s<>'")\]]+|(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+(?:com|org|net|io|ai|dev|co|app|edu|gov|uk|us)(?:\/[^\s<>'")\]]*)?)/gi;

function hrefFor(match: string): string {
  if (/^https?:\/\//i.test(match)) return match;
  if (/^www\./i.test(match)) return `https://${match}`;
  return `https://${match}`;
}

/** Strip trailing punctuation that usually isn't part of the URL. */
function trimTrailing(match: string): { url: string; trail: string } {
  const m = match.match(/^(.*?)([.,;:!?)]+)$/);
  if (!m) return { url: match, trail: "" };
  return { url: m[1], trail: m[2] };
}

export function linkifyText(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  let key = 0;
  LINK_RE.lastIndex = 0;

  for (const match of text.matchAll(LINK_RE)) {
    const raw = match[0];
    const index = match.index ?? 0;
    if (index > last) {
      nodes.push(text.slice(last, index));
    }
    const { url, trail } = trimTrailing(raw);
    nodes.push(
      <a
        key={`l-${key++}`}
        href={hrefFor(url)}
        target="_blank"
        rel="noopener noreferrer"
      >
        {url}
      </a>,
    );
    if (trail) nodes.push(trail);
    last = index + raw.length;
  }

  if (last < text.length) nodes.push(text.slice(last));
  return nodes.length > 0 ? nodes : [text];
}
