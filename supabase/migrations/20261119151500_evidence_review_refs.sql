-- Adds resumable private uploads and case-scoped evidence references.
-- Review this migration before applying it to the intended development project.
begin;

create table if not exists public.signa_rate_limits (
  scope text not null check (scope in ('report','evidence')),
  key_hash text not null check (key_hash ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz not null,
  hit_count integer not null check (hit_count > 0),
  primary key (scope, key_hash, window_started_at)
);
alter table public.signa_rate_limits enable row level security;
revoke all on table public.signa_rate_limits from public, anon, authenticated;
grant all on table public.signa_rate_limits to service_role;

create or replace function public.signa_consume_rate_limit(
  p_scope text,
  p_key_hash text,
  p_limit integer,
  p_window_seconds integer
) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_window timestamptz;
  v_hits integer;
begin
  if p_scope is null or p_scope not in ('report','evidence') or
     p_key_hash is null or p_key_hash !~ '^[0-9a-f]{64}$' or
     p_limit is null or p_limit < 1 or p_limit > 1000 or
     p_window_seconds is null or p_window_seconds < 30 or p_window_seconds > 86400 then
    raise exception 'Invalid rate limit request';
  end if;
  v_window := to_timestamp(
    floor(extract(epoch from clock_timestamp()) / p_window_seconds) * p_window_seconds
  );
  insert into public.signa_rate_limits as current_window(scope,key_hash,window_started_at,hit_count)
    values(p_scope,p_key_hash,v_window,1)
  on conflict (scope,key_hash,window_started_at)
    do update set hit_count = current_window.hit_count + 1
  returning hit_count into v_hits;

  -- Opportunistic bounded retention; identifiers are opaque keyed hashes.
  if mod(extract(epoch from clock_timestamp())::bigint, 300) = 0 then
    delete from public.signa_rate_limits where window_started_at < now() - interval '24 hours';
  end if;
  return v_hits <= p_limit;
end $$;
revoke all on function public.signa_consume_rate_limit(text,text,integer,integer) from public, anon, authenticated;
grant execute on function public.signa_consume_rate_limit(text,text,integer,integer) to service_role;

alter table public.evidence
  add column if not exists upload_status text not null default 'ready',
  add column if not exists upload_token uuid,
  add column if not exists upload_lease_expires_at timestamptz,
  add column if not exists cleanup_token uuid;
create index if not exists evidence_pending_cleanup_idx
  on public.evidence(upload_status, received_at)
  where upload_status in ('pending','failed','uploading');

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.evidence'::regclass
      and conname = 'evidence_upload_status_check'
  ) then
    alter table public.evidence
      add constraint evidence_upload_status_check
      check (upload_status in ('pending','uploading','ready','failed','cleaning'));
  end if;
end $$;

create table if not exists public.review_evidence (
  review_id uuid not null references public.reviews(id) on delete restrict,
  evidence_id uuid not null references public.evidence(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (review_id, evidence_id)
);
create index if not exists review_evidence_evidence_idx on public.review_evidence(evidence_id);
alter table public.review_evidence enable row level security;
revoke all on table public.review_evidence from public, anon, authenticated;
grant all on table public.review_evidence to service_role;

-- Add the evidence-aware RPC under a new name. Keeping the hardened four-arg
-- function avoids breaking existing deployments during rolling app releases.
create function public.signa_review_case_with_evidence(
  p_actor uuid,
  p_case_id uuid,
  p_outcome text,
  p_reason text,
  p_evidence_ids uuid[] default '{}'::uuid[]
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_role text;
  v_review_id uuid;
  v_evidence_ids uuid[] := coalesce(p_evidence_ids, '{}'::uuid[]);
  v_valid_evidence_count integer;
begin
  select role into v_role from public.profiles where id = p_actor for update;
  if v_role is distinct from 'monitor' and v_role is distinct from 'admin' then
    raise exception 'Not authorised';
  end if;
  if p_outcome is null or p_outcome not in ('supported','inconclusive','not_supported') or
     char_length(coalesce(p_reason,'')) < 12 then
    raise exception 'Invalid review';
  end if;
  if cardinality(v_evidence_ids) > 20 then
    raise exception 'Too many evidence references';
  end if;

  perform 1 from public.incidents where id = p_case_id for update;
  if not found then raise exception 'Unknown case'; end if;
  if exists (select 1 from public.incidents where id = p_case_id and created_by = p_actor) then
    raise exception 'Reviewer cannot verify a case they created';
  end if;
  if exists (
    select 1 from public.incident_reports ir
    join public.reports r on r.id = ir.report_id
    where ir.incident_id = p_case_id and r.reporter_id = p_actor
  ) then
    raise exception 'Reviewer cannot verify their own report';
  end if;
  if exists (select 1 from public.assignments where incident_id = p_case_id) then
    raise exception 'Review locked after assignment';
  end if;

  select count(distinct e.id) into v_valid_evidence_count
  from public.evidence e
  join public.incident_reports ir on ir.report_id = e.report_id
  where ir.incident_id = p_case_id
    and e.upload_status = 'ready'
    and e.id = any(v_evidence_ids);
  if v_valid_evidence_count <> cardinality(v_evidence_ids) then
    raise exception 'Evidence reference is missing, unavailable, or outside this case';
  end if;

  insert into public.reviews(incident_id, reviewer_id, outcome, reason)
    values(p_case_id, p_actor, p_outcome, p_reason)
    returning id into v_review_id;
  insert into public.review_evidence(review_id, evidence_id)
    select v_review_id, refs.evidence_id from unnest(v_evidence_ids) as refs(evidence_id);
  update public.incidents set review_state = p_outcome, updated_at = now() where id = p_case_id;
  insert into public.case_events(incident_id, actor_id, event_type, details)
    values(p_case_id, p_actor, 'review_recorded', jsonb_build_object(
      'outcome', p_outcome,
      'review_id', v_review_id,
      'evidence_ids', to_jsonb(v_evidence_ids)
    ));
  return v_review_id;
end $$;

revoke all on function public.signa_review_case_with_evidence(uuid,uuid,text,text,uuid[]) from public, anon, authenticated;
grant execute on function public.signa_review_case_with_evidence(uuid,uuid,text,text,uuid[]) to service_role;

commit;
