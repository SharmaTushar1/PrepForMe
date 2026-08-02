import { useState } from "react";
import { useApp } from "../store";
import { css } from "../css";
import { EmptyState, PrimaryButton, TextInput } from "./ui";

export function Discover() {
  const { openAddRole } = useApp();
  const [query, setQuery] = useState("");
  const [searched, setSearched] = useState(false);

  return (
    <div style={css("padding:30px 40px 60px; max-width:860px; width:100%; animation:fadeIn .3s ease both;")}>
      <div style={css("display:flex; align-items:center; gap:10px; margin-bottom:6px;")}>
        <h1 style={css("font-family:'Space Grotesk'; font-size:26px; font-weight:600; margin:0;")}>Discover</h1>
        <span style={css("font-family:'IBM Plex Mono'; font-size:11px; background:oklch(0.55 0.15 255 / 0.1); color:oklch(0.4 0.13 255); padding:3px 9px; border-radius:100px;")}>v2 · preview</span>
      </div>
      <p style={css("font-size:14px; color:oklch(0.45 0.015 260); margin:0 0 22px; max-width:560px;")}>
        Describe the role you want. The plan is to query public ATS feeds and rank matches against
        your profile — a query-and-rank layer, not an exhaustive board.
      </p>

      <div data-tour="discover-search" style={css("display:flex; gap:10px; margin-bottom:26px;")}>
        <TextInput
          value={query}
          onChange={(value) => {
            setQuery(value);
            setSearched(false);
          }}
          onEnter={() => setSearched(!!query.trim())}
          placeholder="Staff-level backend roles, distributed systems, remote-friendly, Series C+"
          ariaLabel="Describe the role you want"
          style={{ flex: 1, padding: "14px 16px", fontSize: "14px", borderRadius: "11px" }}
        />
        <PrimaryButton
          onClick={() => setSearched(!!query.trim())}
          disabled={!query.trim()}
          style={{ padding: "0 22px", fontSize: "14px", borderRadius: "11px" }}
        >
          Find
        </PrimaryButton>
      </div>

      {searched ? (
        <EmptyState
          title="No feeds connected yet"
          body={`We're not querying job boards yet, so there's nothing to rank "${query.trim()}" against. Until then, add roles you've found yourself — the tracker, tailoring, and prep all work today.`}
          action={<PrimaryButton onClick={openAddRole}>+ Add a role manually</PrimaryButton>}
        />
      ) : (
        <EmptyState
          title="Search is a preview"
          body="Type what you're looking for to see where this is going. Ranking against your profile arrives with the public ATS feed integration."
        />
      )}
    </div>
  );
}
