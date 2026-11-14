-- Normalize the existing company record to the requested spelling.
update public.companies
set name = regexp_replace(name, 'Megatama', 'Mega Tama', 'gi')
where name ~* 'Megatama';
