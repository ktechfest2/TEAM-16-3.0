"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { browserSupabase, citizenSupabase } from "@/lib/client/supabase";
import type { DemoRole } from "@/lib/demo-contract";

const options: { role: DemoRole; label: string; detail: string }[] = [
  { role: "citizen", label: "Citizen", detail: "Submit and track a fictional alert" },
  { role: "reviewer1", label: "Incident Reviewer 1", detail: "Create and inspect a fictional case" },
  { role: "reviewer2", label: "Independent Reviewer 2", detail: "Record an independent review" },
  { role: "coordinator", label: "Response Coordinator", detail: "Acknowledge and record follow-up" },
];

export function DemoAccessPanel({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState<DemoRole | null>(null);
  const [error, setError] = useState("");

  async function enter(role: DemoRole) {
    if (!enabled || loading) return;
    setLoading(role);
    setError("");
    try {
      const response = await fetch("/api/demo/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role }),
        cache: "no-store",
      });
      const body = await response.json().catch(() => null) as { session?: { accessToken?: string; refreshToken?: string; expiresAt?: number }; destination?: string; error?: { message?: string } } | null;
      if (!response.ok || !body?.session?.accessToken || !body.session.refreshToken || !body.session.expiresAt || !body.destination)
        throw new Error(body?.error?.message || "Demo session could not be started");
      const target = role === "citizen" ? citizenSupabase() : browserSupabase();
      const other = role === "citizen" ? browserSupabase() : citizenSupabase();
      await other.auth.signOut({ scope: "local" });
      const { error: sessionError } = await target.auth.setSession({ access_token: body.session.accessToken, refresh_token: body.session.refreshToken });
      if (sessionError) throw new Error("Demo session could not be established");
      target.auth.stopAutoRefresh();
      const expiresInMs = Math.max(0, body.session.expiresAt * 1000 - Date.now());
      window.setTimeout(() => void target.auth.signOut({ scope: "local" }), expiresInMs);
      router.push(body.destination);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Demo session could not be started");
      setLoading(null);
    }
  }

  return <section className="mt-6 rounded-[18px] bg-white p-5 ring-1 ring-[var(--hairline)]" aria-labelledby="try-signa-title">
    <h2 id="try-signa-title" className="text-xl font-semibold">Try Signa</h2>
    <p className="mt-2 text-sm text-slate-ink">{enabled
      ? "Choose a role for the isolated fictional demonstration. Sessions are temporary and cannot access the live citizen workspace."
      : "One-click access remains unavailable until a separate fictional demonstration project and its controlled accounts are configured."}</p>
    <div className="mt-4 grid gap-2 sm:grid-cols-2">{options.map((option) => <button
      key={option.role}
      type="button"
      disabled={!enabled || !!loading}
      onClick={() => void enter(option.role)}
      className="min-h-14 rounded-xl border border-[var(--hairline)] bg-canvas px-3 py-2 text-left text-sm font-medium text-navy disabled:cursor-not-allowed disabled:text-slate-ink/70"
      aria-label={enabled ? `Try Signa as ${option.label}` : `${option.label} demo unavailable`}
    ><span className="block font-semibold">{option.label}{loading === option.role ? " · opening…" : !enabled ? " · unavailable" : ""}</span><span className="mt-0.5 block text-xs font-normal text-slate-ink/75">{option.detail}</span></button>)}</div>
    {error && <p role="alert" className="mt-3 text-sm text-alert">{error}</p>}
    {enabled && <p className="mt-3 text-xs leading-relaxed text-muted-ink">Demo access is restricted to fictional records. Acknowledgement means internal responsibility, not emergency dispatch or official intervention.</p>}
  </section>;
}
