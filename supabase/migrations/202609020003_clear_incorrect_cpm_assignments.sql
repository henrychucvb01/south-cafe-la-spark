-- Remove the incorrect blanket CPM assignment that applied John Aguirre to every location.
-- CPM contacts should only be entered when the school-specific assignment is verified.

update public.location_information
set cpm_name = null,
    cpm_office_phone = null,
    cpm_cell_phone = null,
    cpm_email = null,
    updated_at = now()
where cpm_name = 'John Aguirre';
