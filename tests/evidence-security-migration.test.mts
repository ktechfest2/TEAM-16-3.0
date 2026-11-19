import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sql = readFileSync(new URL("../supabase/migrations/20261119160000_evidence_review_refs.sql", import.meta.url), "utf8");

// These are source-pattern checks only. They do not establish that the migration
// has been applied or that PostgreSQL executed these policies/functions.
test("abuse counters are opaque, bounded, durable, and server-only", () => {
  assert.match(sql, /key_hash text not null check \(key_hash ~ '\^\[0-9a-f\]\{64\}\$'\)/i);
  assert.match(sql, /insert into public\.signa_rate_limits as current_window/i);
  assert.match(sql, /do update set hit_count = current_window\.hit_count \+ 1/i);
  assert.match(sql, /revoke all on function public\.signa_consume_rate_limit\(text,text,integer,integer\) from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function public\.signa_consume_rate_limit\(text,text,integer,integer\) to service_role/i);
});

test("review RPC validates case evidence and writes review history atomically", () => {
  assert.match(sql, /create function public\.signa_review_case_with_evidence\([\s\S]*?p_evidence_ids uuid\[\] default '\{\}'::uuid\[\]/i);
  assert.match(sql, /from public\.profiles where id = p_actor for update/i);
  assert.match(sql, /from public\.incidents where id = p_case_id for update/i);
  assert.match(sql, /e\.upload_status = 'ready'/i);
  assert.match(sql, /ir\.incident_id = p_case_id[\s\S]*?e\.id = any\(v_evidence_ids\)/i);
  assert.match(sql, /insert into public\.review_evidence[\s\S]*?insert into public\.case_events/i);
  assert.match(sql, /revoke all on function public\.signa_review_case_with_evidence\(uuid,uuid,text,text,uuid\[\]\) from public, anon, authenticated/i);
  assert.match(sql.trimEnd(), /commit;$/i);
});

test("evidence migration is additive for rolling review deployments and fences upload cleanup", () => {
  assert.doesNotMatch(sql, /drop function if exists public\.signa_review_case\(uuid,uuid,text,text\)/i);
  assert.match(sql, /create function public\.signa_review_case_with_evidence/i);
  assert.match(sql, /upload_token uuid/i);
  assert.match(sql, /upload_lease_expires_at timestamptz/i);
  assert.match(sql, /cleanup_token uuid/i);
  assert.match(sql, /'uploading'[\s\S]*?'cleaning'/i);
});
