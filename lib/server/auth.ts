import "server-only";
import { adminClient, identityClient } from "./supabase";
export type Role = "reporter" | "monitor" | "coordinator" | "admin";
export type Viewer = { userId: string; role: Role };
export class AccessError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export async function getViewer(req: Request, permitted?: Role[]): Promise<Viewer> {
  const header = req.headers.get("authorization") || "";
  if (!header.startsWith("Bearer ") || !header.slice(7).trim()) throw new AccessError(401, "Sign in required");
  const { data, error } = await identityClient().auth.getUser(header.slice(7));
  if (error || !data.user) throw new AccessError(401, "Session expired or invalid");
  const { data: profile, error: profileError } = await adminClient()
    .from("profiles").select("role").eq("id", data.user.id).maybeSingle();
  if (profileError || !profile?.role) throw new AccessError(403, "No authorised profile");
  const role = profile.role as Role;
  if (permitted && !permitted.includes(role)) throw new AccessError(403, "Not authorised");
  return { userId: data.user.id, role };
}
