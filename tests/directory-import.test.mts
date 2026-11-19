import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const {
  EXPECTED_SHA256,
  validateDataset,
  validateTargetUrl,
  verifyImport,
} = require("../scripts/import-polling-directory.cjs") as {
  EXPECTED_SHA256: string;
  validateDataset: (dataset: Record<string, unknown>) => {
    counts: Record<string, number>;
    maximum_children: Record<string, { count: number; parents: string[] }>;
  };
  validateTargetUrl: (url: string, ref: string) => string;
  verifyImport: (db: unknown, counts: Record<string, number>) => Promise<Record<string, number>>;
};

const header = "state_code,state_name,lga_code,lga_name,ward_code,ward_name,pu_code,pu_name,pu_location,full_code,portal_id";

function fixture() {
  const states = [
    { code: "01", name: "ALPHA" },
    { code: "02", name: "BETA" },
  ];
  const lgas = [
    { state_code: "01", state_name: "ALPHA", code: "01", name: "NORTH" },
    { state_code: "01", state_name: "ALPHA", code: "02", name: "SOUTH" },
    { state_code: "02", state_name: "BETA", code: "01", name: "CENTRAL" },
  ];
  const wards = [
    { state_code: "01", state_name: "ALPHA", lga_code: "01", lga_name: "NORTH", code: "01", name: "ONE" },
    { state_code: "01", state_name: "ALPHA", lga_code: "01", lga_name: "NORTH", code: "02", name: "TWO" },
    { state_code: "01", state_name: "ALPHA", lga_code: "02", lga_name: "SOUTH", code: "01", name: "THREE" },
    { state_code: "02", state_name: "BETA", lga_code: "01", lga_name: "CENTRAL", code: "01", name: "FOUR" },
  ];
  const rows = [
    "01,ALPHA,01,NORTH,01,ONE,001,FIRST,,01/01/01/001,1",
    "01,ALPHA,01,NORTH,01,ONE,002,SECOND,,01/01/01/002,2",
    "01,ALPHA,01,NORTH,02,TWO,001,THIRD,,01/01/02/001,3",
    "01,ALPHA,02,SOUTH,01,THREE,001,FOURTH,,01/02/01/001,4",
    "02,BETA,01,CENTRAL,01,FOUR,001,FIFTH,,02/01/01/001,5",
  ];
  return {
    manifest: {
      source: "https://cvr.inecnigeria.org/pu",
      scraped_at: "2026-08-10T05:40:24.108Z",
      counts: { states: 2, lgas: 3, wards: 4, polling_units: 5 },
    },
    states,
    lgas,
    wards,
    csvBuffer: Buffer.from(`${header}\n${rows.join("\n")}\n`),
    sha256: EXPECTED_SHA256,
  };
}

test("directory validation reports maximum child counts", () => {
  const result = validateDataset(fixture());
  assert.deepEqual(result.counts, { states: 2, lgas: 3, wards: 4, polling_units: 5 });
  assert.deepEqual(result.maximum_children.lgas_per_state, { count: 2, parents: ["01"] });
  assert.deepEqual(result.maximum_children.wards_per_lga, { count: 2, parents: ["01/01"] });
  assert.deepEqual(result.maximum_children.polling_units_per_ward, { count: 2, parents: ["01/01/01"] });
});

test("directory validation rejects duplicate codes and missing parents", () => {
  const duplicate = fixture();
  duplicate.lgas.push({ ...duplicate.lgas[0] });
  duplicate.manifest.counts.lgas++;
  assert.throws(() => validateDataset(duplicate), /Duplicate LGA code/);

  const missingParent = fixture();
  missingParent.wards[0].lga_code = "99";
  assert.throws(() => validateDataset(missingParent), /missing LGA parent/);
});

test("import target must be the exact Supabase project URL", () => {
  const ref = "zddmcuidtzvwalvdtfqp";
  assert.equal(validateTargetUrl(`https://${ref}.supabase.co/`, ref), `https://${ref}.supabase.co`);
  assert.throws(() => validateTargetUrl(`https://${ref}.supabase.co.attacker.example/`, ref), /exactly equal/);
  assert.throws(() => validateTargetUrl(`https://${ref}.supabase.co/rest/v1`, ref), /exactly equal/);
  assert.throws(() => validateTargetUrl("https://differentref1234567.supabase.co/", ref), /exactly equal/);
});

test("post-import verification rejects incomplete dataset versions", async () => {
  const observed = new Map([
    ["directory_states", 2],
    ["directory_lgas", 3],
    ["directory_wards", 3],
    ["polling_units", 5],
  ]);
  const db = {
    from(table: string) {
      const query = {
        select() { return query; },
        eq() { return query; },
        then(resolve: (value: unknown) => unknown) {
          return Promise.resolve(resolve({ count: observed.get(table), error: null }));
        },
      };
      return query;
    },
  };
  await assert.rejects(
    verifyImport(db, { states: 2, lgas: 3, wards: 4, polling_units: 5 }),
    /Incomplete import: directory_wards has 3 .* expected 4/,
  );
});

test("directory API traverses bounded pages instead of applying child limits", () => {
  const route = readFileSync(new URL("../app/api/directory/route.ts", import.meta.url), "utf8");
  assert.match(route, /const PAGE_SIZE = 500/);
  assert.match(route, /for \(let from = 0; ; from \+= PAGE_SIZE\)/);
  assert.match(route, /\.range\(from, to\)/);
  assert.doesNotMatch(route, /\.limit\(/);
});

test("polling-unit upserts omit ids so existing UUID relationships survive", () => {
  const script = readFileSync(new URL("../scripts/import-polling-directory.cjs", import.meta.url), "utf8");
  const mapping = script.slice(script.indexOf("validated.units.map"), script.indexOf("'code');", script.indexOf("validated.units.map")));
  assert.doesNotMatch(mapping, /^\s*id\s*:/m);
  assert.match(mapping, /onConflict|Deliberately omit id/);
});
