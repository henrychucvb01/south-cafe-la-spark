-- Public media references approved for school photos, school logos, and
-- manager/FSM photos. No personnel documents belong in this bucket.
alter table public.location_information
  add column if not exists school_photo_url text,
  add column if not exists manager_photo_url text,
  add column if not exists school_logo_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('school-media', 'school-media', true, 5242880, array['image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

update public.location_information
set school_photo_url = 'https://kkrcxqhfzepifhkryodd.supabase.co/storage/v1/object/public/school-media/' || location_code || '/school.webp',
    manager_photo_url = case
      when location_code in ('2146', '2815', '8575', '8103', '4041', '7419') then null
      else 'https://kkrcxqhfzepifhkryodd.supabase.co/storage/v1/object/public/school-media/' || location_code || '/manager.webp'
    end,
    school_logo_url = 'https://kkrcxqhfzepifhkryodd.supabase.co/storage/v1/object/public/school-media/' || location_code || '/logo.webp',
    updated_at = now()
where location_code in (
  '5753', '7329', '2089', '2146', '8529', '2473', '6867', '2527', '2530',
  '8090', '2815', '2836', '8575', '2890', '8103', '2301', '3384', '3452',
  '3466', '4014', '4041', '4829', '8868', '7205', '7419', '8487', '7781'
);

update public.location_information
set school_photo_url = 'https://kkrcxqhfzepifhkryodd.supabase.co/storage/v1/object/public/school-media/willenberg-special-ed/school.webp',
    manager_photo_url = null,
    school_logo_url = 'https://kkrcxqhfzepifhkryodd.supabase.co/storage/v1/object/public/school-media/willenberg-special-ed/logo.webp',
    updated_at = now()
where location_code is null
  and lower(trim(school_name)) = 'willenberg special ed';
