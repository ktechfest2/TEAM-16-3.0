"use client";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
let client: SupabaseClient | null = null;
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
export async function bearerHeaders() {
  const supabase = browserSupabase();
  let { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    const attempt = await supabase.auth.signInAnonymously();
    if (attempt.error || !attempt.data.session) throw new Error("Could not establish an online reporter session");
    session = attempt.data.session;
  }
  return { authorization: `Bearer ${session.access_token}` };
}
