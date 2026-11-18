"use client";
import * as React from "react";
import { KeyRound, Lock, ShieldCheck } from "lucide-react";
import { browserSupabase } from "@/lib/client/supabase";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { Reveal } from "./motion";

/**
 * Sign-in panel for restricted workspaces. Roles are assigned by a trusted admin
 * in the database — there is no self-service role selection anywhere in Signa.
 */
export function StaffGate({
  title, description, onSignedIn,
}: {
  title: string;
  description: string;
  onSignedIn: () => void | Promise<void>;
}) {
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");

  async function signIn(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const { error: signInError } = await browserSupabase().auth.signInWithPassword({ email, password });
    setBusy(false);
    if (signInError) {
      setError("Could not sign in. Check the address and password, or ask an admin to approve this account.");
      return;
    }
    await onSignedIn();
  }

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-8 py-6 lg:grid-cols-[1fr_0.9fr] lg:items-center">
      <Reveal>
        <span className="inline-flex items-center gap-2 rounded-full bg-[rgba(15,23,42,0.05)] px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-ink">
          <Lock className="size-3.5" aria-hidden /> Restricted workspace
        </span>
        <h1 className="mt-5 text-[32px] font-semibold leading-[1.08] sm:text-[40px]">{title}</h1>
        <p className="mt-4 max-w-md text-[15.5px] leading-relaxed text-slate-ink/85">{description}</p>
        <ul className="mt-7 space-y-3">
          {[
            "Accounts are provisioned by a trusted admin, never self-selected.",
            "Incoming reports are unverified allegations until a human review is recorded.",
            "Every state change is written to an auditable case timeline.",
          ].map((item) => (
            <li key={item} className="flex items-start gap-2.5 text-[13.5px] leading-relaxed text-slate-ink/85">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-trust" aria-hidden />
              {item}
            </li>
          ))}
        </ul>
      </Reveal>

      <Reveal delay={0.1}>
        <Card className="p-6 sm:p-7">
          <div className="flex items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-[11px] bg-midnight text-white">
              <KeyRound className="size-4" aria-hidden />
            </span>
            <h2 className="text-[17px] font-semibold">Approved staff sign-in</h2>
          </div>
          <form className="mt-6 space-y-4" onSubmit={signIn}>
            <Field label="Work email" htmlFor="email">
              <Input
                id="email"
                type="email"
                required
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@organisation.org"
              />
            </Field>
            <Field label="Password" htmlFor="password">
              <Input
                id="password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            <Button type="submit" variant="primary" size="lg" full loading={busy}>
              Sign in
            </Button>
            {error && (
              <p role="alert" className="text-[13px] leading-relaxed text-alert">
                {error}
              </p>
            )}
          </form>
          <p className="mt-5 border-t border-[var(--hairline)] pt-4 text-[12.5px] leading-relaxed text-slate-ink/70">
            Signing in does not grant a role. Access depends on the role stored against your
            profile by an administrator.
          </p>
        </Card>
      </Reveal>
    </div>
  );
}
