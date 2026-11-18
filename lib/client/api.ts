"use client";
import { browserSupabase } from "./supabase";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Authenticated fetch for staff screens.
 * Unlike the reporter helper it never falls back to an anonymous session —
 * staff must already hold a signed-in Supabase session.
 */
export async function staffFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const { data: { session } } = await browserSupabase().auth.getSession();
  if (!session) throw new ApiError(401, "Sign in required");

  const response = await fetch(path, {
    ...init,
    cache: "no-store",
    headers: {
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...(init?.headers || {}),
      authorization: `Bearer ${session.access_token}`,
    },
  });

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(
      response.status,
      body?.error?.message || `Request failed (HTTP ${response.status})`,
    );
  }
  return body as T;
}
