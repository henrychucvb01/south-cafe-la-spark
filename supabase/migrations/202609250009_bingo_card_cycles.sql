begin;
-- School-scoped durable cards. No browser may write card/quota state directly.
create table public.spark_bingo_goals(id text primary key, definition jsonb not null);
create table public.spark_bingo_cards(
 id uuid primary key default gen_random_uuid(), location_id bigint not null references public.locations(id),
 cycle integer not null check(cycle>0), goal_ids text[] not null,
 started_at timestamptz not null, started_on date not null,
 completed_ids text[] not null default array['free'], blackout_at timestamptz,
 revision integer not null default 1, unique(location_id,cycle),
 check(cardinality(goal_ids)=25 and goal_ids[13]='free')
);
create table public.spark_bingo_repicks(
 location_id bigint not null references public.locations(id), month date not null,
 card_id uuid not null references public.spark_bingo_cards(id), square_index integer not null check(square_index between 0 and 24 and square_index<>12),
 old_goal text not null, new_goal text not null, used_at timestamptz not null default now(),
 primary key(location_id,month)
);
alter table public.spark_bingo_goals enable row level security;
alter table public.spark_bingo_cards enable row level security;
alter table public.spark_bingo_repicks enable row level security;
revoke all on public.spark_bingo_goals,public.spark_bingo_cards,public.spark_bingo_repicks from public,anon,authenticated;
insert into public.spark_bingo_goals select value->>'id',value from jsonb_array_elements($catalog$[{"id": "finish-line-3", "label": "Finish Line", "detail": "Complete 3 days", "icon": "✅", "draw_enabled": true, "threshold": 3, "evidence": "finish"}, {"id": "finish-line-5", "label": "Finish Line", "detail": "Complete 5 days", "icon": "✅", "draw_enabled": true, "threshold": 5, "evidence": "finish"}, {"id": "finish-line-7", "label": "Finish Line", "detail": "Complete 7 days", "icon": "🏁", "draw_enabled": true, "threshold": 7, "evidence": "finish"}, {"id": "finish-line-10", "label": "Finish Line", "detail": "Complete 10 days", "icon": "🏁", "draw_enabled": true, "threshold": 10, "evidence": "finish"}, {"id": "finish-line-15", "label": "Finish Line", "detail": "Complete 15 days", "icon": "🏆", "draw_enabled": true, "threshold": 15, "evidence": "finish"}, {"id": "finish-line-20", "label": "Finish Line", "detail": "Complete 20 days", "icon": "🏆", "draw_enabled": true, "threshold": 20, "evidence": "finish"}, {"id": "finish-streak-3", "label": "Finish Line", "detail": "3-day streak", "icon": "🔥", "draw_enabled": true, "threshold": 3, "evidence": "streak"}, {"id": "finish-streak-5", "label": "Finish Line", "detail": "5-day streak", "icon": "🔥", "draw_enabled": true, "threshold": 5, "evidence": "streak"}, {"id": "perfect-week", "label": "Perfect Week", "detail": "Finish Line", "icon": "⭐", "draw_enabled": true, "threshold": 1, "evidence": "perfect_week"}, {"id": "daily-bites-3", "label": "Daily Bites", "detail": "Visit 3 days", "icon": "🍎", "draw_enabled": true, "threshold": 3, "evidence": "visits"}, {"id": "daily-bites-5", "label": "Daily Bites", "detail": "Visit 5 days", "icon": "🍎", "draw_enabled": true, "threshold": 5, "evidence": "visits"}, {"id": "daily-bites-7", "label": "Daily Bites", "detail": "Visit 7 days", "icon": "🥕", "draw_enabled": true, "threshold": 7, "evidence": "visits"}, {"id": "daily-bites-10", "label": "Daily Bites", "detail": "Visit 10 days", "icon": "🥕", "draw_enabled": true, "threshold": 10, "evidence": "visits"}, {"id": "meal-counts-3", "label": "Meal Counts", "detail": "Enter 3 days", "icon": "🍽️", "draw_enabled": true, "threshold": 3, "evidence": "meals"}, {"id": "meal-counts-5", "label": "Meal Counts", "detail": "Enter 5 days", "icon": "🍽️", "draw_enabled": true, "threshold": 5, "evidence": "meals"}, {"id": "meal-counts-7", "label": "Meal Counts", "detail": "Enter 7 days", "icon": "🔢", "draw_enabled": true, "threshold": 7, "evidence": "meals"}, {"id": "meal-counts-10", "label": "Meal Counts", "detail": "Enter 10 days", "icon": "🔢", "draw_enabled": true, "threshold": 10, "evidence": "meals"}, {"id": "meal-counts-15", "label": "Meal Counts", "detail": "Enter 15 days", "icon": "🔢", "draw_enabled": true, "threshold": 15, "evidence": "meals"}, {"id": "production-record-3", "label": "Production Record", "detail": "Complete 3 days", "icon": "📋", "draw_enabled": true, "threshold": 3, "evidence": "item", "item_key": "production_record"}, {"id": "production-record-5", "label": "Production Record", "detail": "Complete 5 days", "icon": "📋", "draw_enabled": true, "threshold": 5, "evidence": "item", "item_key": "production_record"}, {"id": "production-record-10", "label": "Production Record", "detail": "Complete 10 days", "icon": "📋", "draw_enabled": true, "threshold": 10, "evidence": "item", "item_key": "production_record"}, {"id": "production-worksheet-5", "label": "Production Worksheet", "detail": "Complete 5 days", "icon": "📝", "draw_enabled": true, "threshold": 5, "evidence": "item", "item_key": "production_worksheet"}, {"id": "reports-reviewed-5", "label": "Reports Reviewed", "detail": "Complete 5 days", "icon": "🔍", "draw_enabled": true, "threshold": 5, "evidence": "item", "item_key": "reports_reviewed"}, {"id": "finish-meal-count-5", "label": "Meal Count Check", "detail": "Confirm 5 days", "icon": "✔️", "draw_enabled": true, "threshold": 5, "evidence": "item", "item_key": "meal_count_entered"}, {"id": "perfect-bic", "label": "Perfect BIC Run", "detail": "Supervisor verified", "icon": "🌟", "draw_enabled": false, "threshold": 1, "evidence": "perfect_monitoring", "item_key": "breakfast"}, {"id": "monitoring-1", "label": "Supper Monitoring", "detail": "Manager monitoring accepted", "icon": "🔎", "requiresSupper": true, "draw_enabled": true, "threshold": 1, "evidence": "monitoring"}, {"id": "perfect-lunch", "label": "Perfect Lunch", "detail": "Monitoring", "icon": "🥗", "draw_enabled": false, "threshold": 1, "evidence": "perfect_monitoring", "item_key": "lunch"}, {"id": "all-monitorings", "label": "Supper Monitoring", "detail": "Manager monitoring accepted", "icon": "✔️", "requiresSupper": true, "draw_enabled": false, "threshold": 1, "evidence": "monitoring"}, {"id": "inventory", "label": "Inventory", "detail": "Month-end complete", "icon": "📦", "draw_enabled": true, "threshold": 1, "evidence": "item", "item_key": "month_end_inventory"}, {"id": "monday", "label": "Monday Tasks", "detail": "Complete all", "icon": "M", "draw_enabled": true, "threshold": 1, "evidence": "monday"}, {"id": "tuesday", "label": "Tuesday Plan", "detail": "Meal plan complete", "icon": "T", "draw_enabled": true, "threshold": 1, "evidence": "item", "item_key": "tuesday_meal_plan"}, {"id": "wednesday", "label": "Wednesday", "detail": "Ordering complete", "icon": "W", "draw_enabled": true, "threshold": 1, "evidence": "item", "item_key": "wednesday_order_status"}, {"id": "thursday", "label": "Thursday", "detail": "Orders complete", "icon": "T", "draw_enabled": true, "threshold": 1, "evidence": "item", "item_key": "thursday_orders_complete"}, {"id": "perfect-supper", "label": "Perfect Supper", "detail": "Monitoring", "icon": "🌙", "requiresSupper": true, "draw_enabled": false, "threshold": 1, "evidence": "perfect_monitoring", "item_key": "supper"}, {"id": "supper-monitoring-1", "label": "Supper Monitoring", "detail": "Manager monitoring accepted", "icon": "🌙", "requiresSupper": true, "draw_enabled": false, "threshold": 1, "evidence": "monitoring"}, {"id": "supper-monitorings-3", "label": "Supper Monitoring", "detail": "Manager monitoring accepted", "icon": "3️⃣", "requiresSupper": true, "draw_enabled": false, "threshold": 1, "evidence": "monitoring"}, {"id": "mplh-2", "label": "MPLH Target", "detail": "Hit target 2 days", "icon": "📈", "requiresMplh": true, "draw_enabled": true, "threshold": 2, "evidence": "mplh"}, {"id": "mplh-3", "label": "MPLH Target", "detail": "Hit target 3 days", "icon": "📈", "requiresMplh": true, "draw_enabled": true, "threshold": 3, "evidence": "mplh"}, {"id": "mplh-5", "label": "MPLH Target", "detail": "Hit target 5 days", "icon": "📊", "requiresMplh": true, "draw_enabled": true, "threshold": 5, "evidence": "mplh"}, {"id": "previous-meal-counts-3", "label": "Previous Meal Counts", "detail": "Confirm 3 days", "icon": "✅", "evidence": "item", "item_key": "previous_meal_counts", "threshold": 3, "draw_enabled": true}, {"id": "previous-meal-counts-5", "label": "Previous Meal Counts", "detail": "Confirm 5 days", "icon": "✅", "evidence": "item", "item_key": "previous_meal_counts", "threshold": 5, "draw_enabled": true}, {"id": "previous-meal-counts-10", "label": "Previous Meal Counts", "detail": "Confirm 10 days", "icon": "✅", "evidence": "item", "item_key": "previous_meal_counts", "threshold": 10, "draw_enabled": true}, {"id": "dairy-order-3", "label": "Dairy Order", "detail": "Confirm 3 days", "icon": "✅", "evidence": "item", "item_key": "dairy_order_created", "threshold": 3, "draw_enabled": true}, {"id": "dairy-order-5", "label": "Dairy Order", "detail": "Confirm 5 days", "icon": "✅", "evidence": "item", "item_key": "dairy_order_created", "threshold": 5, "draw_enabled": true}, {"id": "dairy-order-10", "label": "Dairy Order", "detail": "Confirm 10 days", "icon": "✅", "evidence": "item", "item_key": "dairy_order_created", "threshold": 10, "draw_enabled": true}, {"id": "receivers-3", "label": "Receivers", "detail": "Confirm 3 days", "icon": "✅", "evidence": "item", "item_key": "receivers_completed", "threshold": 3, "draw_enabled": true}, {"id": "receivers-5", "label": "Receivers", "detail": "Confirm 5 days", "icon": "✅", "evidence": "item", "item_key": "receivers_completed", "threshold": 5, "draw_enabled": true}, {"id": "receivers-10", "label": "Receivers", "detail": "Confirm 10 days", "icon": "✅", "evidence": "item", "item_key": "receivers_completed", "threshold": 10, "draw_enabled": true}, {"id": "production-worksheet-3", "label": "Production Worksheet", "detail": "Confirm 3 days", "icon": "📋", "evidence": "item", "item_key": "production_worksheet", "threshold": 3, "draw_enabled": true}, {"id": "production-worksheet-10", "label": "Production Worksheet", "detail": "Confirm 10 days", "icon": "📋", "evidence": "item", "item_key": "production_worksheet", "threshold": 10, "draw_enabled": true}, {"id": "reports-reviewed-3", "label": "Reports Reviewed", "detail": "Confirm 3 days", "icon": "📋", "evidence": "item", "item_key": "reports_reviewed", "threshold": 3, "draw_enabled": true}, {"id": "reports-reviewed-10", "label": "Reports Reviewed", "detail": "Confirm 10 days", "icon": "📋", "evidence": "item", "item_key": "reports_reviewed", "threshold": 10, "draw_enabled": true}, {"id": "finish-meal-count-3", "label": "Meal Count Check", "detail": "Confirm 3 days", "icon": "📋", "evidence": "item", "item_key": "meal_count_entered", "threshold": 3, "draw_enabled": true}, {"id": "finish-meal-count-10", "label": "Meal Count Check", "detail": "Confirm 10 days", "icon": "📋", "evidence": "item", "item_key": "meal_count_entered", "threshold": 10, "draw_enabled": true}, {"id": "game-word-1", "label": "Cafeteria Word", "detail": "Solve on 1 day", "icon": "🥕", "evidence": "game", "item_key": "word", "threshold": 1, "draw_enabled": true}, {"id": "game-word-3", "label": "Cafeteria Word", "detail": "Solve on 3 days", "icon": "🥕", "evidence": "game", "item_key": "word", "threshold": 3, "draw_enabled": true}, {"id": "game-word-5", "label": "Cafeteria Word", "detail": "Solve on 5 days", "icon": "🥕", "evidence": "game", "item_key": "word", "threshold": 5, "draw_enabled": true}, {"id": "game-spark_sort-1", "label": "Connections", "detail": "Solve on 1 day", "icon": "✨", "evidence": "game", "item_key": "spark_sort", "threshold": 1, "draw_enabled": true}, {"id": "game-spark_sort-3", "label": "Connections", "detail": "Solve on 3 days", "icon": "✨", "evidence": "game", "item_key": "spark_sort", "threshold": 3, "draw_enabled": true}, {"id": "game-spark_sort-5", "label": "Connections", "detail": "Solve on 5 days", "icon": "✨", "evidence": "game", "item_key": "spark_sort", "threshold": 5, "draw_enabled": true}, {"id": "training-1", "label": "AR Training", "detail": "Answer correctly on 1 day", "icon": "📚", "evidence": "training", "threshold": 1, "draw_enabled": true}, {"id": "training-3", "label": "AR Training", "detail": "Answer correctly on 3 days", "icon": "📚", "evidence": "training", "threshold": 3, "draw_enabled": true}, {"id": "training-5", "label": "AR Training", "detail": "Answer correctly on 5 days", "icon": "📚", "evidence": "training", "threshold": 5, "draw_enabled": true}, {"id": "free", "label": "FREE SPACE", "detail": "Already yours", "icon": "✨", "evidence": "free", "threshold": 1, "draw_enabled": false}]$catalog$::jsonb);
-- Preserve current school layouts except removed Labor squares. Preserve all paid reward keys.
insert into public.spark_bingo_cards(location_id,cycle,goal_ids,started_at,started_on)
select (value->>'location_id')::bigint,1,array(select jsonb_array_elements_text(value->'goal_ids')),
 '2026-08-01 00:00:00 America/Los_Angeles'::timestamptz,date '2026-08-01'
from jsonb_array_elements($seeds$[{"location_id": 4, "goal_ids": ["finish-line-10", "monday", "finish-line-5", "all-monitorings", "production-record-5", "production-record-3", "meal-counts-5", "daily-bites-3", "daily-bites-10", "meal-counts-3", "supper-monitoring-1", "supper-monitorings-3", "free", "monitoring-1", "finish-line-3", "thursday", "finish-streak-3", "perfect-lunch", "perfect-week", "perfect-supper", "daily-bites-5", "meal-counts-15", "perfect-bic", "mplh-3", "reports-reviewed-5"]}, {"location_id": 5, "goal_ids": ["thursday", "daily-bites-3", "mplh-2", "inventory", "finish-line-10", "meal-counts-7", "meal-counts-10", "finish-line-5", "mplh-5", "daily-bites-7", "perfect-lunch", "production-record-3", "free", "production-record-5", "meal-counts-5", "finish-meal-count-5", "tuesday", "all-monitorings", "reports-reviewed-5", "perfect-bic", "finish-streak-5", "monday", "receivers-5", "production-worksheet-5", "mplh-3"]}, {"location_id": 6, "goal_ids": ["finish-streak-5", "finish-line-5", "thursday", "meal-counts-15", "daily-bites-3", "finish-line-3", "meal-counts-7", "meal-counts-3", "production-record-3", "tuesday", "all-monitorings", "perfect-bic", "free", "daily-bites-10", "wednesday", "finish-line-15", "monitoring-1", "mplh-2", "perfect-week", "inventory", "finish-meal-count-5", "production-record-10", "production-record-5", "mplh-5", "daily-bites-7"]}, {"location_id": 7, "goal_ids": ["finish-line-15", "daily-bites-10", "training-1", "finish-streak-3", "perfect-bic", "thursday", "previous-meal-counts-3", "production-record-5", "production-record-3", "mplh-2", "daily-bites-5", "meal-counts-15", "free", "finish-line-5", "meal-counts-5", "all-monitorings", "production-worksheet-5", "daily-bites-7", "finish-line-20", "finish-line-7", "meal-counts-10", "inventory", "production-record-10", "finish-line-10", "perfect-lunch"]}, {"location_id": 8, "goal_ids": ["thursday", "finish-streak-3", "finish-line-3", "reports-reviewed-5", "production-record-3", "mplh-5", "perfect-bic", "monday", "finish-meal-count-5", "mplh-3", "daily-bites-3", "finish-streak-5", "free", "finish-line-15", "game-spark_sort-5", "finish-line-20", "meal-counts-10", "finish-line-5", "production-record-5", "finish-line-10", "perfect-supper", "meal-counts-15", "daily-bites-5", "inventory", "production-record-10"]}, {"location_id": 9, "goal_ids": ["inventory", "finish-line-15", "mplh-2", "supper-monitorings-3", "thursday", "finish-line-3", "meal-counts-15", "finish-line-20", "mplh-5", "perfect-supper", "daily-bites-5", "production-record-10", "free", "daily-bites-10", "perfect-bic", "production-record-3", "wednesday", "finish-streak-5", "finish-line-7", "finish-line-5", "finish-streak-3", "tuesday", "monitoring-1", "meal-counts-3", "meal-counts-7"]}, {"location_id": 10, "goal_ids": ["perfect-lunch", "meal-counts-3", "daily-bites-3", "daily-bites-7", "production-record-3", "production-record-10", "finish-streak-3", "finish-streak-5", "finish-line-15", "finish-line-20", "perfect-bic", "daily-bites-5", "free", "finish-meal-count-5", "monday", "mplh-3", "finish-line-7", "inventory", "finish-line-5", "monitoring-1", "meal-counts-5", "production-record-5", "mplh-5", "previous-meal-counts-5", "supper-monitoring-1"]}, {"location_id": 11, "goal_ids": ["daily-bites-7", "mplh-3", "finish-line-7", "finish-line-20", "meal-counts-10", "meal-counts-7", "production-record-3", "perfect-bic", "finish-line-5", "reports-reviewed-5", "thursday", "finish-meal-count-5", "free", "finish-streak-5", "perfect-supper", "daily-bites-10", "production-record-10", "daily-bites-5", "finish-line-10", "wednesday", "meal-counts-5", "monday", "all-monitorings", "production-record-5", "production-worksheet-5"]}, {"location_id": 12, "goal_ids": ["monitoring-1", "thursday", "finish-line-10", "production-worksheet-5", "tuesday", "daily-bites-7", "finish-streak-5", "daily-bites-10", "perfect-bic", "production-record-3", "daily-bites-5", "perfect-week", "free", "supper-monitorings-3", "production-record-5", "mplh-3", "meal-counts-15", "meal-counts-5", "finish-line-15", "daily-bites-3", "production-record-10", "finish-line-7", "perfect-lunch", "meal-counts-3", "all-monitorings"]}, {"location_id": 13, "goal_ids": ["perfect-week", "supper-monitoring-1", "meal-counts-5", "mplh-2", "production-record-10", "meal-counts-7", "finish-streak-3", "perfect-bic", "wednesday", "reports-reviewed-5", "all-monitorings", "finish-line-5", "free", "perfect-lunch", "meal-counts-3", "supper-monitorings-3", "daily-bites-5", "finish-streak-5", "mplh-3", "production-record-5", "finish-line-3", "finish-meal-count-5", "game-word-5", "monitoring-1", "production-record-3"]}, {"location_id": 14, "goal_ids": ["finish-streak-5", "finish-streak-3", "tuesday", "perfect-supper", "wednesday", "finish-line-10", "mplh-5", "thursday", "production-record-10", "meal-counts-15", "meal-counts-3", "finish-line-15", "free", "mplh-3", "production-worksheet-3", "monitoring-1", "inventory", "production-worksheet-5", "mplh-2", "perfect-lunch", "daily-bites-3", "finish-meal-count-3", "perfect-bic", "reports-reviewed-5", "finish-line-7"]}, {"location_id": 15, "goal_ids": ["finish-line-20", "production-worksheet-5", "thursday", "monitoring-1", "finish-line-15", "tuesday", "finish-line-10", "monday", "inventory", "training-1", "finish-meal-count-5", "daily-bites-10", "free", "supper-monitoring-1", "supper-monitorings-3", "finish-line-7", "mplh-2", "perfect-bic", "perfect-supper", "finish-streak-3", "mplh-3", "finish-line-3", "all-monitorings", "perfect-lunch", "meal-counts-7"]}, {"location_id": 16, "goal_ids": ["finish-line-3", "finish-line-10", "meal-counts-7", "daily-bites-5", "production-record-5", "meal-counts-3", "meal-counts-15", "perfect-lunch", "reports-reviewed-5", "finish-line-15", "finish-streak-5", "thursday", "free", "supper-monitorings-3", "production-worksheet-5", "perfect-bic", "mplh-2", "wednesday", "monday", "tuesday", "mplh-3", "production-record-10", "all-monitorings", "finish-line-5", "supper-monitoring-1"]}, {"location_id": 17, "goal_ids": ["production-worksheet-5", "perfect-bic", "finish-line-5", "monday", "finish-streak-5", "daily-bites-3", "perfect-lunch", "supper-monitorings-3", "reports-reviewed-5", "finish-streak-3", "perfect-supper", "mplh-5", "free", "supper-monitoring-1", "production-record-3", "meal-counts-5", "monitoring-1", "production-record-10", "daily-bites-10", "tuesday", "mplh-3", "wednesday", "finish-line-10", "daily-bites-7", "thursday"]}, {"location_id": 18, "goal_ids": ["mplh-2", "finish-line-10", "thursday", "perfect-lunch", "meal-counts-15", "daily-bites-3", "finish-streak-3", "finish-line-7", "monitoring-1", "mplh-3", "meal-counts-10", "perfect-week", "free", "inventory", "meal-counts-7", "finish-line-5", "finish-line-15", "daily-bites-5", "wednesday", "meal-counts-3", "production-record-5", "supper-monitoring-1", "reports-reviewed-5", "production-worksheet-5", "perfect-bic"]}, {"location_id": 19, "goal_ids": ["monday", "finish-streak-3", "finish-meal-count-5", "finish-line-3", "mplh-3", "finish-line-10", "monitoring-1", "daily-bites-3", "finish-streak-5", "all-monitorings", "perfect-lunch", "inventory", "free", "meal-counts-3", "receivers-5", "perfect-supper", "perfect-bic", "production-record-3", "finish-line-20", "finish-line-5", "production-worksheet-5", "mplh-5", "finish-line-7", "perfect-week", "daily-bites-7"]}, {"location_id": 20, "goal_ids": ["perfect-week", "daily-bites-7", "daily-bites-5", "finish-streak-3", "meal-counts-15", "production-record-10", "meal-counts-10", "receivers-5", "monitoring-1", "previous-meal-counts-10", "supper-monitorings-3", "mplh-3", "free", "finish-line-10", "production-record-3", "finish-line-20", "production-worksheet-5", "production-record-5", "monday", "perfect-bic", "inventory", "all-monitorings", "wednesday", "daily-bites-3", "tuesday"]}, {"location_id": 21, "goal_ids": ["finish-streak-3", "perfect-week", "meal-counts-10", "meal-counts-7", "training-3", "monday", "perfect-bic", "finish-streak-5", "production-record-10", "reports-reviewed-5", "perfect-supper", "monitoring-1", "free", "supper-monitoring-1", "supper-monitorings-3", "mplh-2", "production-worksheet-5", "meal-counts-5", "receivers-3", "inventory", "daily-bites-5", "daily-bites-7", "production-record-5", "production-record-3", "finish-line-20"]}, {"location_id": 22, "goal_ids": ["supper-monitorings-3", "finish-streak-5", "meal-counts-5", "finish-line-10", "meal-counts-10", "all-monitorings", "finish-line-7", "supper-monitoring-1", "mplh-5", "mplh-2", "perfect-bic", "finish-line-20", "free", "perfect-lunch", "finish-streak-3", "daily-bites-10", "reports-reviewed-5", "meal-counts-3", "monday", "wednesday", "daily-bites-7", "daily-bites-5", "perfect-week", "monitoring-1", "meal-counts-7"]}, {"location_id": 23, "goal_ids": ["inventory", "production-record-5", "all-monitorings", "production-worksheet-5", "production-record-3", "thursday", "finish-streak-3", "finish-streak-5", "perfect-supper", "monitoring-1", "daily-bites-7", "perfect-bic", "free", "meal-counts-5", "finish-line-15", "perfect-week", "daily-bites-10", "mplh-2", "reports-reviewed-5", "monday", "finish-meal-count-5", "wednesday", "finish-line-5", "supper-monitoring-1", "supper-monitorings-3"]}, {"location_id": 24, "goal_ids": ["meal-counts-15", "supper-monitoring-1", "finish-line-7", "daily-bites-7", "mplh-2", "meal-counts-10", "finish-meal-count-5", "inventory", "tuesday", "perfect-week", "production-record-3", "daily-bites-10", "free", "daily-bites-5", "monday", "thursday", "wednesday", "production-record-10", "perfect-bic", "production-worksheet-5", "monitoring-1", "mplh-3", "perfect-lunch", "finish-line-3", "finish-line-5"]}, {"location_id": 25, "goal_ids": ["supper-monitoring-1", "perfect-week", "thursday", "all-monitorings", "production-record-5", "finish-line-3", "production-record-10", "meal-counts-10", "finish-line-15", "meal-counts-7", "mplh-5", "receivers-3", "free", "finish-line-7", "perfect-bic", "daily-bites-10", "daily-bites-3", "production-worksheet-5", "perfect-lunch", "monday", "meal-counts-3", "meal-counts-15", "inventory", "supper-monitorings-3", "finish-line-10"]}, {"location_id": 26, "goal_ids": ["finish-streak-5", "production-worksheet-5", "finish-line-5", "tuesday", "daily-bites-10", "mplh-2", "daily-bites-3", "finish-line-3", "wednesday", "perfect-bic", "perfect-supper", "finish-line-15", "free", "thursday", "production-record-5", "production-worksheet-10", "inventory", "production-record-10", "previous-meal-counts-5", "perfect-week", "meal-counts-5", "daily-bites-7", "reports-reviewed-5", "finish-meal-count-5", "meal-counts-7"]}, {"location_id": 27, "goal_ids": ["monitoring-1", "perfect-lunch", "perfect-bic", "receivers-5", "tuesday", "mplh-3", "daily-bites-5", "meal-counts-3", "daily-bites-3", "meal-counts-5", "mplh-2", "all-monitorings", "free", "production-record-10", "finish-line-20", "daily-bites-7", "meal-counts-10", "monday", "production-record-3", "meal-counts-7", "supper-monitorings-3", "meal-counts-15", "finish-line-7", "finish-line-3", "finish-meal-count-5"]}, {"location_id": 28, "goal_ids": ["all-monitorings", "finish-line-7", "monday", "supper-monitoring-1", "finish-line-15", "perfect-bic", "daily-bites-5", "supper-monitorings-3", "training-5", "perfect-supper", "finish-line-10", "daily-bites-7", "free", "mplh-5", "meal-counts-3", "finish-streak-3", "production-worksheet-3", "finish-line-20", "tuesday", "daily-bites-10", "mplh-3", "wednesday", "finish-line-5", "meal-counts-7", "mplh-2"]}, {"location_id": 29, "goal_ids": ["perfect-supper", "finish-line-7", "finish-line-10", "production-record-3", "daily-bites-7", "meal-counts-3", "finish-streak-3", "production-worksheet-5", "monitoring-1", "inventory", "finish-line-3", "daily-bites-10", "free", "meal-counts-5", "perfect-bic", "meal-counts-7", "meal-counts-10", "perfect-lunch", "meal-counts-15", "monday", "mplh-2", "previous-meal-counts-3", "daily-bites-5", "finish-streak-5", "mplh-5"]}, {"location_id": 30, "goal_ids": ["perfect-lunch", "production-record-10", "meal-counts-15", "meal-counts-10", "game-spark_sort-1", "meal-counts-7", "daily-bites-10", "mplh-3", "finish-meal-count-5", "finish-line-5", "tuesday", "finish-line-15", "free", "wednesday", "inventory", "perfect-bic", "finish-line-10", "finish-line-7", "meal-counts-3", "thursday", "finish-line-20", "production-record-3", "daily-bites-7", "finish-streak-3", "mplh-2"]}, {"location_id": 31, "goal_ids": ["finish-line-5", "production-record-10", "finish-streak-3", "finish-streak-5", "perfect-lunch", "perfect-supper", "wednesday", "meal-counts-15", "perfect-bic", "finish-line-10", "production-worksheet-5", "tuesday", "free", "mplh-2", "daily-bites-10", "reports-reviewed-5", "monitoring-1", "perfect-week", "meal-counts-3", "mplh-3", "thursday", "mplh-5", "meal-counts-10", "finish-meal-count-5", "production-record-5"]}, {"location_id": 32, "goal_ids": ["finish-streak-5", "supper-monitoring-1", "production-record-3", "meal-counts-7", "mplh-5", "daily-bites-7", "mplh-3", "thursday", "finish-streak-3", "meal-counts-15", "perfect-bic", "wednesday", "free", "daily-bites-10", "finish-line-3", "finish-line-15", "meal-counts-10", "meal-counts-5", "finish-line-10", "perfect-lunch", "meal-counts-3", "all-monitorings", "production-worksheet-5", "production-record-10", "perfect-week"]}]$seeds$::jsonb) where exists(select 1 from public.locations where id=(value->>'location_id')::bigint);

create function public.spark_bingo_now() returns timestamptz language sql stable as $$ select now(); $$;
create function public.spark_bingo_today() returns date language sql stable as $$ select (public.spark_bingo_now() at time zone 'America/Los_Angeles')::date; $$;

create function public.spark_bingo_goal_met(p_card public.spark_bingo_cards,p_goal text)
returns boolean language plpgsql stable security definer set search_path=public,pg_temp as $$
declare g jsonb; n integer; v_count integer:=0; v_today date:=public.spark_bingo_today(); v_kind text;
 v_dates date[]; v_excluded date[]; d date; run integer:=0; longest integer:=0;
 v_target numeric; v_type text; v_number integer; v_year text; v_location public.locations;
begin
 select definition into g from public.spark_bingo_goals where id=p_goal;
 if g is null then return false; end if;
 v_kind:=g->>'evidence'; n:=(g->>'threshold')::integer;
 if v_kind='free' then return true; end if;
 if v_kind in ('finish','streak','perfect_week') then
  select coalesce(array_agg(distinct service_date),'{}'::date[]) into v_dates from public.finish_line_checks
   where location_id=p_card.location_id and status='complete' and service_date between p_card.started_on and v_today and submitted_at>=p_card.started_at;
  if v_kind='finish' then return cardinality(v_dates)>=n; end if;
  select coalesce(array_agg(service_date),'{}'::date[]) into v_excluded from public.spark_excluded_days where location_id=p_card.location_id;
  if v_kind='perfect_week' then
   if exists(select 1 from public.spark_points where location_id=p_card.location_id and point_type in ('perfect_week','weekly_streak_bonus') and service_date between p_card.started_on and v_today and created_at>=p_card.started_at) then return true; end if;
   return exists(select 1 from generate_series(p_card.started_on::timestamp,v_today::timestamp,interval '1 day') m
    where extract(isodow from m)=1 and m::date+4<=v_today
    and exists(select 1 from generate_series(m,m+interval '4 days',interval '1 day') x where not x::date=any(v_excluded))
    and not exists(select 1 from generate_series(m,m+interval '4 days',interval '1 day') x where not x::date=any(v_dates) and not x::date=any(v_excluded)));
  end if;
  for d in select day::date from generate_series(p_card.started_on::timestamp,v_today::timestamp,interval '1 day') day loop
   if extract(isodow from d)>5 or d=any(v_excluded) then continue; end if;
   if d=any(v_dates) then run:=run+1;longest:=greatest(longest,run);else run:=0;end if;
  end loop;
  return longest>=n;
 elsif v_kind in ('item','monday') then
  select count(distinct c.service_date) into v_count from public.finish_line_checks c
   where c.location_id=p_card.location_id and c.service_date between p_card.started_on and v_today and c.submitted_at>=p_card.started_at
    and exists(select 1 from public.finish_line_items i where i.finish_line_check_id=c.id and i.answer='yes'
      and i.item_key=case when v_kind='monday' then 'monday_missing_meal_report' else g->>'item_key' end)
    and (v_kind<>'monday' or exists(select 1 from public.finish_line_items i where i.finish_line_check_id=c.id and i.answer='yes' and i.item_key='monday_all_meal_counts_entered'));
 elsif v_kind='meals' then
  select count(distinct service_date) into v_count from public.meal_counts where location_id=p_card.location_id and service_date between p_card.started_on and v_today and created_at>=p_card.started_at;
 elsif v_kind='visits' then
  select count(distinct service_date) into v_count from public.spark_points where location_id=p_card.location_id and point_type='daily_bites_visit' and service_date between p_card.started_on and v_today and created_at>=p_card.started_at;
 elsif v_kind='game' then
  select count(distinct service_date) into v_count from public.daily_bites_game_progress where location_id=p_card.location_id and game_type=g->>'item_key' and status='won' and service_date between p_card.started_on and v_today and completed_at>=p_card.started_at;
 elsif v_kind='training' then
  select count(distinct service_date) into v_count from public.ar_training_attempts where location_id=p_card.location_id and is_correct and points_awarded>0 and service_date between p_card.started_on and v_today and answered_at>=p_card.started_at;
 elsif v_kind='mplh' then
  select * into v_location from public.locations where id=p_card.location_id;
  v_target:=case when v_location.location_code::text in ('3452','1957') or v_location.school_name ilike '%willenberg%' then 20
   when v_location.labor_type='secondary' then 18 when v_location.labor_type='elementary_prep' then 20 when v_location.labor_type in ('elementary_nnc','special','special_ed') then 24 else null end;
  select count(distinct m.service_date) into v_count from public.meal_counts m left join public.labor_hours h on h.location_id=m.location_id and h.service_date=m.service_date
   where m.location_id=p_card.location_id and m.service_date between p_card.started_on and v_today and m.created_at>=p_card.started_at
    and coalesce(v_location.budget_labor_hours,0)+coalesce(h.additional_worker_hours,0)+coalesce(h.manager_overtime_hours,0)>0
    and (coalesce(m.breakfast_count,0)*0.66+coalesce(m.lunch_count,0)+case when m.supper_status='pending' then 0 else coalesce(m.supper_count,0) end)
      /nullif(coalesce(v_location.budget_labor_hours,0)+coalesce(h.additional_worker_hours,0)+coalesce(h.manager_overtime_hours,0),0)>=v_target;
 elsif v_kind in ('monitoring','perfect_monitoring') then
  v_type:=case when v_kind='monitoring' then 'supper' else g->>'item_key' end;
  v_number:=case when extract(month from p_card.started_on) between 1 and 6 then 3 else 1 end;
  v_year:=(extract(year from p_card.started_on)::integer-case when extract(month from p_card.started_on)<7 then 1 else 0 end)::text;
  v_year:=v_year||'-'||right(((left(v_year,4)::integer)+1)::text,2);
  if exists(select 1 from public.monitoring_records m where m.location_id=p_card.location_id and m.monitoring_type=v_type and m.school_year=v_year
   and m.monitoring_date<=v_today and m.updated_at>=p_card.started_at and m.status='accepted' and m.locked and m.monitor_role='manager'
   and (v_kind<>'monitoring' or m.monitoring_number=v_number)
   and (v_kind<>'perfect_monitoring' or coalesce(m.perfect_monitoring_override,m.had_correction_requested is false))) then return true; end if;
  -- Legacy manual awards remain evidence only when no current record replaces their slot.
  return exists(select 1 from public.spark_points p where p.location_id=p_card.location_id and p.point_type='monitoring_'||v_type
   and p.service_date between p_card.started_on and v_today and p.created_at>=p_card.started_at
   and (v_kind<>'monitoring' or p.unique_key ~ ('-'||v_number||'$'))
   and (v_kind<>'perfect_monitoring' or p.description ~* '^perfect\y')
   and not exists(select 1 from public.monitoring_records m where m.location_id=p.location_id and m.monitoring_type=v_type and m.school_year=v_year
    and (substring(p.unique_key from '-([0-9]+)$') is null or m.monitoring_number=(substring(p.unique_key from '-([0-9]+)$'))::integer)));
 end if;
 return v_count>=n;
end;
$$;

create function public.spark_bingo_eligible(p_location bigint,p_started date)
returns setof public.spark_bingo_goals language sql stable security definer set search_path=public,pg_temp as $$
 select g.* from public.spark_bingo_goals g join public.locations l on l.id=p_location
 where (g.definition->>'draw_enabled')::boolean
  and (not coalesce((g.definition->>'requiresSupper')::boolean,false) or l.labor_type not in ('special','special_ed'))
  and (not coalesce((g.definition->>'requiresMplh')::boolean,false) or (l.labor_type<>'special_ed' and coalesce(l.budget_labor_hours,0)>0))
  and (g.definition->>'evidence'<>'monitoring' or not exists(select 1 from public.monitoring_records m
    where m.location_id=p_location and m.monitoring_type='supper' and m.monitoring_number=case when extract(month from p_started) between 1 and 6 then 3 else 1 end
    and m.school_year=(extract(year from p_started)::integer-case when extract(month from p_started)<7 then 1 else 0 end)::text||'-'||right((extract(year from p_started)::integer+case when extract(month from p_started)<7 then 0 else 1 end)::text,2)
    and m.status='accepted' and m.locked));
$$;

create function public.spark_bingo_draw(p_location bigint,p_cycle integer,p_started date,p_previous text[] default '{}')
returns text[] language plpgsql stable security definer set search_path=public,pg_temp as $$
declare result text[];
begin
 select array_agg(id order by ord) into result from (
  select id,row_number() over(order by (id=any(p_previous)),md5(p_location||'-'||p_cycle||'-'||id)) ord
  from public.spark_bingo_eligible(p_location,p_started)
 ) g where ord<=24;
 if cardinality(result)<>24 then raise exception 'There are not enough available tasks for a new card.'; end if;
 return result[1:12]||array['free']||result[13:24];
end;
$$;

create function public.spark_bingo_reward_key(c public.spark_bingo_cards,p_suffix text)
returns text language sql immutable as $$
 select case when c.cycle=1 then 'card1-fall-2026-'||p_suffix||'-'||c.location_id else 'bingo-'||c.id||'-'||p_suffix end;
$$;

create function public.spark_bingo_refresh_school(p_location bigint)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.spark_bingo_cards; goal text; met text[]; v_lines integer[]; milestone integer; v_key text; added integer:=0; amount integer;
 earned integer[]:='{}'; v_month date:=date_trunc('month',public.spark_bingo_today())::date; v_goals jsonb; v_choices jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended('spark-bingo-'||p_location,0));
 select * into c from public.spark_bingo_cards where location_id=p_location order by cycle desc limit 1 for update;
 if c.id is null then
  insert into public.spark_bingo_cards(location_id,cycle,goal_ids,started_at,started_on)
   values(p_location,1,public.spark_bingo_draw(p_location,1,public.spark_bingo_today()),public.spark_bingo_now(),public.spark_bingo_today()) returning * into c;
 end if;
 met:=c.completed_ids;
 if exists(select 1 from public.spark_points where location_id=p_location and unique_key=public.spark_bingo_reward_key(c,'blackout')) then met:=c.goal_ids; end if;
 foreach goal in array c.goal_ids loop
  if not goal=any(met) and public.spark_bingo_goal_met(c,goal) then met:=array_append(met,goal); end if;
 end loop;
 select coalesce(array_agg(i order by i),'{}') into v_lines from (values
  (0,array[1,2,3,4,5]),(1,array[6,7,8,9,10]),(2,array[11,12,13,14,15]),(3,array[16,17,18,19,20]),(4,array[21,22,23,24,25]),
  (5,array[1,6,11,16,21]),(6,array[2,7,12,17,22]),(7,array[3,8,13,18,23]),(8,array[4,9,14,19,24]),(9,array[5,10,15,20,25]),
  (10,array[1,7,13,19,25]),(11,array[5,9,13,17,21])) lines(i,slots)
  where not exists(select 1 from unnest(slots) slot where not c.goal_ids[slot]=any(met));
 for milestone in 1..5 loop
  -- Preserve the legacy key order exactly: card1-fall-2026-line-<school>-<milestone>.
  v_key:=case when c.cycle=1 then 'card1-fall-2026-line-'||p_location||'-'||milestone else public.spark_bingo_reward_key(c,'line-'||milestone) end;
  if milestone<=cardinality(v_lines) then
   amount:=null;
   insert into public.spark_points(location_id,points,point_type,description,service_date,source,unique_key)
    values(p_location,milestone*10,'bingo_line_reward','SPARK Bingo Card '||c.cycle||' — '||milestone||' lines',public.spark_bingo_today(),'automatic',v_key)
    on conflict(unique_key) do nothing returning points into amount;
   added:=added+coalesce(amount,0);
  end if;
  if exists(select 1 from public.spark_points where location_id=p_location and unique_key=v_key) then earned:=array_append(earned,milestone); end if;
 end loop;
 if c.goal_ids <@ met then
  amount:=null;
  insert into public.spark_points(location_id,points,point_type,description,service_date,source,unique_key)
   values(p_location,100,'bingo_blackout_reward','SPARK Bingo Card '||c.cycle||' — BLACKOUT',public.spark_bingo_today(),'automatic',public.spark_bingo_reward_key(c,'blackout'))
   on conflict(unique_key) do nothing returning points into amount;
  added:=added+coalesce(amount,0);
  c.blackout_at:=coalesce(c.blackout_at,public.spark_bingo_now());
 end if;
 update public.spark_bingo_cards set completed_ids=met,blackout_at=c.blackout_at where id=c.id returning * into c;
 select jsonb_agg(g.definition||jsonb_build_object('completed',g.id=any(met)) order by u.ord) into v_goals
  from unnest(c.goal_ids) with ordinality u(id,ord) join public.spark_bingo_goals g on g.id=u.id;
 select coalesce(jsonb_agg(g.definition order by md5(c.id||'-'||g.id)),'[]'::jsonb) into v_choices
  from public.spark_bingo_eligible(p_location,c.started_on) g
  where not g.id=any(c.goal_ids) and not public.spark_bingo_goal_met(c,g.id);
 return jsonb_build_object('card',to_jsonb(c),'goals',v_goals,'completed_lines',v_lines,'earned_milestones',earned,'new_points',added,
  'renew_on',(c.started_on+interval '1 month')::date,'can_renew',c.blackout_at is not null and public.spark_bingo_today()>=(c.started_on+interval '1 month')::date,
  'repick_available',c.blackout_at is null and not exists(select 1 from public.spark_bingo_repicks where location_id=p_location and month=v_month),
  'repick_month',v_month,'replacement_goals',v_choices,'required_supper_number',case when extract(month from c.started_on) between 1 and 6 then 3 else 1 end);
end;
$$;

create function public.spark_bingo_context(p_token text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.supper_monitoring_sessions;
begin s:=public.require_supper_monitoring_session(p_token);return public.spark_bingo_refresh_school(s.location_id);end;
$$;

create function public.spark_bingo_repick(p_token text,p_card uuid,p_revision integer,p_square integer,p_goal text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.supper_monitoring_sessions;c public.spark_bingo_cards; v_context jsonb; v_month date:=date_trunc('month',public.spark_bingo_today())::date;
begin
 s:=public.require_supper_monitoring_session(p_token);
 if s.actor_role<>'manager' then raise exception 'Use the Manager session for a monthly repick.';end if;
 v_context:=public.spark_bingo_refresh_school(s.location_id);
 select * into c from public.spark_bingo_cards where location_id=s.location_id order by cycle desc limit 1 for update;
 if c.id is distinct from p_card or c.revision is distinct from p_revision then raise exception 'This card changed. Refresh before replacing a square.';end if;
 if c.blackout_at is not null or p_square is null or p_square not between 0 and 24 or p_square=12 or c.goal_ids[p_square+1]=any(c.completed_ids) then raise exception 'Choose an incomplete task square.';end if;
 if exists(select 1 from public.spark_bingo_repicks where location_id=s.location_id and month=v_month) then raise exception 'Your school has already used its repick this month.';end if;
 if not exists(select 1 from jsonb_array_elements(v_context->'replacement_goals') g where g->>'id'=p_goal) then raise exception 'Choose an available replacement task.';end if;
 insert into public.spark_bingo_repicks(location_id,month,card_id,square_index,old_goal,new_goal)
  values(s.location_id,v_month,c.id,p_square,c.goal_ids[p_square+1],p_goal);
 c.goal_ids[p_square+1]:=p_goal;
 update public.spark_bingo_cards set goal_ids=c.goal_ids,revision=revision+1 where id=c.id;
 return public.spark_bingo_refresh_school(s.location_id);
end;
$$;

create function public.spark_bingo_renew(p_token text,p_card uuid,p_revision integer)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.supper_monitoring_sessions;c public.spark_bingo_cards;
begin
 s:=public.require_supper_monitoring_session(p_token);
 if s.actor_role<>'manager' then raise exception 'Use the Manager session to start a new card.';end if;
 perform public.spark_bingo_refresh_school(s.location_id);
 select * into c from public.spark_bingo_cards where location_id=s.location_id order by cycle desc limit 1 for update;
 if c.id is distinct from p_card or c.revision is distinct from p_revision then raise exception 'This card changed. Refresh before starting a new card.';end if;
 if c.blackout_at is null then raise exception 'Complete blackout before starting a new card.';end if;
 if public.spark_bingo_today()<(c.started_on+interval '1 month')::date then raise exception 'A new card unlocks one month after this card started.';end if;
 insert into public.spark_bingo_cards(location_id,cycle,goal_ids,started_at,started_on)
  values(s.location_id,c.cycle+1,public.spark_bingo_draw(s.location_id,c.cycle+1,public.spark_bingo_today(),c.goal_ids),public.spark_bingo_now(),public.spark_bingo_today());
 return public.spark_bingo_refresh_school(s.location_id);
end;
$$;

create function public.spark_bingo_reconcile_all() returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare r record;n integer:=0;
begin
 for r in select distinct c.location_id from public.spark_bingo_cards c join public.locations l on l.id=c.location_id where l.active is not false loop
  perform public.spark_bingo_refresh_school(r.location_id);n:=n+1;
 end loop;
 return n;
end;
$$;

revoke all on function public.spark_bingo_now(),public.spark_bingo_today(),public.spark_bingo_goal_met(public.spark_bingo_cards,text),public.spark_bingo_eligible(bigint,date),public.spark_bingo_draw(bigint,integer,date,text[]),public.spark_bingo_reward_key(public.spark_bingo_cards,text),public.spark_bingo_refresh_school(bigint),public.spark_bingo_reconcile_all() from public,anon,authenticated;
revoke all on function public.spark_bingo_context(text),public.spark_bingo_repick(text,uuid,integer,integer,text),public.spark_bingo_renew(text,uuid,integer) from public;
grant execute on function public.spark_bingo_context(text),public.spark_bingo_repick(text,uuid,integer,integer,text),public.spark_bingo_renew(text,uuid,integer) to anon,authenticated,service_role;

-- CRON-BEGIN: background reconciliation does not renew or repick cards.
create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('spark-bingo-reconcile','15 * * * *','select public.spark_bingo_reconcile_all();');
-- CRON-END
commit;
