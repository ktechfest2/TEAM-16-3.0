import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sql = readFileSync(new URL("../supabase/migrations/20261118223000_harden_case_authorization.sql", import.meta.url), "utf8");

test("review RPC rejects case creators and report submitters", () => {
  assert.match(sql, /where id = p_case_id and created_by = p_actor/i);
  assert.match(sql, /ir\.incident_id = p_case_id and r\.reporter_id = p_actor/i);
});

test("acknowledgement and follow-up recheck the current coordinator role", () => {
  const roleChecks = sql.match(/v_role is distinct from 'coordinator' and v_role is distinct from 'admin'/gi) ?? [];
  assert.equal(roleChecks.length, 2);
  const serializedRoleReads = sql.match(/select role into v_role from public\.profiles where id\s*=\s*p_actor for update/gi) ?? [];
  assert.equal(serializedRoleReads.length, 3);
});

test("privileged case RPCs stay unavailable to clients", () => {
  assert.match(sql, /^begin;/i);
  assert.match(sql.trimEnd(), /commit;$/i);
  for (const signature of [
    "signa_review_case(uuid,uuid,text,text)",
    "signa_acknowledge_case(uuid,uuid,text)",
    "signa_record_followup(uuid,uuid,text,text)",
  ]) {
    assert.match(sql, new RegExp(`revoke all on function public\\.${signature.replace(/[()]/g, "\\$&")} from public, anon, authenticated`, "i"));
    assert.match(sql, new RegExp(`grant execute on function public\\.${signature.replace(/[()]/g, "\\$&")} to service_role`, "i"));
  }
});
