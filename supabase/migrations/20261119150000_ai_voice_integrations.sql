-- AI observations and narrowly scoped public voice tool data.
-- Apply only after reviewing the target Supabase project. RLS has no client policies.

alter table public.reports add column if not exists ai_processing_consent boolean not null default false;

create table if not exists public.ai_assessments (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports(id) on delete restrict,
  requested_by uuid not null references public.profiles(id),
  provider text not null check (provider = 'gemini'),
  model text not null,
  status text not null check (status in ('completed','failed')),
  provisional_summary text,
  model_observations jsonb,
  deterministic_checks jsonb not null default '{}'::jsonb,
  source_references jsonb not null default '[]'::jsonb,
  uncertainty jsonb not null default '[]'::jsonb,
  provider_failure text,
  created_at timestamptz not null default now(),
  constraint ai_assessment_result_consistent check (
    (status = 'completed' and model_observations is not null and provider_failure is null)
    or (status = 'failed' and provider_failure is not null)
  )
);
create index if not exists ai_assessments_report_idx on public.ai_assessments(report_id, created_at desc);
alter table public.ai_assessments enable row level security;

-- Rows are inserted only by the authenticated monitor route using service credentials.
-- Human review is still authoritative; this table does not mutate incident/review state.

create table if not exists public.public_safe_updates (
  id uuid primary key default gen_random_uuid(),
  polling_unit_code text not null check (char_length(polling_unit_code) between 2 and 32),
  summary text not null check (char_length(summary) between 12 and 400),
  public_date date not null,
  approved boolean not null default false,
  approved_by uuid references public.profiles(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  constraint public_update_approval_fields check (
    (approved = false and approved_by is null and approved_at is null)
    or (approved = true and approved_by is not null and approved_at is not null)
  )
);
create index if not exists public_safe_updates_lookup_idx on public.public_safe_updates(polling_unit_code, public_date desc) where approved = true;
alter table public.public_safe_updates enable row level security;

-- The Voicebip tool route selects only these columns from rows explicitly approved by staff.
-- No raw reports, evidence, witnesses, notes, or internal incident IDs are returned.
