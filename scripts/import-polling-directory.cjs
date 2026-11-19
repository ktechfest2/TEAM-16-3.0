// Dry run by default. Source: github.com/saidiadegoke/nigeria-inec-geo@3cf617721aea519eef960681d3d86a4fad4325da.
// MIT-licensed dataset; INEC CVR portal snapshot dated 2026-08-10. This is not a live INEC feed or certification.
const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');
const { createClient } = require('@supabase/supabase-js');

const SOURCE_COMMIT = '3cf617721aea519eef960681d3d86a4fad4325da';
const DATASET_VERSION = 'nigeria-inec-geo@3cf6177';
const EXPECTED_SOURCE = 'https://cvr.inecnigeria.org/pu';
const EXPECTED_SNAPSHOT_DATE = '2026-08-10';
const EXPECTED_SHA256 = '65BE04B266B4C013A39F327E7242451C4DC50A27E9DCF2038A565A0A5AAF86A2';
const EXPECTED_HEADER = [
  'state_code', 'state_name', 'lga_code', 'lga_name', 'ward_code', 'ward_name',
  'pu_code', 'pu_name', 'pu_location', 'full_code', 'portal_id',
];
const CODE = /^\d{2}$/;
const PU_CODE = /^\d{3}$/;
const FULL_CODE = /^\d{2}\/\d{2}\/\d{2}\/\d{3}$/;
// Cross-checked against INEC's 2023 nationwide mock-accreditation list. The live locator is dynamic,
// so these checks are representative provenance evidence, not certification that every row is current.
const OFFICIAL_REFERENCE_SAMPLES = [
  { full_code: '01/01/01/001', state_name: 'ABIA', lga_name: 'ABA NORTH', ward_name: 'EZIAMA', pu_name: 'RAILWAY QUARTERS I' },
  { full_code: '01/01/01/005', state_name: 'ABIA', lga_name: 'ABA NORTH', ward_name: 'EZIAMA', pu_name: 'ABIA POLY I' },
  { full_code: '02/13/06/014', state_name: 'ADAMAWA', lga_name: 'MICHIKA', ward_name: 'MICHIKA I', pu_name: 'ZAIBADARI I / ZAIBADARI PRI. SCH. I' },
];

function parseCsv(input) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < input.length; i++) {
    const character = input[i];
    if (character === '"') {
      if (quoted && input[i + 1] === '"') {
        field += '"';
        i++;
      } else quoted = !quoted;
    } else if (character === ',' && !quoted) {
      row.push(field);
      field = '';
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && input[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.some(Boolean)) rows.push(row);
      row = [];
    } else field += character;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  if (quoted) throw Error('Unclosed CSV quote');
  return rows;
}

function addCount(counts, key) {
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

function maximum(counts) {
  let count = 0;
  let parents = [];
  for (const [parent, value] of counts) {
    if (value > count) {
      count = value;
      parents = [parent];
    } else if (value === count) parents.push(parent);
  }
  return { count, parents };
}

function unique(records, keyOf, label) {
  const seen = new Set();
  for (const record of records) {
    const key = keyOf(record);
    if (seen.has(key)) throw Error(`Duplicate ${label}: ${key}`);
    seen.add(key);
  }
  return seen;
}

function validateDataset({ manifest, states, lgas, wards, csvBuffer, sha256 }) {
  if (sha256 !== EXPECTED_SHA256) throw Error('Source CSV checksum mismatch');
  if (manifest.source !== EXPECTED_SOURCE) throw Error(`Unexpected manifest source: ${manifest.source}`);
  if (typeof manifest.scraped_at !== 'string' || !manifest.scraped_at.startsWith(EXPECTED_SNAPSHOT_DATE)) {
    throw Error(`Unexpected dataset snapshot: ${manifest.scraped_at}`);
  }

  for (const state of states) {
    if (!CODE.test(state.code) || !state.name?.trim()) throw Error(`Invalid state record: ${JSON.stringify(state)}`);
  }
  const stateKeys = unique(states, state => state.code, 'state code');
  const stateNames = new Map(states.map(state => [state.code, state.name]));

  for (const lga of lgas) {
    if (!CODE.test(lga.code) || !CODE.test(lga.state_code) || !lga.name?.trim() || !stateKeys.has(lga.state_code)) {
      throw Error(`Invalid LGA or missing state parent: ${lga.state_code}/${lga.code}`);
    }
    if (lga.state_name !== stateNames.get(lga.state_code)) throw Error(`LGA state name mismatch: ${lga.state_code}/${lga.code}`);
  }
  const lgaKeys = unique(lgas, lga => `${lga.state_code}/${lga.code}`, 'LGA code');
  const lgaNames = new Map(lgas.map(lga => [`${lga.state_code}/${lga.code}`, lga.name]));

  for (const ward of wards) {
    const lgaKey = `${ward.state_code}/${ward.lga_code}`;
    if (!CODE.test(ward.code) || !CODE.test(ward.state_code) || !CODE.test(ward.lga_code) || !ward.name?.trim() || !lgaKeys.has(lgaKey)) {
      throw Error(`Invalid ward or missing LGA parent: ${lgaKey}/${ward.code}`);
    }
    if (ward.state_name !== stateNames.get(ward.state_code) || ward.lga_name !== lgaNames.get(lgaKey)) {
      throw Error(`Ward hierarchy name mismatch: ${lgaKey}/${ward.code}`);
    }
  }
  const wardKeys = unique(wards, ward => `${ward.state_code}/${ward.lga_code}/${ward.code}`, 'ward code');
  const wardNames = new Map(wards.map(ward => [`${ward.state_code}/${ward.lga_code}/${ward.code}`, ward.name]));

  const [header, ...values] = parseCsv(csvBuffer.toString('utf8'));
  if (header.length !== EXPECTED_HEADER.length || header.some((name, index) => name !== EXPECTED_HEADER[index])) {
    throw Error(`Unexpected polling-unit CSV header: ${header.join(',')}`);
  }
  const units = values.map((row, rowIndex) => {
    if (row.length !== header.length) throw Error(`Polling-unit CSV row ${rowIndex + 2} has ${row.length} columns; expected ${header.length}`);
    return Object.fromEntries(header.map((name, index) => [name, row[index]]));
  });
  const unitKeys = new Set();
  for (const unit of units) {
    const lgaKey = `${unit.state_code}/${unit.lga_code}`;
    const wardKey = `${lgaKey}/${unit.ward_code}`;
    if (!FULL_CODE.test(unit.full_code) || !PU_CODE.test(unit.pu_code) || unit.full_code !== `${wardKey}/${unit.pu_code}` || !unit.pu_name?.trim()) {
      throw Error(`Invalid polling unit: ${unit.full_code}`);
    }
    if (!stateKeys.has(unit.state_code) || !lgaKeys.has(lgaKey) || !wardKeys.has(wardKey)) {
      throw Error(`Polling unit has a missing hierarchy parent: ${unit.full_code}`);
    }
    if (unit.state_name !== stateNames.get(unit.state_code) || unit.lga_name !== lgaNames.get(lgaKey) || unit.ward_name !== wardNames.get(wardKey)) {
      throw Error(`Polling-unit hierarchy name mismatch: ${unit.full_code}`);
    }
    if (unitKeys.has(unit.full_code)) throw Error(`Duplicate polling-unit code: ${unit.full_code}`);
    unitKeys.add(unit.full_code);
  }

  const counts = { states: states.length, lgas: lgas.length, wards: wards.length, polling_units: units.length };
  for (const [key, value] of Object.entries(counts)) {
    if (manifest.counts?.[key] !== value) throw Error(`Manifest count mismatch for ${key}: expected ${manifest.counts?.[key]}, read ${value}`);
  }

  const representative_checks = [];
  if (counts.polling_units === 176846) {
    const unitsByCode = new Map(units.map(unit => [unit.full_code, unit]));
    for (const expected of OFFICIAL_REFERENCE_SAMPLES) {
      const actual = unitsByCode.get(expected.full_code);
      if (!actual || Object.entries(expected).some(([key, value]) => actual[key] !== value)) {
        throw Error(`Official representative sample mismatch: ${expected.full_code}`);
      }
      representative_checks.push(expected.full_code);
    }
  }

  const lgasPerState = new Map();
  const wardsPerLga = new Map();
  const unitsPerWard = new Map();
  for (const lga of lgas) addCount(lgasPerState, lga.state_code);
  for (const ward of wards) addCount(wardsPerLga, `${ward.state_code}/${ward.lga_code}`);
  for (const unit of units) addCount(unitsPerWard, `${unit.state_code}/${unit.lga_code}/${unit.ward_code}`);

  return {
    units,
    counts,
    maximum_children: {
      lgas_per_state: maximum(lgasPerState),
      wards_per_lga: maximum(wardsPerLga),
      polling_units_per_ward: maximum(unitsPerWard),
    },
    representative_checks,
  };
}

function validateTargetUrl(rawUrl, projectRef) {
  if (!/^[a-z0-9]{20}$/.test(projectRef)) throw Error('SIGNA_DIRECTORY_TARGET_REF must be the exact 20-character Supabase project reference');
  let target;
  try {
    target = new URL(rawUrl);
  } catch {
    throw Error('NEXT_PUBLIC_SUPABASE_URL must be a valid URL');
  }
  const expectedOrigin = `https://${projectRef}.supabase.co`;
  if (target.origin !== expectedOrigin || target.pathname !== '/' || target.search || target.hash || target.username || target.password) {
    throw Error(`Supabase target URL must exactly equal ${expectedOrigin}/`);
  }
  return expectedOrigin;
}

function readDataset(root) {
  const dataRoot = path.join(root, 'data');
  const requiredFiles = ['manifest.json', 'states.json', 'lgas.json', 'wards.json', 'polling-units.csv'];
  for (const file of requiredFiles) {
    const target = path.join(dataRoot, file);
    if (!fs.existsSync(target) || !fs.statSync(target).isFile()) throw Error(`Required dataset file is missing: data/${file}`);
  }
  const csvBuffer = fs.readFileSync(path.join(dataRoot, 'polling-units.csv'));
  return {
    csvBuffer,
    sha256: crypto.createHash('sha256').update(csvBuffer).digest('hex').toUpperCase(),
    manifest: JSON.parse(fs.readFileSync(path.join(dataRoot, 'manifest.json'), 'utf8')),
    states: JSON.parse(fs.readFileSync(path.join(dataRoot, 'states.json'), 'utf8')),
    lgas: JSON.parse(fs.readFileSync(path.join(dataRoot, 'lgas.json'), 'utf8')),
    wards: JSON.parse(fs.readFileSync(path.join(dataRoot, 'wards.json'), 'utf8')),
  };
}

async function upsert(db, table, records, conflict, size = 500) {
  for (let from = 0; from < records.length; from += size) {
    const to = Math.min(from + size, records.length);
    const { error } = await db.from(table).upsert(records.slice(from, to), { onConflict: conflict });
    if (error) throw Error(`${table} batch ${from}-${to - 1}: ${error.message}`);
    console.log(`[${table}] ${to}/${records.length} imported`);
  }
}

async function exactCount(db, table, configure = query => query) {
  const query = configure(db.from(table).select('*', { count: 'exact', head: true }));
  const { count, error } = await query;
  if (error) throw Error(`Could not verify ${table}: ${error.message}`);
  if (typeof count !== 'number') throw Error(`Could not verify ${table}: database did not return an exact count`);
  return count;
}

async function verifyImport(db, expectedCounts) {
  const checks = [
    ['directory_states', expectedCounts.states, query => query.eq('dataset_version', DATASET_VERSION)],
    ['directory_lgas', expectedCounts.lgas, query => query.eq('dataset_version', DATASET_VERSION)],
    ['directory_wards', expectedCounts.wards, query => query.eq('dataset_version', DATASET_VERSION)],
    ['polling_units', expectedCounts.polling_units, query => query.eq('dataset_version', DATASET_VERSION).eq('is_simulated', false)],
  ];
  const verified = {};
  for (const [table, expected, configure] of checks) {
    const actual = await exactCount(db, table, configure);
    verified[table] = actual;
    if (actual !== expected) throw Error(`Incomplete import: ${table} has ${actual} ${DATASET_VERSION} rows; expected ${expected}`);
    console.log(`[${table}] verified ${actual}/${expected} rows at ${DATASET_VERSION}`);
  }
  return verified;
}

async function main(argv = process.argv.slice(2)) {
  require('@next/env').loadEnvConfig(process.cwd());
  const source = argv.find(argument => argument !== '--apply');
  const apply = argv.includes('--apply');
  if (!source) throw Error('Usage: node scripts/import-polling-directory.cjs <dataset-dir> [--apply]');
  const dataset = readDataset(path.resolve(source));
  const validated = validateDataset(dataset);
  console.log(JSON.stringify({
    source_commit: SOURCE_COMMIT,
    source: dataset.manifest.source,
    scraped_at: dataset.manifest.scraped_at,
    sha256: dataset.sha256,
    dataset_version: DATASET_VERSION,
    counts: validated.counts,
    maximum_children: validated.maximum_children,
    representative_checks: validated.representative_checks,
    provenance_limitation: '2026-08-10 portal snapshot; representative official samples checked, but the dynamic locator does not expose a static signed nationwide export.',
    mode: apply ? 'apply' : 'dry-run',
  }, null, 2));
  if (!apply) return;

  const projectRef = process.env.SIGNA_DIRECTORY_TARGET_REF ?? '';
  const targetUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  validateTargetUrl(targetUrl, projectRef);
  if (projectRef !== 'zddmcuidtzvwalvdtfqp') throw Error('Refusing import: target is not the reviewed Signa Supabase project');
  if (!process.env.SUPABASE_SECRET_KEY) throw Error('SUPABASE_SECRET_KEY is required for an approved import');
  const db = createClient(targetUrl, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });

  await upsert(db, 'directory_states', dataset.states.map(state => ({ code: state.code, name: state.name, dataset_version: DATASET_VERSION })), 'code');
  await upsert(db, 'directory_lgas', dataset.lgas.map(lga => ({ state_code: lga.state_code, code: lga.code, name: lga.name, dataset_version: DATASET_VERSION })), 'state_code,code');
  await upsert(db, 'directory_wards', dataset.wards.map(ward => ({ state_code: ward.state_code, lga_code: ward.lga_code, code: ward.code, name: ward.name, dataset_version: DATASET_VERSION })), 'state_code,lga_code,code');
  await upsert(db, 'polling_units', validated.units.map(unit => ({
    code: unit.full_code,
    name: unit.pu_name,
    state: unit.state_name,
    state_code: unit.state_code,
    lga: unit.lga_name,
    lga_code: unit.lga_code,
    ward: unit.ward_name,
    ward_code: unit.ward_code,
    pu_code: unit.pu_code,
    location: unit.pu_location || null,
    is_simulated: false,
    source: 'INEC CVR portal via nigeria-inec-geo',
    dataset_version: DATASET_VERSION,
    // Deliberately omit id: conflict updates retain an existing polling unit UUID and its report FKs.
  })), 'code');

  const verified = await verifyImport(db, validated.counts);
  console.log(JSON.stringify({ status: 'complete', target: targetUrl, dataset_version: DATASET_VERSION, verified }, null, 2));
}

module.exports = {
  DATASET_VERSION,
  EXPECTED_SHA256,
  parseCsv,
  readDataset,
  validateDataset,
  validateTargetUrl,
  verifyImport,
};

if (require.main === module) {
  main().catch(error => {
    console.error(`Directory import failed: ${error.message}`);
    process.exitCode = 1;
  });
}
