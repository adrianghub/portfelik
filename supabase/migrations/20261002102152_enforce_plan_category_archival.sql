-- Plans must not newly assign archived categories; unchanged historical refs stay.
create trigger plans_active_category before insert or update of category_id on public.plans
  for each row execute function public.enforce_active_category_assignment();
