"use client";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
let client: SupabaseClient | null = null;
let citizenClient: SupabaseClient | null = null;

export type ReporterContext = {
  ownerUserId: string;
  headers: Record<string, string>;
};
export function browserSupabase() {
  if (!client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const publishableKey =
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !publishableKey) throw new Error("Supabase browser environment is not configured");
    client = createClient(url, publishableKey, {
      auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true },
    });
  }
  return client;
}
export function citizenSupabase() {
  if (!citizenClient) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) throw new Error("Supabase browser environment is not configured");
    citizenClient = createClient(url, key, {
      auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: false, storageKey: "signa-citizen-auth-v1" },
    });
  }
  return citizenClient;
}
export async function getCitizenSession() {
  const citizen = citizenSupabase();
  const current = await citizen.auth.getSession();
  if (current.data.session) return current;
  const legacy = await browserSupabase().auth.getSession();
  if (legacy.data.session?.user.is_anonymous) {
    const migrated = await citizen.auth.setSession({
      access_token: legacy.data.session.access_token,
      refresh_token: legacy.data.session.refresh_token,
    });
    if (!migrated.error) {
      await browserSupabase().auth.signOut({ scope: "local" });
      return citizen.auth.getSession();
    }
  }
  return current;
}
export async function getReporterContext(options: {
  createIfMissing?: boolean;
} = {}): Promise<ReporterContext | null> {
  const { data: { session: currentSession } } = await getCitizenSession();
  let session = currentSession;
  if (!session) {
    if (options.createIfMissing === false) return null;
    const attempt = await citizenSupabase().auth.signInAnonymously();
    if (attempt.error || !attempt.data.session) throw new Error("Could not establish an online reporter session");
    session = attempt.data.session;
  }
  const context = {
    ownerUserId: session.user.id,
    headers: { authorization: `Bearer ${session.access_token}` },
  };
  return context;
}

export async function bearerHeaders() {
  const context = await getReporterContext();
  if (!context) throw new Error("Could not establish an online reporter session");
  return context.headers;
}
