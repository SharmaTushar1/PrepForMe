import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase, unwrap } from "../lib/supabase";
import type {
  ExperienceBulletRow,
  ExperienceRow,
  ProfileRow,
  SkillRow,
} from "../lib/db.types";
import type { Experience, ExperienceBullet, Profile, Skill } from "../types";
import type { ProfileContext } from "../lib/ai";
import { useSession } from "../auth/SessionProvider";
import { keys } from "./queryKeys";

function toProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    fullName: row.full_name,
    headline: row.headline,
    email: row.email,
    noticePeriod: row.notice_period,
    workAuthorization: row.work_authorization,
    salaryExpectation: row.salary_expectation,
  };
}

function toBullet(row: ExperienceBulletRow): ExperienceBullet {
  return {
    id: row.id,
    experienceId: row.experience_id,
    text: row.text,
    enabled: row.enabled,
    sortOrder: row.sort_order,
  };
}

export function useProfile() {
  const { userId } = useSession();
  return useQuery({
    queryKey: keys.profile(userId ?? "anon"),
    enabled: !!userId,
    queryFn: async (): Promise<Profile | null> => {
      const rows = await unwrap<ProfileRow[]>(
        supabase.from("profiles").select("*").eq("id", userId!).limit(1),
      );
      return rows.length ? toProfile(rows[0]) : null;
    },
  });
}

export interface ProfilePatch {
  fullName?: string | null;
  headline?: string | null;
  noticePeriod?: string | null;
  workAuthorization?: string | null;
  salaryExpectation?: string | null;
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  const { userId } = useSession();

  return useMutation({
    mutationFn: async (patch: ProfilePatch) => {
      const payload: Record<string, unknown> = {};
      if (patch.fullName !== undefined) payload.full_name = patch.fullName || null;
      if (patch.headline !== undefined) payload.headline = patch.headline || null;
      if (patch.noticePeriod !== undefined) payload.notice_period = patch.noticePeriod || null;
      if (patch.workAuthorization !== undefined) {
        payload.work_authorization = patch.workAuthorization || null;
      }
      if (patch.salaryExpectation !== undefined) {
        payload.salary_expectation = patch.salaryExpectation || null;
      }
      const row = await unwrap<ProfileRow>(
        supabase.from("profiles").update(payload).eq("id", userId!).select("*").single(),
      );
      return toProfile(row);
    },
    onSuccess: () => {
      if (!userId) return;
      queryClient.invalidateQueries({ queryKey: keys.profile(userId) });
    },
  });
}

// ------------------------------------------------------------- experiences

type ExperienceWithBullets = ExperienceRow & {
  experience_bullets: ExperienceBulletRow[] | null;
};

export function useExperiences() {
  const { userId } = useSession();
  return useQuery({
    queryKey: keys.experiences(userId ?? "anon"),
    enabled: !!userId,
    queryFn: async (): Promise<Experience[]> => {
      const rows = await unwrap<ExperienceWithBullets[]>(
        supabase
          .from("experiences")
          .select("*, experience_bullets(*)")
          .order("sort_order", { ascending: true }),
      );
      return rows.map((row) => ({
        id: row.id,
        title: row.title,
        company: row.company,
        startDate: row.start_date,
        endDate: row.end_date,
        summary: row.summary,
        sortOrder: row.sort_order,
        bullets: (row.experience_bullets ?? [])
          .map(toBullet)
          .sort((a, b) => a.sortOrder - b.sortOrder),
      }));
    },
  });
}

export interface ExperienceDraft {
  title: string;
  company: string;
  startDate?: string | null;
  endDate?: string | null;
  summary?: string | null;
}

export function useCreateExperience() {
  const queryClient = useQueryClient();
  const { userId } = useSession();

  return useMutation({
    mutationFn: async (draft: ExperienceDraft) => {
      const existing = await unwrap<{ id: string }[]>(
        supabase.from("experiences").select("id"),
      );
      return unwrap<ExperienceRow>(
        supabase
          .from("experiences")
          .insert({
            title: draft.title.trim(),
            company: draft.company.trim(),
            start_date: draft.startDate || null,
            end_date: draft.endDate || null,
            summary: draft.summary?.trim() || null,
            sort_order: existing.length,
          })
          .select("*")
          .single(),
      );
    },
    onSuccess: () => {
      if (!userId) return;
      queryClient.invalidateQueries({ queryKey: keys.experiences(userId) });
    },
  });
}

export function useUpdateExperience() {
  const queryClient = useQueryClient();
  const { userId } = useSession();

  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: Partial<ExperienceDraft> & { sortOrder?: number };
    }) => {
      const payload: Record<string, unknown> = {};
      if (patch.title !== undefined) payload.title = patch.title.trim();
      if (patch.company !== undefined) payload.company = patch.company.trim();
      if (patch.startDate !== undefined) payload.start_date = patch.startDate || null;
      if (patch.endDate !== undefined) payload.end_date = patch.endDate || null;
      if (patch.summary !== undefined) payload.summary = patch.summary?.trim() || null;
      if (patch.sortOrder !== undefined) payload.sort_order = patch.sortOrder;
      await unwrap<null>(supabase.from("experiences").update(payload).eq("id", id));
    },
    onSuccess: () => {
      if (!userId) return;
      queryClient.invalidateQueries({ queryKey: keys.experiences(userId) });
    },
  });
}

export function useDeleteExperience() {
  const queryClient = useQueryClient();
  const { userId } = useSession();

  return useMutation({
    mutationFn: async (id: string) => {
      await unwrap<null>(supabase.from("experiences").delete().eq("id", id));
    },
    onSuccess: () => {
      if (!userId) return;
      queryClient.invalidateQueries({ queryKey: keys.experiences(userId) });
    },
  });
}

// ----------------------------------------------------------------- bullets

export function useCreateBullet() {
  const queryClient = useQueryClient();
  const { userId } = useSession();

  return useMutation({
    mutationFn: async ({
      experienceId,
      text,
      sortOrder,
    }: {
      experienceId: string;
      text: string;
      sortOrder: number;
    }) =>
      unwrap<ExperienceBulletRow>(
        supabase
          .from("experience_bullets")
          .insert({ experience_id: experienceId, text: text.trim(), sort_order: sortOrder })
          .select("*")
          .single(),
      ),
    onSuccess: () => {
      if (!userId) return;
      queryClient.invalidateQueries({ queryKey: keys.experiences(userId) });
    },
  });
}

export function useUpdateBullet() {
  const queryClient = useQueryClient();
  const { userId } = useSession();

  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: { text?: string; enabled?: boolean; sortOrder?: number };
    }) => {
      const payload: Record<string, unknown> = {};
      if (patch.text !== undefined) payload.text = patch.text;
      if (patch.enabled !== undefined) payload.enabled = patch.enabled;
      if (patch.sortOrder !== undefined) payload.sort_order = patch.sortOrder;
      await unwrap<null>(supabase.from("experience_bullets").update(payload).eq("id", id));
    },
    onSuccess: () => {
      if (!userId) return;
      queryClient.invalidateQueries({ queryKey: keys.experiences(userId) });
    },
  });
}

export function useDeleteBullet() {
  const queryClient = useQueryClient();
  const { userId } = useSession();

  return useMutation({
    mutationFn: async (id: string) => {
      await unwrap<null>(supabase.from("experience_bullets").delete().eq("id", id));
    },
    onSuccess: () => {
      if (!userId) return;
      queryClient.invalidateQueries({ queryKey: keys.experiences(userId) });
    },
  });
}

/** Swap two bullets' sort_order — the reorder affordance, without drag-and-drop. */
export function useMoveBullet() {
  const queryClient = useQueryClient();
  const { userId } = useSession();

  return useMutation({
    mutationFn: async ({ a, b }: { a: ExperienceBullet; b: ExperienceBullet }) => {
      await unwrap<null>(
        supabase.from("experience_bullets").update({ sort_order: b.sortOrder }).eq("id", a.id),
      );
      await unwrap<null>(
        supabase.from("experience_bullets").update({ sort_order: a.sortOrder }).eq("id", b.id),
      );
    },
    onSuccess: () => {
      if (!userId) return;
      queryClient.invalidateQueries({ queryKey: keys.experiences(userId) });
    },
  });
}

// ------------------------------------------------------------------ skills

export function useSkills() {
  const { userId } = useSession();
  return useQuery({
    queryKey: keys.skills(userId ?? "anon"),
    enabled: !!userId,
    queryFn: async (): Promise<Skill[]> => {
      const rows = await unwrap<SkillRow[]>(
        supabase.from("skills").select("*").order("sort_order", { ascending: true }),
      );
      return rows.map((r) => ({ id: r.id, name: r.name, sortOrder: r.sort_order }));
    },
  });
}

export function useAddSkill() {
  const queryClient = useQueryClient();
  const { userId } = useSession();

  return useMutation({
    mutationFn: async (name: string) => {
      const existing = await unwrap<{ id: string }[]>(supabase.from("skills").select("id"));
      await unwrap<null>(
        supabase.from("skills").insert({ name: name.trim(), sort_order: existing.length }),
      );
    },
    onSuccess: () => {
      if (!userId) return;
      queryClient.invalidateQueries({ queryKey: keys.skills(userId) });
    },
  });
}

export function useDeleteSkill() {
  const queryClient = useQueryClient();
  const { userId } = useSession();

  return useMutation({
    mutationFn: async (id: string) => {
      await unwrap<null>(supabase.from("skills").delete().eq("id", id));
    },
    onSuccess: () => {
      if (!userId) return;
      queryClient.invalidateQueries({ queryKey: keys.skills(userId) });
    },
  });
}

// ----------------------------------------------------------------- context

/** Everything the AI provider is allowed to reason over, loaded once. */
export function useProfileContext(): ProfileContext & { loading: boolean } {
  const profile = useProfile();
  const experiences = useExperiences();
  const skills = useSkills();

  return {
    profile: profile.data ?? null,
    experiences: experiences.data ?? [],
    skills: skills.data ?? [],
    loading: profile.isLoading || experiences.isLoading || skills.isLoading,
  };
}

/**
 * The standing review: concrete, checkable gaps in the profile. Deliberately
 * rule-based — it points at things the user can see and fix, not a score.
 */
export function profileGaps(
  profile: Profile | null | undefined,
  experiences: Experience[],
  skills: Skill[],
): string[] {
  const gaps: string[] = [];
  if (!profile?.fullName) gaps.push("your name is missing");
  if (!experiences.length) gaps.push("no experience added yet");

  const bullets = experiences.flatMap((e) => e.bullets);
  const unquantified = bullets.filter((b) => b.enabled && !/\d/.test(b.text));
  if (unquantified.length) {
    gaps.push(
      `no quantified impact on ${unquantified.length} bullet${unquantified.length === 1 ? "" : "s"}`,
    );
  }

  const mostRecent = experiences[0];
  if (mostRecent && !mostRecent.summary) {
    gaps.push("your most recent role is missing a summary");
  }
  if (experiences.some((e) => !e.bullets.length)) {
    gaps.push("a role has no bullets");
  }
  if (skills.length < 3) gaps.push("fewer than three skills listed");
  if (!profile?.workAuthorization) gaps.push("work authorization is blank, so autofill can't use it");

  return gaps;
}
