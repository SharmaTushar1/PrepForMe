/**
 * robots.txt gate for URL ingest.
 *
 * Access gate only — not a redistribution license. See PROJECT.md §11.
 * User-agent is fixed so disallow rules for AI/LLM bots (e.g. Glassdoor) apply.
 */

export const PREP_USER_AGENT = "PrepForMeBot/1.0 (+https://prep-for-me.vercel.app)";

export interface RobotsDecision {
  allowed: boolean;
  reason?: string;
}

/**
 * True when our user-agent may fetch `url` according to the host's robots.txt.
 * Fail closed on network/parse errors for the robots file itself only when the
 * host is unreachable for robots — if robots.txt 404s, treat as allow (standard).
 */
export async function robotsAllows(url: string): Promise<RobotsDecision> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { allowed: false, reason: "That URL is not valid." };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { allowed: false, reason: "Only http and https URLs can be fetched." };
  }

  const robotsUrl = `${parsed.protocol}//${parsed.host}/robots.txt`;
  let text = "";
  try {
    const response = await fetch(robotsUrl, {
      headers: { "user-agent": PREP_USER_AGENT },
      redirect: "follow",
      signal: AbortSignal.timeout(8_000),
    });
    if (response.status === 404) return { allowed: true };
    if (!response.ok) {
      // Unreachable robots — fail closed so we do not fetch against an unknown policy.
      return {
        allowed: false,
        reason: "Could not read robots.txt for that site, so it was not fetched.",
      };
    }
    text = await response.text();
  } catch {
    return {
      allowed: false,
      reason: "Could not reach robots.txt for that site, so it was not fetched.",
    };
  }

  const path = parsed.pathname || "/";
  if (isDisallowed(text, path, PREP_USER_AGENT)) {
    return {
      allowed: false,
      reason:
        "That site's robots.txt disallows our crawler, so the page was not fetched.",
    };
  }
  return { allowed: true };
}

/** Minimal robots.txt matcher for User-agent + Disallow/Allow. */
export function isDisallowed(
  robotsText: string,
  path: string,
  userAgent: string,
): boolean {
  const ua = userAgent.toLowerCase();
  const groups = parseGroups(robotsText);
  // Prefer the most specific matching group; fall back to *.
  const matching =
    groups.filter((g) => g.agents.some((a) => a === "*" || ua.includes(a) || a.includes("prepforme"))) ||
    [];
  const group =
    matching.find((g) => g.agents.some((a) => a !== "*" && (ua.includes(a) || a.includes("bot")))) ??
    matching.find((g) => g.agents.includes("*")) ??
    matching[0];

  if (!group) return false;

  let disallowMatch = "";
  let allowMatch = "";
  for (const rule of group.disallow) {
    if (pathMatches(path, rule) && rule.length >= disallowMatch.length) {
      disallowMatch = rule;
    }
  }
  for (const rule of group.allow) {
    if (pathMatches(path, rule) && rule.length >= allowMatch.length) {
      allowMatch = rule;
    }
  }
  if (allowMatch.length > disallowMatch.length) return false;
  if (disallowMatch === "") return false;
  return true;
}

interface RobotsGroup {
  agents: string[];
  disallow: string[];
  allow: string[];
}

function parseGroups(text: string): RobotsGroup[] {
  const groups: RobotsGroup[] = [];
  let current: RobotsGroup | null = null;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    if (line === "") continue;
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const key = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();

    if (key === "user-agent") {
      const agent = value.toLowerCase();
      if (!current || current.disallow.length > 0 || current.allow.length > 0) {
        current = { agents: [agent], disallow: [], allow: [] };
        groups.push(current);
      } else {
        current.agents.push(agent);
      }
    } else if (key === "disallow" && current) {
      current.disallow.push(value);
    } else if (key === "allow" && current) {
      current.allow.push(value);
    }
  }
  return groups;
}

function pathMatches(path: string, rule: string): boolean {
  if (rule === "") return false;
  // Trailing * is common; treat as prefix.
  const prefix = rule.endsWith("*") ? rule.slice(0, -1) : rule;
  return path.startsWith(prefix);
}
