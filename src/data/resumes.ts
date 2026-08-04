import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase, unwrap } from "../lib/supabase";
import type { ResumeReportRow, ResumeRow } from "../lib/db.types";
import type { Resume } from "../types";
import { ai, ATS_LAYOUTS } from "../lib/ai";
import type {
  AnalysisProgress,
  AtsReport,
  ParsedResume,
  ParsedResumeExperience,
  ResumeAnalysis,
} from "../lib/ai";
import { fileSize } from "../lib/format";
import { useSession } from "../auth/SessionProvider";
import { keys } from "./queryKeys";
import {
  useAddSkill,
  useCreateBullet,
  useCreateExperience,
  useDeleteExperience,
  useExperiences,
  useProfile,
  useSkills,
  useUpdateProfile,
} from "./profile";

const BUCKET = "resumes";

/** The bucket's own cap, checked here so a doomed file never leaves the browser. */
export const MAX_RESUME_BYTES = 10 * 1024 * 1024;

const SIGNED_URL_TTL_SECONDS = 600;

/**
 * How long an `analyzing` row is believed before it's treated as abandoned.
 *
 * Must match `ANALYSIS_LOCK_MS` in `supabase/functions/analyze-resume`: that is
 * the window the function refuses a second run inside, so believing it for
 * longer strands the user in front of a spinner for a run that has already
 * stopped, and believing it for less offers a button the server would refuse.
 * Two deployables, one number, no way to import it across the gap.
 */
const ANALYZING_STALE_MS = 3 * 60 * 1000;

/**
 * An analysis that stopped without saying so — the process died between setting
 * `analyzing` and writing an outcome. Nothing will ever move this row, so the
 * screen has to offer the button again instead of spinning forever.
 */
export function isAnalysisStale(resume: Resume): boolean {
  if (resume.status !== "analyzing") return false;
  const startedAt = Date.parse(resume.updatedAt);
  if (Number.isNaN(startedAt)) return true;
  return Date.now() - startedAt >= ANALYZING_STALE_MS;
}

function toResume(row: ResumeRow): Resume {
  return {
    id: row.id,
    storagePath: row.storage_path,
    fileName: row.file_name,
    mimeType: row.mime_type,
    byteSize: row.byte_size,
    pageCount: row.page_count,
    status: row.status,
    error: row.error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Why this file can't be used, phrased for the person who picked it, or null.
 * Exported so the drop zone can refuse before a mutation is even started.
 */
export function resumeFileProblem(file: File): string | null {
  if (/\.docx?$/i.test(file.name)) {
    return `Word documents aren't supported. Open “${file.name}”, export it as a PDF, and upload that — half of an ATS review is about layout, and only the PDF carries the layout a parser actually sees.`;
  }
  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  if (!isPdf) {
    return `“${file.name}” isn't a PDF. Export it as a PDF and upload that — a PDF is the only format we can read the layout of, and layout is half of an ATS review.`;
  }
  if (file.size === 0) return "That file is empty — nothing came through.";
  if (file.size > MAX_RESUME_BYTES) {
    return `That file is ${fileSize(file.size)} and the limit is 10 MB. Re-export it with the images compressed and it'll fit.`;
  }
  return null;
}

// ------------------------------------------------------------- base resume

export interface BaseResumeState {
  resume: Resume | null;
  isLoading: boolean;
  error: unknown;
}

/**
 * The upload `profiles.base_resume_id` points at. Two reads rather than an
 * embedded join, so the resume row is cached under its own key and can be
 * invalidated on its own when its status moves.
 */
export function useBaseResume(): BaseResumeState {
  const { userId } = useSession();
  const profile = useProfile();
  const baseResumeId = profile.data?.baseResumeId ?? null;

  const query = useQuery({
    queryKey: keys.resume(userId ?? "anon", baseResumeId ?? "none"),
    enabled: !!userId && !!baseResumeId,
    // An analysis outlives the request that started it, so a reload mid-run has
    // to find out when it lands rather than sit on a stale "analyzing". Polling
    // stops once the row is past the lock window: nothing is coming, and the
    // screen switches to offering the run again.
    refetchInterval: (query) => {
      const resume = query.state.data;
      if (!resume || resume.status !== "analyzing") return false;
      return isAnalysisStale(resume) ? false : 4000;
    },
    queryFn: async (): Promise<Resume | null> => {
      const rows = await unwrap<ResumeRow[]>(
        supabase.from("resumes").select("*").eq("id", baseResumeId!).limit(1),
      );
      return rows.length ? toResume(rows[0]) : null;
    },
  });

  return {
    resume: query.data ?? null,
    isLoading: profile.isLoading || (!!baseResumeId && query.isPending),
    error: profile.error ?? query.error,
  };
}

// ------------------------------------------------------------------ report

/**
 * The stored analysis for one upload, or null when nothing has analyzed it.
 *
 * A `resume_reports` row exists only because the Edge Function wrote one, and
 * the local provider never writes — so anything read back here is a real
 * analysis, and `sample` is false by construction. A sample analysis lives in
 * this cache and nowhere else, which is why the query never goes stale: a
 * refetch would answer null and quietly replace it with an empty screen.
 */
export function useResumeReport(resumeId: string | null | undefined) {
  const { userId } = useSession();
  return useQuery({
    queryKey: keys.resumeReport(userId ?? "anon", resumeId ?? "none"),
    enabled: !!userId && !!resumeId,
    staleTime: Infinity,
    queryFn: async (): Promise<ResumeAnalysis | null> => {
      const rows = await unwrap<ResumeReportRow[]>(
        supabase
          .from("resume_reports")
          .select("*")
          .eq("resume_id", resumeId!)
          .order("created_at", { ascending: false })
          .limit(1),
      );
      if (!rows.length) return null;
      const row = rows[0];
      const { parsed, partial } = readParse(row.parsed);
      return {
        report: withLayout(row.report),
        parsed,
        // Carried through because the rewrite pass hangs off this exact row.
        reportId: row.id,
        model: row.model,
        sample: false,
        partialParse: partial,
      };
    },
  });
}

/**
 * A stored parse, with the sections a newer analyzer captures filled in.
 *
 * `parsed` is jsonb, so a row written by an earlier version is missing keys the
 * type declares — reading `parsed.education.length` on one would throw. They are
 * defaulted to empty arrays here, and `partial` records *why* they are empty, so
 * the difference between "this resume has no projects" and "nobody looked for
 * projects" survives. Only the rebuild cares, and it cares completely: rendering
 * a new resume from a parse of the second kind drops sections the candidate has.
 */
function readParse(raw: ParsedResume): { parsed: ParsedResume; partial: boolean } {
  const partial =
    !Array.isArray(raw.education) ||
    !Array.isArray(raw.projects) ||
    !Array.isArray(raw.certifications);

  return {
    partial,
    parsed: {
      ...raw,
      summary: raw.summary ?? null,
      links: raw.links ?? [],
      experiences: raw.experiences ?? [],
      education: raw.education ?? [],
      projects: raw.projects ?? [],
      certifications: raw.certifications ?? [],
      skills: raw.skills ?? [],
    },
  };
}

/**
 * A stored report predating the `layout` field reads as the conventional layout.
 *
 * `report` is jsonb, so the column accepts yesterday's shape and the type says
 * nothing about it. Absent is read the same way the server reads unrecognised —
 * as `single_column_text` — which withholds the rebuild offer rather than telling
 * someone their resume has a structural problem nothing actually observed. The
 * alternative, re-running the analysis to fill the field in, would bill them for
 * a report they already have.
 */
function withLayout(report: AtsReport): AtsReport {
  const known = ATS_LAYOUTS.some((layout) => layout === report.layout);
  return known ? report : { ...report, layout: "single_column_text" };
}

/** A short-lived link to the stored PDF. The bucket is private; nothing else reaches it. */
export function useResumeFileUrl(resume: Resume | null | undefined) {
  const { userId } = useSession();
  return useQuery({
    queryKey: keys.resumeFile(userId ?? "anon", resume?.id ?? "none"),
    enabled: !!userId && !!resume,
    // Re-signed a minute before it expires, so a link on screen always opens.
    staleTime: (SIGNED_URL_TTL_SECONDS - 60) * 1000,
    queryFn: async (): Promise<string> => {
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(resume!.storagePath, SIGNED_URL_TTL_SECONDS);
      if (error) throw new Error(error.message);
      if (!data?.signedUrl) throw new Error("Couldn't produce a link to that file.");
      return data.signedUrl;
    },
  });
}

// ----------------------------------------------------------------- analysis

export interface AnalyzeResumeInput {
  resumeId: string;
  /** Re-runs an analysis the server would otherwise refuse. Costs a model call. */
  force?: boolean;
}

/** The live progress of the analysis this hook is running, or null when idle. */
export type AnalysisProgressState = AnalysisProgress | null;

/**
 * Analyze an upload that is already in storage — the retry path, and the re-run.
 *
 * `resumes.status` is written only by the Edge Function, never from here. The
 * function's time-boxed `analyzing` lock is the one thing standing between a
 * double-click and two billed calls, and a client that wrote `failed` on every
 * thrown error would release that lock on the very refusal it was protecting:
 * press once, get refused, row flips to `failed`, press again, get billed.
 * Refusals that cost nothing (lock held, daily cap) leave the row untouched on
 * purpose, and the failures that are about the file are already recorded
 * server-side with a better message than this side can produce.
 */
export function useAnalyzeResume() {
  const queryClient = useQueryClient();
  const { userId } = useSession();
  const [progress, setProgress] = useState<AnalysisProgressState>(null);

  const mutation = useMutation({
    mutationFn: ({ resumeId, force = false }: AnalyzeResumeInput) =>
      ai.analyzeResume(resumeId, { force, onProgress: setProgress }),
    onSuccess: (analysis, { resumeId }) => {
      if (!userId) return;
      queryClient.setQueryData(keys.resumeReport(userId, resumeId), analysis);
      queryClient.invalidateQueries({ queryKey: keys.resume(userId, resumeId) });
    },
    onError: (_error, { resumeId }) => {
      if (!userId) return;
      queryClient.invalidateQueries({ queryKey: keys.resume(userId, resumeId) });
    },
    onSettled: () => setProgress(null),
  });

  // Carried alongside the mutation rather than inside it: react-query owns the
  // result, and this is the part that has to re-render a dozen times before
  // there is one.
  return { ...mutation, progress };
}

// ------------------------------------------------------------------- upload

/** Which leg of the upload is running, so the screen can name it instead of spinning. */
export type UploadPhase = "idle" | "uploading" | "saving" | "done";

export interface UploadResumeInput {
  file: File;
  /** Called as each leg starts. The phase is ephemeral, so the caller holds it. */
  onPhase?: (phase: UploadPhase) => void;
}

export interface UploadedResume {
  resumeId: string;
}

/**
 * Store a PDF and point the profile at it. Deliberately stops there.
 *
 * Analysis is a separate, explicitly pressed action: it is the only thing here
 * that costs a model call, so it never rides along on a file picker. The row
 * lands on `uploaded`, which is exactly what has happened.
 */
export function useUploadResume() {
  const queryClient = useQueryClient();
  const { userId } = useSession();

  return useMutation({
    mutationFn: async ({ file, onPhase }: UploadResumeInput): Promise<UploadedResume> => {
      const problem = resumeFileProblem(file);
      if (problem) throw new Error(problem);
      if (!userId) throw new Error("Your session expired. Sign in again and re-pick the file.");

      // The leading path segment is the entire authorization story for storage,
      // so the id is minted here and used for both the object and the row —
      // there is no window in which one exists under a name the other can't find.
      const resumeId = crypto.randomUUID();
      const storagePath = `${userId}/${resumeId}.pdf`;

      onPhase?.("uploading");
      const upload = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, file, { contentType: "application/pdf", upsert: false });
      if (upload.error) throw new Error(upload.error.message);

      onPhase?.("saving");
      try {
        await unwrap<ResumeRow>(
          supabase
            .from("resumes")
            .insert({
              id: resumeId,
              storage_path: storagePath,
              file_name: file.name,
              mime_type: "application/pdf",
              byte_size: file.size,
            })
            .select("*")
            .single(),
        );
      } catch (e) {
        // An object with no row is unreachable from the app and invisible in
        // every count, so it would sit in the bucket forever.
        await supabase.storage.from(BUCKET).remove([storagePath]);
        throw e;
      }

      // The newest upload becomes the base resume whether or not it is ever
      // analyzed, so the card has something to show its state on.
      await unwrap<null>(
        supabase.from("profiles").update({ base_resume_id: resumeId }).eq("id", userId),
      );

      onPhase?.("done");
      return { resumeId };
    },
    onSuccess: ({ resumeId }) => {
      if (!userId) return;
      queryClient.invalidateQueries({ queryKey: keys.profile(userId) });
      queryClient.invalidateQueries({ queryKey: keys.resume(userId, resumeId) });
    },
    onError: () => {
      if (!userId) return;
      // The row and the pointer can both exist even though a later step threw.
      queryClient.invalidateQueries({ queryKey: keys.profile(userId) });
    },
  });
}

// ------------------------------------------------------------------- delete

export function useDeleteResume() {
  const queryClient = useQueryClient();
  const { userId } = useSession();

  return useMutation({
    mutationFn: async (resume: Resume): Promise<string> => {
      // Object first: a row with no file can be seen and re-uploaded, a file
      // with no row can't be seen at all.
      const { error } = await supabase.storage.from(BUCKET).remove([resume.storagePath]);
      if (error) throw new Error(error.message);
      await unwrap<null>(supabase.from("resumes").delete().eq("id", resume.id));
      return resume.id;
    },
    onSuccess: (resumeId) => {
      if (!userId) return;
      queryClient.removeQueries({ queryKey: keys.resumeReport(userId, resumeId) });
      queryClient.removeQueries({ queryKey: keys.resumeFile(userId, resumeId) });
      queryClient.invalidateQueries({ queryKey: keys.resume(userId, resumeId) });
      // base_resume_id is `on delete set null`, so the profile clears itself.
      queryClient.invalidateQueries({ queryKey: keys.profile(userId) });
    },
  });
}

// ------------------------------------------------------- apply to the spine

export type ApplyMode = "add" | "replace";

export interface ApplyParsedResumeInput {
  /** "replace" deletes the roles already on the profile. Only ever asked for. */
  mode: ApplyMode;
  /** Written only when the user left it ticked; blank strings are ignored. */
  fullName?: string | null;
  headline?: string | null;
  experiences: ParsedResumeExperience[];
  skills: string[];
}

export interface ApplyParsedResumeResult {
  rolesAdded: number;
  bulletsAdded: number;
  skillsAdded: number;
  /** Skills the profile already had, matched case-insensitively and left alone. */
  skillsAlreadyThere: number;
  rolesRemoved: number;
}

/**
 * Write a reviewed parse into the profile spine.
 *
 * Composed out of the per-row hooks in `./profile` rather than a bulk insert,
 * because a bulk insert would need its own sort-order and trimming rules and
 * they would drift from the ones the profile screen already uses. The single
 * invalidation is here, at the end, rather than one per row.
 */
export function useApplyParsedResume() {
  const queryClient = useQueryClient();
  const { userId } = useSession();
  const experiences = useExperiences();
  const skills = useSkills();
  const updateProfile = useUpdateProfile();
  const createExperience = useCreateExperience();
  const deleteExperience = useDeleteExperience();
  const createBullet = useCreateBullet();
  const addSkill = useAddSkill();

  return useMutation({
    mutationFn: async (input: ApplyParsedResumeInput): Promise<ApplyParsedResumeResult> => {
      const result: ApplyParsedResumeResult = {
        rolesAdded: 0,
        bulletsAdded: 0,
        skillsAdded: 0,
        skillsAlreadyThere: 0,
        rolesRemoved: 0,
      };

      const fullName = input.fullName?.trim();
      const headline = input.headline?.trim();
      if (fullName || headline) {
        await updateProfile.mutateAsync({
          ...(fullName ? { fullName } : {}),
          ...(headline ? { headline } : {}),
        });
      }

      if (input.mode === "replace") {
        // Refetched rather than read from cache: this deletes the user's own
        // work, so it has to act on what is there now, not what was there when
        // the review screen mounted.
        const current = (await experiences.refetch()).data ?? [];
        for (const existing of current) {
          await deleteExperience.mutateAsync(existing.id);
          result.rolesRemoved += 1;
        }
      }

      for (const role of input.experiences) {
        const created = await createExperience.mutateAsync({
          title: role.title,
          company: role.company,
          startDate: role.startDate,
          endDate: role.endDate,
        });
        result.rolesAdded += 1;
        const bullets = role.bullets.map((b) => b.trim()).filter(Boolean);
        for (let i = 0; i < bullets.length; i++) {
          await createBullet.mutateAsync({
            experienceId: created.id,
            text: bullets[i],
            sortOrder: i,
          });
          result.bulletsAdded += 1;
        }
      }

      const taken = new Set(
        ((await skills.refetch()).data ?? []).map((s) => s.name.trim().toLowerCase()),
      );
      for (const name of input.skills) {
        const key = name.trim().toLowerCase();
        if (!key) continue;
        if (taken.has(key)) {
          result.skillsAlreadyThere += 1;
          continue;
        }
        await addSkill.mutateAsync(name);
        taken.add(key);
        result.skillsAdded += 1;
      }

      return result;
    },
    onSuccess: () => {
      if (!userId) return;
      queryClient.invalidateQueries({ queryKey: keys.profile(userId) });
      queryClient.invalidateQueries({ queryKey: keys.experiences(userId) });
      queryClient.invalidateQueries({ queryKey: keys.skills(userId) });
    },
  });
}
