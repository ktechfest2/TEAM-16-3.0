import { NextResponse } from "next/server";
import { parseDemoRole } from "@/lib/demo-contract";
import { demoConfiguration } from "@/lib/server/demo-access";
import { adminClient, identityClient } from "@/lib/server/supabase";
import { enforceAbuseLimit } from "@/lib/server/rate-limit";
import { AccessError } from "@/lib/server/auth";
import { DependencyUnavailableError, errorResponse, noStore } from "@/lib/server/responses";
import { InputError } from "@/lib/report-contract";
import { trustedRole } from "@/lib/role-contract";

export async function POST(req: Request) {
  try {
    let config;
    try { config = demoConfiguration(); } catch { throw new DependencyUnavailableError("Demo access is not configured"); }
    if (!config.enabled) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Demo access is unavailable" } }, { status: 404, headers: noStore });
    const origin = req.headers.get("origin");
    if (!origin || new URL(origin).origin !== new URL(req.url).origin) throw new AccessError(403, "Invalid demo session origin");
    const body = await req.json().catch(() => null) as { role?: unknown } | null;
    const demoRole = parseDemoRole(body?.role);
    if (!demoRole) throw new InputError("Choose a valid demonstration role");
    await enforceAbuseLimit(req, `demo-access:${demoRole}`, { scope: "voice", reporterMax: 30, ipMax: 20, windowSeconds: 600 });

    const account = config.accounts[demoRole];
    const { data, error } = await identityClient().auth.signInWithPassword({ email: account.email, password: account.password });
    if (error || !data.user || !data.session || data.user.id.toLowerCase() !== account.userId)
      throw new DependencyUnavailableError("Demo identity is unavailable");
    const { data: profile, error: profileError } = await adminClient().from("profiles").select("role").eq("id", data.user.id).maybeSingle();
    if (profileError || trustedRole(profile) !== account.trustedRole)
      throw new DependencyUnavailableError("Demo role is not provisioned");
    const expiresAt = data.session.expires_at;
    const remaining = typeof expiresAt === "number" ? expiresAt - Math.floor(Date.now() / 1000) : 0;
    if (remaining < 60 || remaining > config.maxSessionSeconds + 60)
      throw new DependencyUnavailableError("Demo token lifetime is not safely bounded");

    return NextResponse.json({
      session: { accessToken: data.session.access_token, refreshToken: data.session.refresh_token, expiresAt },
      destination: account.destination,
      role: demoRole,
    }, { headers: noStore });
  } catch (error) {
    return errorResponse(error);
  }
}
