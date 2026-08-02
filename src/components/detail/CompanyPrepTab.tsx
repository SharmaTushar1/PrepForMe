import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../../store";
import { css } from "../../css";
import { ACCENT } from "../../data";
import { DEPTH_SEGMENTS } from "../../lib/depth";
import { ROUTES } from "../../routes";
import { useProfileContext } from "../../data/profile";
import { useRecaps } from "../../data/recaps";
import {
  useAddPrepSource,
  useAskPrep,
  useDeletePrepSource,
  usePrepMessages,
  usePrepSources,
} from "../../data/prep";
import type { DecoratedApp } from "../../data/derived";
import type { PrepCitation } from "../../types";
import { PrimaryButton, Spinner, TextInput } from "../ui";

const CITATION_STYLES: Record<PrepCitation["layer"], string> = {
  company: "background:oklch(0.55 0.15 255 / 0.1); color:oklch(0.4 0.13 255);",
  role: "background:oklch(0.55 0.13 300 / 0.12); color:oklch(0.42 0.13 300);",
  personal: "background:oklch(0.55 0.13 145 / 0.12); color:oklch(0.3 0.09 150);",
  general: "background:oklch(0.6 0.01 260 / 0.12); color:oklch(0.45 0.015 260);",
};

export function CompanyPrepTab({ app, apps }: { app: DecoratedApp; apps: DecoratedApp[] }) {
  const { state, clearLeveled } = useApp();
  const navigate = useNavigate();
  const context = useProfileContext();

  const sources = usePrepSources(app.id);
  const messages = usePrepMessages(app.id);
  const recaps = useRecaps(app.id);
  const addSource = useAddPrepSource();
  const deleteSource = useDeletePrepSource();
  const ask = useAskPrep();

  const [sourceUrl, setSourceUrl] = useState("");
  const [addingSource, setAddingSource] = useState(false);
  const [question, setQuestion] = useState("");

  const coldStart = app.recapCount === 0 && app.sourceCount <= 2;
  const roleShallow = app.recapCount === 0;
  const roleLayerText = roleShallow
    ? "Shallow — general role guidance for now"
    : `${app.recapCount} interview pattern${app.recapCount === 1 ? "" : "s"} mapped`;
  const roleLayerBar = roleShallow ? "16%" : `${Math.min(100, 32 + app.recapCount * 22)}%`;
  const justLeveledNow = state.justLeveled === app.id;

  // The badge is a moment, not a state — retire it once it's been seen.
  useEffect(() => {
    if (!justLeveledNow) return;
    const timer = window.setTimeout(clearLeveled, 6000);
    return () => window.clearTimeout(timer);
  }, [justLeveledNow, clearLeveled]);

  async function submitSource() {
    const url = sourceUrl.trim();
    if (!url) return;
    await addSource.mutateAsync({ applicationId: app.id, url });
    setSourceUrl("");
    setAddingSource(false);
  }

  async function submitQuestion() {
    const q = question.trim();
    if (!q || ask.isPending) return;
    setQuestion("");
    await ask.mutateAsync({
      question: q,
      application: app,
      context,
      recaps: recaps.data ?? [],
      sourceCount: app.sourceCount,
    });
  }

  return (
    <div>
      {/* prep-space scope header */}
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
            {app.recapCount === 1 ? "" : "s"} —{" "}
            {coldStart
              ? "just getting started, and it deepens every time you log a recap."
              : "deepening with every source and recap you add."}
          </div>
        </div>
      </div>

      {/* briefing-room switcher */}
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
                    background: active ? "oklch(0.55 0.15 255 / 0.08)" : "#fff",
                    border: `1px solid ${active ? "oklch(0.55 0.15 255 / 0.45)" : "oklch(0.9 0.006 260)"}`,
                  }}
                >
                  <div style={{ ...css("width:26px; height:26px; border-radius:7px; display:flex; align-items:center; justify-content:center; font-family:'Space Grotesk'; font-weight:700; font-size:12px;"), background: room.logoBg, color: room.logoFg }}>{room.initial}</div>
                  <div style={css("min-width:0;")}>
                    <div style={css("font-size:12.5px; font-weight:600; white-space:nowrap;")}>{room.company}</div>
                    <div style={css("font-size:11px; color:oklch(0.5 0.015 260); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:130px;")}>{room.role}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div style={css("display:grid; grid-template-columns:1.5fr 1fr; gap:20px;")}>
        {/* left: the conversation */}
        <div>
          {coldStart && (
            <div style={css("background:oklch(0.65 0.11 85 / 0.09); border:1px solid oklch(0.65 0.11 85 / 0.3); border-radius:11px; padding:13px 15px; margin-bottom:14px; font-size:12.5px; color:oklch(0.4 0.06 75); line-height:1.5;")}>
              🌱 This space is just getting started — it's running on general {app.role} guidance. Add a
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
                  <div key={message.id} style={css("align-self:flex-end; max-width:80%; background:oklch(0.55 0.15 255); color:#fff; font-size:13.5px; padding:10px 13px; border-radius:12px 12px 3px 12px; line-height:1.5;")}>
                    {message.content}
                  </div>
                ) : (
                  <div key={message.id} style={css("align-self:flex-start; max-width:90%;")}>
                    <div style={css("background:oklch(0.98 0.003 260); border:1px solid oklch(0.93 0.006 260); font-size:13.5px; color:oklch(0.25 0.015 260); padding:12px 14px; border-radius:12px 12px 12px 3px; line-height:1.55;")}>
                      {message.content}
                    </div>
                    {message.citations.length > 0 && (
                      <div style={css("display:flex; gap:6px; margin-top:7px; flex-wrap:wrap;")}>
                        {message.citations.map((c, i) => (
                          <span
                            key={i}
                            style={{
                              ...css("font-family:'IBM Plex Mono'; font-size:10.5px; padding:3px 8px; border-radius:5px;"),
                              ...css(CITATION_STYLES[c.layer]),
                            }}
                          >
                            {c.layer === "personal" ? "🔒" : "📎"} {c.label}
                          </span>
                        ))}
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
            <div style={css("border-top:1px solid oklch(0.93 0.006 260); padding:12px; display:flex; gap:9px;")}>
              <TextInput
                value={question}
                onChange={setQuestion}
                onEnter={submitQuestion}
                placeholder="Ask about the interview loop, who you'll meet, what they value…"
                ariaLabel="Ask about this company"
                style={{ flex: 1 }}
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
        </div>

        {/* right: the three knowledge layers */}
        <div style={css("display:flex; flex-direction:column; gap:12px;")}>
          <div style={css("border:1px solid oklch(0.9 0.006 260); border-radius:13px; padding:16px; background:#fff;")}>
            <div style={css("display:flex; align-items:center; gap:8px; margin-bottom:4px;")}>
              <span style={css("width:9px;height:9px;border-radius:2px;background:oklch(0.55 0.15 255);")}></span>
              <span style={css("font-family:'Space Grotesk'; font-size:14px; font-weight:600;")}>Company layer</span>
            </div>
            <div style={css("font-size:11.5px; color:oklch(0.5 0.015 260); margin-bottom:12px;")}>
              Sources you've pointed us at for {app.company}
            </div>

            {sources.data && sources.data.length > 0 ? (
              <div style={css("display:flex; flex-direction:column; gap:7px;")}>
                {sources.data.map((source) => (
                  <div key={source.id} style={css("display:flex; align-items:center; gap:9px; font-size:12.5px;")}>
                    <a
                      href={source.url ?? undefined}
                      target="_blank"
                      rel="noopener"
                      style={css("overflow:hidden; text-overflow:ellipsis; white-space:nowrap;")}
                    >
                      {source.title ?? source.url}
                    </a>
                    <span style={css("margin-left:auto; font-family:'IBM Plex Mono'; font-size:9.5px; color:oklch(0.55 0.015 260); flex:0 0 auto;")}>
                      {source.status === "indexed" ? "✓ indexed" : "queued"}
                    </span>
                    <button
                      onClick={() => deleteSource.mutate({ id: source.id, applicationId: app.id })}
                      aria-label={`Remove ${source.title ?? "source"}`}
                      style={css("background:none; border:none; color:oklch(0.6 0.015 260); cursor:pointer; font-size:14px; line-height:1; padding:0;")}
                    >
                      ×
                    </button>
                  </div>
                ))}
                <div style={css("font-size:11px; color:oklch(0.55 0.015 260); line-height:1.5; margin-top:4px;")}>
                  Fetching and indexing page content isn't live yet, so these are saved and counted,
                  not read.
                </div>
              </div>
            ) : (
              <div style={css("font-size:12.5px; color:oklch(0.5 0.015 260); line-height:1.5;")}>
                Nothing here yet. Add the company blog, their careers page, or a recent post.
              </div>
            )}

            {addingSource ? (
              <div style={css("margin-top:13px; display:flex; flex-direction:column; gap:8px;")}>
                <TextInput
                  value={sourceUrl}
                  onChange={setSourceUrl}
                  onEnter={submitSource}
                  placeholder={`A link about ${app.company} — blog, careers page, news`}
                  autoFocus
                  ariaLabel="Source URL"
                />
                <div style={css("display:flex; gap:8px;")}>
                  <PrimaryButton
                    onClick={submitSource}
                    disabled={!sourceUrl.trim() || addSource.isPending}
                    style={{ flex: 1, fontSize: "12.5px", padding: "8px" }}
                  >
                    {addSource.isPending ? "Adding…" : "Add source"}
                  </PrimaryButton>
                  <button
                    onClick={() => {
                      setAddingSource(false);
                      setSourceUrl("");
                    }}
                    style={css("font-family:'IBM Plex Sans'; font-size:12.5px; color:oklch(0.5 0.015 260); background:none; border:none; cursor:pointer;")}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setAddingSource(true)}
                style={css("width:100%; margin-top:13px; font-family:'IBM Plex Sans'; font-size:12.5px; font-weight:600; color:oklch(0.4 0.13 255); background:oklch(0.55 0.15 255 / 0.08); border:1px dashed oklch(0.55 0.15 255 / 0.4); padding:9px; border-radius:8px; cursor:pointer;")}
              >
                + Add a source URL
              </button>
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
              <span style={css("margin-left:auto; font-family:'IBM Plex Mono'; font-size:9.5px; color:oklch(0.4 0.09 150); background:oklch(0.55 0.13 145 / 0.14); padding:2px 7px; border-radius:100px;")}>🔒 PRIVATE</span>
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
            Provenance on every answer — you always see whether it came from company sources or from
            your private notes.
          </div>
        </div>
      </div>
    </div>
  );
}
