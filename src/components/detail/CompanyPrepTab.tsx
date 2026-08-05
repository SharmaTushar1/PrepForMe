import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../../store";
import { css } from "../../css";
import { ACCENT } from "../../data";
import { DEPTH_SEGMENTS } from "../../lib/depth";
import { ROUTES } from "../../routes";
import { useProfileContext } from "../../data/profile";
import { useRecaps } from "../../data/recaps";
import { useUpdateApplication } from "../../data/applications";
import {
  useAddPasteSource,
  useAddPdfSource,
  useAddPrepSource,
  useAskPrep,
  useConfirmIngest,
  useDeletePrepSource,
  usePrepMessages,
  usePrepSources,
  useSavePrepClaims,
  useSharedClaimCount,
} from "../../data/prep";
import type { DecoratedApp } from "../../data/derived";
import type { PrepCitation, PrepClaimDraft } from "../../types";
import { linkifyText } from "../../lib/linkify";
import { PrimaryButton, Spinner, TextArea, TextInput } from "../ui";

const CITATION_STYLES: Record<PrepCitation["layer"], string> = {
  company: "background:oklch(0.55 0.15 255 / 0.1); color:oklch(0.4 0.13 255);",
  role: "background:oklch(0.55 0.13 300 / 0.12); color:oklch(0.42 0.13 300);",
  personal: "background:oklch(0.55 0.13 145 / 0.12); color:oklch(0.3 0.09 150);",
  general: "background:oklch(0.6 0.01 260 / 0.12); color:oklch(0.45 0.015 260);",
};

type AddMode = "paste" | "url" | "pdf" | null;

export function CompanyPrepTab({ app, apps }: { app: DecoratedApp; apps: DecoratedApp[] }) {
  const { state, clearLeveled } = useApp();
  const navigate = useNavigate();
  const context = useProfileContext();

  const sources = usePrepSources(app.id, app.company);
  const sharedClaims = useSharedClaimCount(app.company, app.role);
  const messages = usePrepMessages(app.id);
  const recaps = useRecaps(app.id);
  const addSource = useAddPrepSource();
  const addPaste = useAddPasteSource();
  const addPdf = useAddPdfSource();
  const confirmIngest = useConfirmIngest();
  const deleteSource = useDeletePrepSource();
  const ask = useAskPrep();
  const saveClaims = useSavePrepClaims();
  const updateApp = useUpdateApplication();

  const [addMode, setAddMode] = useState<AddMode>(null);
  const [sourceUrl, setSourceUrl] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [scope, setScope] = useState<"company" | "role">("role");
  const [ack, setAck] = useState(false);
  const [domainDraft, setDomainDraft] = useState(app.companyDomain ?? "");
  const [question, setQuestion] = useState("");
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [pendingWarning, setPendingWarning] = useState<{
    sourceId: string;
    reason: string;
    message: string;
  } | null>(null);

  const [saveDrafts, setSaveDrafts] = useState<
    { content: string; claimKind: "company_fact" | "interview_process"; selected: boolean; fromExperience: boolean }[]
  >([]);

  const fileRef = useRef<HTMLInputElement>(null);

  const sharedCount = sharedClaims.data ?? 0;
  /**
   * Shared claims count as grounding here even though they never appear in this
   * role's own totals — the coach retrieves them, so promising "general guidance
   * only" would be false.
   */
  const coldStart = app.recapCount === 0 && app.sourceCount <= 2 && sharedCount === 0;
  const roleShallow = app.recapCount === 0;
  const roleLayerText = roleShallow
    ? "Shallow — general role guidance for now"
    : `${app.recapCount} interview pattern${app.recapCount === 1 ? "" : "s"} mapped`;
  const roleLayerBar = roleShallow ? "16%" : `${Math.min(100, 32 + app.recapCount * 22)}%`;
  const justLeveledNow = state.justLeveled === app.id;
  const busy =
    addSource.isPending ||
    addPaste.isPending ||
    addPdf.isPending ||
    confirmIngest.isPending;

  useEffect(() => {
    if (!justLeveledNow) return;
    const timer = window.setTimeout(clearLeveled, 6000);
    return () => window.clearTimeout(timer);
  }, [justLeveledNow, clearLeveled]);

  useEffect(() => {
    setDomainDraft(app.companyDomain ?? "");
  }, [app.companyDomain, app.id]);

  async function saveDomain() {
    const trimmed = domainDraft.trim().toLowerCase().replace(/^www\./, "");
    await updateApp.mutateAsync({
      id: app.id,
      patch: { companyDomain: trimmed || null },
    });
  }

  function resetAddForm() {
    setAddMode(null);
    setSourceUrl("");
    setPasteText("");
    setAck(false);
    setSourceError(null);
  }

  async function submitUrl(acknowledgeRelevance = false) {
    const url = sourceUrl.trim();
    if (!url || !ack) return;
    setSourceError(null);
    try {
      const result = await addSource.mutateAsync({
        applicationId: app.id,
        url,
        scope,
        acknowledgeRelevance,
      });
      if (result.warning) {
        setPendingWarning({
          sourceId: result.source.id,
          reason: result.warning.reason || "May not match this company or role.",
          message: result.warning.message || "",
        });
        return;
      }
      resetAddForm();
    } catch (e) {
      setSourceError(e instanceof Error ? e.message : "Could not add that source.");
    }
  }

  async function submitPaste(acknowledgeRelevance = false) {
    if (!pasteText.trim() || !ack) return;
    setSourceError(null);
    try {
      const result = await addPaste.mutateAsync({
        applicationId: app.id,
        text: pasteText,
        scope,
        acknowledgeRelevance,
      });
      if (result.warning) {
        setPendingWarning({
          sourceId: result.source.id,
          reason: result.warning.reason || "May not match this company or role.",
          message: result.warning.message || "",
        });
        return;
      }
      resetAddForm();
    } catch (e) {
      setSourceError(e instanceof Error ? e.message : "Could not index that paste.");
    }
  }

  async function submitPdf(file: File, acknowledgeRelevance = false) {
    if (!ack) return;
    setSourceError(null);
    try {
      const result = await addPdf.mutateAsync({
        applicationId: app.id,
        file,
        scope,
        acknowledgeRelevance,
      });
      if (result.warning) {
        setPendingWarning({
          sourceId: result.source.id,
          reason: result.warning.reason || "May not match this company or role.",
          message: result.warning.message || "",
        });
        return;
      }
      resetAddForm();
    } catch (e) {
      setSourceError(e instanceof Error ? e.message : "Could not index that PDF.");
    }
  }

  async function proceedDespiteWarning() {
    if (!pendingWarning) return;
    try {
      await confirmIngest.mutateAsync({
        sourceId: pendingWarning.sourceId,
        applicationId: app.id,
      });
      setPendingWarning(null);
      resetAddForm();
    } catch (e) {
      setSourceError(e instanceof Error ? e.message : "Could not finish indexing.");
    }
  }

  async function submitQuestion() {
    const q = question.trim();
    if (!q || ask.isPending) return;
    setQuestion("");
    setSaveDrafts([]);
    const history = (messages.data ?? [])
      .slice(-8)
      .map((m) => ({ role: m.role, content: m.content }));
    const answer = await ask.mutateAsync({
      question: q,
      application: app,
      context,
      recaps: recaps.data ?? [],
      sourceCount: app.sourceCount,
      history,
    });
    if (answer.suggestedClaims && answer.suggestedClaims.length > 0) {
      setSaveDrafts(
        answer.suggestedClaims.map((c) => ({
          content: c.content,
          claimKind: c.claimKind,
          selected: false,
          fromExperience:
            c.fromExperience === true || c.provenance === "candidate_report",
        })),
      );
    }
  }

  async function submitSaveClaims() {
    const claims: PrepClaimDraft[] = saveDrafts
      .filter((d) => d.selected)
      .map((d) => ({
        content: d.content,
        claimKind: d.claimKind,
        provenance: d.fromExperience ? "candidate_report" : "ai_inferred",
      }));
    if (claims.length === 0) return;
    await saveClaims.mutateAsync({ applicationId: app.id, claims });
    setSaveDrafts([]);
  }

  function statusLabel(status: string, error: string | null): string {
    if (status === "indexed") return "✓ indexed";
    if (status === "failed") return error ? `failed` : "failed";
    return "queued";
  }

  return (
    <div>
      <div style={css("border:1px solid oklch(0.9 0.006 260); border-radius:14px; background:linear-gradient(120deg, oklch(0.55 0.15 255 / 0.05), #fff 62%); padding:18px 20px; margin-bottom:16px;")}>
        <div style={css("display:flex; align-items:flex-start; gap:14px;")}>
          <div style={{ ...css("width:44px; height:44px; border-radius:12px; display:flex; align-items:center; justify-content:center; font-family:'Space Grotesk'; font-weight:700; font-size:18px;"), background: app.logoBg, color: app.logoFg }}>{app.initial}</div>
          <div style={css("flex:1;")}>
            <div style={css("font-family:'IBM Plex Mono'; font-size:10.5px; letter-spacing:0.12em; text-transform:uppercase; color:oklch(0.5 0.02 260); margin-bottom:5px;")}>Briefing room</div>
            <div style={css("font-family:'Space Grotesk'; font-size:19px; font-weight:600; line-height:1.2;")}>
              {app.company} <span style={css("color:oklch(0.6 0.01 260);")}>·</span> {app.role}
              {app.level && (
                <>
                  {" "}
                  <span style={css("color:oklch(0.6 0.01 260);")}>·</span> {app.level}
                </>
              )}
            </div>
            <div style={css("font-size:12.5px; color:oklch(0.5 0.015 260); margin-top:4px;")}>
              One coach, briefed on this space — grounded in what you've put here, for this exact role.
            </div>
          </div>
          <PrimaryButton onClick={() => navigate(ROUTES.newRecap(app.id))}>+ Log a recap</PrimaryButton>
        </div>

        <div style={css("margin-top:16px; padding-top:16px; border-top:1px solid oklch(0.93 0.006 260); display:flex; align-items:center; gap:16px;")}>
          <div style={css("display:flex; flex-direction:column; gap:6px;")}>
            <div style={css("display:flex; align-items:center; gap:9px;")}>
              <span style={css("font-family:'IBM Plex Mono'; font-size:11px; letter-spacing:0.06em; text-transform:uppercase; color:oklch(0.5 0.02 260);")}>Prep depth</span>
              <span style={css("font-family:'Space Grotesk'; font-size:13.5px; font-weight:600; color:oklch(0.4 0.13 255);")}>{app.depthLabel}</span>
              {justLeveledNow && (
                <span style={css("font-family:'IBM Plex Mono'; font-size:10.5px; font-weight:600; color:oklch(0.4 0.13 255); background:oklch(0.55 0.15 255 / 0.12); padding:3px 9px; border-radius:100px; animation:float 1.4s ease-in-out infinite;")}>✦ Just leveled up</span>
              )}
            </div>
            <div style={css("display:flex; gap:4px;")}>
              {Array.from({ length: DEPTH_SEGMENTS }, (_, i) => (
                <span
                  key={i}
                  style={{
                    width: "38px",
                    height: "7px",
                    borderRadius: "3px",
                    background: i < app.depthIndex ? ACCENT : "oklch(0.91 0.006 260)",
                    transition: "background .4s",
                  }}
                ></span>
              ))}
            </div>
          </div>
          <div style={css("font-size:12px; color:oklch(0.5 0.015 260); line-height:1.45; flex:1;")}>
            {app.sourceCount} source{app.sourceCount === 1 ? "" : "s"} · {app.recapCount} recap
            {app.recapCount === 1 ? "" : "s"}
            {sharedCount > 0
              ? ` · ${sharedCount} shared claim${sharedCount === 1 ? "" : "s"}`
              : ""}{" "}
            —{" "}
            {coldStart
              ? "just getting started, and it deepens every time you log a recap."
              : "deepening with every source and recap you add."}
          </div>
        </div>
      </div>

      {!app.companyDomain && (
        <div style={css("background:oklch(0.65 0.11 85 / 0.09); border:1px solid oklch(0.65 0.11 85 / 0.3); border-radius:11px; padding:13px 15px; margin-bottom:14px;")}>
          <div style={css("font-size:13px; font-weight:600; margin-bottom:6px;")}>Confirm the company domain</div>
          <div style={css("font-size:12.5px; color:oklch(0.4 0.06 75); line-height:1.5; margin-bottom:10px;")}>
            Needed before URL fetch so we can tell {app.company}'s own site from third-party pages.
          </div>
          <div style={css("display:flex; gap:8px;")}>
            <TextInput
              value={domainDraft}
              onChange={setDomainDraft}
              placeholder="abnormal.ai"
              ariaLabel="Company domain"
              style={{ flex: 1 }}
            />
            <PrimaryButton onClick={saveDomain} disabled={updateApp.isPending}>
              Save domain
            </PrimaryButton>
          </div>
        </div>
      )}

      {apps.length > 1 && (
        <div style={css("margin-bottom:20px;")}>
          <div style={css("font-family:'IBM Plex Mono'; font-size:10.5px; letter-spacing:0.1em; text-transform:uppercase; color:oklch(0.5 0.02 260); margin-bottom:9px;")}>Switch briefing room · same coach, different dossier</div>
          <div style={css("display:flex; gap:9px; overflow-x:auto; padding-bottom:4px;")}>
            {apps.map((room) => {
              const active = room.id === app.id;
              return (
                <div
                  key={room.id}
                  onClick={() => navigate(ROUTES.applicationTab(room.id, "prep"))}
                  style={{
                    ...css("flex:0 0 auto; display:flex; align-items:center; gap:9px; border-radius:10px; padding:9px 13px; cursor:pointer; min-width:186px;"),
                    border: active ? "1.5px solid oklch(0.55 0.15 255)" : "1px solid oklch(0.9 0.006 260)",
                    background: active ? "oklch(0.55 0.15 255 / 0.06)" : "#fff",
                  }}
                >
                  <div style={{ ...css("width:28px; height:28px; border-radius:7px; display:flex; align-items:center; justify-content:center; font-family:'Space Grotesk'; font-weight:700; font-size:12px;"), background: room.logoBg, color: room.logoFg }}>{room.initial}</div>
                  <div>
                    <div style={css("font-size:13px; font-weight:600;")}>{room.company}</div>
                    <div style={css("font-size:11px; color:oklch(0.5 0.015 260);")}>{room.role}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div style={css("display:grid; grid-template-columns:1.5fr 1fr; gap:20px;")}>
        <div>
          {coldStart && (
            <div style={css("background:oklch(0.65 0.11 85 / 0.09); border:1px solid oklch(0.65 0.11 85 / 0.3); border-radius:11px; padding:13px 15px; margin-bottom:14px; font-size:12.5px; color:oklch(0.4 0.06 75); line-height:1.5;")}>
              This space is just getting started — it's running on general {app.role} guidance. Add a
              source or log your first recap and it gets specific fast.
            </div>
          )}

          <div style={css("border:1px solid oklch(0.9 0.006 260); border-radius:13px; background:#fff; overflow:hidden;")}>
            <div style={css("padding:18px; display:flex; flex-direction:column; gap:14px; max-height:380px; overflow-y:auto;")}>
              {(messages.data ?? []).length === 0 && !ask.isPending && (
                <div style={css("font-size:13px; color:oklch(0.5 0.015 260); line-height:1.6; text-align:center; padding:20px 10px;")}>
                  Ask about the interview loop, who you'll meet, or what they value. Every answer shows
                  which layers it drew on.
                </div>
              )}
              {(messages.data ?? []).map((message) =>
                message.role === "user" ? (
                  <div
                    key={message.id}
                    style={{
                      ...css("align-self:flex-end; max-width:80%; background:oklch(0.55 0.15 255); color:#fff; font-size:13.5px; padding:10px 13px; border-radius:12px 12px 3px 12px; line-height:1.5;"),
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {message.content}
                  </div>
                ) : (
                  <div key={message.id} style={css("align-self:flex-start; max-width:90%;")}>
                    <div
                      style={{
                        ...css("background:oklch(0.98 0.003 260); border:1px solid oklch(0.93 0.006 260); font-size:13.5px; color:oklch(0.25 0.015 260); padding:12px 14px; border-radius:12px 12px 12px 3px; line-height:1.55;"),
                        whiteSpace: "pre-wrap",
                      }}
                    >
                      {linkifyText(message.content)}
                    </div>
                    {message.citations.length > 0 && (
                      <div style={css("display:flex; gap:6px; margin-top:7px; flex-wrap:wrap;")}>
                        {message.citations.map((c, i) => {
                          const pillStyle = {
                            ...css("font-family:'IBM Plex Mono'; font-size:10.5px; padding:3px 8px; border-radius:5px; text-decoration:none;"),
                            ...css(CITATION_STYLES[c.layer]),
                          };
                          const label = (
                            <>
                              {c.layer === "personal" ? "🔒" : "📎"} {c.label}
                            </>
                          );
                          return c.sourceUrl ? (
                            <a
                              key={i}
                              href={c.sourceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              title={c.provenance}
                              style={pillStyle}
                            >
                              {label}
                            </a>
                          ) : (
                            <span key={i} title={c.provenance} style={pillStyle}>
                              {label}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ),
              )}
              {ask.isPending && (
                <div style={css("align-self:flex-start; display:flex; align-items:center; gap:10px; font-size:13px; color:oklch(0.5 0.015 260);")}>
                  <Spinner size={16} /> Pulling this together…
                </div>
              )}
            </div>
            <div style={css("border-top:1px solid oklch(0.93 0.006 260); padding:12px; display:flex; gap:9px; align-items:flex-end;")}>
              <TextArea
                value={question}
                onChange={setQuestion}
                onEnter={submitQuestion}
                rows={2}
                placeholder="Ask about the interview loop, who you'll meet, what they value… (Shift+Enter for a new line)"
                ariaLabel="Ask about this company"
                style={{ flex: 1, resize: "vertical", minHeight: 44 }}
              />
              <PrimaryButton onClick={submitQuestion} disabled={!question.trim() || ask.isPending}>
                Ask
              </PrimaryButton>
            </div>
          </div>

          {ask.isError && (
            <div style={css("margin-top:10px; font-size:12.5px; color:oklch(0.5 0.14 25);")}>
              {ask.error instanceof Error ? ask.error.message : "That didn't go through."}
            </div>
          )}

          {saveDrafts.length > 0 && (
            <div style={css("margin-top:14px; border:1px solid oklch(0.9 0.006 260); border-radius:13px; padding:16px; background:#fff;")}>
              <div style={css("font-family:'Space Grotesk'; font-size:14px; font-weight:600; margin-bottom:6px;")}>Save to prep</div>
              <div style={css("font-size:12px; color:oklch(0.5 0.015 260); margin-bottom:12px; line-height:1.5;")}>
                Tick claims that are true. Saved privately. Mark “from my experience” only if you lived it — that can help corroborate the shared interview corpus.
              </div>
              <div style={css("display:flex; flex-direction:column; gap:10px;")}>
                {saveDrafts.map((draft, i) => (
                  <label key={i} style={css("display:flex; gap:10px; align-items:flex-start; font-size:13px; line-height:1.45;")}>
                    <input
                      type="checkbox"
                      checked={draft.selected}
                      onChange={(e) => {
                        const next = [...saveDrafts];
                        next[i] = { ...draft, selected: e.target.checked };
                        setSaveDrafts(next);
                      }}
                    />
                    <span style={css("flex:1;")}>
                      {draft.content}
                      <div style={css("margin-top:4px;")}>
                        <label style={css("font-size:11.5px; color:oklch(0.45 0.015 260); display:inline-flex; gap:6px; align-items:center;")}>
                          <input
                            type="checkbox"
                            checked={draft.fromExperience}
                            onChange={(e) => {
                              const next = [...saveDrafts];
                              next[i] = { ...draft, fromExperience: e.target.checked };
                              setSaveDrafts(next);
                            }}
                          />
                          From my real interview experience
                        </label>
                      </div>
                    </span>
                  </label>
                ))}
              </div>
              <div style={css("display:flex; gap:8px; margin-top:14px;")}>
                <PrimaryButton
                  onClick={submitSaveClaims}
                  disabled={!saveDrafts.some((d) => d.selected) || saveClaims.isPending}
                >
                  {saveClaims.isPending ? "Saving…" : "Save selected"}
                </PrimaryButton>
                <button
                  onClick={() => setSaveDrafts([])}
                  style={css("font-family:'IBM Plex Sans'; font-size:12.5px; color:oklch(0.5 0.015 260); background:none; border:none; cursor:pointer;")}
                >
                  Dismiss
                </button>
              </div>
              {saveClaims.isError && (
                <div style={css("margin-top:8px; font-size:12.5px; color:oklch(0.5 0.14 25);")}>
                  {saveClaims.error instanceof Error ? saveClaims.error.message : "Save failed."}
                </div>
              )}
            </div>
          )}
        </div>

        <div style={css("display:flex; flex-direction:column; gap:12px;")}>
          <div style={css("border:1px solid oklch(0.9 0.006 260); border-radius:13px; padding:16px; background:#fff;")}>
            <div style={css("display:flex; align-items:center; gap:8px; margin-bottom:4px;")}>
              <span style={css("width:9px;height:9px;border-radius:2px;background:oklch(0.55 0.15 255);")}></span>
              <span style={css("font-family:'Space Grotesk'; font-size:14px; font-weight:600;")}>Company layer</span>
            </div>
            <div style={css("font-size:11.5px; color:oklch(0.5 0.015 260); margin-bottom:12px;")}>
              Sources for {app.company}
              {app.companyDomain ? ` · ${app.companyDomain}` : ""}
            </div>

            {sources.data && sources.data.length > 0 ? (
              <div style={css("display:flex; flex-direction:column; gap:7px; margin-bottom:12px;")}>
                {sources.data.map((source) => {
                  // Added under a sibling role at this company. It grounds answers
                  // here because company-scope claims match any role, but it is not
                  // this role's to delete.
                  const inherited = source.applicationId !== app.id;
                  return (
                    <div key={source.id}>
                      <div style={css("display:flex; align-items:center; gap:9px; font-size:12.5px;")}>
                        {source.url ? (
                          <a href={source.url} target="_blank" rel="noopener" style={css("overflow:hidden; text-overflow:ellipsis; white-space:nowrap;")}>
                            {source.title ?? source.url}
                          </a>
                        ) : (
                          <span style={css("overflow:hidden; text-overflow:ellipsis; white-space:nowrap;")}>
                            {source.title ?? source.inputKind}
                          </span>
                        )}
                        {inherited && (
                          <span
                            title={`Added on another ${app.company} role, scoped to the whole company`}
                            style={css("font-family:'IBM Plex Mono'; font-size:9px; padding:2px 5px; border-radius:4px; background:oklch(0.55 0.15 255 / 0.1); color:oklch(0.4 0.13 255); flex:0 0 auto;")}
                          >
                            company-wide
                          </span>
                        )}
                        <span style={css("margin-left:auto; font-family:'IBM Plex Mono'; font-size:9.5px; color:oklch(0.55 0.015 260); flex:0 0 auto;")}>
                          {statusLabel(source.status, source.error)}
                        </span>
                        {!inherited && (
                          <button
                            onClick={() => deleteSource.mutate({ id: source.id, applicationId: app.id })}
                            aria-label={`Remove ${source.title ?? "source"}`}
                            style={css("background:none; border:none; color:oklch(0.6 0.015 260); cursor:pointer; font-size:14px; line-height:1; padding:0;")}
                          >
                            ×
                          </button>
                        )}
                      </div>
                      {source.status === "failed" && source.error && (
                        <div style={css("font-size:11px; color:oklch(0.5 0.14 25); margin-top:2px;")}>{source.error}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={css("font-size:12.5px; color:oklch(0.5 0.015 260); line-height:1.5; margin-bottom:12px;")}>
                You haven't added anything here yet. Paste notes, add a URL, or upload a PDF of
                Q&amp;As.
              </div>
            )}

            {sharedCount > 0 && (
              <div style={css("font-size:11.5px; color:oklch(0.5 0.015 260); line-height:1.5; margin-bottom:12px; padding:8px 10px; border-radius:8px; background:oklch(0.55 0.15 255 / 0.07);")}>
                Plus {sharedCount} shared claim{sharedCount === 1 ? "" : "s"} about {app.company}{" "}
                from other candidates. Answers can cite these; the uploads behind them stay
                private to whoever added them.
              </div>
            )}

            {pendingWarning && (
              <div style={css("margin-bottom:12px; padding:10px; border-radius:8px; background:oklch(0.65 0.11 85 / 0.12); border:1px solid oklch(0.65 0.11 85 / 0.35); font-size:12px; line-height:1.5;")}>
                <div style={css("font-weight:600; margin-bottom:4px;")}>{pendingWarning.reason}</div>
                <div style={css("margin-bottom:8px; color:oklch(0.4 0.06 75);")}>{pendingWarning.message}</div>
                <div style={css("display:flex; gap:8px;")}>
                  <PrimaryButton onClick={proceedDespiteWarning} disabled={confirmIngest.isPending} style={{ fontSize: "12px", padding: "7px 10px" }}>
                    Index anyway
                  </PrimaryButton>
                  <button
                    onClick={() => setPendingWarning(null)}
                    style={css("font-size:12px; background:none; border:none; cursor:pointer; color:oklch(0.5 0.015 260);")}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {addMode ? (
              <div style={css("display:flex; flex-direction:column; gap:8px;")}>
                <div style={css("display:flex; gap:8px; font-size:12px;")}>
                  <label style={css("display:flex; gap:5px; align-items:center;")}>
                    <input type="radio" checked={scope === "role"} onChange={() => setScope("role")} />
                    This role only
                  </label>
                  <label style={css("display:flex; gap:5px; align-items:center;")}>
                    <input type="radio" checked={scope === "company"} onChange={() => setScope("company")} />
                    Whole company
                  </label>
                </div>

                {addMode === "paste" && (
                  <TextArea
                    value={pasteText}
                    onChange={setPasteText}
                    rows={5}
                    placeholder="Paste interview notes or commonly asked Q&As…"
                    ariaLabel="Paste notes"
                  />
                )}
                {addMode === "url" && (
                  <TextInput
                    value={sourceUrl}
                    onChange={setSourceUrl}
                    placeholder={`A link about ${app.company}`}
                    autoFocus
                    ariaLabel="Source URL"
                  />
                )}
                {addMode === "pdf" && (
                  <input
                    ref={fileRef}
                    type="file"
                    accept="application/pdf"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void submitPdf(file);
                    }}
                  />
                )}

                <label style={css("display:flex; gap:8px; align-items:flex-start; font-size:11.5px; line-height:1.45; color:oklch(0.4 0.015 260);")}>
                  <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
                  <span>
                    I believe this is relevant to {app.company}
                    {scope === "role" ? ` · ${app.role}` : ""}. PrepFor.Me may use my own notes and
                    recaps to improve the product — not third-party page text.
                  </span>
                </label>

                <div style={css("display:flex; gap:8px;")}>
                  {addMode !== "pdf" && (
                    <PrimaryButton
                      onClick={() => (addMode === "paste" ? submitPaste() : submitUrl())}
                      disabled={
                        busy ||
                        !ack ||
                        (addMode === "url" ? !sourceUrl.trim() : pasteText.trim().length < 40)
                      }
                      style={{ flex: 1, fontSize: "12.5px", padding: "8px" }}
                    >
                      {busy ? "Indexing…" : "Index source"}
                    </PrimaryButton>
                  )}
                  <button
                    onClick={resetAddForm}
                    style={css("font-family:'IBM Plex Sans'; font-size:12.5px; color:oklch(0.5 0.015 260); background:none; border:none; cursor:pointer;")}
                  >
                    Cancel
                  </button>
                </div>
                {sourceError && (
                  <div style={css("font-size:12px; color:oklch(0.5 0.14 25);")}>{sourceError}</div>
                )}
              </div>
            ) : (
              <div style={css("display:flex; flex-direction:column; gap:8px;")}>
                <button
                  onClick={() => setAddMode("paste")}
                  style={css("width:100%; font-family:'IBM Plex Sans'; font-size:12.5px; font-weight:600; color:#fff; background:oklch(0.4 0.13 255); border:none; padding:10px; border-radius:8px; cursor:pointer;")}
                >
                  + Paste notes / Q&amp;As
                </button>
                <button
                  onClick={() => setAddMode("url")}
                  style={css("width:100%; font-family:'IBM Plex Sans'; font-size:12.5px; font-weight:600; color:oklch(0.4 0.13 255); background:oklch(0.55 0.15 255 / 0.08); border:1px dashed oklch(0.55 0.15 255 / 0.4); padding:9px; border-radius:8px; cursor:pointer;")}
                >
                  + Add a source URL
                </button>
                <button
                  onClick={() => setAddMode("pdf")}
                  style={css("width:100%; font-family:'IBM Plex Sans'; font-size:12.5px; font-weight:600; color:oklch(0.4 0.13 255); background:oklch(0.55 0.15 255 / 0.08); border:1px dashed oklch(0.55 0.15 255 / 0.4); padding:9px; border-radius:8px; cursor:pointer;")}
                >
                  + Upload a PDF
                </button>
              </div>
            )}
          </div>

          <div style={css("border:1px solid oklch(0.9 0.006 260); border-radius:13px; padding:16px; background:#fff;")}>
            <div style={css("display:flex; align-items:center; gap:8px; margin-bottom:4px;")}>
              <span style={css("width:9px;height:9px;border-radius:2px;background:oklch(0.55 0.13 300);")}></span>
              <span style={css("font-family:'Space Grotesk'; font-size:14px; font-weight:600;")}>Role &amp; level layer</span>
            </div>
            <div style={css("font-size:11.5px; color:oklch(0.5 0.015 260); margin-bottom:12px;")}>
              {app.role}
              {app.level ? ` · ${app.level}` : ""} — what this exact interview looks like
            </div>
            <div style={css("height:7px; border-radius:4px; background:oklch(0.93 0.006 260); overflow:hidden; margin-bottom:8px;")}>
              <div style={{ ...css("height:100%; background:oklch(0.55 0.13 300); transform-origin:left; animation:growBar .7s ease both;"), width: roleLayerBar }}></div>
            </div>
            <div style={css("font-size:12px; color:oklch(0.45 0.015 260);")}>{roleLayerText}</div>
          </div>

          <div style={css("border:1px solid oklch(0.55 0.13 145 / 0.3); border-radius:13px; padding:16px; background:oklch(0.55 0.13 145 / 0.04);")}>
            <div style={css("display:flex; align-items:center; gap:8px; margin-bottom:4px;")}>
              <span style={css("width:9px;height:9px;border-radius:2px;background:oklch(0.55 0.13 145);")}></span>
              <span style={css("font-family:'Space Grotesk'; font-size:14px; font-weight:600;")}>Personal layer</span>
              <span style={css("margin-left:auto; font-family:'IBM Plex Mono'; font-size:9.5px; color:oklch(0.4 0.09 150); background:oklch(0.55 0.13 145 / 0.14); padding:2px 7px; border-radius:100px;")}>PRIVATE</span>
            </div>
            <div style={css("font-size:11.5px; color:oklch(0.5 0.015 260); margin-bottom:12px;")}>Your own recaps — only you see these</div>
            <div style={css("font-family:'Space Grotesk'; font-size:22px; font-weight:600;")}>
              {app.recapCount} <span style={css("font-size:13px; font-weight:500; color:oklch(0.5 0.015 260);")}>folded in</span>
            </div>
            <button
              onClick={() => navigate(ROUTES.newRecap(app.id))}
              className="pressable"
              style={css("width:100%; margin-top:13px; font-family:'IBM Plex Sans'; font-size:13px; font-weight:600; color:#fff; background:oklch(0.5 0.13 150); border:none; padding:10px; border-radius:9px; cursor:pointer;")}
            >
              + Log a recap
            </button>
          </div>

          <div style={css("font-size:11px; color:oklch(0.5 0.015 260); line-height:1.5; padding:2px 4px;")}>
            Provenance on every answer. We store restated claims, not verbatim page text. Interview
            claims stay private until independently corroborated by candidates.
          </div>
        </div>
      </div>
    </div>
  );
}
