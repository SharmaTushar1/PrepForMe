import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../store";
import { css } from "../css";
import { ALL_STAGES } from "../data";
import { useCreateApplication, useUpdateApplication, guessCompanyDomain } from "../data/applications";
import { ROUTES } from "../routes";
import type { Application, Stage } from "../types";
import {
  FieldLabel,
  PrimaryButton,
  SecondaryButton,
  Select,
  Spinner,
  TextArea,
  TextInput,
} from "./ui";

/** A timestamptz as the value a datetime-local input expects. */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface Props {
  application?: Application;
  onClose: () => void;
}

/**
 * One role, one workspace. The job description matters most: tailoring and the
 * keyword gap are measured against it, so everything downstream is only as
 * specific as what gets pasted here.
 */
export function RoleDialog({ application, onClose }: Props) {
  const navigate = useNavigate();
  const create = useCreateApplication();
  const update = useUpdateApplication();
  const editing = !!application;

  const [company, setCompany] = useState(application?.company ?? "");
  const [role, setRole] = useState(application?.role ?? "");
  const [level, setLevel] = useState(application?.level ?? "");
  const [stage, setStage] = useState<Stage>(application?.stage ?? "Saved");
  const [postingUrl, setPostingUrl] = useState(application?.postingUrl ?? "");
  const [companyDomain, setCompanyDomain] = useState(
    application?.companyDomain ?? guessCompanyDomain(application?.postingUrl) ?? "",
  );
  const [jobDescription, setJobDescription] = useState(application?.jobDescription ?? "");
  const [nextAction, setNextAction] = useState(application?.nextAction ?? "");
  const [nextActionAt, setNextActionAt] = useState(toLocalInput(application?.nextActionAt ?? null));
  const [error, setError] = useState<string | null>(null);

  const valid = company.trim().length > 0 && role.trim().length > 0;
  const pending = create.isPending || update.isPending;

  async function submit() {
    if (!valid || pending) return;
    setError(null);
    const fields = {
      company,
      role,
      level,
      stage,
      postingUrl,
      companyDomain: companyDomain.trim() || guessCompanyDomain(postingUrl),
      jobDescription,
      nextAction,
      nextActionAt: nextActionAt ? new Date(nextActionAt).toISOString() : null,
    };
    try {
      if (application) {
        await update.mutateAsync({ id: application.id, patch: fields });
        onClose();
      } else {
        const created = await create.mutateAsync(fields);
        onClose();
        navigate(ROUTES.application(created.id));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save this role.");
    }
  }

  return (
    <Shell
      title={editing ? "Edit role" : "Add a role"}
      subtitle={
        editing
          ? "Keep the stage and the next date honest — the tracker's numbers are counted from them."
          : "One role, one workspace: its tailored resume, referral drafts, company prep, and recaps."
      }
      onClose={onClose}
    >
      <div style={css("display:flex; flex-direction:column; gap:16px;")}>
        <div style={css("display:grid; grid-template-columns:1fr 1fr; gap:14px;")}>
          <div>
            <FieldLabel>Company</FieldLabel>
            <TextInput value={company} onChange={setCompany} placeholder="Stripe" autoFocus={!editing} />
          </div>
          <div>
            <FieldLabel>Role</FieldLabel>
            <TextInput value={role} onChange={setRole} placeholder="Staff Software Engineer" />
          </div>
        </div>

        <div style={css("display:grid; grid-template-columns:1fr 1fr; gap:14px;")}>
          <div>
            <FieldLabel hint="(optional)">Level</FieldLabel>
            <TextInput value={level} onChange={setLevel} placeholder="Staff · L6" />
          </div>
          <div>
            <FieldLabel>Stage</FieldLabel>
            <Select
              value={stage}
              onChange={setStage}
              options={ALL_STAGES.map((s) => ({ value: s, label: s }))}
              ariaLabel="Stage"
            />
          </div>
        </div>

        <div>
          <FieldLabel hint="(optional)">Posting link</FieldLabel>
          <TextInput
            type="url"
            value={postingUrl}
            onChange={(v) => {
              setPostingUrl(v);
              if (!companyDomain.trim()) {
                const guessed = guessCompanyDomain(v);
                if (guessed) setCompanyDomain(guessed);
              }
            }}
            placeholder="https://…"
          />
        </div>

        <div>
          <FieldLabel hint="— used to tell the company's own site from third-party pages">
            Company domain
          </FieldLabel>
          <TextInput
            value={companyDomain}
            onChange={setCompanyDomain}
            placeholder="abnormal.ai"
          />
        </div>

        <div>
          <FieldLabel hint="— tailoring and the keyword gap are measured against this">
            Job description
          </FieldLabel>
          <TextArea
            value={jobDescription}
            onChange={setJobDescription}
            rows={6}
            placeholder="Paste the full posting here."
          />
        </div>

        <div style={css("display:grid; grid-template-columns:1.4fr 1fr; gap:14px;")}>
          <div>
            <FieldLabel hint="(optional)">Next action</FieldLabel>
            <TextInput value={nextAction} onChange={setNextAction} placeholder="Prep the screen" />
          </div>
          <div>
            <FieldLabel hint="(optional)">When</FieldLabel>
            <TextInput
              type="datetime-local"
              value={nextActionAt}
              onChange={setNextActionAt}
              ariaLabel="Next action date and time"
            />
          </div>
        </div>

        {error && (
          <div style={css("font-size:12.5px; color:oklch(0.5 0.14 25); line-height:1.5;")}>{error}</div>
        )}

        <div style={css("display:flex; align-items:center; gap:12px; margin-top:4px;")}>
          <span style={css("font-size:11.5px; color:oklch(0.55 0.015 260); line-height:1.5;")}>
            Nothing is submitted anywhere. This is your tracker.
          </span>
          <div style={css("margin-left:auto; display:flex; gap:8px;")}>
            <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
            <PrimaryButton
              onClick={submit}
              disabled={!valid || pending}
              style={{ display: "flex", alignItems: "center", gap: "8px" }}
            >
              {pending && <Spinner size={14} />}
              {pending ? "Saving…" : editing ? "Save changes" : "Add role"}
            </PrimaryButton>
          </div>
        </div>
      </div>
    </Shell>
  );
}

/** Store-driven instance for the "+ Add a role" buttons. */
export function AddRoleModal() {
  const { closeAddRole } = useApp();
  return <RoleDialog onClose={closeAddRole} />;
}

function Shell({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div
      onClick={onClose}
      style={css("position:fixed; inset:0; background:oklch(0.15 0.02 260 / 0.45); backdrop-filter:blur(3px); z-index:80; display:flex; align-items:flex-start; justify-content:center; padding:40px 20px; overflow-y:auto;")}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        style={css("width:620px; max-width:100%; background:#fff; border-radius:18px; box-shadow:0 40px 90px -34px oklch(0.2 0.05 260 / 0.7); animation:fadeUp .3s ease both; padding:26px;")}
      >
        <div style={css("display:flex; align-items:flex-start; justify-content:space-between; gap:12px; margin-bottom:4px;")}>
          <h2 style={css("font-family:'Space Grotesk'; font-size:21px; font-weight:600; margin:0;")}>{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            style={css("background:none; border:none; font-size:22px; line-height:1; color:oklch(0.55 0.015 260); cursor:pointer;")}
          >
            ×
          </button>
        </div>
        <p style={css("font-size:13.5px; color:oklch(0.45 0.015 260); margin:0 0 20px; line-height:1.5;")}>{subtitle}</p>
        {children}
      </div>
    </div>
  );
}
