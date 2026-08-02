import { useEffect, useState } from "react";
import { css } from "../css";
import { dateRange } from "../lib/format";
import type { Experience, ExperienceBullet } from "../types";
import {
  profileGaps,
  useAddSkill,
  useCreateBullet,
  useCreateExperience,
  useDeleteBullet,
  useDeleteExperience,
  useDeleteSkill,
  useExperiences,
  useMoveBullet,
  useProfile,
  useSkills,
  useUpdateBullet,
  useUpdateExperience,
  useUpdateProfile,
} from "../data/profile";
import {
  EmptyState,
  Eyebrow,
  FieldLabel,
  Loading,
  PrimaryButton,
  TextInput,
  Toggle,
} from "./ui";

export function Profile() {
  const profile = useProfile();
  const experiences = useExperiences();
  const skills = useSkills();
  const updateProfile = useUpdateProfile();
  const createExperience = useCreateExperience();
  const addSkill = useAddSkill();
  const deleteSkill = useDeleteSkill();

  const [skillDraft, setSkillDraft] = useState("");
  const [addingRole, setAddingRole] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newCompany, setNewCompany] = useState("");
  const [newStart, setNewStart] = useState("");
  const [newEnd, setNewEnd] = useState("");

  const gaps = profileGaps(profile.data, experiences.data ?? [], skills.data ?? []);
  const loading = profile.isLoading || experiences.isLoading || skills.isLoading;
  const saving =
    updateProfile.isPending ||
    createExperience.isPending ||
    addSkill.isPending ||
    deleteSkill.isPending;

  async function submitRole() {
    if (!newTitle.trim() || !newCompany.trim()) return;
    await createExperience.mutateAsync({
      title: newTitle,
      company: newCompany,
      startDate: newStart || null,
      endDate: newEnd || null,
    });
    setNewTitle("");
    setNewCompany("");
    setNewStart("");
    setNewEnd("");
    setAddingRole(false);
  }

  if (loading) return <Loading label="Loading your profile…" />;

  return (
    <div style={css("padding:30px 40px 60px; max-width:900px; width:100%; animation:fadeIn .3s ease both;")}>
      <div style={css("display:flex; align-items:center; justify-content:space-between; gap:16px; margin-bottom:8px;")}>
        <h1 style={css("font-family:'Space Grotesk'; font-size:26px; font-weight:600; margin:0;")}>Your profile</h1>
        <span
          style={{
            ...css("font-family:'IBM Plex Mono'; font-size:12px;"),
            color: saving ? "oklch(0.5 0.015 260)" : "oklch(0.55 0.13 145)",
          }}
        >
          {saving ? "saving…" : "✓ changes save as you go"}
        </span>
      </div>
      <p style={css("font-size:14px; color:oklch(0.45 0.015 260); margin:0 0 24px;")}>
        Every bullet and answer is an editable object — reorder, toggle, reuse. This is the source of
        truth for tailoring and autofill.
      </p>

      <div
        data-tour="profile-review"
        style={{
          ...css("border-radius:11px; padding:14px 16px; margin-bottom:22px; display:flex; align-items:center; gap:12px; flex-wrap:wrap;"),
          background: gaps.length ? "oklch(0.55 0.13 40 / 0.06)" : "oklch(0.55 0.13 145 / 0.06)",
          border: `1px solid ${gaps.length ? "oklch(0.55 0.13 40 / 0.25)" : "oklch(0.55 0.13 145 / 0.25)"}`,
        }}
      >
        <span
          style={{
            ...css("font-size:13.5px; line-height:1.55;"),
            color: gaps.length ? "oklch(0.4 0.1 40)" : "oklch(0.32 0.09 150)",
          }}
        >
          <strong>Standing review:</strong>{" "}
          {gaps.length
            ? `${gaps.length} gap${gaps.length === 1 ? "" : "s"} — ${gaps.slice(0, 3).join(", ")}${gaps.length > 3 ? `, and ${gaps.length - 3} more` : ""}.`
            : "nothing flagged. Your profile has what tailoring and autofill need."}
        </span>
      </div>

      {/* identity */}
      <Eyebrow style={{ marginBottom: "12px" }}>You</Eyebrow>
      <div style={css("border:1px solid oklch(0.9 0.006 260); border-radius:13px; padding:20px; background:#fff; margin-bottom:22px; display:grid; grid-template-columns:1fr 1fr; gap:16px;")}>
        <div>
          <FieldLabel>Name</FieldLabel>
          <SavedInput
            value={profile.data?.fullName ?? ""}
            placeholder="Your full name"
            onSave={(fullName) => updateProfile.mutate({ fullName })}
          />
        </div>
        <div>
          <FieldLabel>Headline</FieldLabel>
          <SavedInput
            value={profile.data?.headline ?? ""}
            placeholder="Senior Software Engineer · Reliability"
            onSave={(headline) => updateProfile.mutate({ headline })}
          />
        </div>
      </div>

      {/* experience */}
      <div style={css("display:flex; align-items:center; justify-content:space-between; margin-bottom:12px;")}>
        <Eyebrow>Experience</Eyebrow>
        <button
          onClick={() => setAddingRole((v) => !v)}
          style={css("font-family:'IBM Plex Sans'; font-size:12.5px; font-weight:600; color:oklch(0.4 0.13 255); background:none; border:none; cursor:pointer;")}
        >
          {addingRole ? "Cancel" : "+ Add a role"}
        </button>
      </div>

      {addingRole && (
        <div style={css("border:1px solid oklch(0.55 0.15 255 / 0.35); border-radius:13px; padding:18px; background:#fff; margin-bottom:16px; display:flex; flex-direction:column; gap:14px;")}>
          <div style={css("display:grid; grid-template-columns:1fr 1fr; gap:14px;")}>
            <div>
              <FieldLabel>Title</FieldLabel>
              <TextInput value={newTitle} onChange={setNewTitle} placeholder="Senior Software Engineer" autoFocus />
            </div>
            <div>
              <FieldLabel>Company</FieldLabel>
              <TextInput value={newCompany} onChange={setNewCompany} placeholder="Acme Cloud" />
            </div>
          </div>
          <div style={css("display:grid; grid-template-columns:1fr 1fr; gap:14px;")}>
            <div>
              <FieldLabel hint="(optional)">Started</FieldLabel>
              <TextInput type="date" value={newStart} onChange={setNewStart} ariaLabel="Start date" />
            </div>
            <div>
              <FieldLabel hint="— leave blank if current">Ended</FieldLabel>
              <TextInput type="date" value={newEnd} onChange={setNewEnd} ariaLabel="End date" />
            </div>
          </div>
          <div>
            <PrimaryButton
              onClick={submitRole}
              disabled={!newTitle.trim() || !newCompany.trim() || createExperience.isPending}
            >
              {createExperience.isPending ? "Adding…" : "Add role"}
            </PrimaryButton>
          </div>
        </div>
      )}

      {experiences.data?.length === 0 && !addingRole && (
        <div style={css("margin-bottom:22px;")}>
          <EmptyState
            title="No experience yet"
            body="Add the roles you've held and the bullets that describe them. Everything the app generates is built from these — nothing gets invented on top."
            action={<PrimaryButton onClick={() => setAddingRole(true)}>+ Add your first role</PrimaryButton>}
          />
        </div>
      )}

      <div style={css("display:flex; flex-direction:column; gap:16px; margin-bottom:24px;")}>
        {(experiences.data ?? []).map((experience) => (
          <ExperienceCard key={experience.id} experience={experience} />
        ))}
      </div>

      <div style={css("display:grid; grid-template-columns:1fr 1fr; gap:16px;")}>
        {/* skills */}
        <div>
          <Eyebrow style={{ marginBottom: "12px" }}>Skills</Eyebrow>
          <div style={css("border:1px solid oklch(0.9 0.006 260); border-radius:13px; padding:16px; background:#fff;")}>
            <div style={css("display:flex; gap:7px; flex-wrap:wrap; margin-bottom:12px;")}>
              {(skills.data ?? []).map((skill) => (
                <span
                  key={skill.id}
                  style={css("display:inline-flex; align-items:center; gap:7px; font-size:12.5px; background:oklch(0.55 0.15 255 / 0.1); color:oklch(0.35 0.11 255); padding:5px 11px; border-radius:100px;")}
                >
                  {skill.name}
                  <button
                    onClick={() => deleteSkill.mutate(skill.id)}
                    aria-label={`Remove ${skill.name}`}
                    style={css("background:none; border:none; color:oklch(0.45 0.1 255); cursor:pointer; font-size:13px; line-height:1; padding:0;")}
                  >
                    ×
                  </button>
                </span>
              ))}
              {skills.data?.length === 0 && (
                <span style={css("font-size:12.5px; color:oklch(0.55 0.015 260);")}>
                  Nothing listed yet — the keyword gap uses these.
                </span>
              )}
            </div>
            <TextInput
              value={skillDraft}
              onChange={setSkillDraft}
              placeholder="Add a skill and press Enter"
              ariaLabel="Add a skill"
              onEnter={() => {
                if (!skillDraft.trim()) return;
                addSkill.mutate(skillDraft);
                setSkillDraft("");
              }}
            />
          </div>
        </div>

        {/* autofill answers */}
        <div>
          <Eyebrow style={{ marginBottom: "12px" }}>Common answers · power the autofill</Eyebrow>
          <div style={css("border:1px solid oklch(0.9 0.006 260); border-radius:13px; padding:16px; background:#fff; display:flex; flex-direction:column; gap:14px;")}>
            <div>
              <FieldLabel>Notice period</FieldLabel>
              <SavedInput
                value={profile.data?.noticePeriod ?? ""}
                placeholder="2 weeks"
                onSave={(noticePeriod) => updateProfile.mutate({ noticePeriod })}
              />
            </div>
            <div>
              <FieldLabel>Work authorization</FieldLabel>
              <SavedInput
                value={profile.data?.workAuthorization ?? ""}
                placeholder="US citizen, no sponsorship needed"
                onSave={(workAuthorization) => updateProfile.mutate({ workAuthorization })}
              />
            </div>
            <div>
              <FieldLabel>Salary expectation</FieldLabel>
              <SavedInput
                value={profile.data?.salaryExpectation ?? ""}
                placeholder="$220k — $260k"
                onSave={(salaryExpectation) => updateProfile.mutate({ salaryExpectation })}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** An input that persists when you leave it, so nothing needs a save button. */
function SavedInput({
  value,
  placeholder,
  onSave,
}: {
  value: string;
  placeholder?: string;
  onSave: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const commit = () => {
    if (draft.trim() !== value.trim()) onSave(draft.trim());
  };

  return (
    <input
      className="field"
      value={draft}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") setDraft(value);
      }}
    />
  );
}

function ExperienceCard({ experience }: { experience: Experience }) {
  const updateExperience = useUpdateExperience();
  const deleteExperience = useDeleteExperience();
  const createBullet = useCreateBullet();
  const [bulletDraft, setBulletDraft] = useState("");
  const [editingHeader, setEditingHeader] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  return (
    <div style={css("border:1px solid oklch(0.9 0.006 260); border-radius:13px; padding:20px; background:#fff;")}>
      <div style={css("display:flex; align-items:flex-start; justify-content:space-between; gap:12px;")}>
        {editingHeader ? (
          <div style={css("flex:1; display:flex; flex-direction:column; gap:10px;")}>
            <div style={css("display:grid; grid-template-columns:1fr 1fr; gap:10px;")}>
              <SavedInput
                value={experience.title}
                onSave={(title) => updateExperience.mutate({ id: experience.id, patch: { title } })}
              />
              <SavedInput
                value={experience.company}
                onSave={(company) => updateExperience.mutate({ id: experience.id, patch: { company } })}
              />
            </div>
            <SavedTextArea
              value={experience.summary ?? ""}
              placeholder="One line on what this role was about — the review flags its absence"
              onSave={(summary) => updateExperience.mutate({ id: experience.id, patch: { summary } })}
            />
          </div>
        ) : (
          <div>
            <div style={css("font-family:'Space Grotesk'; font-size:16px; font-weight:600;")}>{experience.title}</div>
            <div style={css("font-size:13.5px; color:oklch(0.45 0.015 260);")}>
              {experience.company}
              {dateRange(experience.startDate, experience.endDate)
                ? ` · ${dateRange(experience.startDate, experience.endDate)}`
                : ""}
            </div>
            {experience.summary && (
              <div style={css("font-size:13px; color:oklch(0.45 0.015 260); margin-top:8px; line-height:1.55; max-width:560px;")}>{experience.summary}</div>
            )}
          </div>
        )}

        <div style={css("display:flex; gap:10px; flex:0 0 auto;")}>
          <button
            onClick={() => setEditingHeader((v) => !v)}
            style={css("font-family:'IBM Plex Mono'; font-size:11px; color:oklch(0.5 0.015 260); background:none; border:none; cursor:pointer;")}
          >
            {editingHeader ? "done" : "edit"}
          </button>
          <button
            onClick={() => (confirmingDelete ? deleteExperience.mutate(experience.id) : setConfirmingDelete(true))}
            onBlur={() => setConfirmingDelete(false)}
            style={css("font-family:'IBM Plex Mono'; font-size:11px; color:oklch(0.55 0.13 25); background:none; border:none; cursor:pointer;")}
          >
            {confirmingDelete ? "really delete?" : "delete"}
          </button>
        </div>
      </div>

      <div style={css("display:flex; flex-direction:column; gap:8px; margin-top:14px;")}>
        {experience.bullets.map((bullet, i) => (
          <BulletRow
            key={bullet.id}
            bullet={bullet}
            above={experience.bullets[i - 1]}
            below={experience.bullets[i + 1]}
          />
        ))}
      </div>

      <div style={css("margin-top:12px;")}>
        <TextInput
          value={bulletDraft}
          onChange={setBulletDraft}
          placeholder="Add a bullet — what you did, with a number if you have one"
          ariaLabel="Add a bullet"
          onEnter={() => {
            if (!bulletDraft.trim()) return;
            createBullet.mutate({
              experienceId: experience.id,
              text: bulletDraft,
              sortOrder: experience.bullets.length,
            });
            setBulletDraft("");
          }}
        />
      </div>
    </div>
  );
}

function BulletRow({
  bullet,
  above,
  below,
}: {
  bullet: ExperienceBullet;
  above?: ExperienceBullet;
  below?: ExperienceBullet;
}) {
  const update = useUpdateBullet();
  const remove = useDeleteBullet();
  const move = useMoveBullet();
  const [draft, setDraft] = useState(bullet.text);

  useEffect(() => {
    setDraft(bullet.text);
  }, [bullet.text]);

  return (
    <div
      style={{
        ...css("display:flex; align-items:center; gap:11px; background:oklch(0.99 0.003 260); border:1px solid oklch(0.93 0.006 260); border-radius:9px; padding:11px 13px;"),
        opacity: bullet.enabled ? 1 : 0.6,
      }}
    >
      <div style={css("display:flex; flex-direction:column; gap:1px; flex:0 0 auto;")}>
        <button
          onClick={() => above && move.mutate({ a: bullet, b: above })}
          disabled={!above}
          aria-label="Move bullet up"
          style={{
            ...css("background:none; border:none; cursor:pointer; font-size:9px; line-height:1; padding:1px;"),
            color: above ? "oklch(0.55 0.015 260)" : "oklch(0.85 0.006 260)",
          }}
        >
          ▲
        </button>
        <button
          onClick={() => below && move.mutate({ a: bullet, b: below })}
          disabled={!below}
          aria-label="Move bullet down"
          style={{
            ...css("background:none; border:none; cursor:pointer; font-size:9px; line-height:1; padding:1px;"),
            color: below ? "oklch(0.55 0.015 260)" : "oklch(0.85 0.006 260)",
          }}
        >
          ▼
        </button>
      </div>

      <input
        className="field-bare"
        value={draft}
        aria-label="Bullet text"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft.trim() && draft !== bullet.text) update.mutate({ id: bullet.id, patch: { text: draft.trim() } });
          else if (!draft.trim()) setDraft(bullet.text);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") setDraft(bullet.text);
        }}
        style={{ fontSize: "13.5px", flex: 1 }}
      />

      <Toggle
        on={bullet.enabled}
        label={bullet.enabled ? "Included in tailoring" : "Held back from tailoring"}
        onToggle={() => update.mutate({ id: bullet.id, patch: { enabled: !bullet.enabled } })}
      />
      <button
        onClick={() => remove.mutate(bullet.id)}
        aria-label="Delete bullet"
        style={css("background:none; border:none; color:oklch(0.65 0.015 260); cursor:pointer; font-size:15px; line-height:1; padding:0;")}
      >
        ×
      </button>
    </div>
  );
}

function SavedTextArea({
  value,
  placeholder,
  onSave,
}: {
  value: string;
  placeholder?: string;
  onSave: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  return (
    <textarea
      className="field"
      value={draft}
      rows={2}
      placeholder={placeholder}
      aria-label="Role summary"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft.trim() !== value.trim()) onSave(draft.trim());
      }}
    />
  );
}