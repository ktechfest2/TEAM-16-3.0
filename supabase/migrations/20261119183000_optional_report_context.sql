-- Categorical alerts may omit free-text context; an empty description is not a witness statement.
begin;
alter table public.reports drop constraint if exists reports_description_check;
alter table public.reports add constraint reports_description_check
  check (char_length(description) <= 1600);
commit;
