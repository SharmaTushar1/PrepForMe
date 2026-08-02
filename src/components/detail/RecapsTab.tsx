import { useNavigate } from "react-router-dom";
import { css } from "../../css";
import { relativeTime } from "../../lib/format";
import { ROUTES } from "../../routes";
import { OUTCOME_LABELS, useDeleteRecap, useRecaps } from "../../data/recaps";
import type { DecoratedApp } from "../../data/derived";
import { EmptyState, ErrorNote, Loading, PrimaryButton } from "../ui";

export function RecapsTab({ app }: { app: DecoratedApp }) {
  const navigate = useNavigate();
  const recaps = useRecaps(app.id);
  const remove = useDeleteRecap();

  return (
    <div>
      <div style={css("display:flex; align-items:center; justify-content:space-between; gap:16px; margin-bottom:16px;")}>
        <div>
          <h2 style={css("font-family:'Space Grotesk'; font-size:18px; font-weight:600; margin:0;")}>Interview recaps</h2>
          <p style={css("font-size:13px; color:oklch(0.5 0.015 260); margin:3px 0 0;")}>
            The highest-value data in the product. Each one deepens {app.company}'s prep.
          </p>
        </div>
        <PrimaryButton onClick={() => navigate(ROUTES.newRecap(app.id))}>+ Log a recap</PrimaryButton>
      </div>

      {recaps.isLoading && <Loading label="Loading recaps…" />}
      {recaps.isError && <ErrorNote error={recaps.error} retry={() => recaps.refetch()} />}

      {recaps.data?.length === 0 && (
        <EmptyState
          title="No recaps yet"
          body="After a real interview, write down what they actually asked. It's the one thing that makes this company's prep specific to you instead of generic."
          action={<PrimaryButton onClick={() => navigate(ROUTES.newRecap(app.id))}>Log your first recap</PrimaryButton>}
        />
      )}

      <div style={css("display:flex; flex-direction:column; gap:12px;")}>
        {(recaps.data ?? []).map((recap) => (
          <div key={recap.id} style={css("border:1px solid oklch(0.9 0.006 260); border-radius:11px; padding:16px; background:#fff;")}>
            <div style={css("display:flex; align-items:center; gap:10px; margin-bottom:8px;")}>
              <span style={css("font-size:11.5px; font-weight:600; background:oklch(0.55 0.15 255 / 0.1); color:oklch(0.4 0.13 255); padding:3px 10px; border-radius:100px;")}>
                {recap.roundType}
                {recap.roundNumber ? ` · R${recap.roundNumber}` : ""}
              </span>
              <span style={css("font-size:12px; color:oklch(0.55 0.015 260);")}>
                {relativeTime(recap.createdAt)}
                {recap.outcome ? ` · ${OUTCOME_LABELS[recap.outcome]}` : ""}
              </span>
              <button
                onClick={() => remove.mutate({ id: recap.id, applicationId: app.id })}
                aria-label="Delete recap"
                style={css("margin-left:auto; background:none; border:none; font-size:15px; line-height:1; color:oklch(0.65 0.015 260); cursor:pointer;")}
              >
                ×
              </button>
            </div>
            {recap.questions && (
              <div style={css("font-size:13.5px; color:oklch(0.3 0.015 260); line-height:1.55; white-space:pre-wrap;")}>{recap.questions}</div>
            )}
            {recap.notes && (
              <div style={css("font-size:12.5px; color:oklch(0.45 0.015 260); line-height:1.55; margin-top:10px; padding-top:10px; border-top:1px solid oklch(0.95 0.006 260); white-space:pre-wrap;")}>{recap.notes}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
