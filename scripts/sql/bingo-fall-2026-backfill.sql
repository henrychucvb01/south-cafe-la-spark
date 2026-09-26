-- Prepared from read-only September 25 audit; not applied.
-- Re-run the audit before executing if underlying records have changed.
begin;
insert into public.spark_points(location_id,points,point_type,description,service_date,source,unique_key) values
(4,40,'bingo_line_reward','SPARK Bingo Card 1 — 4 lines','2026-09-25','automatic','card1-fall-2026-line-4-4'),
(4,50,'bingo_line_reward','SPARK Bingo Card 1 — 5 lines','2026-09-25','automatic','card1-fall-2026-line-4-5'),
(6,30,'bingo_line_reward','SPARK Bingo Card 1 — 3 lines','2026-09-25','automatic','card1-fall-2026-line-6-3'),
(7,10,'bingo_line_reward','SPARK Bingo Card 1 — 1 lines','2026-09-25','automatic','card1-fall-2026-line-7-1'),
(9,10,'bingo_line_reward','SPARK Bingo Card 1 — 1 lines','2026-09-25','automatic','card1-fall-2026-line-9-1'),
(9,20,'bingo_line_reward','SPARK Bingo Card 1 — 2 lines','2026-09-25','automatic','card1-fall-2026-line-9-2'),
(9,30,'bingo_line_reward','SPARK Bingo Card 1 — 3 lines','2026-09-25','automatic','card1-fall-2026-line-9-3'),
(10,30,'bingo_line_reward','SPARK Bingo Card 1 — 3 lines','2026-09-25','automatic','card1-fall-2026-line-10-3'),
(10,40,'bingo_line_reward','SPARK Bingo Card 1 — 4 lines','2026-09-25','automatic','card1-fall-2026-line-10-4'),
(11,40,'bingo_line_reward','SPARK Bingo Card 1 — 4 lines','2026-09-25','automatic','card1-fall-2026-line-11-4'),
(12,10,'bingo_line_reward','SPARK Bingo Card 1 — 1 lines','2026-09-25','automatic','card1-fall-2026-line-12-1'),
(13,40,'bingo_line_reward','SPARK Bingo Card 1 — 4 lines','2026-09-25','automatic','card1-fall-2026-line-13-4'),
(13,50,'bingo_line_reward','SPARK Bingo Card 1 — 5 lines','2026-09-25','automatic','card1-fall-2026-line-13-5'),
(14,10,'bingo_line_reward','SPARK Bingo Card 1 — 1 lines','2026-09-25','automatic','card1-fall-2026-line-14-1'),
(14,20,'bingo_line_reward','SPARK Bingo Card 1 — 2 lines','2026-09-25','automatic','card1-fall-2026-line-14-2'),
(15,50,'bingo_line_reward','SPARK Bingo Card 1 — 5 lines','2026-09-25','automatic','card1-fall-2026-line-15-5'),
(19,10,'bingo_line_reward','SPARK Bingo Card 1 — 1 lines','2026-09-25','automatic','card1-fall-2026-line-19-1'),
(21,10,'bingo_line_reward','SPARK Bingo Card 1 — 1 lines','2026-09-25','automatic','card1-fall-2026-line-21-1'),
(25,20,'bingo_line_reward','SPARK Bingo Card 1 — 2 lines','2026-09-25','automatic','card1-fall-2026-line-25-2'),
(26,20,'bingo_line_reward','SPARK Bingo Card 1 — 2 lines','2026-09-25','automatic','card1-fall-2026-line-26-2'),
(30,10,'bingo_line_reward','SPARK Bingo Card 1 — 1 lines','2026-09-25','automatic','card1-fall-2026-line-30-1'),
(30,20,'bingo_line_reward','SPARK Bingo Card 1 — 2 lines','2026-09-25','automatic','card1-fall-2026-line-30-2'),
(30,30,'bingo_line_reward','SPARK Bingo Card 1 — 3 lines','2026-09-25','automatic','card1-fall-2026-line-30-3'),
(32,50,'bingo_line_reward','SPARK Bingo Card 1 — 5 lines','2026-09-25','automatic','card1-fall-2026-line-32-5')
on conflict (unique_key) do nothing;
commit;
