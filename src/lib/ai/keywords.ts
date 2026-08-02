/**
 * Keyword extraction for the ATS gap view. This is deliberately mechanical
 * rather than model-driven: the claim "this word is in the job description and
 * not in your resume" should be verifiable by reading both documents.
 */

const STOPWORDS = new Set([
  "a", "about", "above", "across", "after", "all", "also", "an", "and", "any",
  "are", "as", "at", "be", "been", "being", "both", "but", "by", "can", "could",
  "do", "does", "doing", "each", "either", "else", "etc", "every", "for", "from",
  "had", "has", "have", "he", "her", "here", "his", "how", "i", "if", "in", "into",
  "is", "it", "its", "just", "like", "may", "me", "might", "more", "most", "must",
  "my", "no", "not", "of", "on", "one", "only", "or", "other", "our", "out", "over",
  "own", "per", "plus", "same", "she", "should", "so", "some", "such", "than",
  "that", "the", "their", "them", "then", "there", "these", "they", "this",
  "those", "through", "to", "too", "under", "up", "us", "use", "using", "very",
  "was", "we", "were", "what", "when", "where", "which", "while", "who", "why",
  "will", "with", "within", "would", "you", "your", "yours",
  // Job-post boilerplate that says nothing about the work.
  "ability", "able", "across", "applicants", "apply", "background", "benefits",
  "candidate", "candidates", "career", "close", "company", "culture", "day",
  "deep", "different", "diverse", "employer", "equal", "excellent", "experience",
  "experienced", "familiar", "great", "growth", "help", "hiring", "impact",
  "including", "job", "join", "know", "latest", "level", "look", "looking",
  "love", "make", "new", "nice", "opportunity", "people", "position",
  "preferred", "product", "qualifications", "requirements", "role", "salary",
  "senior", "skills", "strong", "team", "teams", "technologies", "things",
  "think", "time", "understanding", "want", "work", "working", "years",
]);

/**
 * Multi-word terms worth treating as one keyword. Single-token extraction
 * would split these into words that mean nothing on their own.
 */
const PHRASES = [
  "distributed systems", "system design", "systems design", "machine learning",
  "data pipelines", "data modeling", "event driven", "event-driven",
  "microservices", "payments infrastructure", "payments infra", "payment systems",
  "fraud detection", "risk systems", "ledger", "double entry",
  "on-call", "on call", "incident response", "observability", "reliability",
  "site reliability", "fault tolerance", "fault-tolerant", "high availability",
  "load balancing", "rate limiting", "caching", "message queues",
  "infrastructure as code", "continuous integration", "continuous delivery",
  "code review", "technical leadership", "cross-functional", "mentorship",
  "design systems", "accessibility", "performance optimization",
  "api design", "graphql", "grpc", "rest apis", "websockets",
  "kubernetes", "docker", "terraform", "postgres", "postgresql", "mysql",
  "redis", "kafka", "spark", "snowflake", "airflow", "dbt",
  "typescript", "javascript", "python", "golang", "rust", "java", "kotlin",
  "swift", "ruby", "scala", "elixir", "react", "next.js", "node.js",
  "aws", "gcp", "azure", "prometheus", "grafana", "datadog",
];

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9+#./\- ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Keywords from a job description, most frequent first. */
export function extractKeywords(jobDescription: string, limit = 14): string[] {
  const text = normalize(jobDescription);
  if (!text) return [];

  const found = new Map<string, number>();

  for (const phrase of PHRASES) {
    const count = occurrences(text, phrase);
    if (count > 0) found.set(phrase, count * 3); // phrases beat loose words
  }

  // Anything already covered by a matched phrase shouldn't also appear alone.
  const claimed = new Set(
    [...found.keys()].flatMap((p) => p.split(/[\s-]+/)),
  );

  for (const token of text.split(" ")) {
    const word = token.replace(/^[-.]+|[-.]+$/g, "");
    if (word.length < 3 || word.length > 24) continue;
    if (STOPWORDS.has(word) || claimed.has(word)) continue;
    if (/^\d+$/.test(word)) continue;
    found.set(word, (found.get(word) ?? 0) + 1);
  }

  return [...found.entries()]
    .filter(([, score]) => score > 1)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([term]) => term);
}

function occurrences(haystack: string, needle: string): number {
  let count = 0;
  let from = 0;
  for (;;) {
    const at = haystack.indexOf(needle, from);
    if (at === -1) return count;
    count++;
    from = at + needle.length;
  }
}

/** Whether a keyword is genuinely present in the user's own material. */
export function covers(resumeText: string, keyword: string): boolean {
  return normalize(resumeText).includes(normalize(keyword));
}

/** Title-case a keyword only when it looks like an acronym or proper noun. */
export function displayKeyword(keyword: string): string {
  if (keyword.length <= 4 && !keyword.includes(" ")) return keyword.toUpperCase();
  return keyword;
}
