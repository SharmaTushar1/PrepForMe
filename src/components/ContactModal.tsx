import { useState } from "react";
import { useApp } from "../store";
import { css } from "../css";
import { PrimaryButton, TextArea } from "./ui";

const TOPICS = ["General", "Billing", "Bug report", "Privacy"] as const;
type Topic = (typeof TOPICS)[number];

const SUPPORT_EMAIL = "help@prepfor.me";

export function ContactModal() {
  const { state, closeContact, sendContact } = useApp();
  const [topic, setTopic] = useState<Topic>("General");
  const [message, setMessage] = useState("");

  /**
   * There's no ticketing backend yet, so rather than pretend a message was
   * filed, we hand the draft to the user's mail client and say so.
   */
  function send() {
    if (!message.trim()) return;
    const href = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
      `[${topic}] PrepFor.Me`,
    )}&body=${encodeURIComponent(message.trim())}`;
    window.location.href = href;
    sendContact();
  }

  return (
    <div onClick={closeContact} style={css("position:fixed; inset:0; background:oklch(0.15 0.02 260 / 0.45); backdrop-filter:blur(3px); z-index:80; display:flex; align-items:center; justify-content:center; padding:20px;")}>
      <div onClick={(e) => e.stopPropagation()} style={css("width:480px; max-width:100%; background:#fff; border-radius:18px; box-shadow:0 40px 90px -34px oklch(0.2 0.05 260 / 0.7); animation:fadeUp .3s ease both; overflow:hidden;")}>
        {!state.contactSent && (
          <div style={css("padding:26px;")}>
            <div style={css("display:flex; align-items:center; justify-content:space-between; margin-bottom:6px;")}>
              <h2 style={css("font-family:'Space Grotesk'; font-size:21px; font-weight:600; margin:0;")}>Contact us</h2>
              <button onClick={closeContact} aria-label="Close" style={css("background:none; border:none; font-size:22px; line-height:1; color:oklch(0.55 0.015 260); cursor:pointer;")}>×</button>
            </div>
            <p style={css("font-size:13.5px; color:oklch(0.45 0.015 260); margin:0 0 20px; line-height:1.5;")}>
              Questions, feedback, or trouble? Write it here and we'll open it in your mail app,
              addressed to <strong style={css("color:#10151c;")}>{SUPPORT_EMAIL}</strong>.
            </p>

            <div style={css("display:flex; flex-direction:column; gap:14px;")}>
              <div>
                <div style={css("font-size:12px; font-weight:600; margin-bottom:8px;")}>Topic</div>
                <div style={css("display:flex; gap:7px; flex-wrap:wrap;")}>
                  {TOPICS.map((t) => (
                    <button
                      key={t}
                      onClick={() => setTopic(t)}
                      style={
                        t === topic
                          ? css("font-family:'IBM Plex Sans'; font-size:12px; background:oklch(0.55 0.15 255 / 0.1); color:oklch(0.4 0.13 255); border:1px solid oklch(0.55 0.15 255 / 0.3); padding:6px 12px; border-radius:100px; cursor:pointer;")
                          : css("font-family:'IBM Plex Sans'; font-size:12px; background:none; border:1px solid oklch(0.9 0.006 260); color:oklch(0.45 0.015 260); padding:6px 12px; border-radius:100px; cursor:pointer;")
                      }
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div style={css("font-size:12px; font-weight:600; margin-bottom:8px;")}>Message</div>
                <TextArea
                  value={message}
                  onChange={setMessage}
                  placeholder="How can we help?"
                  rows={4}
                  autoFocus
                  ariaLabel="Message"
                />
              </div>

              <PrimaryButton
                onClick={send}
                disabled={!message.trim()}
                style={{ padding: "13px", fontSize: "14.5px", borderRadius: "11px" }}
              >
                Open in my mail app
              </PrimaryButton>
            </div>
          </div>
        )}
        {state.contactSent && (
          <div style={css("padding:46px 30px; text-align:center;")}>
            <div style={css("width:60px; height:60px; border-radius:16px; background:oklch(0.55 0.13 145 / 0.12); color:oklch(0.45 0.13 145); display:flex; align-items:center; justify-content:center; margin:0 auto 18px; font-size:28px;")}>✓</div>
            <h2 style={css("font-family:'Space Grotesk'; font-size:21px; font-weight:600; margin:0 0 8px;")}>Draft's in your mail app.</h2>
            <p style={css("font-size:14px; color:oklch(0.45 0.015 260); margin:0 0 22px; line-height:1.5;")}>
              Send it whenever you're ready — we read every message and usually reply within a few hours.
            </p>
            <button onClick={closeContact} style={css("font-family:'IBM Plex Sans'; font-size:14px; font-weight:600; color:#fff; background:oklch(0.55 0.15 255); border:none; padding:12px 22px; border-radius:10px; cursor:pointer;")}>Close</button>
          </div>
        )}
      </div>
    </div>
  );
}
