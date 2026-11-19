// Dry run by default. Source: github.com/saidiadegoke/nigeria-inec-geo@3cf617721aea519eef960681d3d86a4fad4325da.
// MIT-licensed dataset; CVR portal snapshot dated 2026-08-10. This is not a live INEC feed or certification.
const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');
const { createClient } = require('@supabase/supabase-js');
const source = process.argv[2];
if (!source) throw Error('Usage: node scripts/import-polling-directory.cjs <dataset-dir> [--apply]');
const root = path.resolve(source);
const csv = fs.readFileSync(path.join(root, 'data/polling-units.csv'));
const sha = crypto.createHash('sha256').update(csv).digest('hex').toUpperCase();
if (sha !== '65BE04B266B4C013A39F327E7242451C4DC50A27E9DCF2038A565A0A5AAF86A2') throw Error('Source CSV checksum mismatch');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'data/manifest.json'), 'utf8'));
const states = JSON.parse(fs.readFileSync(path.join(root, 'data/states.json'), 'utf8'));
const lgas = JSON.parse(fs.readFileSync(path.join(root, 'data/lgas.json'), 'utf8'));
const wards = JSON.parse(fs.readFileSync(path.join(root, 'data/wards.json'), 'utf8'));
function parseCsv(input) {
  const rows = []; let row = [], field = '', quoted = false;
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (c === '"') { if (quoted && input[i + 1] === '"') { field += '"'; i++; } else quoted = !quoted; }
    else if (c === ',' && !quoted) { row.push(field); field = ''; }
    else if ((c === '\n' || c === '\r') && !quoted) { if (c === '\r' && input[i + 1] === '\n') i++; row.push(field); field = ''; if (row.some(Boolean)) rows.push(row); row = []; }
    else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  if (quoted) throw Error('Unclosed CSV quote');
  return rows;
}
const [header, ...values] = parseCsv(csv.toString('utf8'));
const units = values.map(row => Object.fromEntries(header.map((name, index) => [name, row[index]])));
const stateKeys = new Set(states.map(x => x.code));
const lgaKeys = new Set(lgas.map(x => `${x.state_code}/${x.code}`));
const wardKeys = new Set(wards.map(x => `${x.state_code}/${x.lga_code}/${x.code}`));
const seen = new Set();
for (const unit of units) {
  if (!/^\d{2}\/\d{2}\/\d{2}\/\d{3}$/.test(unit.full_code) || unit.full_code !== `${unit.state_code}/${unit.lga_code}/${unit.ward_code}/${unit.pu_code}` || !unit.pu_name || !stateKeys.has(unit.state_code) || !lgaKeys.has(`${unit.state_code}/${unit.lga_code}`) || !wardKeys.has(`${unit.state_code}/${unit.lga_code}/${unit.ward_code}`) || seen.has(unit.full_code)) throw Error(`Invalid or duplicate unit ${unit.full_code}`);
  seen.add(unit.full_code);
}
const counts = { states: states.length, lgas: lgas.length, wards: wards.length, polling_units: units.length };
for (const [key, value] of Object.entries(counts)) if (manifest.counts[key] !== value) throw Error(`Manifest count mismatch: ${key}`);
console.log(JSON.stringify({ source_commit: '3cf617721aea519eef960681d3d86a4fad4325da', scraped_at: manifest.scraped_at, sha256: sha, counts, mode: process.argv.includes('--apply') ? 'apply' : 'dry-run' }));
if (!process.argv.includes('--apply')) process.exit(0);
if (process.env.SIGNA_DIRECTORY_TARGET_REF !== 'zddmcuidtzvwalvdtfqp' || !process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('zddmcuidtzvwalvdtfqp.supabase.co') || !process.env.SUPABASE_SECRET_KEY) throw Error('Explicit verified target and server key required');
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
async function upsert(table, records, conflict, size = 500) {
  for (let i = 0; i < records.length; i += size) { const { error } = await db.from(table).upsert(records.slice(i, i + size), { onConflict: conflict }); if (error) throw Error(`${table} batch ${i}: ${error.message}`); }
}
(async () => {
  const version = 'nigeria-inec-geo@3cf6177';
  await upsert('directory_states', states.map(x => ({ code: x.code, name: x.name, dataset_version: version })), 'code');
  await upsert('directory_lgas', lgas.map(x => ({ state_code: x.state_code, code: x.code, name: x.name, dataset_version: version })), 'state_code,code');
  await upsert('directory_wards', wards.map(x => ({ state_code: x.state_code, lga_code: x.lga_code, code: x.code, name: x.name, dataset_version: version })), 'state_code,lga_code,code');
  await upsert('polling_units', units.map(x => ({ code: x.full_code, name: x.pu_name, state: x.state_name, state_code: x.state_code, lga: x.lga_name, lga_code: x.lga_code, ward: x.ward_name, ward_code: x.ward_code, pu_code: x.pu_code, location: x.pu_location || null, is_simulated: false, source: 'INEC CVR portal via nigeria-inec-geo', dataset_version: version })), 'code');
})().catch(error => { console.error(error.message); process.exitCode = 1; });
