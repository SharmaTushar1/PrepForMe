import { useState, type ReactNode } from "react";
import { css } from "../../css";
import { ACCENT } from "../../data";
import { dateRange } from "../../lib/format";
import type {
  ParsedResume,
  ParsedResumeEntry,
  ParsedResumeExperience,
} from "../../lib/ai";
import { useExperiences, useProfile, useSkills } from "../../data/profile";
import { useApplyParsedResume, type ApplyMode, type ApplyParsedResumeResult } from "../../data/resumes";
import { EmptyState, ErrorNote, Eyebrow, Loading, PrimaryButton } from "../ui";

/**
 * The gate between a parse and the profile. Everything is opt-out rather than
 * opt-in — the parse is usually right — but nothing crosses until the button
 * is pressed, and roles the user typed themselves are never removed unless
 * they ask for that in as many words.
 */
export function ParsedResumeReview({
  parsed,
  sample,
  onApplied,
  footer,
}: {
  parsed: ParsedResume;
  /** True when this came from the local fixture rather than the user's file. */
  sample?: boolean;
  onApplied?: (result: ApplyParsedResumeResult) => void;
  footer?: ReactNode;
}) {
  const profile = useProfile();
  const experiences = useExperiences();
  const skills = useSkills();
  const apply = useApplyParsedResume();

  const [offRoles, setOffRoles] = useState<Set<number>>(new Set());
  const [offBullets, setOffBullets] = useState<Set<string>>(new Set());
  const [skillOverride, setSkillOverride] = useState<Record<string, boolean>>({});
  const [identityOverride, setIdentityOverride] = useState<Record<"fullName" | "headline", boolean>>(
    {} as Record<"fullName" | "headline", boolean>,
  );
  const [mode, setMode] = useState<ApplyMode>("add");

  const loading = profile.isLoading || experiences.isLoading || skills.isLoading;
  if (loading) return <Loading label="Checking what's already on your profile…" />;

  const existingRoles = experiences.data ?? [];
  const existingSkills = new Set((skills.data ?? []).map((s) => s.name.trim().toLowerCase()));
  const roleKey = (title: string, company: string) =>
    `${title.trim().toLowerCase()}|${company.trim().toLowerCase()}`;
  const existingRoleKeys = new Set(existingRoles.map((e) => roleKey(e.title, e.company)));

  // An identity field is ticked by default only where the profile is blank, so
  // something typed by hand is never overwritten without being asked for.
  const identityChecked = (field: "fullName" | "headline") =>
    identityOverride[field] ?? !profile.data?.[field];
  const skillChecked = (name: string) =>
    skillOverride[name] ?? !existingSkills.has(name.trim().toLowerCase());

  const chosenRoles: ParsedResumeExperience[] = parsed.experiences
    .map((role, i) => ({ role, i }))
    .filter(({ i }) => !offRoles.has(i))
    .map(({ role, i }) => ({
      ...role,
      bullets: role.bullets.filter((_, j) => !offBullets.has(`${i}:${j}`)),
    }));
  const chosenSkills = parsed.skills.filter(skillChecked);
  const chosenName = identityChecked("fullName") ? parsed.fullName : null;
  const chosenHeadline = identityChecked("headline") ? parsed.headline : null;

  const nothingParsed =
    !parsed.experiences.length &&
    !parsed.skills.length &&
    !parsed.fullName &&
    !parsed.headline &&
    !parsed.education.length &&
    !parsed.projects.length &&
    !parsed.certifications.length &&
    !parsed.summary &&
    !parsed.location &&
    !parsed.links.length &&
    !parsed.email &&
    !parsed.phone;
  const nothingChosen =
    !chosenRoles.length &&
    !chosenSkills.length &&
    !chosenName &&
    !chosenHeadline &&
    !parsed.education.length &&
    !parsed.projects.length &&
    !parsed.certifications.length &&
    !parsed.summary &&
    !parsed.location &&
    !parsed.links.length &&
    !parsed.email &&
    !parsed.phone;

  const duplicates = parsed.experiences.filter(
    (role, i) => !offRoles.has(i) && existingRoleKeys.has(roleKey(role.title, role.company)),
  );

  function toggleRole(i: number, on: boolean) {
    setOffRoles((prev) => {
      const next = new Set(prev);
      if (on) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  function toggleBullet(key: string, on: boolean) {
    setOffBullets((prev) => {
      const next = new Set(prev);
      if (on) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function submit() {
    const result = await apply.mutateAsync({
      mode,
      fullName: chosenName,
      headline: chosenHeadline,
      email: parsed.email,
      phone: parsed.phone,
      location: parsed.location,
      summary: parsed.summary,
      links: parsed.links,
      experiences: chosenRoles,
      education: parsed.education,
      projects: parsed.projects,
      certifications: parsed.certifications,
      skills: chosenSkills,
    });
    onApplied?.(result);
  }

  if (nothingParsed) {
    return (
      <EmptyState
        title="Nothing came back from the parse"
        body="No roles, skills or name could be read out of that file. That's a finding in itself — the parse category of the report says what got in the way. Adding a role by hand always works."
        action={footer}
      />
    );
  }

  if (apply.isSuccess && apply.data) {
    return <AppliedSummary result={apply.data} footer={footer} />;
  }

  return (
    <div style={css("display:flex; flex-direction:column; gap:20px;")}>
      {sample && (
        <div style={css("border:1px solid oklch(0.65 0.14 60 / 0.45); background:oklch(0.7 0.15 60 / 0.12); border-radius:12px; padding:14px 16px; font-size:13px; line-height:1.6; color:oklch(0.4 0.1 55);")}>
          <strong>This is sample data, not your resume.</strong> No model read your file, so the
          roles and skills below belong to a fixture. Applying them puts someone else's job history
          on your profile.
        </div>
      )}

      <div>
        <h2 style={css("font-family:'Space Grotesk'; font-size:19px; font-weight:600; margin:0 0 6px;")}>
          What we read off your file
        </h2>
        <p style={css("font-size:13.5px; color:oklch(0.45 0.015 260); line-height:1.6; margin:0; max-width:620px;")}>
          None of this is on your profile yet. Untick anything that came back wrong or that you'd
          rather not carry over — you can edit all of it afterwards.
        </p>
      </div>

      {apply.isError && <ErrorNote error={apply.error} />}

      {(parsed.fullName || parsed.headline) && (
        <section>
          <Eyebrow style={{ marginBottom: "10px" }}>You</Eyebrow>
          <div style={css("border:1px solid oklch(0.9 0.006 260); border-radius:13px; background:#fff; padding:16px; display:flex; flex-direction:column; gap:11px;")}>
            {parsed.fullName && (
              <IdentityRow
                label="Name"
                value={parsed.fullName}
                current={profile.data?.fullName ?? null}
                checked={identityChecked("fullName")}
                onChange={(on) => setIdentityOverride((prev) => ({ ...prev, fullName: on }))}
              />
            )}
            {parsed.headline && (
              <IdentityRow
                label="Headline"
                value={parsed.headline}
                current={profile.data?.headline ?? null}
                checked={identityChecked("headline")}
                onChange={(on) => setIdentityOverride((prev) => ({ ...prev, headline: on }))}
              />
            )}
          </div>
        </section>
      )}

      {parsed.experiences.length > 0 && (
        <section>
          <Eyebrow style={{ marginBottom: "10px" }}>
            Roles · {chosenRoles.length} of {parsed.experiences.length} selected
          </Eyebrow>

          {existingRoles.length > 0 && (
            <ModeChoice
              mode={mode}
              onChange={setMode}
              existingCount={existingRoles.length}
              duplicateCount={duplicates.length}
            />
          )}

          <div style={css("display:flex; flex-direction:column; gap:12px;")}>
            {parsed.experiences.map((role, i) => (
              <RoleCard
                key={`${role.company}-${role.title}-${i}`}
                role={role}
                checked={!offRoles.has(i)}
                duplicate={existingRoleKeys.has(roleKey(role.title, role.company))}
                bulletChecked={(j) => !offBullets.has(`${i}:${j}`)}
                onToggle={(on) => toggleRole(i, on)}
                onToggleBullet={(j, on) => toggleBullet(`${i}:${j}`, on)}
              />
            ))}
          </div>
        </section>
      )}

      {parsed.skills.length > 0 && (
        <section>
          <Eyebrow style={{ marginBottom: "10px" }}>
            Skills · {chosenSkills.length} of {parsed.skills.length} selected
          </Eyebrow>
          <div style={css("border:1px solid oklch(0.9 0.006 260); border-radius:13px; background:#fff; padding:16px; display:flex; gap:8px; flex-wrap:wrap;")}>
            {parsed.skills.map((skill) => {
              const already = existingSkills.has(skill.trim().toLowerCase());
              return (
                <label
                  key={skill}
                  style={{
                    ...css("display:inline-flex; align-items:center; gap:8px; font-size:12.5px; padding:6px 12px; border-radius:100px; cursor:pointer;"),
                    background: skillChecked(skill)
                      ? "oklch(0.55 0.15 255 / 0.1)"
                      : "oklch(0.97 0.004 260)",
                    color: skillChecked(skill) ? "oklch(0.35 0.11 255)" : "oklch(0.55 0.015 260)",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={skillChecked(skill)}
                    onChange={(e) =>
                      setSkillOverride((prev) => ({ ...prev, [skill]: e.target.checked }))
                    }
                    style={{ accentColor: ACCENT, width: "14px", height: "14px", cursor: "pointer" }}
                  />
                  {skill}
                  {already && (
                    <span style={css("font-family:'IBM Plex Mono'; font-size:10px; color:oklch(0.55 0.015 260);")}>
                      already yours
                    </span>
                  )}
                </label>
              );
            })}
          </div>
        </section>
      )}

      <SpineExtras parsed={parsed} />

      <div style={css("display:flex; align-items:center; gap:12px; flex-wrap:wrap;")}>
        <PrimaryButton onClick={submit} disabled={nothingChosen || apply.isPending}>
          {apply.isPending
            ? "Writing to your profile…"
            : mode === "replace"
              ? `Replace my ${existingRoles.length} role${existingRoles.length === 1 ? "" : "s"} with these`
              : "Add these to my profile"}
        </PrimaryButton>
        {footer}
      </div>
    </div>
  );
}

function IdentityRow({
  label,
  value,
  current,
  checked,
  onChange,
}: {
  label: string;
  value: string;
  current: string | null;
  checked: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <label style={css("display:flex; align-items:flex-start; gap:11px; cursor:pointer;")}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ accentColor: ACCENT, width: "15px", height: "15px", marginTop: "3px", cursor: "pointer", flex: "0 0 auto" }}
      />
      <span style={css("min-width:0;")}>
        <span style={css("font-family:'IBM Plex Mono'; font-size:10.5px; letter-spacing:0.08em; text-transform:uppercase; color:oklch(0.55 0.015 260); display:block; margin-bottom:2px;")}>
          {label}
        </span>
        <span style={css("font-size:13.5px;")}>{value}</span>
        {current && current.trim() !== value.trim() && (
          <span style={css("display:block; font-size:12px; color:oklch(0.45 0.1 40); line-height:1.5; margin-top:3px;")}>
            Your profile currently says “{current}” — ticking this replaces it.
          </span>
        )}
      </span>
    </label>
  );
}

function ModeChoice({
  mode,
  onChange,
  existingCount,
  duplicateCount,
}: {
  mode: ApplyMode;
  onChange: (mode: ApplyMode) => void;
  existingCount: number;
  duplicateCount: number;
}) {
  return (
    <div style={css("border:1px solid oklch(0.65 0.14 60 / 0.35); background:oklch(0.7 0.15 60 / 0.07); border-radius:12px; padding:14px 16px; margin-bottom:14px;")}>
      <div style={css("font-size:13px; line-height:1.6; color:oklch(0.4 0.1 55); margin-bottom:12px;")}>
        {duplicateCount > 0 ? (
          <>
            <strong>
              {duplicateCount} of these {duplicateCount === 1 ? "is" : "are"} already on your profile.
            </strong>{" "}
            Adding will list {duplicateCount === 1 ? "it" : "them"} twice.
          </>
        ) : (
          <>
            <strong>
              You already have {existingCount} role{existingCount === 1 ? "" : "s"} on your profile.
            </strong>{" "}
            These get added alongside them.
          </>
        )}
      </div>

      <div style={css("display:flex; flex-direction:column; gap:9px;")}>
        <ModeOption
          mode="add"
          current={mode}
          onChange={onChange}
          title="Add these, keep what's there"
          detail="Nothing is deleted. Untick any role above that would be a duplicate."
        />
        <ModeOption
          mode="replace"
          current={mode}
          onChange={onChange}
          title={`Replace my existing ${existingCount} role${existingCount === 1 ? "" : "s"}`}
          detail="Deletes those roles and every bullet on them first. This can't be undone."
        />
      </div>
    </div>
  );
}

function ModeOption({
  mode,
  current,
  onChange,
  title,
  detail,
}: {
  mode: ApplyMode;
  current: ApplyMode;
  onChange: (mode: ApplyMode) => void;
  title: string;
  detail: string;
}) {
  const selected = current === mode;
  return (
    <label
      style={{
        ...css("display:flex; align-items:flex-start; gap:10px; cursor:pointer; border-radius:10px; padding:10px 12px; background:#fff;"),
        border: `1px solid ${selected ? "oklch(0.55 0.15 255 / 0.5)" : "oklch(0.92 0.006 260)"}`,
      }}
    >
      <input
        type="radio"
        name="apply-mode"
        checked={selected}
        onChange={() => onChange(mode)}
        style={{ accentColor: ACCENT, width: "15px", height: "15px", marginTop: "2px", cursor: "pointer", flex: "0 0 auto" }}
      />
      <span>
        <span style={css("display:block; font-size:13px; font-weight:600;")}>{title}</span>
        <span style={css("display:block; font-size:12.5px; color:oklch(0.5 0.015 260); line-height:1.55; margin-top:2px;")}>
          {detail}
        </span>
      </span>
    </label>
  );
}

function RoleCard({
  role,
  checked,
  duplicate,
  bulletChecked,
  onToggle,
  onToggleBullet,
}: {
  role: ParsedResumeExperience;
  checked: boolean;
  duplicate: boolean;
  bulletChecked: (index: number) => boolean;
  onToggle: (on: boolean) => void;
  onToggleBullet: (index: number, on: boolean) => void;
}) {
  const range = dateRange(role.startDate, role.endDate);
  return (
    <div
      style={{
        ...css("border-radius:13px; background:#fff; padding:16px;"),
        border: `1px solid ${checked ? "oklch(0.9 0.006 260)" : "oklch(0.94 0.006 260)"}`,
        opacity: checked ? 1 : 0.55,
      }}
    >
      <label style={css("display:flex; align-items:flex-start; gap:11px; cursor:pointer;")}>
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onToggle(e.target.checked)}
          style={{ accentColor: ACCENT, width: "15px", height: "15px", marginTop: "3px", cursor: "pointer", flex: "0 0 auto" }}
        />
        <span style={css("min-width:0;")}>
          <span style={css("display:flex; align-items:center; gap:9px; flex-wrap:wrap;")}>
            <span style={css("font-family:'Space Grotesk'; font-size:15.5px; font-weight:600;")}>
              {role.title}
            </span>
            {duplicate && (
              <span style={css("font-family:'IBM Plex Mono'; font-size:10px; letter-spacing:0.06em; text-transform:uppercase; color:oklch(0.45 0.1 40); background:oklch(0.7 0.15 60 / 0.12); padding:3px 8px; border-radius:100px;")}>
                already on your profile
              </span>
            )}
          </span>
          <span style={css("display:block; font-size:13px; color:oklch(0.45 0.015 260); margin-top:2px;")}>
            {role.company}
            {range ? ` · ${range}` : " · dates weren't readable"}
          </span>
        </span>
      </label>

      {role.bullets.length > 0 && (
        <div style={css("display:flex; flex-direction:column; gap:7px; margin-top:12px; padding-left:26px;")}>
          {role.bullets.map((bullet, j) => (
            <label
              key={j}
              style={{
                ...css("display:flex; align-items:flex-start; gap:10px; font-size:13px; line-height:1.55; background:oklch(0.99 0.003 260); border:1px solid oklch(0.94 0.006 260); border-radius:9px; padding:10px 12px;"),
                cursor: checked ? "pointer" : "not-allowed",
                opacity: bulletChecked(j) ? 1 : 0.55,
              }}
            >
              <input
                type="checkbox"
                checked={bulletChecked(j)}
                disabled={!checked}
                onChange={(e) => onToggleBullet(j, e.target.checked)}
                style={{ accentColor: ACCENT, width: "14px", height: "14px", marginTop: "2px", cursor: "inherit", flex: "0 0 auto" }}
              />
              <span>{bullet}</span>
            </label>
          ))}
        </div>
      )}

      {role.bullets.length === 0 && (
        <div style={css("font-size:12.5px; color:oklch(0.55 0.015 260); line-height:1.55; margin-top:10px; padding-left:26px;")}>
          No bullets were read for this role — you can add them on your profile.
        </div>
      )}
    </div>
  );
}

/**
 * Contact, summary, education, projects and certifications now land on the
 * profile spine on confirm. Shown here so the user can see what will be stored
 * — unticking is reserved for roles/skills where conflicts are common.
 */
function SpineExtras({ parsed }: { parsed: ParsedResume }) {
  const contact: string[] = [];
  if (parsed.email) contact.push(parsed.email);
  if (parsed.phone) contact.push(parsed.phone);
  if (parsed.location) contact.push(parsed.location);
  for (const link of parsed.links) contact.push(`${link.label}: ${link.url}`);

  const sections: { label: string; entries: ParsedResumeEntry[] }[] = [
    { label: "Education", entries: parsed.education },
    { label: "Projects", entries: parsed.projects },
    { label: "Certifications", entries: parsed.certifications },
  ].filter((section) => section.entries.length > 0);

  if (!contact.length && !sections.length && !parsed.summary) return null;

  return (
    <div style={css("border:1px solid oklch(0.9 0.006 260); border-radius:12px; padding:16px 18px; background:#fff;")}>
      <div style={css("font-size:12.5px; font-weight:600; margin-bottom:4px;")}>
        Also going on your profile
      </div>
      <div style={css("font-size:12px; color:oklch(0.55 0.015 260); line-height:1.55; margin-bottom:14px;")}>
        Contact details, summary, education, projects and certifications are
        stored with your roles and skills so Generate and Tailor can use them.
      </div>

      {parsed.summary && (
        <UnstoredBlock label="Summary">
          <div style={css("font-size:12.5px; color:oklch(0.4 0.015 260); line-height:1.65;")}>
            {parsed.summary}
          </div>
        </UnstoredBlock>
      )}

      {contact.length > 0 && (
        <UnstoredBlock label="Contact and links">
          <div style={css("font-size:12.5px; color:oklch(0.4 0.015 260); line-height:1.7;")}>
            {contact.join(" · ")}
          </div>
        </UnstoredBlock>
      )}

      {sections.map((section) => (
        <UnstoredBlock key={section.label} label={section.label}>
          <div style={css("display:flex; flex-direction:column; gap:8px;")}>
            {section.entries.map((entry, i) => (
              <div key={`${entry.title}-${i}`}>
                <div style={css("font-size:12.5px; color:oklch(0.3 0.015 260); line-height:1.5;")}>
                  {entry.title}
                  {entry.organization && (
                    <span style={css("color:oklch(0.5 0.015 260);")}> · {entry.organization}</span>
                  )}
                  {entry.dateRange && (
                    <span style={css("font-family:'IBM Plex Mono'; font-size:11px; color:oklch(0.55 0.015 260);")}>
                      {" "}
                      {entry.dateRange}
                    </span>
                  )}
                </div>
                {entry.lines.map((line, j) => (
                  <div
                    key={j}
                    style={css("font-size:12px; color:oklch(0.5 0.015 260); line-height:1.6; padding-left:11px;")}
                  >
                    {line}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </UnstoredBlock>
      ))}
    </div>
  );
}

function UnstoredBlock({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={css("margin-bottom:13px;")}>
      <div style={css("font-family:'IBM Plex Mono'; font-size:10px; letter-spacing:0.08em; text-transform:uppercase; color:oklch(0.55 0.015 260); margin-bottom:4px;")}>
        {label}
      </div>
      {children}
    </div>
  );
}

function AppliedSummary({
  result,
  footer,
}: {
  result: ApplyParsedResumeResult;
  footer?: ReactNode;
}) {
  const parts = [
    `${result.rolesAdded} role${result.rolesAdded === 1 ? "" : "s"}`,
    `${result.bulletsAdded} bullet${result.bulletsAdded === 1 ? "" : "s"}`,
    `${result.skillsAdded} skill${result.skillsAdded === 1 ? "" : "s"}`,
  ];
  if (result.educationAdded) {
    parts.push(
      `${result.educationAdded} education entr${result.educationAdded === 1 ? "y" : "ies"}`,
    );
  }
  if (result.projectsAdded) {
    parts.push(
      `${result.projectsAdded} project${result.projectsAdded === 1 ? "" : "s"}`,
    );
  }
  if (result.certificationsAdded) {
    parts.push(
      `${result.certificationsAdded} certification${result.certificationsAdded === 1 ? "" : "s"}`,
    );
  }

  return (
    <div style={css("border:1px solid oklch(0.55 0.13 145 / 0.3); background:oklch(0.55 0.13 145 / 0.05); border-radius:13px; padding:20px;")}>
      <div style={css("font-family:'Space Grotesk'; font-size:16px; font-weight:600; margin-bottom:5px;")}>
        On your profile now
      </div>
      <p style={css("font-size:13px; line-height:1.65; color:oklch(0.35 0.05 150); margin:0;")}>
        Added {parts.join(", ")}.
        {result.rolesRemoved > 0 &&
          ` Replaced ${result.rolesRemoved} role${result.rolesRemoved === 1 ? "" : "s"} you had before.`}
        {result.skillsAlreadyThere > 0 &&
          ` ${result.skillsAlreadyThere} skill${result.skillsAlreadyThere === 1 ? " was" : "s were"} already there and left alone.`}
      </p>
      {footer && <div style={css("margin-top:16px; display:flex; gap:10px; flex-wrap:wrap;")}>{footer}</div>}
    </div>
  );
}
