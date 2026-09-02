-- Backfill only blank location addresses from the approved
-- "Cafeteria School Listing 2026-08-31.xlsx" data already curated in this repo.
-- Preserve any address subsequently entered by a supervisor.
update public.location_information as location
set address = source.address,
    updated_at = now()
from (values
  ('5753', '1581 W 186TH ST, Gardena 90248'),
  ('7329', '23240 ARCHIBALD AVE, Carson 90745'),
  ('2089', '319 E SHERMAN DR, Carson 90746'),
  ('2146', '19410 S ANNALEE AVE, Carson 90746'),
  ('8529', '1527 LAKME AVE, Wilmington 90744'),
  ('2473', '21929 BONITA ST, Carson 90745'),
  ('6867', '1235 BROAD AVE, Wilmington 90744'),
  ('2527', '24815 BROAD AVE, Wilmington 90744'),
  ('2530', '19424 S BROADACRES AVE, Carson 90746'),
  ('8090', '21820 BONITA ST, Carson 90745'),
  ('2815', '22424 CAROLDALE AVE, Carson 90745'),
  ('2836', '161 E CARSON ST, Carson 90745'),
  ('8575', '22328 S MAIN ST, Carson 90745'),
  ('2890', '23536 CATSKILL AVE, Carson 90745'),
  ('8103', '1254 E HELMICK ST, Carson 90746'),
  ('2301', '500 N ISLAND AVE, Wilmington 90744'),
  ('3384', '21228 WATER ST, Carson 90745'),
  ('3452', '22526 DOLORES ST, Carson 90745'),
  ('3466', '21250 SANTA FE AVE, Long Beach 90810'),
  ('4014', '1301 FRIES AVE, Wilmington 90744'),
  ('4041', '647 W GARDENA BLVD, Gardena 90247'),
  ('4829', '19302 LEAPWOOD AVE, Carson 90746'),
  ('8868', '4110 SANTA FE AVE, Long Beach 90810'),
  ('7205', '18924 TOWNE AVE, Carson 90746'),
  ('7419', '826 W JAVELIN ST, Torrance 90502'),
  ('8487', '22102 S FIGUEROA ST, Carson 90745'),
  ('7781', '1140 MAHAR AVE, Wilmington 90744')
) as source(location_code, address)
where location.location_code = source.location_code
  and nullif(trim(location.address), '') is null;

update public.location_information
set address = '308 WEYMOUTH AVE, San Pedro 90732',
    updated_at = now()
where location_code is null
  and lower(trim(school_name)) = 'willenberg special ed'
  and nullif(trim(address), '') is null;
