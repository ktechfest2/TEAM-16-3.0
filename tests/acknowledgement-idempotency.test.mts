import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sql = readFileSync(
  new URL("../supabase/migrations/20261119110000_acknowledgement_retry_receipt.sql", import.meta.url),
  "utf8",
);

test("acknowledgement returns a transactional duplicate receipt", () => {
  assert.match(sql, /from public\.assignments where id\s*=\s*p_assignment for update/i);
  assert.match(sql, /if v_at is not null then return null; end if;/i);
  assert.match(sql, /insert into public\.case_events[\s\S]*?return p_assignment;/i);
  assert.match(sql, /revoke all on function public\.signa_acknowledge_case\(uuid,uuid,text\) from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function public\.signa_acknowledge_case\(uuid,uuid,text\) to service_role/i);
});
