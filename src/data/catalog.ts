import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase, unwrap } from "../lib/supabase";
import type {
  CatalogCompanyRow,
  CatalogLevelRow,
  CatalogRoleAliasRow,
  CatalogRoleRow,
} from "../lib/db.types";
import type { CatalogCompany, CatalogLevel, CatalogRole } from "../types";
import { useSession } from "../auth/SessionProvider";
import { keys } from "./queryKeys";

function toLevel(row: CatalogLevelRow): CatalogLevel {
  return { id: row.id, label: row.label, sortOrder: row.sort_order };
}

function toCompany(row: CatalogCompanyRow): CatalogCompany {
  return {
    id: row.id,
    name: row.name,
    domain: row.domain,
    linkedinCompanyId: row.linkedin_company_id,
  };
}

function toRole(row: CatalogRoleRow): CatalogRole {
  return { id: row.id, name: row.name };
}

export function useCatalogLevels() {
  return useQuery({
    queryKey: keys.catalogLevels(),
    queryFn: async (): Promise<CatalogLevel[]> => {
      const rows = await unwrap<CatalogLevelRow[]>(
        supabase.from("catalog_levels").select("*").order("sort_order", { ascending: true }),
      );
      return rows.map(toLevel);
    },
    staleTime: 60 * 60 * 1000,
  });
}

export function useCatalogCompanies() {
  return useQuery({
    queryKey: keys.catalogCompanies(),
    queryFn: async (): Promise<CatalogCompany[]> => {
      const rows = await unwrap<CatalogCompanyRow[]>(
        supabase.from("catalog_companies").select("*").order("name", { ascending: true }),
      );
      return rows.map(toCompany);
    },
    staleTime: 60 * 60 * 1000,
  });
}

/**
 * Roles plus aliases so typing "swe" or "SDE" surfaces Software Engineer.
 * Returned as role rows; aliases are folded into search on the client.
 */
export function useCatalogRoles() {
  return useQuery({
    queryKey: keys.catalogRoles(),
    queryFn: async (): Promise<{ roles: CatalogRole[]; aliases: { alias: string; roleId: string }[] }> => {
      const [roles, aliases] = await Promise.all([
        unwrap<CatalogRoleRow[]>(
          supabase.from("catalog_roles").select("*").order("name", { ascending: true }),
        ),
        unwrap<CatalogRoleAliasRow[]>(
          supabase.from("catalog_role_aliases").select("*"),
        ),
      ]);
      return {
        roles: roles.map(toRole),
        aliases: aliases.map((a) => ({ alias: a.alias, roleId: a.role_id })),
      };
    },
    staleTime: 60 * 60 * 1000,
  });
}

/** Filter companies by typed query (name or id substring). */
export function filterCompanies(companies: CatalogCompany[], query: string, limit = 12): CatalogCompany[] {
  const q = query.trim().toLowerCase();
  if (!q) return companies.slice(0, limit);
  return companies
    .filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.id.includes(q) ||
        (c.domain?.toLowerCase().includes(q) ?? false),
    )
    .slice(0, limit);
}

/** Filter roles by name or any alias that points at them. */
export function filterRoles(
  roles: CatalogRole[],
  aliases: { alias: string; roleId: string }[],
  query: string,
  limit = 12,
): CatalogRole[] {
  const q = query.trim().toLowerCase();
  if (!q) return roles.slice(0, limit);
  const fromAlias = new Set(
    aliases.filter((a) => a.alias.toLowerCase().includes(q)).map((a) => a.roleId),
  );
  return roles
    .filter((r) => r.name.toLowerCase().includes(q) || r.id.includes(q) || fromAlias.has(r.id))
    .slice(0, limit);
}

export function useRequestCatalogItem() {
  const { userId } = useSession();

  return useMutation({
    mutationFn: async ({
      kind,
      name,
      notes,
    }: {
      kind: "company" | "role";
      name: string;
      notes?: string;
    }) => {
      if (!userId) throw new Error("Sign in again to continue.");
      const trimmed = name.trim();
      if (trimmed.length < 2) throw new Error("Enter a name to request.");
      await unwrap(
        supabase.from("catalog_requests").insert({
          kind,
          name: trimmed,
          notes: notes?.trim() || null,
        }),
      );
    },
  });
}
