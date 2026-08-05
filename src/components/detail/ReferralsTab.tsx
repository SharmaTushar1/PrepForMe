import { useEffect, useState } from "react";
import { css } from "../../css";
import { ACCENT } from "../../data";
import { ai, type ReferralDraft } from "../../lib/ai";
import { useProfileContext } from "../../data/profile";
import {
  CHAR_LIMIT_MIN,
  FREE_CHAR_LIMIT,
  PREMIUM_CHAR_LIMIT,
  useSettings,
  useUpdateSettings,
} from "../../data/settings";
import type { DecoratedApp } from "../../data/derived";
import { linkedinPeopleSearchUrl } from "../../lib/linkedinSearch";
import { Loading, Toggle } from "../ui";

export function ReferralsTab({ app }: { app: DecoratedApp }) {
  const context = useProfileContext();
  const { settings } = useSettings();
  const updateSettings = useUpdateSettings();

  const [drafts, setDrafts] = useState<ReferralDraft[] | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const invite = settings.referralChannel === "invite";
  const cap = invite ? settings.charLimit : undefined;

  useEffect(() => {
    let active = true;
    if (context.loading) return;
    ai.suggestReferrals({ application: app, context, charLimit: cap }).then((next) => {
      if (active) setDrafts(next);
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app.id, app.role, app.company, cap, context.loading, context.experiences]);

  const linkedinUrl = linkedinPeopleSearchUrl({
    company: app.company,
    role: app.role,
    specialty: app.specialty,
    linkedinCompanyId: app.linkedinCompanyId,
  });

  const capLabel = `${settings.linkedinPremium ? PREMIUM_CHAR_LIMIT : FREE_CHAR_LIMIT} max · ${
    settings.linkedinPremium ? "Premium invite" : "free invite"
  }`;

  const setLimit = (next: number) => {
    const ceiling = settings.linkedinPremium ? PREMIUM_CHAR_LIMIT : FREE_CHAR_LIMIT;
    updateSettings.mutate({ charLimit: Math.max(CHAR_LIMIT_MIN, Math.min(ceiling, next)) });
  };

  return (
    <div>
      <h2 style={css("font-family:'Space Grotesk'; font-size:18px; font-weight:600; margin:0 0 4px;")}>Ask for a referral before you apply</h2>
      <p style={css("font-size:13px; color:oklch(0.5 0.015 260); margin:0 0 16px; max-width:640px;")}>
        A warm intro beats a cold application. We draft a note grounded in your own experience — you
        review, then send it yourself on LinkedIn.
      </p>

      <div style={css("background:oklch(0.55 0.13 145 / 0.06); border:1px solid oklch(0.55 0.13 145 / 0.22); border-radius:10px; padding:12px 15px; margin-bottom:22px; font-size:12.5px; color:oklch(0.3 0.08 150); line-height:1.5;")}>
        🛡 Small-batch and opt-in by design. PrepFor.Me never mass-messages, never scrapes contacts,
        and never sends on your behalf — it opens LinkedIn and hands you the draft.
      </div>

      {/* channel + limits, persisted to your settings */}
      <div style={css("border:1px solid oklch(0.9 0.006 260); border-radius:13px; padding:18px; background:#fff; margin-bottom:16px; display:flex; gap:28px; align-items:center; flex-wrap:wrap;")}>
        <div>
          <div style={css("font-size:12px; color:oklch(0.5 0.015 260); margin-bottom:8px;")}>How you'll reach out</div>
          <div style={css("display:flex; background:oklch(0.96 0.004 260); border:1px solid oklch(0.9 0.006 260); border-radius:9px; padding:3px;")}>
            <button
              onClick={() => updateSettings.mutate({ referralChannel: "invite" })}
              style={{ ...css("font-family:'IBM Plex Sans'; font-size:12.5px; font-weight:600; border:none; padding:8px 13px; border-radius:7px; cursor:pointer;"), background: invite ? ACCENT : "#fff", color: invite ? "#fff" : "oklch(0.4 0.015 260)" }}
            >
              Personalized invite
            </button>
            <button
              onClick={() => updateSettings.mutate({ referralChannel: "message" })}
              style={{ ...css("font-family:'IBM Plex Sans'; font-size:12.5px; font-weight:600; border:none; padding:8px 13px; border-radius:7px; cursor:pointer;"), background: !invite ? ACCENT : "#fff", color: !invite ? "#fff" : "oklch(0.4 0.015 260)" }}
            >
              Message after they accept
            </button>
          </div>
        </div>

        {invite ? (
          <div style={css("display:flex; gap:28px; align-items:center;")}>
            <div>
              <div style={css("font-size:12px; color:oklch(0.5 0.015 260); margin-bottom:8px;")}>LinkedIn Premium</div>
              <div style={css("display:flex; align-items:center; gap:9px;")}>
                <Toggle
                  on={settings.linkedinPremium}
                  label="LinkedIn Premium"
                  onToggle={() => {
                    const on = !settings.linkedinPremium;
                    updateSettings.mutate({
                      linkedinPremium: on,
                      charLimit: on
                        ? settings.charLimit
                        : Math.min(settings.charLimit, FREE_CHAR_LIMIT),
                    });
                  }}
                />
                <span style={css("font-size:12px; color:oklch(0.5 0.015 260);")}>longer invites</span>
              </div>
            </div>
            <div>
              <div style={css("font-size:12px; color:oklch(0.5 0.015 260); margin-bottom:8px;")}>Character limit</div>
              <div style={css("display:flex; align-items:center; gap:10px;")}>
                <button
                  onClick={() => setLimit(settings.charLimit - 20)}
                  aria-label="Decrease character limit"
                  style={css("width:28px; height:28px; border-radius:8px; border:1px solid oklch(0.9 0.006 260); background:#fff; cursor:pointer; font-size:16px; color:oklch(0.4 0.015 260);")}
                >
                  −
                </button>
                <span style={css("font-family:'Space Grotesk'; font-size:18px; font-weight:600; min-width:36px; text-align:center;")}>{settings.charLimit}</span>
                <button
                  onClick={() => setLimit(settings.charLimit + 20)}
                  aria-label="Increase character limit"
                  style={css("width:28px; height:28px; border-radius:8px; border:1px solid oklch(0.9 0.006 260); background:#fff; cursor:pointer; font-size:16px; color:oklch(0.4 0.015 260);")}
                >
                  +
                </button>
                <span style={css("font-family:'IBM Plex Mono'; font-size:11px; color:oklch(0.55 0.015 260);")}>{capLabel}</span>
              </div>
            </div>
          </div>
        ) : (
          <div style={css("font-size:12.5px; color:oklch(0.5 0.015 260); max-width:340px; line-height:1.5;")}>
            No invite limit — send a full message once they accept your connection. We'll draft a
            longer version.
          </div>
        )}
      </div>

      <a
        href={linkedinUrl}
        target="_blank"
        rel="noopener"
        style={css("display:flex; align-items:center; gap:16px; border:1px solid oklch(0.55 0.15 255 / 0.35); background:linear-gradient(110deg, oklch(0.55 0.15 255 / 0.06), #fff 70%); border-radius:13px; padding:16px 18px; margin-bottom:22px; text-decoration:none;")}
      >
        <div style={css("width:42px; height:42px; border-radius:11px; background:oklch(0.5 0.13 255); color:#fff; display:flex; align-items:center; justify-content:center; font-family:'Space Grotesk'; font-weight:700; font-size:18px;")}>in</div>
        <div style={css("flex:1;")}>
          <div style={css("font-weight:600; font-size:14.5px; color:#10151c;")}>Open this search on LinkedIn</div>
          <div style={css("display:flex; gap:7px; margin-top:7px; flex-wrap:wrap;")}>
            <span style={css("font-family:'IBM Plex Mono'; font-size:11px; background:#fff; border:1px solid oklch(0.9 0.006 260); padding:3px 9px; border-radius:100px; color:oklch(0.4 0.015 260);")}>Company · {app.company}</span>
            <span style={css("font-family:'IBM Plex Mono'; font-size:11px; background:#fff; border:1px solid oklch(0.9 0.006 260); padding:3px 9px; border-radius:100px; color:oklch(0.4 0.015 260);")}>People · 2nd degree</span>
            <span style={css("font-family:'IBM Plex Mono'; font-size:11px; background:#fff; border:1px solid oklch(0.9 0.006 260); padding:3px 9px; border-radius:100px; color:oklch(0.4 0.015 260);")}>Role · {app.role}</span>
          </div>
        </div>
        <span style={css("font-family:'IBM Plex Sans'; font-size:13px; font-weight:600; color:#fff; background:oklch(0.5 0.13 255); padding:10px 15px; border-radius:9px;")}>Open ↗</span>
      </a>

      <div style={css("font-family:'IBM Plex Mono'; font-size:11px; letter-spacing:0.1em; text-transform:uppercase; color:oklch(0.5 0.02 260); margin-bottom:6px;")}>Who to reach out to · drafts ready</div>
      <p style={css("font-size:12px; color:oklch(0.55 0.015 260); margin:0 0 12px; line-height:1.5;")}>
        We don't have a people graph yet, so these are the three angles worth taking — find the
        actual person through the search above and the draft is ready to go.
      </p>

      {drafts === null ? (
        <Loading label="Drafting notes…" />
      ) : (
        <div style={css("display:flex; flex-direction:column; gap:12px;")}>
          {drafts.map((person) => {
            const over = invite && person.note.length > settings.charLimit;
            return (
              <div key={person.tag} style={css("border:1px solid oklch(0.9 0.006 260); border-radius:13px; padding:16px 18px; background:#fff;")}>
                <div style={css("display:flex; align-items:center; gap:12px; margin-bottom:12px;")}>
                  <div style={css("width:38px; height:38px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:16px; background:oklch(0.55 0.14 255 / 0.12);")}>👤</div>
                  <div style={css("flex:1;")}>
                    <div style={css("font-weight:600; font-size:14.5px;")}>{person.name}</div>
                    <div style={css("font-size:12.5px; color:oklch(0.5 0.015 260);")}>{person.role}</div>
                  </div>
                  <span style={css("font-size:11.5px; font-weight:600; background:oklch(0.55 0.15 255 / 0.1); color:oklch(0.4 0.13 255); padding:4px 10px; border-radius:100px;")}>{person.tag}</span>
                </div>
                <div
                  style={{
                    ...css("border-radius:10px; padding:12px 14px; background:oklch(0.99 0.003 260); font-size:13px; color:oklch(0.28 0.015 260); line-height:1.55;"),
                    border: `1px solid ${over ? "oklch(0.6 0.16 25 / 0.4)" : "oklch(0.92 0.006 260)"}`,
                  }}
                >
                  {person.note}
                </div>
                <div style={css("display:flex; align-items:center; gap:12px; margin-top:11px; flex-wrap:wrap;")}>
                  <span
                    style={{
                      ...css("font-family:'IBM Plex Mono'; font-size:11.5px;"),
                      color: over ? "oklch(0.55 0.18 25)" : "oklch(0.5 0.015 260)",
                    }}
                  >
                    {invite
                      ? `${person.note.length} / ${settings.charLimit}${over ? " · over" : ""}`
                      : `${person.note.length} chars · send after they accept`}
                  </span>
                  <div style={css("margin-left:auto; display:flex; gap:8px;")}>
                    <button
                      onClick={() => {
                        navigator.clipboard?.writeText(person.note).then(
                          () => setCopied(person.tag),
                          () => setCopied(null),
                        );
                      }}
                      className="pressable"
                      style={css("font-family:'IBM Plex Sans'; font-size:12.5px; font-weight:600; color:oklch(0.35 0.02 260); background:#fff; border:1px solid oklch(0.9 0.006 260); padding:8px 13px; border-radius:8px; cursor:pointer;")}
                    >
                      {copied === person.tag ? "Copied ✓" : "Copy note"}
                    </button>
                    <a
                      href={linkedinUrl}
                      target="_blank"
                      rel="noopener"
                      style={css("font-family:'IBM Plex Sans'; font-size:12.5px; font-weight:600; color:#fff; background:oklch(0.5 0.13 255); padding:8px 13px; border-radius:8px; text-decoration:none;")}
                    >
                      Find on LinkedIn ↗
                    </a>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
