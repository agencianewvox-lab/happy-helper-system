create or replace function app_private.staff_name() returns text language sql stable security definer set search_path='' as $$
 select case lower(trim(full_name)) when 'murillo' then 'Murilo Araújo' when 'murilo' then 'Murilo Araújo' when 'netto' then 'Netto Monge' when 'neto' then 'Netto Monge' when 'priscilla' then 'Priscilla Borges' else full_name end
 from public.profiles where user_id=auth.uid() and role in ('admin','gestor') and app_private.is_staff();
$$;
create or replace function app_private.is_self_name(candidate text) returns boolean language sql stable security definer set search_path='' as $$
 select app_private.is_staff() and exists(select 1 from public.profiles where user_id=auth.uid() and role in ('admin','gestor') and lower(trim(candidate)) in(lower(trim(full_name)),lower(app_private.staff_name())));
$$;
create or replace function app_private.social_actor_allowed(c uuid,u uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles p join auth.users a on a.id=p.user_id join public.whatsapp_grupos g on g.id=c
 where p.user_id=u and a.deleted_at is null and(a.banned_until is null or a.banned_until<now())
 and(p.is_master or p.role='admin' or
 (p.role='gestor' and g.gestor_responsavel=case lower(trim(p.full_name)) when 'murillo' then 'Murilo Araújo' when 'murilo' then 'Murilo Araújo' when 'netto' then 'Netto Monge' when 'neto' then 'Netto Monge' when 'priscilla' then 'Priscilla Borges' else p.full_name end)
 or exists(select 1 from public.social_members m where m.client_id=c and m.user_id=u and m.can_approve)));
$$;
