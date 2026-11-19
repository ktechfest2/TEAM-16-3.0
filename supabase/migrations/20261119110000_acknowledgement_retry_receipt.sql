begin;

-- Return NULL only when the assignment was already acknowledged. This lets the
-- HTTP API report retries accurately while keeping the state change and event
-- insertion in the same transaction under the assignment row lock.
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
  if v_at is not null then return null; end if;
  update public.assignments
    set acknowledged_at=now(), acknowledgement_note=left(coalesce(p_note,''),2000)
    where id=p_assignment;
  update public.incidents set response_state='acknowledged',updated_at=now() where id=v_case;
  insert into public.case_events(incident_id,actor_id,event_type,details)
    values(v_case,p_actor,'assignment_acknowledged',jsonb_build_object('assignment_id',p_assignment));
  return p_assignment;
end $$;

revoke all on function public.signa_acknowledge_case(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.signa_acknowledge_case(uuid,uuid,text) to service_role;

commit;
