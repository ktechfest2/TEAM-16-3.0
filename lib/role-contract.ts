export const roles = ["reporter", "monitor", "coordinator", "admin"] as const;
export type Role = (typeof roles)[number];

/** Resolve authority only from a server-loaded profile row, never auth metadata. */
export function trustedRole(profile: unknown): Role | null {
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) return null;
  const role = (profile as Record<string, unknown>).role;
  return typeof role === "string" && roles.includes(role as Role) ? (role as Role) : null;
}
