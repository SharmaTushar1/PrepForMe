import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase, unwrap } from "../lib/supabase";
import { useSession } from "../auth/SessionProvider";
import { keys } from "./queryKeys";

const TABLES = [
  "profiles",
  "user_settings",
  "experiences",
  "experience_bullets",
  "skills",
  "applications",
  "application_stage_events",
  "recaps",
  "prep_sources",
  "prep_messages",
  "prep_chunks",
  "referral_contacts",
  "tailorings",
] as const;

/**
 * Everything this account owns, as one JSON file. Row level security means a
 * plain select per table returns exactly the user's own rows and nothing else.
 */
export function useExportData() {
  const { session } = useSession();

  return useMutation({
    mutationFn: async () => {
      const data: Record<string, unknown> = {
        exportedAt: new Date().toISOString(),
        account: { id: session?.user.id, email: session?.user.email },
      };

      for (const table of TABLES) {
        data[table] = await unwrap<unknown[]>(supabase.from(table).select("*"));
      }

      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `prepforme-export-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
    },
  });
}

/**
 * Wipe one company's prep space — its sources, its chat history, and its
 * recaps — while leaving the application itself in your tracker.
 */
export function useClearCorpus() {
  const queryClient = useQueryClient();
  const { userId } = useSession();

  return useMutation({
    mutationFn: async (applicationId: string) => {
      await unwrap<null>(
        supabase.from("prep_messages").delete().eq("application_id", applicationId),
      );
      await unwrap<null>(
        supabase.from("prep_chunks").delete().eq("application_id", applicationId),
      );
      await unwrap<null>(
        supabase.from("prep_sources").delete().eq("application_id", applicationId),
      );
      await unwrap<null>(supabase.from("recaps").delete().eq("application_id", applicationId));
    },
    onSuccess: (_data, applicationId) => {
      if (!userId) return;
      queryClient.invalidateQueries({ queryKey: keys.prepMessages(userId, applicationId) });
      queryClient.invalidateQueries({ queryKey: keys.prepSources(userId, applicationId) });
      queryClient.invalidateQueries({ queryKey: keys.recaps(userId, applicationId) });
      queryClient.invalidateQueries({ queryKey: keys.applications(userId) });
    },
  });
}
