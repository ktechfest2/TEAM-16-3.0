-- Extend the backend's durable limiter to the bounded AI and browser voice APIs.
begin;
alter table public.signa_rate_limits drop constraint if exists signa_rate_limits_scope_check;
alter table public.signa_rate_limits add constraint signa_rate_limits_scope_check
  check (scope in ('report','evidence','ai_assessment','voice'));
create or replace function public.signa_consume_rate_limit(
  p_scope text, p_key_hash text, p_limit integer, p_window_seconds integer
) returns boolean language plpgsql security definer set search_path = '' as $$
declare v_window timestamptz; v_hits integer;
begin
  if p_scope is null or p_scope not in ('report','evidence','ai_assessment','voice') or
     p_key_hash is null or p_key_hash !~ '^[0-9a-f]{64}$' or
     p_limit is null or p_limit < 1 or p_limit > 1000 or
     p_window_seconds is null or p_window_seconds < 30 or p_window_seconds > 86400 then
    raise exception 'Invalid rate limit request';
  end if;
  v_window := to_timestamp(floor(extract(epoch from clock_timestamp()) / p_window_seconds) * p_window_seconds);
  insert into public.signa_rate_limits as current_window(scope,key_hash,window_started_at,hit_count)
    values(p_scope,p_key_hash,v_window,1)
  on conflict (scope,key_hash,window_started_at) do update set hit_count = current_window.hit_count + 1
  returning hit_count into v_hits;
  if mod(extract(epoch from clock_timestamp())::bigint, 300) = 0 then
    delete from public.signa_rate_limits where window_started_at < now() - interval '24 hours';
  end if;
  return v_hits <= p_limit;
end $$;
revoke all on function public.signa_consume_rate_limit(text,text,integer,integer) from public, anon, authenticated;
grant execute on function public.signa_consume_rate_limit(text,text,integer,integer) to service_role;
commit;
