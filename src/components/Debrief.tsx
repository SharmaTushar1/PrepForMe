import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useApp } from "../store";
import { css } from "../css";
import { ACCENT } from "../data";
import { ROUTES } from "../routes";
import { toDateInput } from "../lib/format";
import type { RecapOutcome } from "../types";
import { useCreateRecap } from "../data/recaps";
import { useDecoratedApplication } from "../data/derived";
import { EmptyState, FieldLabel, Loading, PrimaryButton, TextArea, TextInput } from "./ui";

const ROUND_TYPES = ["Phone", "Technical", "System design", "Behavioral", "Onsite"];

const OUTCOMES: { value: RecapOutcome; label: string; positive?: boolean }[] = [
  { value: "rough", label: "Rough" },
  { value: "ok", label: "OK" },
  { value: "went_well", label: "Went well", positive: true },
];

export function Debrief() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { markLeveled } = useApp();
  const { app, isLoading } = useDecoratedApplication(id);
  const create = useCreateRecap();

  const [roundType, setRoundType] = useState("Technical");
  const [questions, setQuestions] = useState("");
  const [outcome, setOutcome] = useState<RecapOutcome | null>(null);
  const [notes, setNotes] = useState("");
  const [occurredOn, setOccurredOn] = useState(toDateInput(new Date().toISOString()));
  /** Recap count as of the save, so the confirmation doesn't double-count the refetch. */
  const [savedCount, setSavedCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const saved = savedCount !== null;

  if (isLoading) return <Loading />;

  if (!app) {
    return (
      <div style={css("padding:40px;")}>
        <EmptyState
          title="That role isn't here"
          body="A recap always belongs to a role. Pick one from your tracker and log it there."
          action={
            <PrimaryButton onClick={() => navigate(ROUTES.applications)}>
              Back to applications
            </PrimaryButton>
          }
        />
      </div>
    );
  }

  const back = () => navigate(ROUTES.applicationTab(app.id, "debriefs"));

  async function save() {
    if (!app || create.isPending) return;
    if (!questions.trim()) {
      setError("Write down at least one question — that's the part that makes this worth keeping.");
      return;
    }
    setError(null);
    const count = app.recapCount + 1;
    try {
      await create.mutateAsync({
        applicationId: app.id,
        roundType,
        questions,
        outcome,
        notes,
        occurredOn: occurredOn || undefined,
      });
      markLeveled(app.id);
      setSavedCount(count);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save this recap.");
    }
  }

  return (
    <div style={css("padding:30px 40px 60px; max-width:720px; width:100%; animation:fadeIn .3s ease both;")}>
      <button
        onClick={back}
        style={css("font-family:'IBM Plex Sans'; font-size:13px; color:oklch(0.5 0.015 260); background:none; border:none; cursor:pointer; padding:0; margin-bottom:16px;")}
      >
        ← Back
      </button>

      {saved ? (
        <div style={css("text-align:center; padding:40px 20px; animation:fadeUp .4s ease both;")}>
          <div style={css("width:64px;height:64px;border-radius:18px;background:oklch(0.55 0.13 145 / 0.12);color:oklch(0.45 0.13 145);display:flex;align-items:center;justify-content:center;margin:0 auto 20px;font-size:30px;")}>↑</div>
          <h1 style={css("font-family:'Space Grotesk'; font-size:24px; font-weight:600; margin:0 0 8px;")}>Recap saved.</h1>
          <p style={css("font-size:15px; color:oklch(0.45 0.015 260); max-width:400px; margin:0 auto 24px; line-height:1.6;")}>
            Added to <strong style={css("color:#10151c;")}>{app.company} · {app.role} prep</strong> — future
            questions here will draw on it. That's {savedCount} recap
            {savedCount === 1 ? "" : "s"} in this space.
          </p>
          <div style={css("max-width:280px; margin:0 auto; display:flex; flex-direction:column-reverse; gap:5px;")}>
            {[100, 86, 72, 58].map((width, i) => (
              <div
                key={width}
                style={{
                  height: "14px",
                  borderRadius: "4px",
                  background: `oklch(0.55 0.15 255 / ${1 - i * 0.25})`,
                  width: `${width}%`,
                  transformOrigin: "left",
                  animation: `growBar .6s ${i * 0.1}s ease both`,
                }}
              ></div>
            ))}
          </div>
          <div style={css("display:flex; gap:10px; justify-content:center; margin-top:28px;")}>
            <PrimaryButton onClick={back} style={{ padding: "12px 22px", fontSize: "14px" }}>
              Back to the role
            </PrimaryButton>
            <button
              onClick={() => {
                setSavedCount(null);
                setQuestions("");
                setNotes("");
                setOutcome(null);
              }}
              className="pressable"
              style={css("font-family:'IBM Plex Sans'; font-size:14px; font-weight:600; color:oklch(0.35 0.02 260); background:#fff; border:1px solid oklch(0.9 0.006 260); padding:12px 20px; border-radius:10px; cursor:pointer;")}
            >
              Log another round
            </button>
          </div>
        </div>
      ) : (
        <div>
          <h1 style={css("font-family:'Space Grotesk'; font-size:24px; font-weight:600; margin:0 0 6px;")}>
            Log your {app.company} recap
          </h1>
          <p style={css("font-size:14px; color:oklch(0.45 0.015 260); margin:0 0 24px;")}>
            Fast and structured, while it's fresh. This deepens the {app.company} · {app.role} prep space.
          </p>

          <div style={css("display:flex; flex-direction:column; gap:20px;")}>
            <div>
              <FieldLabel>Round type</FieldLabel>
              <div style={css("display:flex; gap:8px; flex-wrap:wrap;")}>
                {ROUND_TYPES.map((label) => {
                  const on = roundType === label;
                  return (
                    <button
                      key={label}
                      onClick={() => setRoundType(label)}
                      style={{
                        ...css("font-family:'IBM Plex Sans'; font-size:13px; font-weight:500; padding:9px 15px; border-radius:100px; cursor:pointer;"),
                        border: `1px solid ${on ? ACCENT : "oklch(0.9 0.006 260)"}`,
                        background: on ? ACCENT : "#fff",
                        color: on ? "#fff" : "oklch(0.4 0.015 260)",
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <FieldLabel>Questions you were asked</FieldLabel>
              <TextArea
                value={questions}
                onChange={setQuestions}
                rows={5}
                placeholder={
                  'e.g. "Design a rate limiter for the payments API"\n"Walk me through a hard incident you owned"'
                }
                invalid={!!error && !questions.trim()}
              />
            </div>

            <div style={css("display:flex; gap:20px; flex-wrap:wrap;")}>
              <div style={css("flex:1; min-width:260px;")}>
                <FieldLabel>How did it go?</FieldLabel>
                <div style={css("display:flex; gap:8px;")}>
                  {OUTCOMES.map((o) => {
                    const on = outcome === o.value;
                    const positive = o.positive;
                    return (
                      <button
                        key={o.value}
                        onClick={() => setOutcome(on ? null : o.value)}
                        style={{
                          ...css("flex:1; font-family:'IBM Plex Sans'; font-size:13px; padding:9px; border-radius:9px; cursor:pointer;"),
                          border: `1px solid ${on ? (positive ? "oklch(0.55 0.13 145 / 0.6)" : ACCENT) : positive ? "oklch(0.55 0.13 145 / 0.4)" : "oklch(0.9 0.006 260)"}`,
                          background: on
                            ? positive
                              ? "oklch(0.55 0.13 145 / 0.14)"
                              : "oklch(0.55 0.15 255 / 0.1)"
                            : positive
                              ? "oklch(0.55 0.13 145 / 0.06)"
                              : "#fff",
                          color: on
                            ? positive
                              ? "oklch(0.32 0.1 150)"
                              : "oklch(0.38 0.13 255)"
                            : "oklch(0.4 0.015 260)",
                          fontWeight: on ? 600 : 400,
                        }}
                      >
                        {o.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div style={css("width:180px;")}>
                <FieldLabel>When</FieldLabel>
                <TextInput
                  type="date"
                  value={occurredOn}
                  onChange={setOccurredOn}
                  ariaLabel="Interview date"
                />
              </div>
            </div>

            <div>
              <FieldLabel hint="(optional)">Notes</FieldLabel>
              <TextArea
                value={notes}
                onChange={setNotes}
                rows={3}
                placeholder="Anything that'll help future-you or a future round…"
              />
            </div>

            {error && (
              <div style={css("font-size:12.5px; color:oklch(0.5 0.14 25); line-height:1.5;")}>{error}</div>
            )}

            <PrimaryButton
              onClick={save}
              disabled={create.isPending}
              style={{ padding: "14px", fontSize: "15px", borderRadius: "11px" }}
            >
              {create.isPending ? "Saving…" : "Save recap"}
            </PrimaryButton>

            <p style={css("font-size:11.5px; color:oklch(0.55 0.015 260); line-height:1.55; margin:0;")}>
              🔒 Recaps are private to your account. They're what make this company's prep specific to
              you rather than generic.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
