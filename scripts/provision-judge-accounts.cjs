#!/usr/bin/env node
const { createClient } = require("@supabase/supabase-js");
const { randomBytes } = require("node:crypto");
const { writeFileSync } = require("node:fs");
const { isAbsolute, relative } = require("node:path");

const apply = process.argv.includes("--apply");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const secret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const output = process.env.SIGNA_JUDGE_CREDENTIAL_OUTPUT || "";
if (new URL(url).hostname !== "zddmcuidtzvwalvdtfqp.supabase.co") throw new Error("Refusing an unexpected Supabase project");
if (!secret) throw new Error("SUPABASE_SECRET_KEY is required");
if (apply && (!isAbsolute(output) || !relative(process.cwd(), output).startsWith(".."))) throw new Error("SIGNA_JUDGE_CREDENTIAL_OUTPUT must be an absolute path outside the repository");

const accounts = [
  { label: "Reviewer 1", id: process.env.SIGNA_JUDGE_REVIEWER_1_USER_ID, email: "reviewer1@signa.test", role: "monitor" },
  { label: "Reviewer 2", id: process.env.SIGNA_JUDGE_REVIEWER_2_USER_ID, email: "reviewer2@signa.test", role: "monitor" },
  { label: "Coordinator", id: process.env.SIGNA_JUDGE_COORDINATOR_USER_ID, email: "response@signa.test", role: "coordinator" },
];
if (accounts.some((account) => !/^[0-9a-f-]{36}$/i.test(account.id || ""))) throw new Error("All three existing judge UUIDs are required");
if (new Set(accounts.map((account) => account.id.toLowerCase())).size !== accounts.length) throw new Error("Judge accounts must use distinct UUIDs");

const supabase = createClient(url, secret, { auth: { autoRefreshToken: false, persistSession: false } });
(async () => {
  for (const account of accounts) {
    const [{ data: auth, error: authError }, { data: profile, error: profileError }] = await Promise.all([
      supabase.auth.admin.getUserById(account.id),
      supabase.from("profiles").select("id,role,display_name").eq("id", account.id).maybeSingle(),
    ]);
    if (authError || !auth.user || profileError || !profile) throw new Error(`${account.label} could not be verified`);
    if (!auth.user.email?.toLowerCase().endsWith(".invalid")) throw new Error(`${account.label} is not an approved placeholder test account`);
    if (profile.role !== account.role) throw new Error(`${account.label} has an unexpected trusted role`);
  }
  if (!apply) {
    process.stdout.write("Verified three distinct dedicated test accounts. No changes made.\n");
    return;
  }
  const credentials = [];
  for (const account of accounts) {
    const password = `${randomBytes(24).toString("base64url")}!9a`;
    const { data, error } = await supabase.auth.admin.updateUserById(account.id, { email: account.email, password, email_confirm: true });
    if (error || data.user?.id !== account.id) throw new Error(`${account.label} update failed`);
    credentials.push({ role: account.label, email: account.email, password, userId: account.id });
  }
  writeFileSync(output, `${JSON.stringify({ generatedAt: new Date().toISOString(), credentials }, null, 2)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
  process.stdout.write(`Updated three existing account identities. Credentials written only to the requested private file.\n`);
})().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
