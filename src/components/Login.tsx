import { useState } from "react";
import { Link } from "react-router-dom";
import { css } from "../css";
import { LogoMark } from "./Logo";
import { isSupabaseConfigured, supabase } from "../lib/supabase";
import { ROUTES } from "../routes";
import { FieldLabel, PrimaryButton, Spinner, TextInput } from "./ui";

type Status = "idle" | "sending" | "sent" | "error";

export function Login() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  const valid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());

  async function sendLink() {
    if (!valid || status === "sending") return;
    setStatus("sending");
    setError(null);
    const { error: err } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}${ROUTES.home}` },
    });
    if (err) {
      setError(err.message);
      setStatus("error");
      return;
    }
    setStatus("sent");
  }

  return (
    <div style={css("min-height:100vh; display:flex; align-items:center; justify-content:center; padding:40px; background:radial-gradient(110% 80% at 50% -10%, oklch(0.55 0.15 255 / 0.08), transparent 55%), oklch(0.985 0.003 260);")}>
      <div style={css("width:420px; max-width:100%;")}>
        <Link to={ROUTES.landing} style={css("display:flex; align-items:center; gap:9px; justify-content:center; margin-bottom:24px; text-decoration:none; color:inherit;")}>
          <LogoMark size={26} />
          <span style={css("font-family:'Space Grotesk'; font-weight:600; font-size:17px;")}>
            PrepFor<span style={css("color:oklch(0.55 0.15 255);")}>.Me</span>
          </span>
        </Link>

        <div style={css("background:#fff; border:1px solid oklch(0.9 0.006 260); border-radius:18px; padding:32px; box-shadow:0 30px 70px -44px oklch(0.3 0.05 260 / 0.6);")}>
          {!isSupabaseConfigured && (
            <div style={css("background:oklch(0.65 0.11 85 / 0.09); border:1px solid oklch(0.65 0.11 85 / 0.3); border-radius:11px; padding:13px 15px; margin-bottom:20px; font-size:12.5px; color:oklch(0.4 0.06 75); line-height:1.55;")}>
              Supabase isn't configured yet. Copy <code>.env.example</code> to{" "}
              <code>.env.local</code>, fill in your project URL and publishable key, then
              restart the dev server.
            </div>
          )}

          {status === "sent" ? (
            <div style={css("text-align:center;")}>
              <div style={css("width:56px;height:56px;border-radius:16px;background:oklch(0.55 0.13 145 / 0.12);color:oklch(0.45 0.13 145);display:flex;align-items:center;justify-content:center;margin:0 auto 18px;font-size:26px;")}>✓</div>
              <h1 style={css("font-family:'Space Grotesk'; font-size:21px; font-weight:600; margin:0 0 8px;")}>Check your email.</h1>
              <p style={css("font-size:13.5px; color:oklch(0.45 0.015 260); line-height:1.6; margin:0;")}>
                We sent a sign-in link to <strong style={css("color:#10151c;")}>{email.trim()}</strong>. Open
                it on this device and you'll land straight in your war room.
              </p>
              <button
                onClick={() => setStatus("idle")}
                style={css("margin-top:20px; background:none; border:none; font-size:13px; color:oklch(0.5 0.015 260); cursor:pointer;")}
              >
                Use a different email
              </button>
            </div>
          ) : (
            <>
              <h1 style={css("font-family:'Space Grotesk'; font-size:23px; font-weight:600; margin:0 0 6px;")}>Sign in</h1>
              <p style={css("font-size:13.5px; color:oklch(0.45 0.015 260); line-height:1.6; margin:0 0 22px;")}>
                No passwords. We email you a link — new here, and this creates your account.
              </p>

              <FieldLabel>Email</FieldLabel>
              <TextInput
                type="email"
                value={email}
                onChange={setEmail}
                placeholder="you@example.com"
                autoFocus
                onEnter={sendLink}
                ariaLabel="Email address"
              />

              {error && (
                <div style={css("margin-top:12px; font-size:12.5px; color:oklch(0.5 0.14 25); line-height:1.5;")}>{error}</div>
              )}

              <PrimaryButton
                onClick={sendLink}
                disabled={!valid || status === "sending" || !isSupabaseConfigured}
                style={{ width: "100%", marginTop: "18px", padding: "13px", fontSize: "14.5px", borderRadius: "11px", display: "flex", alignItems: "center", justifyContent: "center", gap: "10px" }}
              >
                {status === "sending" ? <Spinner size={16} /> : null}
                {status === "sending" ? "Sending…" : "Email me a link"}
              </PrimaryButton>

              <p style={css("font-size:11.5px; color:oklch(0.55 0.015 260); line-height:1.55; margin:16px 0 0; text-align:center;")}>
                Your career history is yours. Export or delete it whenever you want.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
