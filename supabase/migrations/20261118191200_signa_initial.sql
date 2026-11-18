-- Signa initial schema — DESIGN DRAFT, not applied or integration-tested.
-- Review and apply to a dedicated Supabase project. No direct client table access.
-- All service-role actions must be gated by verified user/role checks in Next.js.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'reporter'
    check (role in ('reporter','monitor','coordinator','admin')),
  display_name text,
  created_at timestamptz not null default now()
);

-- New Supabase anonymous users receive REPORTER role only. Never trust user_metadata.role.
create or replace function public.signa_new_auth_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, role, display_name)
  values (new.id, 'reporter', null)
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists signa_auth_user_created on auth.users;
create trigger signa_auth_user_created
  after insert on auth.users for each row
  execute function public.signa_new_auth_user();

create table if not exists public.polling_units (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  ward text,
  lga text,
  state text,
  is_simulated boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.reports (
  id uuid primary key,  -- client generated; stable idempotency key
  reporter_id uuid not null references public.profiles(id),
  polling_unit_id uuid not null references public.polling_units(id),
  category text not null check (category in (
    'violence','intimidation','vote_buying','missing_materials',
    'disruption','accessibility_barrier','other'
  )),
  description text not null check (char_length(description) between 3 and 1600),
  occurred_at timestamptz,
  client_created_at timestamptz,
  payload_sha256 text not null check (payload_sha256 ~ '^[0-9a-f]{64}$'),
  received_at timestamptz not null default now()
);
create index if not exists reports_received_idx on public.reports(received_at desc);
create index if not exists reports_reporter_idx on public.reports(reporter_id, received_at desc);
create index if not exists reports_polling_idx on public.reports(polling_unit_id, received_at desc);

create table if not exists public.evidence (
  id uuid primary key,  -- client generated; stable idempotency key
  report_id uuid not null references public.reports(id) on delete restrict,
  storage_path text not null unique,
  mime_type text not null check (mime_type in ('image/jpeg','image/png','image/webp')),
  byte_size integer not null check (byte_size > 0 and byte_size <= 5242880),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  received_at timestamptz not null default now()
);
create index if not exists evidence_report_idx on public.evidence(report_id);
create index if not exists evidence_sha_idx on public.evidence(sha256);

-- A case is created only when a monitor groups one or more reports.
create table if not exists public.incidents (
  id uuid primary key default gen_random_uuid(),
  polling_unit_id uuid not null references public.polling_units(id),
  summary text not null check (char_length(summary) between 8 and 1200),
  review_state text not null default 'under_review'
    check (review_state in ('under_review','supported','inconclusive','not_supported')),
  response_state text not null default 'unassigned'
    check (response_state in ('unassigned','assigned','acknowledged','followup_recorded','closed')),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists incidents_state_idx on public.incidents(review_state, response_state, updated_at desc);

create table if not exists public.incident_reports (
  incident_id uuid not null references public.incidents(id) on delete restrict,
  report_id uuid not null unique references public.reports(id) on delete restrict,
  linked_by uuid not null references public.profiles(id),
  linked_at timestamptz not null default now(),
  primary key (incident_id, report_id)
);

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.incidents(id) on delete restrict,
  reviewer_id uuid not null references public.profiles(id),
  outcome text not null check (outcome in ('supported','inconclusive','not_supported')),
  reason text not null check (char_length(reason) between 12 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists reviews_incident_idx on public.reviews(incident_id, created_at desc);

create table if not exists public.assignments (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null unique references public.incidents(id) on delete restrict,
  assigned_to uuid not null references public.profiles(id),
  assigned_by uuid not null references public.profiles(id),
  assigned_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  acknowledgement_note text,
  constraint ack_note_length check (acknowledgement_note is null or char_length(acknowledgement_note) <= 2000)
);
create index if not exists assignments_coordinator_idx on public.assignments(assigned_to, assigned_at desc);

create table if not exists public.case_events (
  id bigint generated always as identity primary key,
  incident_id uuid not null references public.incidents(id) on delete restrict,
  actor_id uuid not null references public.profiles(id),
  event_type text not null check (event_type in (
    'case_created','reports_linked','review_recorded','assignment_created',
    'assignment_acknowledged','followup_recorded','case_closed'
  )),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists case_events_incident_idx on public.case_events(incident_id, id);

-- All app data is PRIVATE. Browser access is via server APIs only.
-- RLS is enabled with NO client-facing policies. Default deny on direct Supabase REST.
alter table public.profiles enable row level security;
alter table public.polling_units enable row level security;
alter table public.reports enable row level security;
alter table public.evidence enable row level security;
alter table public.incidents enable row level security;
alter table public.incident_reports enable row level security;
alter table public.reviews enable row level security;
alter table public.assignments enable row level security;
alter table public.case_events enable row level security;

-- Supabase managed service_role (server only) bypasses RLS; client ANON and AUTHENTICATED have no policies.
-- Every API endpoint must validate actual user identity and server-trusted role/ownership FIRST.

-- Private bucket only. Use service-side validated upload; NO public/signed uploads in MVP.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'signa-evidence', 'signa-evidence', false, 5242880,
  array['image/jpeg','image/png','image/webp']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- No storage.objects client policies intentionally.

-- All state transition functions must be callable ONLY by the server-side service role.
-- RPC: atomic case grouping; enforces monitor role and exact report membership.
create or replace function public.signa_group_reports(
  p_actor uuid, p_case_id uuid, p_report_ids uuid[],
  p_summary text, p_reason text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_role text;
  v_count integer;
  v_distinct_unit integer;
  v_unit uuid;
  v_claimed integer;
begin
  select role into v_role from public.profiles where id = p_actor;
  if v_role is distinct from 'monitor' and v_role is distinct from 'admin' then
    raise exception 'Not authorised';
  end if;
  if p_report_ids is null or cardinality(p_report_ids) < 1 or cardinality(p_report_ids) > 10 then
    raise exception 'Choose between one and ten reports';
  end if;
  if char_length(coalesce(p_summary, '')) < 8 or char_length(coalesce(p_reason, '')) < 12 then
    raise exception 'Summary and link reason required';
  end if;
  -- Lock reports to avoid competing groupings.
  perform 1 from public.reports where id = any(p_report_ids) for update;
  select count(*), count(distinct polling_unit_id)
    into v_count, v_distinct_unit
    from public.reports where id = any(p_report_ids);
  select polling_unit_id into v_unit
    from public.reports where id = any(p_report_ids) limit 1;
  select count(distinct id) into v_claimed from unnest(p_report_ids) as ids(id);
  if v_count <> cardinality(p_report_ids) or v_claimed <> cardinality(p_report_ids) or v_distinct_unit <> 1 then
    raise exception 'Unknown, duplicated, or inconsistent polling-unit report IDs';
  end if;
  if exists (select 1 from public.incident_reports where report_id = any(p_report_ids)) then
    raise exception 'One or more reports already linked';
  end if;
  insert into public.incidents(id, polling_unit_id, summary, created_by)
    values(p_case_id, v_unit, p_summary, p_actor);
  insert into public.incident_reports (incident_id, report_id, linked_by)
    select p_case_id, x.id, p_actor from unnest(p_report_ids) as x(id);
  insert into public.case_events(incident_id, actor_id, event_type, details)
    values (p_case_id, p_actor, 'case_created',
      jsonb_build_object('report_count', cardinality(p_report_ids), 'reason', left(p_reason, 500)));
  return p_case_id;
end $$;

create or replace function public.signa_review_case(
  p_actor uuid, p_case_id uuid, p_outcome text, p_reason text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_role text;
  v_review_id uuid;
begin
  select role into v_role from public.profiles where id = p_actor;
  if v_role not in ('monitor', 'admin') or v_role is null then raise exception 'Not authorised'; end if;
  if p_outcome not in ('supported','inconclusive','not_supported') or
     char_length(coalesce(p_reason,'')) < 12 then raise exception 'Invalid review'; end if;
  perform 1 from public.incidents where id = p_case_id for update;
  if not found then raise exception 'Unknown case'; end if;
  -- After a case is assigned, do not retroactively rewrite its review state in MVP.
  if exists(select 1 from public.assignments where incident_id = p_case_id) then
    raise exception 'Review locked after assignment';
  end if;
  insert into public.reviews(incident_id, reviewer_id, outcome, reason)
    values(p_case_id, p_actor, p_outcome, p_reason) returning id into v_review_id;
  update public.incidents set review_state=p_outcome, updated_at=now() where id=p_case_id;
  insert into public.case_events(incident_id, actor_id, event_type, details)
    values(p_case_id,p_actor,'review_recorded',jsonb_build_object('outcome',p_outcome,'review_id',v_review_id));
  return v_review_id;
end $$;

create or replace function public.signa_assign_case(
  p_actor uuid, p_case_id uuid, p_coordinator uuid
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_role text;
  v_target text;
  v_state text;
  v_assignment uuid;
begin
  select role into v_role from public.profiles where id=p_actor;
  select role into v_target from public.profiles where id=p_coordinator;
  if v_role not in ('monitor','admin') or v_role is null or
     v_target not in ('coordinator','admin') or v_target is null then
    raise exception 'Not authorised';
  end if;
  select review_state into v_state from public.incidents where id=p_case_id for update;
  if v_state is distinct from 'supported' then raise exception 'Only supported cases may be assigned'; end if;
  insert into public.assignments(incident_id,assigned_to,assigned_by)
    values(p_case_id,p_coordinator,p_actor) returning id into v_assignment;
  update public.incidents set response_state='assigned',updated_at=now() where id=p_case_id;
  insert into public.case_events(incident_id,actor_id,event_type,details)
    values(p_case_id,p_actor,'assignment_created',jsonb_build_object('assignment_id',v_assignment));
  return v_assignment;
end $$;

create or replace function public.signa_acknowledge_case(
  p_actor uuid, p_assignment uuid, p_note text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_role text;
  v_owner uuid;
  v_case uuid;
  v_at timestamptz;
begin
  select role into v_role from public.profiles where id=p_actor;
  select assigned_to,incident_id,acknowledged_at
    into v_owner,v_case,v_at from public.assignments where id=p_assignment for update;
  if v_case is null or (v_owner <> p_actor and v_role is distinct from 'admin') then
    raise exception 'Not authorised';
  end if;
  if v_at is not null then return p_assignment; end if; -- idempotent acknowledgement
  update public.assignments
    set acknowledged_at=now(), acknowledgement_note=left(coalesce(p_note,''),2000)
    where id=p_assignment;
  update public.incidents set response_state='acknowledged',updated_at=now() where id=v_case;
  insert into public.case_events(incident_id,actor_id,event_type,details)
    values(v_case,p_actor,'assignment_acknowledged',jsonb_build_object('assignment_id',p_assignment));
  return p_assignment;
end $$;

create or replace function public.signa_record_followup(
  p_actor uuid, p_assignment uuid, p_note text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_role text;
  v_owner uuid;
  v_case uuid;
  v_at timestamptz;
begin
  select role into v_role from public.profiles where id=p_actor;
  select assigned_to,incident_id,acknowledged_at
    into v_owner,v_case,v_at from public.assignments where id=p_assignment for update;
  if v_case is null or (v_owner <> p_actor and v_role is distinct from 'admin') then
    raise exception 'Not authorised';
  end if;
  if v_at is null or char_length(coalesce(p_note,'')) < 5 then
    raise exception 'Acknowledge first and provide an action note';
  end if;
  insert into public.case_events(incident_id,actor_id,event_type,details)
    values(v_case,p_actor,'followup_recorded',jsonb_build_object('note',left(p_note,2000)));
  update public.incidents set response_state='followup_recorded', updated_at=now() where id=v_case;
  return p_assignment;
end $$;

revoke all on function public.signa_new_auth_user() from public, anon, authenticated;
revoke all on function public.signa_group_reports(uuid,uuid,uuid[],text,text) from public, anon, authenticated;
revoke all on function public.signa_review_case(uuid,uuid,text,text) from public, anon, authenticated;
revoke all on function public.signa_assign_case(uuid,uuid,uuid) from public, anon, authenticated;
revoke all on function public.signa_acknowledge_case(uuid,uuid,text) from public, anon, authenticated;
revoke all on function public.signa_record_followup(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.signa_group_reports(uuid,uuid,uuid[],text,text) to service_role;
grant execute on function public.signa_review_case(uuid,uuid,text,text) to service_role;
grant execute on function public.signa_assign_case(uuid,uuid,uuid) to service_role;
grant execute on function public.signa_acknowledge_case(uuid,uuid,text) to service_role;
grant execute on function public.signa_record_followup(uuid,uuid,text) to service_role;

-- Fictional polling units for the hackathon, unmistakably labelled.
insert into public.polling_units(code,name,ward,lga,state,is_simulated)
values
 ('SIM-PU-001','SIMULATED Polling Unit 001','Fictional Ward A','Fictional LGA','Lagos',true),
 ('SIM-PU-002','SIMULATED Polling Unit 002','Fictional Ward B','Fictional LGA','Lagos',true),
 ('SIM-PU-003','SIMULATED Polling Unit 003','Fictional Ward C','Fictional LGA','Lagos',true)
on conflict (code) do nothing;

-- After migration, provision monitor/coordinator accounts via a trusted admin process.
-- Never put staff credentials or secret values into migrations, seed data or commits.
-- TODO BEFORE PRODUCTION: migration test, transaction tests, storage access validation,
-- media decoding and malware safety, audit history hardening, role revocation and retention policy.
