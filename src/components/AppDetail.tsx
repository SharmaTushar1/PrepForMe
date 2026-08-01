import type { ReactNode } from "react";
import { useApp } from "../store";
import { css } from "../css";
import { ACCENT, STAGES } from "../data";
import type { Tab } from "../types";

export function AppDetail() {
  const { state, selectedApp, apps, goApplications, advance, setTab, tailorNow, switchRoom, setChannel, togglePremium, incLimit, decLimit, goDebrief } = useApp();

  const tab = state.tab;
  const accent = ACCENT;

  // pipeline for the selected application
  const si = STAGES.indexOf(selectedApp.stage as (typeof STAGES)[number]);
  const pipeline = STAGES.map((name, i) => {
    const done = si >= 0 && i < si;
    const cur = i === si;
    return {
      name,
      bar: cur ? accent : done ? "oklch(0.55 0.15 255 / 0.4)" : "oklch(0.92 0.006 260)",
      fg: cur ? accent : done ? "oklch(0.4 0.02 260)" : "oklch(0.65 0.01 260)",
      weight: cur ? 600 : 400,
    };
  });

  const tabFg = (t: Tab) => (tab === t ? "#10151c" : "oklch(0.55 0.015 260)");
  const tabBar = (t: Tab) => (tab === t ? accent : "transparent");

  const tabButton = (t: Tab, label: ReactNode, tour?: string) => (
    <button
      onClick={() => setTab(t)}
      data-tour={tour}
      style={{
        ...css("font-family:'IBM Plex Sans'; font-size:13.5px; font-weight:600; border:none; background:none; padding:11px 14px; cursor:pointer;"),
        color: tabFg(t),
        borderBottom: `2px solid ${tabBar(t)}`,
      }}
    >
      {label}
    </button>
  );

  return (
    <div style={css("width:100%; animation:fadeIn .3s ease both;")}>
      {/* header */}
      <div style={css("padding:24px 40px 0; border-bottom:1px solid oklch(0.92 0.006 260); background:#fff;")}>
        <button onClick={goApplications} style={css("font-family:'IBM Plex Sans'; font-size:13px; color:oklch(0.5 0.015 260); background:none; border:none; cursor:pointer; padding:0; margin-bottom:16px;")}>← Applications</button>
        <div style={css("display:flex; align-items:flex-start; justify-content:space-between; gap:20px;")}>
          <div style={css("display:flex; align-items:center; gap:14px;")}>
            <div style={{ ...css("width:48px;height:48px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-family:'Space Grotesk';font-weight:700;font-size:19px;"), background: selectedApp.logoBg, color: selectedApp.logoFg }}>{selectedApp.initial}</div>
            <div>
              <h1 style={css("font-family:'Space Grotesk'; font-size:23px; font-weight:600; margin:0;")}>{selectedApp.role}</h1>
              <div style={css("font-size:14px; color:oklch(0.45 0.015 260); margin-top:3px;")}>{selectedApp.company} · <a href="#" style={css("font-size:13px;")}>View posting ↗</a></div>
            </div>
          </div>
          <div style={css("display:flex; align-items:center; gap:10px;")}>
            <div style={css("text-align:right;")}><div style={css("font-size:11.5px; color:oklch(0.5 0.015 260);")}>Current stage</div><div style={css("font-family:'Space Grotesk'; font-size:16px; font-weight:600; color:oklch(0.4 0.13 255);")}>{selectedApp.stage}</div></div>
            <button onClick={advance} data-tour="advance" style={css("font-family:'IBM Plex Sans'; font-size:13px; font-weight:600; color:#fff; background:oklch(0.55 0.15 255); border:none; padding:10px 15px; border-radius:9px; cursor:pointer;")}>Advance →</button>
          </div>
        </div>
        {/* pipeline */}
        <div style={css("display:flex; gap:6px; margin:22px 0 0;")}>
          {pipeline.map((st) => (
            <div key={st.name} style={css("flex:1; text-align:center;")}>
              <div style={{ height: "5px", borderRadius: "3px", background: st.bar }}></div>
              <div style={{ fontSize: "11px", marginTop: "7px", color: st.fg, fontWeight: st.weight }}>{st.name}</div>
            </div>
          ))}
        </div>
        {/* tabs */}
        <div data-tour="detail-tabs" style={css("display:flex; gap:4px; margin-top:20px;")}>
          {tabButton("materials", "Materials")}
          {tabButton("referrals", "Referrals", "tab-referrals")}
          {tabButton("prep", "Company prep", "tab-prep")}
          {tabButton("debriefs", <>Recaps <span style={css("font-family:'IBM Plex Mono'; font-size:10px;")}>{selectedApp.debriefs}</span></>, "tab-debriefs")}
        </div>
      </div>

      <div style={css("padding:28px 40px 60px; max-width:1000px;")}>
        {tab === "materials" && MaterialsTab({ tailoring: state.tailoring, onRetailor: tailorNow })}
        {tab === "referrals" && ReferralsTab()}
        {tab === "prep" && CompanyPrepTab()}
        {tab === "debriefs" && RecapsTab()}
      </div>
    </div>
  );

  // ---------- tabs (closures over hook values) ----------

  function MaterialsTab({ tailoring, onRetailor }: { tailoring: boolean; onRetailor: () => void }) {
    return (
      <div>
        <div style={css("display:flex; align-items:center; justify-content:space-between; margin-bottom:16px;")}>
          <h2 style={css("font-family:'Space Grotesk'; font-size:18px; font-weight:600; margin:0;")}>Tailored resume</h2>
          <button onClick={onRetailor} style={css("font-family:'IBM Plex Sans'; font-size:13px; font-weight:600; color:oklch(0.4 0.13 255); background:oklch(0.55 0.15 255 / 0.1); border:none; padding:9px 14px; border-radius:9px; cursor:pointer;")}>↻ Re-tailor</button>
        </div>

        {tailoring && (
          <div style={css("border:1px solid oklch(0.9 0.006 260); border-radius:12px; padding:40px; text-align:center; background:#fff;")}>
            <div style={css("width:26px;height:26px;border:3px solid oklch(0.55 0.15 255 / 0.3);border-top-color:oklch(0.55 0.15 255);border-radius:50%;animation:spin .8s linear infinite;margin:0 auto 16px;")}></div>
            <div style={css("font-weight:600; font-size:15px;")}>Reframing your real bullets for this role…</div>
            <div style={css("font-size:13px; color:oklch(0.5 0.015 260); margin-top:5px;")}>Matching against the JD. Nothing invented.</div>
          </div>
        )}

        {!tailoring && (
          <div>
            <div style={css("font-size:13px; color:oklch(0.45 0.015 260); margin-bottom:14px; background:oklch(0.55 0.13 145 / 0.06); border:1px solid oklch(0.55 0.13 145 / 0.2); border-radius:9px; padding:11px 14px;")}>✓ We re-emphasized your real work — here's exactly what changed and why. Nothing was fabricated.</div>
            <div style={css("display:flex; flex-direction:column; gap:12px; margin-bottom:32px;")}>
              <div style={css("border:1px solid oklch(0.9 0.006 260); border-radius:11px; overflow:hidden;")}>
                <div style={css("padding:13px 15px; background:oklch(0.55 0.13 25 / 0.05); font-size:13.5px; color:oklch(0.45 0.06 25); text-decoration:line-through; text-decoration-color:oklch(0.6 0.1 25 / 0.6);")}>Built internal tooling to reduce on-call load.</div>
                <div style={css("padding:13px 15px; background:oklch(0.55 0.13 145 / 0.06); font-size:13.5px; color:oklch(0.28 0.09 150);")}>Drove <strong>reliability</strong> across <strong>distributed systems</strong>, cutting on-call incidents 40%.</div>
                <div style={css("padding:9px 15px; font-size:11.5px; font-family:'IBM Plex Mono'; color:oklch(0.5 0.015 260); border-top:1px solid oklch(0.94 0.006 260);")}>↳ reframed to match the JD's "reliability at scale" language</div>
              </div>
              <div style={css("border:1px solid oklch(0.9 0.006 260); border-radius:11px; overflow:hidden;")}>
                <div style={css("padding:13px 15px; background:oklch(0.55 0.13 25 / 0.05); font-size:13.5px; color:oklch(0.45 0.06 25); text-decoration:line-through; text-decoration-color:oklch(0.6 0.1 25 / 0.6);")}>Managed a team building backend services.</div>
                <div style={css("padding:13px 15px; background:oklch(0.55 0.13 145 / 0.06); font-size:13.5px; color:oklch(0.28 0.09 150);")}>Led a 5-engineer team building <strong>fault-tolerant backend services in Go</strong>.</div>
                <div style={css("padding:9px 15px; font-size:11.5px; font-family:'IBM Plex Mono'; color:oklch(0.5 0.015 260); border-top:1px solid oklch(0.94 0.006 260);")}>↳ surfaced Go, which the role emphasizes and you actually used</div>
              </div>
            </div>

            {/* ATS gap */}
            <h2 style={css("font-family:'Space Grotesk'; font-size:18px; font-weight:600; margin:0 0 8px;")}>ATS keyword gap</h2>
            <p style={css("font-size:13px; color:oklch(0.5 0.015 260); margin:0 0 16px;")}>Keywords from the JD, checked against your resume.</p>
            <div style={css("display:grid; grid-template-columns:1fr 1fr; gap:16px;")}>
              <div style={css("border:1px solid oklch(0.9 0.006 260); border-radius:11px; padding:16px; background:#fff;")}>
                <div style={css("font-size:12.5px; font-weight:600; color:oklch(0.35 0.09 150); margin-bottom:12px;")}>✓ Already covered</div>
                <div style={css("display:flex; gap:7px; flex-wrap:wrap;")}>
                  <span style={css("font-size:12px; background:oklch(0.55 0.13 145 / 0.1); color:oklch(0.3 0.09 150); padding:5px 11px; border-radius:100px;")}>distributed systems</span>
                  <span style={css("font-size:12px; background:oklch(0.55 0.13 145 / 0.1); color:oklch(0.3 0.09 150); padding:5px 11px; border-radius:100px;")}>reliability</span>
                  <span style={css("font-size:12px; background:oklch(0.55 0.13 145 / 0.1); color:oklch(0.3 0.09 150); padding:5px 11px; border-radius:100px;")}>Go</span>
                  <span style={css("font-size:12px; background:oklch(0.55 0.13 145 / 0.1); color:oklch(0.3 0.09 150); padding:5px 11px; border-radius:100px;")}>mentorship</span>
                </div>
              </div>
              <div style={css("border:1px solid oklch(0.9 0.006 260); border-radius:11px; padding:16px; background:#fff;")}>
                <div style={css("font-size:12.5px; font-weight:600; color:oklch(0.45 0.1 40); margin-bottom:12px;")}>Genuinely missing</div>
                <div style={css("display:flex; flex-direction:column; gap:9px;")}>
                  <div style={css("display:flex; align-items:center; gap:9px;")}><span style={css("font-size:12px; background:oklch(0.55 0.13 40 / 0.1); color:oklch(0.45 0.1 40); padding:5px 11px; border-radius:100px;")}>payments infra</span><span style={css("font-size:12px; color:oklch(0.5 0.015 260);")}>worked on billing? surface it.</span></div>
                  <div style={css("display:flex; align-items:center; gap:9px;")}><span style={css("font-size:12px; background:oklch(0.55 0.13 40 / 0.1); color:oklch(0.45 0.1 40); padding:5px 11px; border-radius:100px;")}>gRPC</span><span style={css("font-size:12px; color:oklch(0.5 0.015 260);")}>only add if you've used it.</span></div>
                </div>
                <div style={css("font-size:11.5px; color:oklch(0.5 0.015 260); margin-top:14px; font-style:italic;")}>We won't stuff keywords you can't back up.</div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  function ReferralsTab() {
    const co = selectedApp.company;
    const invite = state.referralChannel === "invite";
    const rawPeople = [
      { name: "Jordan Lee", role: "Senior SWE · ex-Acme Cloud", tag: "Shared background", h: 285, note: `Hi Jordan — fellow ex-Acme engineer here. I'm exploring a Staff SWE role at ${co} and would value a quick read on the team. Open to connecting?` },
      { name: "Priya Nair", role: "Staff Engineer, Payments", tag: "Same problem space", h: 255, note: `Hi Priya — your work on payments idempotency is right where I'm headed. I'm applying for a Staff SWE role at ${co} and would value your perspective.` },
      { name: "Marco Ruiz", role: "Engineering Manager, Reliability", tag: "Team you'd join", h: 150, note: `Hi Marco — I lead reliability work in Go and am eyeing a Staff SWE role at ${co}. Would appreciate connecting and a quick sense of the team.` },
    ];
    const referralPeople = rawPeople.map((p) => {
      const over = invite && p.note.length > state.charLimit;
      return {
        ...p,
        initial: p.name[0],
        logoBg: `oklch(0.55 0.14 ${p.h} / 0.14)`,
        logoFg: `oklch(0.42 0.13 ${p.h})`,
        counterText: invite
          ? `${p.note.length} / ${state.charLimit}${over ? " · over" : ""}`
          : `${p.note.length} chars · send after they accept`,
        counterColor: over ? "oklch(0.55 0.18 25)" : "oklch(0.5 0.015 260)",
        noteBorder: over ? "oklch(0.6 0.16 25 / 0.4)" : "oklch(0.92 0.006 260)",
        copy: () => {
          try {
            navigator.clipboard.writeText(p.note);
          } catch {
            /* noop */
          }
        },
        openLI: () => {
          try {
            window.open("https://www.linkedin.com/search/results/people/?keywords=" + encodeURIComponent(p.name + " " + co), "_blank");
          } catch {
            /* noop */
          }
        },
      };
    });
    const linkedinUrl =
      "https://www.linkedin.com/search/results/people/?keywords=" +
      encodeURIComponent(co + " software engineer") +
      "&network=%5B%22S%22%5D&origin=FACETED_SEARCH";
    const capLabel = (state.premium ? "300" : "200") + " max · " + (state.premium ? "Premium invite" : "free invite");

    return (
      <div>
        <h2 style={css("font-family:'Space Grotesk'; font-size:18px; font-weight:600; margin:0 0 4px;")}>Ask for a referral before you apply</h2>
        <p style={css("font-size:13px; color:oklch(0.5 0.015 260); margin:0 0 16px; max-width:640px;")}>A warm intro beats a cold application. We draft a personalized note for each person based on their background and yours — you review, then send it yourself on LinkedIn.</p>

        <div style={css("background:oklch(0.55 0.13 145 / 0.06); border:1px solid oklch(0.55 0.13 145 / 0.22); border-radius:10px; padding:12px 15px; margin-bottom:22px; font-size:12.5px; color:oklch(0.3 0.08 150); line-height:1.5;")}>🛡 Small-batch and opt-in by design. Job Copilot never mass-messages, never scrapes contacts, and never sends on your behalf — it opens LinkedIn and hands you the draft.</div>

        {/* settings */}
        <div style={css("border:1px solid oklch(0.9 0.006 260); border-radius:13px; padding:18px; background:#fff; margin-bottom:16px; display:flex; gap:28px; align-items:center; flex-wrap:wrap;")}>
          <div>
            <div style={css("font-size:12px; color:oklch(0.5 0.015 260); margin-bottom:8px;")}>How you'll reach out</div>
            <div style={css("display:flex; background:oklch(0.96 0.004 260); border:1px solid oklch(0.9 0.006 260); border-radius:9px; padding:3px;")}>
              <button onClick={() => setChannel("invite")} style={{ ...css("font-family:'IBM Plex Sans'; font-size:12.5px; font-weight:600; border:none; padding:8px 13px; border-radius:7px; cursor:pointer;"), background: invite ? accent : "#fff", color: invite ? "#fff" : "oklch(0.4 0.015 260)" }}>Personalized invite</button>
              <button onClick={() => setChannel("message")} style={{ ...css("font-family:'IBM Plex Sans'; font-size:12.5px; font-weight:600; border:none; padding:8px 13px; border-radius:7px; cursor:pointer;"), background: !invite ? accent : "#fff", color: !invite ? "#fff" : "oklch(0.4 0.015 260)" }}>Message after they accept</button>
            </div>
          </div>
          {invite && (
            <div style={css("display:flex; gap:28px; align-items:center;")}>
              <div>
                <div style={css("font-size:12px; color:oklch(0.5 0.015 260); margin-bottom:8px;")}>LinkedIn Premium</div>
                <div style={css("display:flex; align-items:center; gap:9px;")}>
                  <div onClick={togglePremium} style={{ ...css("width:38px; height:22px; border-radius:100px; display:flex; align-items:center; padding:2px; cursor:pointer; transition:all .15s;"), background: state.premium ? accent : "oklch(0.85 0.006 260)", justifyContent: state.premium ? "flex-end" : "flex-start" }}>
                    <span style={css("width:18px; height:18px; border-radius:50%; background:#fff;")}></span>
                  </div>
                  <span style={css("font-size:12px; color:oklch(0.5 0.015 260);")}>longer invites</span>
                </div>
              </div>
              <div>
                <div style={css("font-size:12px; color:oklch(0.5 0.015 260); margin-bottom:8px;")}>Character limit</div>
                <div style={css("display:flex; align-items:center; gap:10px;")}>
                  <button onClick={decLimit} style={css("width:28px; height:28px; border-radius:8px; border:1px solid oklch(0.9 0.006 260); background:#fff; cursor:pointer; font-size:16px; color:oklch(0.4 0.015 260);")}>−</button>
                  <span style={css("font-family:'Space Grotesk'; font-size:18px; font-weight:600; min-width:36px; text-align:center;")}>{state.charLimit}</span>
                  <button onClick={incLimit} style={css("width:28px; height:28px; border-radius:8px; border:1px solid oklch(0.9 0.006 260); background:#fff; cursor:pointer; font-size:16px; color:oklch(0.4 0.015 260);")}>+</button>
                  <span style={css("font-family:'IBM Plex Mono'; font-size:11px; color:oklch(0.55 0.015 260);")}>{capLabel}</span>
                </div>
              </div>
            </div>
          )}
          {!invite && (
            <div style={css("font-size:12.5px; color:oklch(0.5 0.015 260); max-width:340px; line-height:1.5;")}>No invite limit — send a full message once they accept your connection. We'll draft a longer version.</div>
          )}
        </div>

        {/* linkedin launcher */}
        <a href={linkedinUrl} target="_blank" rel="noopener" style={css("display:flex; align-items:center; gap:16px; border:1px solid oklch(0.55 0.15 255 / 0.35); background:linear-gradient(110deg, oklch(0.55 0.15 255 / 0.06), #fff 70%); border-radius:13px; padding:16px 18px; margin-bottom:22px; text-decoration:none;")}>
          <div style={css("width:42px; height:42px; border-radius:11px; background:oklch(0.5 0.13 255); color:#fff; display:flex; align-items:center; justify-content:center; font-family:'Space Grotesk'; font-weight:700; font-size:18px;")}>in</div>
          <div style={css("flex:1;")}>
            <div style={css("font-weight:600; font-size:14.5px; color:#10151c;")}>Open this search on LinkedIn</div>
            <div style={css("display:flex; gap:7px; margin-top:7px; flex-wrap:wrap;")}>
              <span style={css("font-family:'IBM Plex Mono'; font-size:11px; background:#fff; border:1px solid oklch(0.9 0.006 260); padding:3px 9px; border-radius:100px; color:oklch(0.4 0.015 260);")}>Company · {selectedApp.company}</span>
              <span style={css("font-family:'IBM Plex Mono'; font-size:11px; background:#fff; border:1px solid oklch(0.9 0.006 260); padding:3px 9px; border-radius:100px; color:oklch(0.4 0.015 260);")}>People · 2nd degree</span>
              <span style={css("font-family:'IBM Plex Mono'; font-size:11px; background:#fff; border:1px solid oklch(0.9 0.006 260); padding:3px 9px; border-radius:100px; color:oklch(0.4 0.015 260);")}>Filter · Engineering</span>
            </div>
          </div>
          <span style={css("font-family:'IBM Plex Sans'; font-size:13px; font-weight:600; color:#fff; background:oklch(0.5 0.13 255); padding:10px 15px; border-radius:9px;")}>Open ↗</span>
        </a>

        <div style={css("font-family:'IBM Plex Mono'; font-size:11px; letter-spacing:0.1em; text-transform:uppercase; color:oklch(0.5 0.02 260); margin-bottom:12px;")}>Suggested people · drafts ready</div>
        <div style={css("display:flex; flex-direction:column; gap:12px;")}>
          {referralPeople.map((p) => (
            <div key={p.name} style={css("border:1px solid oklch(0.9 0.006 260); border-radius:13px; padding:16px 18px; background:#fff;")}>
              <div style={css("display:flex; align-items:center; gap:12px; margin-bottom:12px;")}>
                <div style={{ ...css("width:38px; height:38px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-family:'Space Grotesk'; font-weight:700; font-size:15px;"), background: p.logoBg, color: p.logoFg }}>{p.initial}</div>
                <div style={css("flex:1;")}>
                  <div style={css("font-weight:600; font-size:14.5px;")}>{p.name}</div>
                  <div style={css("font-size:12.5px; color:oklch(0.5 0.015 260);")}>{p.role}</div>
                </div>
                <span style={css("font-size:11.5px; font-weight:600; background:oklch(0.55 0.15 255 / 0.1); color:oklch(0.4 0.13 255); padding:4px 10px; border-radius:100px;")}>{p.tag}</span>
              </div>
              <div style={{ ...css("border-radius:10px; padding:12px 14px; background:oklch(0.99 0.003 260); font-size:13px; color:oklch(0.28 0.015 260); line-height:1.55;"), border: `1px solid ${p.noteBorder}` }}>{p.note}</div>
              <div style={css("display:flex; align-items:center; gap:12px; margin-top:11px;")}>
                <span style={{ ...css("font-family:'IBM Plex Mono'; font-size:11.5px;"), color: p.counterColor }}>{p.counterText}</span>
                <span style={css("font-size:12px; color:oklch(0.55 0.015 260); font-style:italic;")}>tailored to their background</span>
                <div style={css("margin-left:auto; display:flex; gap:8px;")}>
                  <button onClick={p.copy} style={css("font-family:'IBM Plex Sans'; font-size:12.5px; font-weight:600; color:oklch(0.35 0.02 260); background:#fff; border:1px solid oklch(0.9 0.006 260); padding:8px 13px; border-radius:8px; cursor:pointer;")}>Copy note</button>
                  <button onClick={p.openLI} style={css("font-family:'IBM Plex Sans'; font-size:12.5px; font-weight:600; color:#fff; background:oklch(0.5 0.13 255); border:none; padding:8px 13px; border-radius:8px; cursor:pointer;")}>Open profile ↗</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  function CompanyPrepTab() {
    const depthScore = (selectedApp.sources || 0) + (selectedApp.debriefs || 0) * 2;
    const depthIndex =
      depthScore <= 0 ? 0 : depthScore <= 2 ? 1 : depthScore <= 5 ? 2 : depthScore <= 8 ? 3 : depthScore <= 12 ? 4 : 5;
    const depthLabels = ["Cold start", "Getting started", "Building", "Solid", "Deep", "Deep"];
    const depthSegs = [0, 1, 2, 3, 4].map((i) => ({ bg: i < depthIndex ? accent : "oklch(0.91 0.006 260)" }));
    const prepColdStart = (selectedApp.debriefs || 0) === 0 && (selectedApp.sources || 0) <= 2;
    const roleShallow = (selectedApp.debriefs || 0) === 0;
    const depthCaption = prepColdStart
      ? "Just getting started — deepens every time you log a recap."
      : "Deepening with every source and recap you add.";
    const roleLayerText = roleShallow
      ? "Shallow — general role guidance for now"
      : selectedApp.debriefs + " interview pattern" + (selectedApp.debriefs === 1 ? "" : "s") + " mapped";
    const roleLayerBar = roleShallow ? "16%" : Math.min(100, 32 + selectedApp.debriefs * 22) + "%";
    const justLeveledNow = state.justLeveled === selectedApp.id;
    const prepQ = "What should I expect in the first interview for this role?";
    const prepA =
      selectedApp.company +
      " usually opens with a " +
      selectedApp.role +
      " screen. Public info points to a values-first conversation, and your logged notes flag that they push for concrete, real examples — line up two or three stories that show impact.";
    const prepColdMsg =
      "This space is just getting started. It’s running on " +
      selectedApp.company +
      "’s public info plus general " +
      selectedApp.role +
      " guidance — useful today, and it deepens every time you log what you were asked.";

    return (
      <div>
        {/* prep-space scope header */}
        <div style={css("border:1px solid oklch(0.9 0.006 260); border-radius:14px; background:linear-gradient(120deg, oklch(0.55 0.15 255 / 0.05), #fff 62%); padding:18px 20px; margin-bottom:16px;")}>
          <div style={css("display:flex; align-items:flex-start; gap:14px;")}>
            <div style={{ ...css("width:44px; height:44px; border-radius:12px; display:flex; align-items:center; justify-content:center; font-family:'Space Grotesk'; font-weight:700; font-size:18px;"), background: selectedApp.logoBg, color: selectedApp.logoFg }}>{selectedApp.initial}</div>
            <div style={css("flex:1;")}>
              <div style={css("font-family:'IBM Plex Mono'; font-size:10.5px; letter-spacing:0.12em; text-transform:uppercase; color:oklch(0.5 0.02 260); margin-bottom:5px;")}>Briefing room</div>
              <div style={css("font-family:'Space Grotesk'; font-size:19px; font-weight:600; line-height:1.2;")}>{selectedApp.company} <span style={css("color:oklch(0.6 0.01 260);")}>·</span> {selectedApp.role} <span style={css("color:oklch(0.6 0.01 260);")}>·</span> {selectedApp.level}</div>
              <div style={css("font-size:12.5px; color:oklch(0.5 0.015 260); margin-top:4px;")}>One coach, fully briefed on this space — grounded in this company, for this exact role and level.</div>
            </div>
            <button onClick={goDebrief} style={css("font-family:'IBM Plex Sans'; font-size:13px; font-weight:600; color:#fff; background:oklch(0.55 0.15 255); border:none; padding:10px 15px; border-radius:9px; cursor:pointer; white-space:nowrap;")}>+ Log a recap</button>
          </div>
          {/* depth indicator */}
          <div style={css("margin-top:16px; padding-top:16px; border-top:1px solid oklch(0.93 0.006 260); display:flex; align-items:center; gap:16px;")}>
            <div style={css("display:flex; flex-direction:column; gap:6px;")}>
              <div style={css("display:flex; align-items:center; gap:9px;")}>
                <span style={css("font-family:'IBM Plex Mono'; font-size:11px; letter-spacing:0.06em; text-transform:uppercase; color:oklch(0.5 0.02 260);")}>Prep depth</span>
                <span style={css("font-family:'Space Grotesk'; font-size:13.5px; font-weight:600; color:oklch(0.4 0.13 255);")}>{depthLabels[depthIndex]}</span>
                {justLeveledNow && <span style={css("font-family:'IBM Plex Mono'; font-size:10.5px; font-weight:600; color:oklch(0.4 0.13 255); background:oklch(0.55 0.15 255 / 0.12); padding:3px 9px; border-radius:100px; animation:float 1.4s ease-in-out infinite;")}>✦ Just leveled up</span>}
              </div>
              <div style={css("display:flex; gap:4px;")}>
                {depthSegs.map((seg, i) => (
                  <span key={i} style={{ width: "38px", height: "7px", borderRadius: "3px", background: seg.bg, transition: "background .4s" }}></span>
                ))}
              </div>
            </div>
            <div style={css("font-size:12px; color:oklch(0.5 0.015 260); line-height:1.45; flex:1;")}>{depthCaption}</div>
          </div>
        </div>

        {/* briefing-room switcher */}
        <div style={css("margin-bottom:20px;")}>
          <div style={css("font-family:'IBM Plex Mono'; font-size:10.5px; letter-spacing:0.1em; text-transform:uppercase; color:oklch(0.5 0.02 260); margin-bottom:9px;")}>Switch briefing room · same coach, different dossier</div>
          <div style={css("display:flex; gap:9px; overflow-x:auto; padding-bottom:4px;")}>
            {apps.map((r) => {
              const active = r.id === selectedApp.id;
              return (
                <div key={r.id} onClick={() => switchRoom(r.id)} style={{ ...css("flex:0 0 auto; display:flex; align-items:center; gap:9px; border-radius:10px; padding:9px 13px; cursor:pointer; min-width:186px;"), background: active ? "oklch(0.55 0.15 255 / 0.08)" : "#fff", border: `1px solid ${active ? "oklch(0.55 0.15 255 / 0.45)" : "oklch(0.9 0.006 260)"}` }}>
                  <div style={{ ...css("width:26px; height:26px; border-radius:7px; display:flex; align-items:center; justify-content:center; font-family:'Space Grotesk'; font-weight:700; font-size:12px;"), background: r.logoBg, color: r.logoFg }}>{r.initial}</div>
                  <div style={css("min-width:0;")}><div style={css("font-size:12.5px; font-weight:600; white-space:nowrap;")}>{r.company}</div><div style={css("font-size:11px; color:oklch(0.5 0.015 260); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:130px;")}>{r.role}</div></div>
                </div>
              );
            })}
          </div>
        </div>

        <div style={css("display:grid; grid-template-columns:1.5fr 1fr; gap:20px;")}>
          {/* left: chat + derived */}
          <div>
            {prepColdStart && (
              <div style={css("background:oklch(0.65 0.11 85 / 0.09); border:1px solid oklch(0.65 0.11 85 / 0.3); border-radius:11px; padding:13px 15px; margin-bottom:14px; font-size:12.5px; color:oklch(0.4 0.06 75); line-height:1.5;")}>🌱 This space is just getting started — running on {selectedApp.company} public info plus general {selectedApp.role} guidance. Log your first recap and it deepens fast.</div>
            )}

            <div style={css("border:1px solid oklch(0.9 0.006 260); border-radius:13px; background:#fff; overflow:hidden;")}>
              <div style={css("padding:18px; display:flex; flex-direction:column; gap:14px; max-height:320px; overflow-y:auto;")}>
                <div style={css("align-self:flex-end; max-width:80%; background:oklch(0.55 0.15 255); color:#fff; font-size:13.5px; padding:10px 13px; border-radius:12px 12px 3px 12px;")}>{prepQ}</div>
                <div style={css("align-self:flex-start; max-width:90%;")}>
                  {!prepColdStart && (
                    <>
                      <div style={css("background:oklch(0.98 0.003 260); border:1px solid oklch(0.93 0.006 260); font-size:13.5px; color:oklch(0.25 0.015 260); padding:12px 14px; border-radius:12px 12px 12px 3px; line-height:1.55;")}>{prepA}</div>
                      <div style={css("display:flex; gap:6px; margin-top:7px; flex-wrap:wrap;")}>
                        <span style={css("font-family:'IBM Plex Mono'; font-size:10.5px; background:oklch(0.55 0.15 255 / 0.1); color:oklch(0.4 0.13 255); padding:3px 8px; border-radius:5px;")}>📎 Company info</span>
                        <span style={css("font-family:'IBM Plex Mono'; font-size:10.5px; background:oklch(0.55 0.13 300 / 0.12); color:oklch(0.42 0.13 300); padding:3px 8px; border-radius:5px;")}>📎 Role &amp; level</span>
                        <span style={css("font-family:'IBM Plex Mono'; font-size:10.5px; background:oklch(0.55 0.13 145 / 0.12); color:oklch(0.3 0.09 150); padding:3px 8px; border-radius:5px;")}>🔒 Your notes</span>
                      </div>
                    </>
                  )}
                  {prepColdStart && (
                    <>
                      <div style={css("background:oklch(0.98 0.003 260); border:1px solid oklch(0.93 0.006 260); font-size:13.5px; color:oklch(0.25 0.015 260); padding:12px 14px; border-radius:12px 12px 12px 3px; line-height:1.55;")}>{prepColdMsg}</div>
                      <div style={css("display:flex; gap:6px; margin-top:7px; flex-wrap:wrap;")}>
                        <span style={css("font-family:'IBM Plex Mono'; font-size:10.5px; background:oklch(0.55 0.15 255 / 0.1); color:oklch(0.4 0.13 255); padding:3px 8px; border-radius:5px;")}>📎 Company info</span>
                        <span style={css("font-family:'IBM Plex Mono'; font-size:10.5px; background:oklch(0.6 0.01 260 / 0.12); color:oklch(0.45 0.015 260); padding:3px 8px; border-radius:5px;")}>General role guidance</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
              <div style={css("border-top:1px solid oklch(0.93 0.006 260); padding:12px; display:flex; gap:9px;")}>
                <div style={css("flex:1; font-size:13.5px; color:oklch(0.55 0.015 260); background:oklch(0.98 0.003 260); border:1px solid oklch(0.92 0.006 260); border-radius:9px; padding:10px 13px;")}>Ask about the interview loop, who you'll meet, what they value…</div>
                <button style={css("font-family:'IBM Plex Sans'; font-size:13px; font-weight:600; color:#fff; background:oklch(0.55 0.15 255); border:none; padding:0 16px; border-radius:9px; cursor:pointer;")}>Ask</button>
              </div>
            </div>

            <div style={css("font-family:'IBM Plex Mono'; font-size:11px; letter-spacing:0.08em; text-transform:uppercase; color:oklch(0.5 0.02 260); margin:22px 0 12px;")}>Derived prep · likely themes</div>
            {!prepColdStart && (
              <div style={css("display:flex; gap:9px; flex-wrap:wrap;")}>
                <span style={css("font-size:13px; background:#fff; border:1px solid oklch(0.9 0.006 260); padding:8px 13px; border-radius:100px;")}>Interview loop &amp; who you'll meet</span>
                <span style={css("font-size:13px; background:#fff; border:1px solid oklch(0.9 0.006 260); padding:8px 13px; border-radius:100px;")}>What they value in this role</span>
                <span style={css("font-size:13px; background:#fff; border:1px solid oklch(0.9 0.006 260); padding:8px 13px; border-radius:100px;")}>Real-example / impact stories</span>
                <span style={css("font-size:13px; background:oklch(0.55 0.15 255 / 0.08); border:1px solid oklch(0.55 0.15 255 / 0.3); color:oklch(0.35 0.11 255); padding:8px 13px; border-radius:100px;")}>✦ new from your last recap</span>
              </div>
            )}
            {prepColdStart && (
              <div style={css("font-size:13px; color:oklch(0.5 0.015 260); line-height:1.55; background:#fff; border:1px dashed oklch(0.85 0.006 260); border-radius:11px; padding:14px;")}>General {selectedApp.role} themes are ready now. Specific, {selectedApp.level}-level patterns sharpen as you (and later, others) log debriefs — this isn't a limit, it's a starting line.</div>
            )}
          </div>

          {/* right: three knowledge layers */}
          <div style={css("display:flex; flex-direction:column; gap:12px;")}>
            <div style={css("border:1px solid oklch(0.9 0.006 260); border-radius:13px; padding:16px; background:#fff;")}>
              <div style={css("display:flex; align-items:center; gap:8px; margin-bottom:4px;")}><span style={css("width:9px;height:9px;border-radius:2px;background:oklch(0.55 0.15 255);")}></span><span style={css("font-family:'Space Grotesk'; font-size:14px; font-weight:600;")}>Company layer</span></div>
              <div style={css("font-size:11.5px; color:oklch(0.5 0.015 260); margin-bottom:12px;")}>Public first-party info · shared across every role at {selectedApp.company}</div>
              <div style={css("display:flex; flex-direction:column; gap:7px;")}>
                <div style={css("display:flex; align-items:center; gap:9px; font-size:12.5px;")}>Company blog <span style={css("margin-left:auto; font-family:'IBM Plex Mono'; font-size:10px; color:oklch(0.55 0.13 145);")}>✓</span></div>
                <div style={css("display:flex; align-items:center; gap:9px; font-size:12.5px;")}>Careers page <span style={css("margin-left:auto; font-family:'IBM Plex Mono'; font-size:10px; color:oklch(0.55 0.13 145);")}>✓</span></div>
                <div style={css("display:flex; align-items:center; gap:9px; font-size:12.5px;")}>Product &amp; docs <span style={css("margin-left:auto; font-family:'IBM Plex Mono'; font-size:10px; color:oklch(0.55 0.13 145);")}>✓</span></div>
                <div style={css("display:flex; align-items:center; gap:9px; font-size:12.5px;")}>Recent news &amp; funding <span style={css("margin-left:auto; font-family:'IBM Plex Mono'; font-size:10px; color:oklch(0.55 0.13 145);")}>✓</span></div>
              </div>
              <button style={css("width:100%; margin-top:13px; font-family:'IBM Plex Sans'; font-size:12.5px; font-weight:600; color:oklch(0.4 0.13 255); background:oklch(0.55 0.15 255 / 0.08); border:1px dashed oklch(0.55 0.15 255 / 0.4); padding:9px; border-radius:8px; cursor:pointer;")}>+ Add a source URL</button>
            </div>

            <div style={css("border:1px solid oklch(0.9 0.006 260); border-radius:13px; padding:16px; background:#fff;")}>
              <div style={css("display:flex; align-items:center; gap:8px; margin-bottom:4px;")}><span style={css("width:9px;height:9px;border-radius:2px;background:oklch(0.55 0.13 300);")}></span><span style={css("font-family:'Space Grotesk'; font-size:14px; font-weight:600;")}>Role &amp; level layer</span></div>
              <div style={css("font-size:11.5px; color:oklch(0.5 0.015 260); margin-bottom:12px;")}>{selectedApp.role} · {selectedApp.level} — what this exact interview looks like</div>
              <div style={css("height:7px; border-radius:4px; background:oklch(0.93 0.006 260); overflow:hidden; margin-bottom:8px;")}><div style={{ ...css("height:100%; background:oklch(0.55 0.13 300); transform-origin:left; animation:growBar .7s ease both;"), width: roleLayerBar }}></div></div>
              <div style={css("font-size:12px; color:oklch(0.45 0.015 260);")}>{roleLayerText}</div>
            </div>

            <div style={css("border:1px solid oklch(0.55 0.13 145 / 0.3); border-radius:13px; padding:16px; background:oklch(0.55 0.13 145 / 0.04);")}>
              <div style={css("display:flex; align-items:center; gap:8px; margin-bottom:4px;")}><span style={css("width:9px;height:9px;border-radius:2px;background:oklch(0.55 0.13 145);")}></span><span style={css("font-family:'Space Grotesk'; font-size:14px; font-weight:600;")}>Personal layer</span><span style={css("margin-left:auto; font-family:'IBM Plex Mono'; font-size:9.5px; color:oklch(0.4 0.09 150); background:oklch(0.55 0.13 145 / 0.14); padding:2px 7px; border-radius:100px;")}>🔒 PRIVATE</span></div>
              <div style={css("font-size:11.5px; color:oklch(0.5 0.015 260); margin-bottom:12px;")}>Your own recaps — only you see these</div>
              <div style={css("font-family:'Space Grotesk'; font-size:22px; font-weight:600;")}>{selectedApp.debriefs || 0} <span style={css("font-size:13px; font-weight:500; color:oklch(0.5 0.015 260);")}>folded in</span></div>
              <button onClick={goDebrief} style={css("width:100%; margin-top:13px; font-family:'IBM Plex Sans'; font-size:13px; font-weight:600; color:#fff; background:oklch(0.5 0.13 150); border:none; padding:10px; border-radius:9px; cursor:pointer;")}>+ Log a recap</button>
            </div>

            <div style={css("font-size:11px; color:oklch(0.5 0.015 260); line-height:1.5; padding:2px 4px;")}>Provenance on every answer — you always see whether it's public company info or drawn from your private notes.</div>
          </div>
        </div>
      </div>
    );
  }

  function RecapsTab() {
    return (
      <div>
        <div style={css("display:flex; align-items:center; justify-content:space-between; margin-bottom:16px;")}>
          <div><h2 style={css("font-family:'Space Grotesk'; font-size:18px; font-weight:600; margin:0;")}>Interview recaps</h2><p style={css("font-size:13px; color:oklch(0.5 0.015 260); margin:3px 0 0;")}>The highest-value data in the product. Each one deepens {selectedApp.company}'s prep.</p></div>
          <button onClick={goDebrief} style={css("font-family:'IBM Plex Sans'; font-size:13.5px; font-weight:600; color:#fff; background:oklch(0.55 0.15 255); border:none; padding:10px 15px; border-radius:9px; cursor:pointer;")}>+ Log a recap</button>
        </div>
        <div style={css("display:flex; flex-direction:column; gap:12px;")}>
          <div style={css("border:1px solid oklch(0.9 0.006 260); border-radius:11px; padding:16px; background:#fff;")}>
            <div style={css("display:flex; align-items:center; gap:10px; margin-bottom:8px;")}><span style={css("font-size:11.5px; font-weight:600; background:oklch(0.55 0.15 255 / 0.1); color:oklch(0.4 0.13 255); padding:3px 10px; border-radius:100px;")}>Technical · R2</span><span style={css("font-size:12px; color:oklch(0.55 0.015 260);")}>3 days ago · went well</span></div>
            <div style={css("font-size:13.5px; color:oklch(0.3 0.015 260); line-height:1.55;")}>"Design a rate limiter for the payments API." Deep on token-bucket vs sliding window; they cared about the distributed case.</div>
          </div>
          <div style={css("border:1px solid oklch(0.9 0.006 260); border-radius:11px; padding:16px; background:#fff;")}>
            <div style={css("display:flex; align-items:center; gap:10px; margin-bottom:8px;")}><span style={css("font-size:11.5px; font-weight:600; background:oklch(0.55 0.15 255 / 0.1); color:oklch(0.4 0.13 255); padding:3px 10px; border-radius:100px;")}>Screen · R1</span><span style={css("font-size:12px; color:oklch(0.55 0.015 260);")}>1 week ago · went well</span></div>
            <div style={css("font-size:13.5px; color:oklch(0.3 0.015 260); line-height:1.55;")}>Recruiter + hiring manager. Lots on reliability philosophy and how I've handled incidents. Behavioral, warm.</div>
          </div>
        </div>
      </div>
    );
  }
}
