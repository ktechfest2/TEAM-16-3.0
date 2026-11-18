begin;

-- A monitor cannot verify a case they grouped or a report they submitted.
create or replace function public.signa_review_case(
  p_actor uuid, p_case_id uuid, p_outcome text, p_reason text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_role text;
  v_review_id uuid;
begin
  select role into v_role from public.profiles where id = p_actor for update;
  if v_role is distinct from 'monitor' and v_role is distinct from 'admin' then
    raise exception 'Not authorised';
  end if;
  if p_outcome not in ('supported','inconclusive','not_supported') or
     char_length(coalesce(p_reason,'')) < 12 then
    raise exception 'Invalid review';
  end if;

  perform 1 from public.incidents where id = p_case_id for update;
  if not found then raise exception 'Unknown case'; end if;
  if exists (
    select 1 from public.incidents
    where id = p_case_id and created_by = p_actor
  ) then
    raise exception 'Reviewer cannot verify a case they created';
  end if;
  if exists (
    select 1
    from public.incident_reports ir
    join public.reports r on r.id = ir.report_id
    where ir.incident_id = p_case_id and r.reporter_id = p_actor
  ) then
    raise exception 'Reviewer cannot verify their own report';
  end if;
  if exists (select 1 from public.assignments where incident_id = p_case_id) then
    raise exception 'Review locked after assignment';
  end if;

  insert into public.reviews(incident_id, reviewer_id, outcome, reason)
    values(p_case_id, p_actor, p_outcome, p_reason) returning id into v_review_id;
  update public.incidents set review_state=p_outcome, updated_at=now() where id=p_case_id;
  insert into public.case_events(incident_id, actor_id, event_type, details)
    values(p_case_id,p_actor,'review_recorded',jsonb_build_object('outcome',p_outcome,'review_id',v_review_id));
  return v_review_id;
end $$;

-- Revoking a coordinator role immediately revokes both case actions, even if an
-- old assignment remains attached to that user's profile.
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
  select role into v_role from public.profiles where id=p_actor for update;
  if v_role is distinct from 'coordinator' and v_role is distinct from 'admin' then
    raise exception 'Not authorised';
  end if;
  select assigned_to,incident_id,acknowledged_at
    into v_owner,v_case,v_at from public.assignments where id=p_assignment for update;
  if v_case is null or (v_owner <> p_actor and v_role is distinct from 'admin') then
    raise exception 'Not authorised';
  end if;
  if v_at is not null then return p_assignment; end if;
  update public.assignments
    set acknowledged_at=now(), acknowledgement_note=left(coalesce(p_note,''),2000)
    where id=p_assignment;
  update public.incidents set response_state='acknowledged',updated_at=now() where id=v_case;
  insert into public.case_events(incident_id,actor_id,event_type,details)
    values(v_case,p_actor,'assignment_acknowledged',jsonb_build_object('assignment_id',p_assignment));
  return p_assignment;
end $$;

create or replace function public.signa_record_followup(
  p_actor uuid, p_assignment uuid, p_action text, p_note text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_role text;
  v_owner uuid;
  v_case uuid;
  v_at timestamptz;
begin
  select role into v_role from public.profiles where id=p_actor for update;
  if v_role is distinct from 'coordinator' and v_role is distinct from 'admin' then
    raise exception 'Not authorised';
  end if;
  select assigned_to,incident_id,acknowledged_at
    into v_owner,v_case,v_at from public.assignments where id=p_assignment for update;
  if v_case is null or (v_owner <> p_actor and v_role is distinct from 'admin') then
    raise exception 'Not authorised';
  end if;
  if v_at is null or char_length(coalesce(p_action,'')) < 4 or
     char_length(coalesce(p_note,'')) > 2000 then
    raise exception 'Acknowledge first and provide an action note';
  end if;
  insert into public.case_events(incident_id,actor_id,event_type,details)
    values(v_case,p_actor,'followup_recorded',jsonb_build_object(
      'action',left(p_action,400), 'note',left(coalesce(p_note,''),2000),
      'assignment_id',p_assignment));
  update public.incidents set response_state='followup_recorded', updated_at=now() where id=v_case;
  return p_assignment;
end $$;

revoke all on function public.signa_review_case(uuid,uuid,text,text) from public, anon, authenticated;
revoke all on function public.signa_acknowledge_case(uuid,uuid,text) from public, anon, authenticated;
revoke all on function public.signa_record_followup(uuid,uuid,text,text) from public, anon, authenticated;
grant execute on function public.signa_review_case(uuid,uuid,text,text) to service_role;
grant execute on function public.signa_acknowledge_case(uuid,uuid,text) to service_role;
grant execute on function public.signa_record_followup(uuid,uuid,text,text) to service_role;

commit;
