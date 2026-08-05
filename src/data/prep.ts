import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { functionsUrl, supabase, supabaseKey, unwrap } from "../lib/supabase";
import type { PrepMessageRow, PrepSourceRow } from "../lib/db.types";
import type {
  Application,
  PrepClaimDraft,
  PrepMessage,
  PrepSource,
  Recap,
} from "../types";
import { ai } from "../lib/ai";
import type { ProfileContext } from "../lib/ai";
import { useSession } from "../auth/SessionProvider";
import { normaliseCompany, normaliseRole } from "../lib/company";
import { keys } from "./queryKeys";

/** A company-scope row with its owning application's company name attached. */
type CompanyScopeRow = PrepSourceRow & {
  applications: { company: string } | null;
};

function toSource(row: PrepSourceRow): PrepSource {
  return {
    id: row.id,
    applicationId: row.application_id,
    kind: row.kind,
    inputKind: row.input_kind ?? "url",
    scope: row.scope ?? "role",
    url: row.url,
    title: row.title,
    status: row.status,
    error: row.error ?? null,
    createdAt: row.created_at,
  };
}

function toMessage(row: PrepMessageRow): PrepMessage {
  return {
    id: row.id,
    applicationId: row.application_id,
    role: row.role,
    content: row.content,
    citations: Array.isArray(row.citations) ? row.citations : [],
    createdAt: row.created_at,
  };
}

/**
 * Sources this role can draw on: its own, then company-scope sources added
 * under a sibling role at the same company.
 *
 * The second half is not decoration. A company-scope source stores its claims
 * with `role`/`level` null, and `match_prep_chunks` matches a null role against
 * any role, so those claims already ground this role's answers. Listing only
 * `application_id` rows told the user there were no sources behind a coach that
 * was demonstrably using some.
 *
 * Every company-scope row the user owns is fetched and filtered client-side
 * because the company match strips legal suffixes, which is not expressible as a
 * PostgREST filter. RLS already limits this to the signed-in user, and the row
 * count is small enough that a second scoped query would cost more than it saves.
 */
export function usePrepSources(
  applicationId: string | undefined,
  company: string | undefined,
) {
  const { userId } = useSession();
  const companyKey = company ? normaliseCompany(company) : "";

  return useQuery({
    queryKey: keys.prepSources(userId ?? "anon", applicationId ?? "none"),
    enabled: !!userId && !!applicationId,
    queryFn: async (): Promise<PrepSource[]> => {
      const [own, companyWide] = await Promise.all([
        unwrap<PrepSourceRow[]>(
          supabase
            .from("prep_sources")
            .select("*")
            .eq("application_id", applicationId!)
            .order("created_at", { ascending: true }),
        ),
        unwrap<CompanyScopeRow[]>(
          supabase
            .from("prep_sources")
            .select("*, applications!inner(company)")
            .eq("scope", "company")
            .neq("application_id", applicationId!)
            .order("created_at", { ascending: true }),
        ),
      ]);

      const inherited = companyWide.filter(
        (row) =>
          !!row.applications &&
          normaliseCompany(row.applications.company) === companyKey,
      );

      return [...own, ...inherited].map(toSource);
    },
  });
}

/**
 * Shared claims about this company that anyone contributed — the grounding this
 * role has that its own source list can't show.
 *
 * A shared claim is `prep_chunks.user_id = null`, readable by every signed-in
 * user, and `match_prep_chunks` matches it whenever company and role line up or
 * are null. The source row behind it belongs to another account and stays
 * invisible under RLS, which is correct but leaves the panel claiming "0
 * sources" for a role the coach can answer in detail. Counting the claims tells
 * the truth without naming anyone else's upload.
 *
 * The filters mirror the retrieval predicate. Drift here overstates or hides
 * grounding, so change it with `match_prep_chunks` in view.
 */
export function useSharedClaimCount(company: string | undefined, role: string | undefined) {
  const { userId } = useSession();
  return useQuery({
    queryKey: keys.sharedClaims(normaliseCompany(company ?? ""), normaliseRole(role ?? "")),
    enabled: !!userId && !!company,
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .from("prep_chunks")
        .select("id", { count: "exact", head: true })
        .is("user_id", null)
        .eq("company", normaliseCompany(company!))
        .or(`role.is.null,role.eq."${normaliseRole(role ?? "").replace(/"/g, "")}"`);
      if (error) throw new Error(error.message);
      return count ?? 0;
    },
  });
}

/** Derive a readable title from a URL, so the list isn't a wall of links. */
function titleFromUrl(raw: string): { title: string; kind: PrepSource["kind"] } {
  let host = raw;
  let path = "";
  try {
    const url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
    host = url.hostname.replace(/^www\./, "");
    path = url.pathname.toLowerCase();
  } catch {
    /* leave the raw string as the title */
  }
  if (/careers|jobs/.test(path)) return { title: `${host} careers`, kind: "careers" };
  if (/blog|engineering/.test(path)) return { title: `${host} blog`, kind: "company_blog" };
  if (/docs|documentation|developer/.test(path)) return { title: `${host} docs`, kind: "docs" };
  if (/news|press|funding/.test(path)) return { title: `${host} news`, kind: "news" };
  return { title: host, kind: "custom" };
}

async function accessToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Sign in again to continue.");
  return token;
}

async function invokeIngest(
  sourceId: string,
  acknowledgeRelevance = false,
): Promise<{ warning?: boolean; reason?: string; message?: string; ok?: boolean; claims?: number }> {
  const response = await fetch(`${functionsUrl}/ingest-prep-source`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: supabaseKey,
      Authorization: `Bearer ${await accessToken()}`,
    },
    body: JSON.stringify({ sourceId, acknowledgeRelevance }),
  });

  const payload = await response.json().catch(() => ({})) as {
    error?: string;
    warning?: boolean;
    reason?: string;
    message?: string;
    ok?: boolean;
    claims?: number;
  };

  if (!response.ok) {
    throw new Error(payload.error || `Ingest failed (${response.status}).`);
  }
  return payload;
}

export function useAddPrepSource() {
  const queryClient = useQueryClient();
  const { userId } = useSession();

  return useMutation({
    mutationFn: async ({
      applicationId,
      url,
      scope = "role",
      acknowledgeRelevance = false,
    }: {
      applicationId: string;
      url: string;
      scope?: "company" | "role";
      acknowledgeRelevance?: boolean;
    }) => {
      const trimmed = url.trim();
      const { title, kind } = titleFromUrl(trimmed);
      const normalized = trimmed.startsWith("http") ? trimmed : `https://${trimmed}`;
      const row = await unwrap<PrepSourceRow>(
        supabase
          .from("prep_sources")
          .insert({
            application_id: applicationId,
            url: normalized,
            title,
            kind,
            input_kind: "url",
            scope,
            status: "pending",
          })
          .select("*")
          .single(),
      );

      const result = await invokeIngest(row.id, acknowledgeRelevance);
      if (result.warning) {
        return { source: toSource(row), warning: result };
      }
      const refreshed = await unwrap<PrepSourceRow>(
        supabase.from("prep_sources").select("*").eq("id", row.id).single(),
      );
      return { source: toSource(refreshed), warning: null };
    },
    onSuccess: () => {
      if (!userId) return;
      queryClient.invalidateQueries({ queryKey: keys.prepSourcesAll(userId) });
      queryClient.invalidateQueries({ queryKey: keys.applications(userId) });
      queryClient.invalidateQueries({ queryKey: keys.aiUsage(userId, "relevance_check") });
      queryClient.invalidateQueries({ queryKey: keys.aiUsage(userId, "chat") });
    },
  });
}

export function useAddPasteSource() {
  const queryClient = useQueryClient();
  const { userId } = useSession();

  return useMutation({
    mutationFn: async ({
      applicationId,
      text,
      scope = "role",
      acknowledgeRelevance = false,
    }: {
      applicationId: string;
      text: string;
      scope?: "company" | "role";
      acknowledgeRelevance?: boolean;
    }) => {
      const body = text.trim();
      if (body.length < 40) throw new Error("Paste a bit more — at least a few sentences.");
      const row = await unwrap<PrepSourceRow>(
        supabase
          .from("prep_sources")
          .insert({
            application_id: applicationId,
            title: "Pasted notes",
            kind: "custom",
            input_kind: "paste",
            scope,
            paste_body: body,
            status: "pending",
          })
          .select("*")
          .single(),
      );
      const result = await invokeIngest(row.id, acknowledgeRelevance);
      if (result.warning) {
        return { source: toSource(row), warning: result };
      }
      const refreshed = await unwrap<PrepSourceRow>(
        supabase.from("prep_sources").select("*").eq("id", row.id).single(),
      );
      return { source: toSource(refreshed), warning: null };
    },
    onSuccess: () => {
      if (!userId) return;
      queryClient.invalidateQueries({ queryKey: keys.prepSourcesAll(userId) });
      queryClient.invalidateQueries({ queryKey: keys.applications(userId) });
      queryClient.invalidateQueries({ queryKey: keys.aiUsage(userId, "relevance_check") });
      queryClient.invalidateQueries({ queryKey: keys.aiUsage(userId, "chat") });
    },
  });
}

export function useAddPdfSource() {
  const queryClient = useQueryClient();
  const { userId } = useSession();

  return useMutation({
    mutationFn: async ({
      applicationId,
      file,
      scope = "role",
      acknowledgeRelevance = false,
    }: {
      applicationId: string;
      file: File;
      scope?: "company" | "role";
      acknowledgeRelevance?: boolean;
    }) => {
      if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
        throw new Error("Upload a PDF.");
      }
      if (file.size > 10 * 1024 * 1024) throw new Error("PDF must be under 10 MB.");
      if (!userId) throw new Error("Sign in again to continue.");

      const id = crypto.randomUUID();
      const storagePath = `${userId}/${id}.pdf`;

      const { error: uploadError } = await supabase.storage
        .from("prep-sources")
        .upload(storagePath, file, { contentType: "application/pdf", upsert: false });
      if (uploadError) throw new Error(uploadError.message);

      const row = await unwrap<PrepSourceRow>(
        supabase
          .from("prep_sources")
          .insert({
            id,
            application_id: applicationId,
            title: file.name,
            kind: "custom",
            input_kind: "pdf",
            scope,
            storage_path: storagePath,
            status: "pending",
          })
          .select("*")
          .single(),
      );

      const result = await invokeIngest(row.id, acknowledgeRelevance);
      if (result.warning) {
        return { source: toSource(row), warning: result };
      }
      const refreshed = await unwrap<PrepSourceRow>(
        supabase.from("prep_sources").select("*").eq("id", row.id).single(),
      );
      return { source: toSource(refreshed), warning: null };
    },
    onSuccess: () => {
      if (!userId) return;
      queryClient.invalidateQueries({ queryKey: keys.prepSourcesAll(userId) });
      queryClient.invalidateQueries({ queryKey: keys.applications(userId) });
      queryClient.invalidateQueries({ queryKey: keys.aiUsage(userId, "relevance_check") });
      queryClient.invalidateQueries({ queryKey: keys.aiUsage(userId, "chat") });
    },
  });
}

export function useConfirmIngest() {
  const queryClient = useQueryClient();
  const { userId } = useSession();

  return useMutation({
    mutationFn: async ({ sourceId, applicationId }: { sourceId: string; applicationId: string }) => {
      const result = await invokeIngest(sourceId, true);
      if (result.warning) {
        throw new Error(result.reason || result.message || "Still flagged.");
      }
      return { applicationId, result };
    },
    onSuccess: () => {
      if (!userId) return;
      queryClient.invalidateQueries({ queryKey: keys.prepSourcesAll(userId) });
      queryClient.invalidateQueries({ queryKey: keys.applications(userId) });
      queryClient.invalidateQueries({ queryKey: keys.aiUsage(userId, "relevance_check") });
      queryClient.invalidateQueries({ queryKey: keys.aiUsage(userId, "chat") });
    },
  });
}

export function useDeletePrepSource() {
  const queryClient = useQueryClient();
  const { userId } = useSession();

  return useMutation({
    mutationFn: async ({ id }: { id: string; applicationId: string }) => {
      await unwrap<null>(supabase.from("prep_sources").delete().eq("id", id));
    },
    onSuccess: () => {
      if (!userId) return;
      queryClient.invalidateQueries({ queryKey: keys.prepSourcesAll(userId) });
      queryClient.invalidateQueries({ queryKey: keys.applications(userId) });
    },
  });
}

export function usePrepMessages(applicationId: string | undefined) {
  const { userId } = useSession();
  return useQuery({
    queryKey: keys.prepMessages(userId ?? "anon", applicationId ?? "none"),
    enabled: !!userId && !!applicationId,
    queryFn: async (): Promise<PrepMessage[]> => {
      const rows = await unwrap<PrepMessageRow[]>(
        supabase
          .from("prep_messages")
          .select("*")
          .eq("application_id", applicationId!)
          .order("created_at", { ascending: true }),
      );
      return rows.map(toMessage);
    },
  });
}

interface AskInput {
  question: string;
  application: Application;
  context: ProfileContext;
  recaps: Recap[];
  sourceCount: number;
  /** Last turns already on screen, excluding this question. */
  history?: { role: "user" | "assistant"; content: string }[];
}

/** Persist the question, answer it through the AI seam, persist the answer. */
export function useAskPrep() {
  const queryClient = useQueryClient();
  const { userId } = useSession();

  return useMutation({
    mutationFn: async ({
      question,
      application,
      context,
      recaps,
      sourceCount,
      history,
    }: AskInput) => {
      await unwrap<null>(
        supabase.from("prep_messages").insert({
          application_id: application.id,
          role: "user",
          content: question.trim(),
        }),
      );

      const answer = await ai.answerPrepQuestion({
        question,
        application,
        context,
        recaps,
        sourceCount,
        history,
      });

      await unwrap<null>(
        supabase.from("prep_messages").insert({
          application_id: application.id,
          role: "assistant",
          content: answer.content,
          citations: answer.citations,
        }),
      );

      return answer;
    },
    onSuccess: (_data, { application }) => {
      if (!userId) return;
      queryClient.invalidateQueries({ queryKey: keys.prepMessages(userId, application.id) });
      queryClient.invalidateQueries({ queryKey: keys.aiUsage(userId, "chat") });
    },
  });
}

export function useSavePrepClaims() {
  const queryClient = useQueryClient();
  const { userId } = useSession();

  return useMutation({
    mutationFn: async ({
      applicationId,
      claims,
    }: {
      applicationId: string;
      claims: PrepClaimDraft[];
    }) => {
      const response = await fetch(`${functionsUrl}/save-prep-claims`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          apikey: supabaseKey,
          Authorization: `Bearer ${await accessToken()}`,
        },
        body: JSON.stringify({ applicationId, claims }),
      });
      const payload = await response.json().catch(() => ({})) as {
        error?: string;
        saved?: number;
      };
      if (!response.ok) {
        throw new Error(payload.error || `Save failed (${response.status}).`);
      }
      return payload;
    },
    onSuccess: (_data, { applicationId }) => {
      if (!userId) return;
      queryClient.invalidateQueries({ queryKey: keys.applications(userId) });
      void applicationId;
    },
  });
}
