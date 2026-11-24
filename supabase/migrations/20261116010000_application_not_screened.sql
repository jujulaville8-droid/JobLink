-- Unapplied. Preserve the existing employer-only RLS and legacy unavailable rows.
alter table public.application_fit_verdicts
  drop constraint application_fit_verdicts_verdict_check;
alter table public.application_fit_verdicts
  add constraint application_fit_verdicts_verdict_check
  check (verdict in ('good_fit', 'not_a_fit', 'not_enough_information', 'unavailable', 'not_screened'));
