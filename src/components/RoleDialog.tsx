import { useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../store";
import { css } from "../css";
import { ALL_STAGES } from "../data";
import {
  useCreateApplication,
  useUpdateApplication,
  guessCompanyDomain,
} from "../data/applications";
import {
  filterCompanies,
  filterRoles,
  useCatalogCompanies,
  useCatalogLevels,
  useCatalogRoles,
  useRequestCatalogItem,
} from "../data/catalog";
import { ROUTES } from "../routes";
import type { Application, EmploymentType, Stage } from "../types";
import {
  Combobox,
  FieldLabel,
  PrimaryButton,
  SecondaryButton,
  Select,
  Spinner,
  TextArea,
  TextInput,
} from "./ui";

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const EMPLOYMENT_OPTIONS: { value: EmploymentType | ""; label: string }[] = [
  { value: "", label: "Not specified" },
  { value: "full_time", label: "Full-time" },
  { value: "contract", label: "Contract / FTC" },
  { value: "intern", label: "Intern" },
  { value: "other", label: "Other" },
];

interface Props {
  application?: Application;
  onClose: () => void;
}

/**
 * One role, one workspace. Company / role / level prefer catalog picks so prep
 * keys stay stable; Custom keeps free text when the catalog misses.
 */
export function RoleDialog({ application, onClose }: Props) {
  const navigate = useNavigate();
  const create = useCreateApplication();
  const update = useUpdateApplication();
  const requestItem = useRequestCatalogItem();
  const editing = !!application;

  const levels = useCatalogLevels();
  const companies = useCatalogCompanies();
  const rolesCatalog = useCatalogRoles();

  const [companyId, setCompanyId] = useState<string | null>(application?.companyId ?? null);
  const [company, setCompany] = useState(application?.company ?? "");
  const [roleId, setRoleId] = useState<string | null>(application?.roleId ?? null);
  const [role, setRole] = useState(application?.role ?? "");
  const [levelId, setLevelId] = useState<string | null>(application?.levelId ?? null);
  const [level, setLevel] = useState(application?.level ?? "");
  const [specialty, setSpecialty] = useState(application?.specialty ?? "");
  const [employmentType, setEmploymentType] = useState<EmploymentType | "">(
    application?.employmentType ?? "",
  );
  const [stage, setStage] = useState<Stage>(application?.stage ?? "Saved");
  const [postingUrl, setPostingUrl] = useState(application?.postingUrl ?? "");
  const [companyDomain, setCompanyDomain] = useState(
    application?.companyDomain ?? guessCompanyDomain(application?.postingUrl) ?? "",
  );
  const [jobDescription, setJobDescription] = useState(application?.jobDescription ?? "");
  const [nextAction, setNextAction] = useState(application?.nextAction ?? "");
  const [nextActionAt, setNextActionAt] = useState(toLocalInput(application?.nextActionAt ?? null));
  const [error, setError] = useState<string | null>(null);

  const [requestOpen, setRequestOpen] = useState(false);
  const [requestKind, setRequestKind] = useState<"company" | "role">("company");
  const [requestName, setRequestName] = useState("");
  const [requestNotes, setRequestNotes] = useState("");
  const [requestDone, setRequestDone] = useState(false);

  const companyOptions = useMemo(
    () =>
      filterCompanies(companies.data ?? [], company).map((c) => ({
        id: c.id,
        label: c.name,
        hint: c.domain ?? undefined,
      })),
    [companies.data, company],
  );

  const roleOptions = useMemo(
    () =>
      filterRoles(
        rolesCatalog.data?.roles ?? [],
        rolesCatalog.data?.aliases ?? [],
        role,
      ).map((r) => ({ id: r.id, label: r.name })),
    [rolesCatalog.data, role],
  );

  const levelOptions = useMemo(
    () => [
      { value: "" as const, label: "Not specified" },
      ...(levels.data ?? []).map((l) => ({ value: l.id, label: l.label })),
    ],
    [levels.data],
  );

  const valid = company.trim().length > 0 && role.trim().length > 0;
  const pending = create.isPending || update.isPending;

  async function submit() {
    if (!valid || pending) return;
    setError(null);
    const fields = {
      company,
      role,
      level: level || null,
      companyId,
      roleId,
      levelId,
      specialty: specialty || null,
      employmentType: employmentType || null,
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

  async function submitRequest() {
    setError(null);
    try {
      await requestItem.mutateAsync({
        kind: requestKind,
        name: requestName || (requestKind === "company" ? company : role),
        notes: requestNotes,
      });
      setRequestDone(true);
      setRequestName("");
      setRequestNotes("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send that request.");
    }
  }

  return (
    <Shell
      title={editing ? "Edit role" : "Add a role"}
      subtitle={
        editing
          ? "Keep the stage and the next date honest — the tracker's numbers are counted from them."
          : "Pick from the catalog when you can — prep and referrals stay consistent. Custom is fine when it isn't listed."
      }
      onClose={onClose}
    >
      <div style={css("display:flex; flex-direction:column; gap:16px;")}>
        <div style={css("display:grid; grid-template-columns:1fr 1fr; gap:14px;")}>
          <div>
            <FieldLabel>Company</FieldLabel>
            <Combobox
              value={{ id: companyId, label: company }}
              onChange={(next) => {
                setCompanyId(next.id);
                setCompany(next.label);
                if (next.id) {
                  const hit = (companies.data ?? []).find((c) => c.id === next.id);
                  if (hit?.domain) setCompanyDomain(hit.domain);
                }
              }}
              options={companyOptions}
              placeholder="Start typing — Google, Stripe…"
              ariaLabel="Company"
              autoFocus={!editing}
              emptyHint="No catalog match — keep the name to save as custom"
            />
            {companyId ? (
              <div style={css("margin-top:4px; font-size:11px; color:oklch(0.5 0.08 145);")}>
                Catalog company
              </div>
            ) : company.trim() ? (
              <div style={css("margin-top:4px; font-size:11px; color:oklch(0.55 0.015 260);")}>
                Custom company
              </div>
            ) : null}
          </div>
          <div>
            <FieldLabel>Role</FieldLabel>
            <Combobox
              value={{ id: roleId, label: role }}
              onChange={(next) => {
                setRoleId(next.id);
                setRole(next.label);
              }}
              options={roleOptions}
              placeholder="Software Engineer, Recruiter…"
              ariaLabel="Role"
              emptyHint="No catalog match — keep the title as custom"
            />
            {roleId ? (
              <div style={css("margin-top:4px; font-size:11px; color:oklch(0.5 0.08 145);")}>
                Catalog role
              </div>
            ) : role.trim() ? (
              <div style={css("margin-top:4px; font-size:11px; color:oklch(0.55 0.015 260);")}>
                Custom role
              </div>
            ) : null}
          </div>
        </div>

        <div style={css("display:grid; grid-template-columns:1fr 1fr 1fr; gap:14px;")}>
          <div>
            <FieldLabel hint="(optional)">Level</FieldLabel>
            <Select
              value={levelId ?? ""}
              onChange={(id) => {
                if (!id) {
                  setLevelId(null);
                  setLevel("");
                  return;
                }
                const hit = (levels.data ?? []).find((l) => l.id === id);
                setLevelId(id);
                setLevel(hit?.label ?? id);
              }}
              options={levelOptions}
              ariaLabel="Level"
            />
          </div>
          <div>
            <FieldLabel hint="(optional)">Specialty</FieldLabel>
            <TextInput
              value={specialty}
              onChange={setSpecialty}
              placeholder="Frontend, Enterprise…"
              ariaLabel="Specialty"
            />
          </div>
          <div>
            <FieldLabel hint="(optional)">Employment</FieldLabel>
            <Select
              value={employmentType}
              onChange={setEmploymentType}
              options={EMPLOYMENT_OPTIONS}
              ariaLabel="Employment type"
            />
          </div>
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

        <div>
          <FieldLabel hint="(optional)">Posting link</FieldLabel>
          <TextInput
            type="url"
            value={postingUrl}
            onChange={(v) => {
              setPostingUrl(v);
              if (!companyDomain.trim() && !companyId) {
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

        <div style={css("border-top:1px solid oklch(0.92 0.006 260); padding-top:12px;")}>
          {!requestOpen ? (
            <button
              type="button"
              onClick={() => {
                setRequestOpen(true);
                setRequestDone(false);
              }}
              style={css(
                "font-family:'IBM Plex Sans'; font-size:12.5px; color:oklch(0.4 0.13 255); background:none; border:none; cursor:pointer; padding:0;",
              )}
            >
              Can't find a company or role? Request it
            </button>
          ) : (
            <div style={css("display:flex; flex-direction:column; gap:10px;")}>
              <div style={css("font-size:12.5px; font-weight:600;")}>Request a catalog addition</div>
              <div style={css("display:flex; gap:12px; font-size:12.5px;")}>
                <label style={css("display:flex; gap:5px; align-items:center;")}>
                  <input
                    type="radio"
                    checked={requestKind === "company"}
                    onChange={() => setRequestKind("company")}
                  />
                  Company
                </label>
                <label style={css("display:flex; gap:5px; align-items:center;")}>
                  <input
                    type="radio"
                    checked={requestKind === "role"}
                    onChange={() => setRequestKind("role")}
                  />
                  Role
                </label>
              </div>
              <TextInput
                value={requestName}
                onChange={setRequestName}
                placeholder={requestKind === "company" ? "Company name" : "Role title"}
              />
              <TextInput
                value={requestNotes}
                onChange={setRequestNotes}
                placeholder="Optional note (why you need it)"
              />
              <div style={css("display:flex; gap:8px; align-items:center;")}>
                <PrimaryButton
                  onClick={submitRequest}
                  disabled={requestItem.isPending}
                  style={{ fontSize: "12.5px", padding: "7px 12px" }}
                >
                  {requestItem.isPending ? "Sending…" : "Submit request"}
                </PrimaryButton>
                <button
                  type="button"
                  onClick={() => setRequestOpen(false)}
                  style={css(
                    "font-size:12px; background:none; border:none; cursor:pointer; color:oklch(0.5 0.015 260);",
                  )}
                >
                  Close
                </button>
                {requestDone && (
                  <span style={css("font-size:12px; color:oklch(0.45 0.08 145);")}>
                    Thanks — we'll review it.
                  </span>
                )}
              </div>
            </div>
          )}
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
      style={css(
        "position:fixed; inset:0; background:oklch(0.15 0.02 260 / 0.45); backdrop-filter:blur(3px); z-index:80; display:flex; align-items:flex-start; justify-content:center; padding:40px 20px; overflow-y:auto;",
      )}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        style={css(
          "width:640px; max-width:100%; background:#fff; border-radius:18px; box-shadow:0 40px 90px -34px oklch(0.2 0.05 260 / 0.7); animation:fadeUp .3s ease both; padding:26px;",
        )}
      >
        <div
          style={css(
            "display:flex; align-items:flex-start; justify-content:space-between; gap:12px; margin-bottom:4px;",
          )}
        >
          <h2 style={css("font-family:'Space Grotesk'; font-size:21px; font-weight:600; margin:0;")}>
            {title}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            style={css(
              "background:none; border:none; font-size:22px; line-height:1; color:oklch(0.55 0.015 260); cursor:pointer;",
            )}
          >
            ×
          </button>
        </div>
        <p style={css("font-size:13.5px; color:oklch(0.45 0.015 260); margin:0 0 20px; line-height:1.5;")}>
          {subtitle}
        </p>
        {children}
      </div>
    </div>
  );
}
