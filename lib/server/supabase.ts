import "server-only";
import { createClient } from "@supabase/supabase-js";

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Server configuration missing: ${name}`);
  return value;
}

function serverKey(): string {
  const value = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!value) throw new Error("Server configuration missing: SUPABASE_SECRET_KEY");
  return value;
}

function publicKey(): string {
  const value = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!value) throw new Error("Server configuration missing: NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  return value;
}

export function adminClient() {
  return createClient(env("NEXT_PUBLIC_SUPABASE_URL"), serverKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
export function identityClient() {
  return createClient(env("NEXT_PUBLIC_SUPABASE_URL"), publicKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
