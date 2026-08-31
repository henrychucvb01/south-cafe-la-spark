-- Compatibility for environments where the existing location address field
-- has not yet been added to the shared directory table.
alter table public.location_information
  add column if not exists address text;
