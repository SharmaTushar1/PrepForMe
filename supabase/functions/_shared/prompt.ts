import {
  CATEGORY_SPECS,
  type AtsReport,
  type RewritableLine,
} from "./schema.ts";

/**
 * The single instruction block that rides behind the PDF.
 *
 * The category list is generated from `CATEGORY_SPECS` so the prompt and the
 * schema cannot describe a category differently.
 *
 * Two constraints are load-bearing rather than stylistic, and both come from
 * what this product is: the review runs on a base resume with no job
 * description, so (a) parse fidelity is the headline and (b) any match
 * percentage would be fabricated. Keyword work against a real posting already
 * lives on each tracked application.
 */
export function buildAnalysisPrompt(): string {
  const categories = CATEGORY_SPECS.map(
    (spec, i) => `${i + 1}. \`${spec.id}\` — ${spec.label}. ${spec.brief}`,
  ).join("\n");

  return `The attached PDF is a candidate's base resume: the one document they keep current and tailor per role. Review it, and return both halves of the JSON object you have been given a schema for.

# What you are producing

- \`report\` — an applicant-tracking review the candidate reads to decide what to change this afternoon.
- \`parsed\` — the same resume as structured data, which the candidate will confirm field by field before any of it is written to their profile.

Both come from one reading of this file. Nothing else about this candidate is available to you, and nothing else should appear in your answer.

# The finding this review is built on

A resume is read by software before it is read by a person, and the software is worse at reading than you are. So **parsing fidelity is the headline**. If a parser reads the title "Senior Engineer, Platform" as the company, or loses the dates because they sit in a table cell, then nothing else about the document matters — the record in the recruiter's search index is already wrong. Lead with what the file actually yields, and treat writing quality as the layer above it.

Read the document twice before you write anything.

**First pass — be the parser.** Ignore how it looks. Walk the text in the order a naive extractor would take it, which is roughly top to bottom, left to right, and which is exactly where multi-column layouts fall apart. Note where the reading order interleaves two columns into nonsense, where a table collapses a row into a run-on line, where a text box or a graphic contributes no text at all, where contact details sit in a page header or footer that many parsers never read, and whether there is a text layer at all or this is a scan. Then write down, field by field, what the extractor ends up holding: name, email, phone, location, links, and every title / company / date triple. That reconstruction — including its errors — is what the \`parse\` category reports and what \`parsed\` records.

**Second pass — be the recruiter** who has six seconds and a stack of these. Judge whether the bullets say what this person achieved or only what they were assigned, whether the skills are findable, whether the length matches the seniority the resume claims for itself.

# There is no job description here, and no match score

This is a base resume, reviewed on its own. Do not produce, state, imply, or hedge towards:

- a percentage match, a "you would score N% against this role", or any number framed as passing or failing an applicant-tracking system;
- a list of keywords the resume is "missing", when nothing defines what it should be matching;
- a claim about how any named product — Workday, Greenhouse, Taleo, iCIMS — would treat this specific file.

Keyword matching against a real posting happens elsewhere in this product, per role, on each application the candidate is tracking, where an actual job description exists to match against. It is not your job here and a number invented in its place would be worse than no number. \`overallScore\` is a quality score for the document, not a match score against anything.

# The seven categories

\`categories\` is an array of exactly seven entries, one per id below, in this order. Score each 0–100, give each a one-sentence \`summary\`, and give each **between one and three findings** — the three that matter, not everything you noticed. Use the id verbatim; the report is keyed by it.

${categories}

# Evidence

Every finding that is about something written in the resume carries \`evidence\`: that text **copied verbatim**, character for character, including its typos and its odd capitalisation. The candidate uses it to find the line in their own file, so a paraphrase is useless and an approximation is worse than useless. Quote the smallest span that makes the point — a bullet, a heading, a date range — not a whole section.

Leave \`evidence\` as an empty string only when the finding is genuinely about the document rather than a line in it: two columns, an image-only scan, a missing section, a page count.

Never place text in \`evidence\` that does not appear in the PDF.

# Fixes

Every finding carries \`fix\`, including the ones at \`pass\` severity, where it says what the candidate is doing right so they do not undo it in the next edit.

A fix names something in **this** resume and says what to do to it. "Move your email and phone out of the page header and onto the first line of the body, under your name" is a fix. "Quantify your bullets" is not — it is advice, and the candidate already knows it. If a bullet is weak, propose the specific rewrite you would make to that bullet, using only facts already present in it: you may restructure and sharpen what is there, and you may point out that a number is missing, but you may never supply a number, a technology, a client, an employer, or an outcome the resume does not state.

# Scoring

Calibrate. Most real resumes are not in the nineties.

- **90–100** — nothing here would cost the candidate an interview.
- **75–89** — sound; a handful of specific improvements.
- **60–74** — works, but is measurably losing ground somewhere.
- **40–59** — a real defect: something important is being extracted wrong or read badly.
- **0–39** — broken for this purpose, e.g. an image-only scan, or a layout that renders the work history unreadable to a parser.

\`overallScore\` weights \`parse\` and \`format\` most heavily, because everything else is downstream of them. It is not an average.

# The layout classification

\`layout\` records how the document is **built**, which is a different question from how good it is, and it is judged on the page rather than on the writing:

- \`single_column_text\` — one column of real text under conventional headings. The shape a parser handles without incident.
- \`multi_column\` — two or more columns, or a sidebar. Reading order now depends on which parser opens it.
- \`graphical\` — template-driven: text boxes, tables holding layout, icons or bars carrying meaning, a designed header block. Common in Canva and Figma exports.
- \`scanned\` — images of text, with no text layer to extract.

A well-written two-column resume is still \`multi_column\`. A plain, badly written one is still \`single_column_text\`. Pick the one that describes the file, independently of every score you have given. This decides whether the candidate is offered a rebuild in a conventional layout, so a wrong answer either withholds a fix they need or offers to solve a problem they do not have.

\`topFixes\` promotes three to five findings, ranked by how much the candidate gains from doing them, so someone who stops after the first three has still done the most valuable work available to them. Each entry repeats its finding's \`title\` and \`fix\` verbatim and names the category it came from.

# The parse

\`parsed\` is what the candidate reviews and applies to their profile, and it is also **the only record of this resume's content that survives** — a rebuilt document is rendered from it, not from the file. So anything on the page with no home in \`parsed\` is content the candidate silently loses. Accuracy beats completeness on any individual field; completeness across sections is not optional.

- Copy bullets **exactly as written**. Do not tighten, reorder, merge, or improve them. Improvements belong in \`fix\`, where the candidate can accept them deliberately; the tailoring step later rewrites from these originals, so a silently rewritten bullet corrupts everything downstream.
- Dates become ISO \`YYYY-MM-DD\`. A month becomes its first day: "Mar 2021" is \`2021-03-01\`. A bare year becomes January the first. A current role has \`endDate: null\` — "Present" is not a date.
- Any field the resume does not state is \`null\`, or an empty array. Do not infer an email from a name, a location from an employer, or a title from a set of bullets. **A field you cannot find is not a gap in your work, it is the finding** — that is what the \`contact\` and \`parse\` categories exist to report.
- \`experiences\` is work history only, and **every bullet under every role belongs in it.** Do not select the strongest ones, do not stop at three, and do not summarise a role you judge less relevant: a bullet missing here is a bullet missing from the resume this parse rebuilds. If a role has seven bullets, return seven.
- Everything else under its own heading goes in \`sections\`, one entry per block, each tagged \`kind\`: \`education\` for a degree or school, \`certification\` for a certificate, licence or named course, \`project\` for everything else — including publications, awards and volunteering, which are tagged \`project\` rather than dropped. Each entry carries \`title\` (the qualification, project or certificate), \`organization\` (institution or issuing body, empty string if none is named), \`dateRange\` (**exactly as printed** — "Aug 2018 – May 2022", "Expected 2027" — not normalised, empty string if undated), and \`lines\` (the supporting lines verbatim).
- \`summary\` is the opening profile or objective paragraph, verbatim. Null if the resume opens straight into a section — an absent summary is a \`sections\` observation, not something to write for them.
- If the layout garbled something and you can tell what was meant, record your best reconstruction in \`parsed\` **and** raise a \`parse\` finding quoting the garbled text, so the candidate sees both what was recovered and that recovery was needed.

# Never

- Never invent a fact about this candidate, this document, or any company named in it — not even hedged, not even as an example.
- Never describe a section, a bullet, or a piece of contact information that is not in the file.
- Never pad a category with a finding you do not believe; one honest finding beats four filler ones.
- Never soften a critical finding into a warning to be encouraging. The candidate is using this to get hired.

Write in plain, direct British-neutral English, second person, no preamble and no closing pleasantries. Return only the JSON object the schema describes.`;
}

/**
 * The rewrite pass, run on the stored report rather than on the PDF.
 *
 * No document block: the review already established what the file looks like,
 * and rewriting a sentence is a text job. That keeps the input to a few thousand
 * tokens instead of a whole PDF, which is most of why a pass costs a fraction of
 * an analysis.
 *
 * The two constraints doing the real work here:
 *
 * - **Quote from the list, not from memory.** `original` is the key an accepted
 *   rewrite is matched back on, so a quotation that does not match a supplied
 *   line has nowhere to be applied and is discarded server-side.
 * - **A missing number stays missing.** The candidate has to defend every line
 *   of this in an interview, so a figure the resume never stated is left as a
 *   blank for them to fill, never guessed at. This is stated three times below
 *   on purpose — it is the one instruction whose violation would be invisible to
 *   the person reading the result and expensive to them later.
 */
export function buildImprovePrompt(
  report: AtsReport,
  lines: readonly RewritableLine[],
): string {
  const quoted = lines
    .map((line, i) => `${i + 1}. [${line.where}]\n"${line.text}"`)
    .join("\n\n");

  const findings = CATEGORY_SPECS.flatMap((spec) => {
    const category = report.categories[spec.id];
    return category.findings
      // A passing finding names what is already right, so there is nothing to
      // rewrite and asking for one invites damage to the strongest line.
      .filter((finding) => finding.severity !== "pass")
      .map((finding) => {
        const evidence = finding.evidence
          ? `\n   quoted: "${finding.evidence}"`
          : "\n   quoted: nothing — this finding is about the document, not a line";
        return `- \`${spec.id}\` · "${finding.title}" (${finding.severity})\n   ${finding.detail}\n   suggested fix: ${finding.fix}${evidence}`;
      });
  }).join("\n");

  return `A resume has already been reviewed. Below are the findings from that review and the exact lines of the candidate's own writing. Your job is to write the replacement lines, so the candidate can accept each one instead of rewriting it themselves.

# The lines you may rewrite

\`original\` must be one of these, copied character for character. Nothing else in the resume is available to you and nothing else may be rewritten.

${quoted || "(none — this resume has no rewritable prose)"}

# The findings

${findings || "(none)"}

# What to return

One entry for every finding a rewrite can fix.

**A finding whose suggested fix names a change to the words of a line always gets a rewrite.** The review has already decided that line is worth fixing; do not overrule it because the change looks small from here. "Replace *Contributed* with a verb that names what you built" is a rewrite worth writing, not a triviality — the opening verb is most of what a reader takes from a bullet.

Write nothing for a finding that rewording cannot fix: a two-column layout, a page count, a missing phone number, a heading that needs renaming in the file itself, contact details stranded in a page header. Those are changes to the document, not to a sentence, and a rewrite offered for one would be a rewrite the candidate cannot use.

So an empty array is a valid answer when every finding is about the document — but do not ration rewrites when they are about the writing. Two findings naming two weak bullets should return two entries.

# How to rewrite a line

Lead with what the candidate did, in a verb that names the actual work — built, shipped, cut, migrated, automated, negotiated — not "responsible for", "worked on", "helped with", "involved in". Then say what changed as a result. Keep it to one sentence, and keep it roughly the length it already is: a bullet that grows by half fills a page the candidate needs for something else.

Everything in the new line must be traceable to the old one. You may restructure it, cut filler, sharpen the verb, and move the outcome to the end. You may not add a number, a percentage, a duration, a team size, a technology, a client, an employer, a title, or a result that the original line did not contain.

# When the line needs a number it does not have

Most weak bullets are weak because they state a duty and no outcome, and the outcome is a number only the candidate knows. **Do not supply that number. Do not estimate it. Do not illustrate it with a plausible one.** A fabricated figure on a resume is a fabrication the candidate has to defend in an interview, and it is the single worst thing this pass could do to them.

Instead, write the strengthened line with \`___\` exactly where the figure belongs, set \`leftBlank\` to true, and use \`note\` to say precisely what to fill in.

- Original: "Responsible for the payments service and its on-call rotation."
- Suggested: "Owned the payments service and its on-call rotation, cutting time to recover from ___ to ___."
- Note: "Fill in your before-and-after recovery time, or swap in incident count if that is the number you have."

A rewrite may contain more than one blank. A rewrite that contains no blank must contain no figure that was not already in the original.

# Never

- Never quote an \`original\` that is not in the numbered list above, even if you remember a better line from the findings.
- Never return an \`original\` and a \`suggested\` that say the same thing.
- Never rewrite a title, an employer, a date, a skill, or a piece of contact information.
- Never write a rewrite in the first person, and never add a closing flourish about impact or passion.

Write in plain, direct English. Return only the JSON object the schema describes.`;
}
