import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { css } from "../css";
import { LogoMark } from "./Logo";
import { isSupabaseConfigured, supabase } from "../lib/supabase";
import { ROUTES } from "../routes";
import { FieldLabel, PrimaryButton, Spinner, TextInput } from "./ui";

type Status = "idle" | "sending" | "sent" | "oauth" | "error";

type OAuthProvider = "google";

export function Login() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  const valid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());
  const redirectTo = `${window.location.origin}${ROUTES.home}`;

  async function sendLink() {
    if (!valid || status === "sending" || status === "oauth") return;
    setStatus("sending");
    setError(null);
    const { error: err } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: redirectTo },
    });
    if (err) {
      setError(err.message);
      setStatus("error");
      return;
    }
    setStatus("sent");
  }

  async function signInWith(provider: OAuthProvider) {
    if (status === "sending" || status === "oauth" || !isSupabaseConfigured) return;
    setStatus("oauth");
    setError(null);
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo },
    });
    if (err) {
      setError(err.message);
      setStatus("error");
    }
    // On success the browser navigates away to the provider.
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
                Google is fastest. Email link still works if you prefer.
              </p>

              <div style={css("display:flex; flex-direction:column; gap:10px;")}>
                <OAuthButton
                  label="Continue with Google"
                  busy={status === "oauth"}
                  disabled={!isSupabaseConfigured}
                  onClick={() => signInWith("google")}
                  icon={<GoogleMark />}
                />
              </div>

              <div style={css("display:flex; align-items:center; gap:12px; margin:22px 0;")}>
                <div style={css("flex:1; height:1px; background:oklch(0.9 0.006 260);")} />
                <span style={css("font-size:11.5px; color:oklch(0.55 0.015 260);")}>or email a link</span>
                <div style={css("flex:1; height:1px; background:oklch(0.9 0.006 260);")} />
              </div>

              <FieldLabel>Email</FieldLabel>
              <TextInput
                type="email"
                value={email}
                onChange={setEmail}
                placeholder="you@example.com"
                onEnter={sendLink}
                ariaLabel="Email address"
              />

              {error && (
                <div style={css("margin-top:12px; font-size:12.5px; color:oklch(0.5 0.14 25); line-height:1.5;")}>{error}</div>
              )}

              <PrimaryButton
                onClick={sendLink}
                disabled={!valid || status === "sending" || status === "oauth" || !isSupabaseConfigured}
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

function OAuthButton({
  label,
  icon,
  onClick,
  disabled,
  busy,
}: {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  busy?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      style={css(
        "display:flex; align-items:center; justify-content:center; gap:10px; width:100%; padding:12px 14px; border-radius:11px; border:1px solid oklch(0.88 0.006 260); background:#fff; font-family:'IBM Plex Sans'; font-size:14px; font-weight:550; color:#10151c; cursor:pointer;",
      )}
    >
      {busy ? <Spinner size={16} /> : icon}
      {label}
    </button>
  );
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}
