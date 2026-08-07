# Resume tailoring: fix the data gap, then add relevance weighting

Context: comparing a tailored output against the source resume for a real JD
(Figma, Software Engineer AI Platforms) surfaced two separate problems. Only
the second one is about prompting — the first is a missing data path that no
prompt change can fix.

## 1. Root cause — the spine never carries this data (fix first)

`supabase/functions/tailor-resume/index.ts`, `loadSpine()`:

```ts
location: null as string | null,
links: [] as { label: string; url: string }[],
education: [] as {...}[],
projects: [] as {...}[],
certifications: [] as {...}[],
```

These are hardcoded, not queried. And `db.types.ts` backs that up — `profiles`
has no `phone`/`location`/`links` columns, and there are no `education`,
`projects`, or `certifications` tables. Only `experiences` /
`experience_bullets` / `skills` exist as the persisted spine.

Consequence: every tailored resume is missing phone, LinkedIn, GitHub,
education, projects, and achievements — not because the model chose to drop
them for space, but because they never reached the model at all. The
`analyze-resume` prompt (`_shared/prompt.ts`) already extracts these into
`parsed.sections` (kind: `education` / `certification` / `project`) during
onboarding — so the extraction exists, it just doesn't persist anywhere
`tailor-resume` can read it back from.

**Fix, in order:**

1. Migration: add `phone text`, `location text`, `links jsonb` to `profiles`.
2. Migration: add `education`, `projects`, `certifications` tables, same
   shape as `experiences` (`id`, `user_id`, `title`, `organization`,
   `date_range` or `start_date`/`end_date`, `sort_order`) plus a `lines`
   child table or `text[]` column mirroring `experience_bullets`.
3. Wire the onboarding confirm step (`ParsedResumeReview.tsx`) to write
   `parsed.sections` into these new tables instead of discarding them after
   profile creation — check whether this already happens and only the read
   side (`loadSpine`) is missing, or whether onboarding drops them too.
4. Update `loadSpine()` in `tailor-resume/index.ts` to query all of the
   above instead of hardcoding null/empty.

Until this lands, section 2 below has nothing to weigh — a prompt can't
prioritize content it was never given.

## 2. Once the data exists — weighting logic for `TAILOR_SYSTEM`

Current `TAILOR_SYSTEM` (same file) only says: don't invent employers/dates,
you may reword bullets, cap missingSkills at 5, keep every spine
employer/title/date exactly. It says nothing about what to keep, shrink, or
cut when the tailored resume has more candidate content than a page can
hold. That's the actual "weighing" question. Add:

**A. A floor that's never cut, regardless of relevance:**
Name, email, phone, links, location, every employer/title/date row itself
(bullets under a role can be trimmed, the role entry cannot disappear), and
at least a one-line education entry. These aren't JD-relevance decisions —
they're baseline resume completeness.

**B. Relevance scoring happens per item, never per section.**
Never let the model decide "drop Projects" or "drop Achievements" as a
category. Score each individual unit — each bullet, each project block,
each achievement line, each skill chip — against the JD's stated
requirements (split JDs into "must-have" and "nice-to-have" language, most
postings signal this explicitly, e.g. Figma's "We'd love to hear from you
if you have" vs "While not required, it's an added plus"). A project that
is the single best evidence for a "must-have" line must outrank a bullet
under a job that only weakly relates — even though "projects" as a section
is usually optional and "experience" isn't. Section identity is not a proxy
for relevance.

**C. Order of what gets trimmed first when space is tight:**
1. Summary/headline paragraph — shrink to 1–2 lines or cut entirely before
   cutting anything else. It's the least evidentiary part of the page.
2. Bullets under experience that don't map to any JD line and aren't the
   strongest 1–2 proof points of seniority/scope for that role.
3. Skills that don't appear in the JD and aren't foundational (e.g. don't
   cut "Python" for a Python-heavy JD to make room for a keyword that
   appeared once).
4. Only after 1–3: consider trimming a project or achievement, and only the
   least JD-relevant one — never all of them, and never before checking
   whether a project is actually the strongest evidence available for a
   must-have line (in which case it should be promoted, not cut).

**D. Every cut needs a stated reason, not just every rewrite.**
The schema's `changes` array already captures `before`/`after`/`rationale`
for rewrites — extend the same idea to omissions. If a project or
achievement is cut, log it the same way ("before": the item, "after":
"(omitted)", "rationale": tied to a specific JD line or absence of one).
This is the same "show what changed and why" principle already in the
project's own design doc — apply it to subtraction, not just rewording.

**E. Never let a confirmed skill-gap answer (the elicitation flow) crowd out
existing real content.** A user-confirmed brief (e.g. "yes, platform scaling
work at C3") should be attached under the best-matching existing role per
the current `ENRICH_SYSTEM` behavior — it should not, on its own, justify
cutting a project or achievement that's unrelated to that specific brief.
Gap-fills add; they shouldn't be the reason something true and relevant gets
removed.

## Suggested TAILOR_SYSTEM addition (draft)

```
Weighting, when the tailored resume would otherwise exceed one page:
- Never drop: name, contact info (email, phone, links, location), any
  employer/title/date row, or the education section entirely.
- Score every bullet, project, achievement, and skill against the JD's
  stated must-haves and nice-to-haves individually — never decide by
  section. A project that is strong evidence for a must-have outranks a
  weak bullet under a job, even though "projects" is usually optional and
  "experience" isn't.
- Trim in this order before cutting anything else: (1) summary/headline,
  (2) JD-irrelevant bullets under experience, (3) JD-irrelevant skill
  chips. Only then consider cutting the single least-relevant project or
  achievement — never all of them, and never one that's the strongest
  available evidence for a stated requirement.
- Every omission gets a rationale in `changes`, same as every rewrite.
```
