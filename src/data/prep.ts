import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase, unwrap } from "../lib/supabase";
import type { PrepMessageRow, PrepSourceRow } from "../lib/db.types";
import type { Application, PrepMessage, PrepSource, Recap } from "../types";
import { ai } from "../lib/ai";
import type { ProfileContext } from "../lib/ai";
import { useSession } from "../auth/SessionProvider";
import { keys } from "./queryKeys";

function toSource(row: PrepSourceRow): PrepSource {
  return {
    id: row.id,
    applicationId: row.application_id,
    kind: row.kind,
    url: row.url,
    title: row.title,
    status: row.status,
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

export function usePrepSources(applicationId: string | undefined) {
  const { userId } = useSession();
  return useQuery({
    queryKey: keys.prepSources(userId ?? "anon", applicationId ?? "none"),
    enabled: !!userId && !!applicationId,
    queryFn: async (): Promise<PrepSource[]> => {
      const rows = await unwrap<PrepSourceRow[]>(
        supabase
          .from("prep_sources")
          .select("*")
          .eq("application_id", applicationId!)
          .order("created_at", { ascending: true }),
      );
      return rows.map(toSource);
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

export function useAddPrepSource() {
  const queryClient = useQueryClient();
  const { userId } = useSession();

  return useMutation({
    mutationFn: async ({ applicationId, url }: { applicationId: string; url: string }) => {
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
            // Nothing fetches and indexes pages yet; say so rather than imply it.
            status: "pending",
          })
          .select("*")
          .single(),
      );
      return toSource(row);
    },
    onSuccess: (source) => {
      if (!userId) return;
      queryClient.invalidateQueries({
        queryKey: keys.prepSources(userId, source.applicationId),
      });
      queryClient.invalidateQueries({ queryKey: keys.applications(userId) });
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
    onSuccess: (_data, { applicationId }) => {
      if (!userId) return;
      queryClient.invalidateQueries({ queryKey: keys.prepSources(userId, applicationId) });
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
}

/** Persist the question, answer it through the AI seam, persist the answer. */
export function useAskPrep() {
  const queryClient = useQueryClient();
  const { userId } = useSession();

  return useMutation({
    mutationFn: async ({ question, application, context, recaps, sourceCount }: AskInput) => {
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
      });

      await unwrap<null>(
        supabase.from("prep_messages").insert({
          application_id: application.id,
          role: "assistant",
          content: answer.content,
          citations: answer.citations,
        }),
      );
    },
    onSuccess: (_data, { application }) => {
      if (!userId) return;
      queryClient.invalidateQueries({ queryKey: keys.prepMessages(userId, application.id) });
    },
  });
}
