-- Correct South Area CPM assignments using the uploaded CPM directory.
-- Location code is the authoritative match key.

update public.location_information as location
set cpm_name = source.cpm_name,
    cpm_office_phone = source.cpm_office_phone,
    cpm_cell_phone = source.cpm_cell_phone,
    cpm_email = source.cpm_email,
    updated_at = now()
from (values
  ('2089', 'Jose Monreal', '310-808-1514', '818-309-3117', 'jose.monreal@lausd.net'),
  ('2146', 'Jose Monreal', '310-808-1514', '818-309-3117', 'jose.monreal@lausd.net'),
  ('2301', 'Allen Craig', '323-549-2073', '213-272-9989', 'allen.craig@lausd.net'),
  ('2473', 'Jose Monreal', '310-808-1514', '818-309-3117', 'jose.monreal@lausd.net'),
  ('2527', 'Allen Craig', '323-549-2073', '213-272-9989', 'allen.craig@lausd.net'),
  ('2530', 'Jose Monreal', '310-808-1514', '818-309-3117', 'jose.monreal@lausd.net'),
  ('2815', 'Jose Monreal', '310-808-1514', '818-309-3117', 'jose.monreal@lausd.net'),
  ('2836', 'Jose Monreal', '310-808-1514', '818-309-3117', 'jose.monreal@lausd.net'),
  ('2890', 'Jose Monreal', '310-808-1514', '818-309-3117', 'jose.monreal@lausd.net'),
  ('3384', 'Jose Monreal', '310-808-1514', '818-309-3117', 'jose.monreal@lausd.net'),
  ('3452', 'Jose Monreal', '310-808-1514', '818-309-3117', 'jose.monreal@lausd.net'),
  ('3466', 'Jose Monreal', '310-808-1514', '818-309-3117', 'jose.monreal@lausd.net'),
  ('4014', 'Allen Craig', '323-549-2073', '213-272-9989', 'allen.craig@lausd.net'),
  ('4041', 'Manuel Duenas Sanchez', '310-808-1516', '213-364-0710', 'mxd6526@lausd.net'),
  ('4829', 'Jose Monreal', '310-808-1514', '818-309-3117', 'jose.monreal@lausd.net'),
  ('5753', 'Manuel Duenas Sanchez', '310-808-1516', '213-364-0710', 'mxd6526@lausd.net'),
  ('6867', 'Allen Craig', '323-549-2073', '213-272-9989', 'allen.craig@lausd.net'),
  ('7205', 'Jose Monreal', '310-808-1514', '818-309-3117', 'jose.monreal@lausd.net'),
  ('7329', 'Jose Monreal', '310-808-1514', '818-309-3117', 'jose.monreal@lausd.net'),
  ('7419', 'Allen Craig', '323-549-2073', '213-272-9989', 'allen.craig@lausd.net'),
  ('7781', 'Allen Craig', '323-549-2073', '213-272-9989', 'allen.craig@lausd.net'),
  ('8090', 'Jose Monreal', '310-808-1514', '818-309-3117', 'jose.monreal@lausd.net'),
  ('8103', 'Jose Monreal', '310-808-1514', '818-309-3117', 'jose.monreal@lausd.net'),
  ('8487', 'Jose Monreal', '310-808-1514', '818-309-3117', 'jose.monreal@lausd.net'),
  ('8529', 'Allen Craig', '323-549-2073', '213-272-9989', 'allen.craig@lausd.net'),
  ('8575', 'Jose Monreal', '310-808-1514', '818-309-3117', 'jose.monreal@lausd.net'),
  ('8868', 'Jose Monreal', '310-808-1514', '818-309-3117', 'jose.monreal@lausd.net')
) as source(location_code, cpm_name, cpm_office_phone, cpm_cell_phone, cpm_email)
where location.location_code = source.location_code;

-- Willenberg Special Education Center is location 1957 in the CPM directory.
update public.location_information
set location_code = '1957',
    cpm_name = 'Ramon Saldana',
    cpm_office_phone = '310-808-1509',
    cpm_cell_phone = '323-997-5357',
    cpm_email = 'rxs7308@lausd.net',
    updated_at = now()
where lower(trim(school_name)) = 'willenberg special ed';
