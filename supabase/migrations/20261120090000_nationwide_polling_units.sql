-- Additive directory fields. Existing simulated UUIDs and report references stay intact.
alter table public.polling_units
  add column if not exists state_code text,
  add column if not exists lga_code text,
  add column if not exists ward_code text,
  add column if not exists pu_code text,
  add column if not exists location text,
  add column if not exists source text,
  add column if not exists dataset_version text;

create index if not exists polling_units_directory_hierarchy_idx
  on public.polling_units (state_code, lga_code, ward_code, code)
  where is_simulated = false;
create index if not exists polling_units_directory_code_idx
  on public.polling_units (code) where is_simulated = false;
create index if not exists polling_units_directory_names_idx
  on public.polling_units (state, lga, ward) where is_simulated = false;

create table if not exists public.directory_states (code text primary key, name text not null, dataset_version text not null);
create table if not exists public.directory_lgas (state_code text not null references public.directory_states(code), code text not null, name text not null, dataset_version text not null, primary key(state_code,code));
create table if not exists public.directory_wards (state_code text not null, lga_code text not null, code text not null, name text not null, dataset_version text not null, primary key(state_code,lga_code,code), foreign key(state_code,lga_code) references public.directory_lgas(state_code,code));
alter table public.directory_states enable row level security;
alter table public.directory_lgas enable row level security;
alter table public.directory_wards enable row level security;
revoke all on public.directory_states, public.directory_lgas, public.directory_wards from anon, authenticated;
