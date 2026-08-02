import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase, unwrap } from "../lib/supabase";
import type { UserSettingsRow } from "../lib/db.types";
import type { UserSettings } from "../types";
import { useSession } from "../auth/SessionProvider";
import { keys } from "./queryKeys";

export const DEFAULT_SETTINGS: UserSettings = {
  referralChannel: "invite",
  linkedinPremium: false,
  charLimit: 200,
  nudgeRecaps: true,
  flagStaleApplications: true,
  flagStaleDays: 10,
  plan: "free",
};

/** LinkedIn's own caps: 200 characters on a free invite, 300 with Premium. */
export const CHAR_LIMIT_MIN = 120;
export const FREE_CHAR_LIMIT = 200;
export const PREMIUM_CHAR_LIMIT = 300;

function toSettings(row: UserSettingsRow): UserSettings {
  return {
    referralChannel: row.referral_channel,
    linkedinPremium: row.linkedin_premium,
    charLimit: row.char_limit,
    nudgeRecaps: row.nudge_recaps,
    flagStaleApplications: row.flag_stale_applications,
    flagStaleDays: row.flag_stale_days,
    plan: row.plan,
  };
}

export function useSettings() {
  const { userId } = useSession();
  const query = useQuery({
    queryKey: keys.settings(userId ?? "anon"),
    enabled: !!userId,
    queryFn: async (): Promise<UserSettings> => {
      const rows = await unwrap<UserSettingsRow[]>(
        supabase.from("user_settings").select("*").eq("user_id", userId!).limit(1),
      );
      if (rows.length) return toSettings(rows[0]);
      // The signup trigger normally creates this row; heal it if it's absent.
      const created = await unwrap<UserSettingsRow>(
        supabase.from("user_settings").insert({ user_id: userId! }).select("*").single(),
      );
      return toSettings(created);
    },
  });

  return { ...query, settings: query.data ?? DEFAULT_SETTINGS };
}

export function useUpdateSettings() {
  const queryClient = useQueryClient();
  const { userId } = useSession();

  return useMutation({
    mutationFn: async (patch: Partial<UserSettings>) => {
      const payload: Record<string, unknown> = {};
      if (patch.referralChannel !== undefined) payload.referral_channel = patch.referralChannel;
      if (patch.linkedinPremium !== undefined) payload.linkedin_premium = patch.linkedinPremium;
      if (patch.charLimit !== undefined) payload.char_limit = patch.charLimit;
      if (patch.nudgeRecaps !== undefined) payload.nudge_recaps = patch.nudgeRecaps;
      if (patch.flagStaleApplications !== undefined) {
        payload.flag_stale_applications = patch.flagStaleApplications;
      }
      if (patch.flagStaleDays !== undefined) payload.flag_stale_days = patch.flagStaleDays;
      await unwrap<null>(
        supabase.from("user_settings").update(payload).eq("user_id", userId!),
      );
    },
    onMutate: async (patch) => {
      if (!userId) return;
      // Toggles and steppers must feel instant.
      const key = keys.settings(userId);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<UserSettings>(key);
      if (previous) queryClient.setQueryData<UserSettings>(key, { ...previous, ...patch });
      return { previous };
    },
    onError: (_err, _patch, context) => {
      if (!userId || !context?.previous) return;
      queryClient.setQueryData(keys.settings(userId), context.previous);
    },
    onSettled: () => {
      if (!userId) return;
      queryClient.invalidateQueries({ queryKey: keys.settings(userId) });
    },
  });
}
