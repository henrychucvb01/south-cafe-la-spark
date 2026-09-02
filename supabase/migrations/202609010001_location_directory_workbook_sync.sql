-- Synchronize supported Huy Nguyen area-directory fields from
-- "Cafeteria School Listing 2026-08-31.xlsx".
-- The workbook does not contain school phone numbers, so school_phone is
-- intentionally preserved rather than inferred or overwritten.
update public.location_information as location
set site_type = source.site_type,
    cafeteria_phone = source.cafeteria_phone,
    address = source.address,
    updated_at = now()
from (values
  ('5753', 'PREP', '(310) 323-2070', '1581 W 186TH ST, Gardena 90248'),
  ('7329', 'PREP', '(310) 835-7343', '23240 ARCHIBALD AVE, Carson 90745'),
  ('2089', 'NNC', '(310) 532-5815', '319 E SHERMAN DR, Carson 90746'),
  ('2146', 'NNC', '(310) 635-0470', '19410 S ANNALEE AVE, Carson 90746'),
  ('8529', 'PREP', '(310) 847-3757', '1527 LAKME AVE, Wilmington 90744'),
  ('2473', 'NNC', '(310) 835-8197', '21929 BONITA ST, Carson 90745'),
  ('6867', 'PREP', '(310) 522-5415', '1235 BROAD AVE, Wilmington 90744'),
  ('2527', 'PREP', '(310) 835-5368', '24815 BROAD AVE, Wilmington 90744'),
  ('2530', 'NNC', '(310) 537-1030', '19424 S BROADACRES AVE, Carson 90746'),
  ('8090', 'PREP', '(310) 952-5730', '21820 BONITA ST, Carson 90745'),
  ('2815', 'PREP', '(310) 328-7489', '22424 CAROLDALE AVE, Carson 90745'),
  ('2836', 'PREP', '(310) 834-4218', '161 E CARSON ST, Carson 90745'),
  ('8575', 'PREP', '(310) 847-6048', '22328 S MAIN ST, Carson 90745'),
  ('2890', 'PREP', '(310) 835-4229', '23536 CATSKILL AVE, Carson 90745'),
  ('8103', 'PREP', '(310) 661-4573', '1254 E HELMICK ST, Carson 90746'),
  ('2301', 'PREP', '(310) 847-1438', '500 N ISLAND AVE, Wilmington 90744'),
  ('3384', 'NNC', '(310) 830-4084', '21228 WATER ST, Carson 90745'),
  ('3452', 'NNC', '(310) 834-4983', '22526 DOLORES ST, Carson 90745'),
  ('3466', 'PREP', '(310) 834-6928', '21250 SANTA FE AVE, Long Beach 90810'),
  ('4014', 'PREP', '(310) 834-6101', '1301 FRIES AVE, Wilmington 90744'),
  ('4041', 'PREP', '(310) 329-8326', '647 W GARDENA BLVD, Gardena 90247'),
  ('4829', 'NNC', '(310) 532-2106', '19302 LEAPWOOD AVE, Carson 90746'),
  ('8868', 'PREP', '(310) 847-6427', '4110 SANTA FE AVE, Long Beach 90810'),
  ('7205', 'PREP', '(310) 323-3880', '18924 TOWNE AVE, Carson 90746'),
  ('7419', 'PREP', '(310) 320-1863', '826 W JAVELIN ST, Torrance 90502'),
  ('8487', 'PREP', '(310) 328-1341', '22102 S FIGUEROA ST, Carson 90745'),
  ('7781', 'PREP', '(310) 834-5996', '1140 MAHAR AVE, Wilmington 90744')
) as source(location_code, site_type, cafeteria_phone, address)
where location.location_code = source.location_code;

-- Willenberg already exists in the directory without a location code. Preserve
-- that identifier state while synchronizing only workbook-supported fields.
update public.location_information
set site_type = 'PREP',
    cafeteria_phone = '(310) 547-5450',
    address = '308 WEYMOUTH AVE, San Pedro 90732',
    updated_at = now()
where location_code is null
  and lower(trim(school_name)) = 'willenberg special ed';
