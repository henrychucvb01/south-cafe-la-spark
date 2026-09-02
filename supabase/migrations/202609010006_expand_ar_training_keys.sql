insert into public.ar_training_question_keys (question_id, correct_index, approved_source_chunk_id) values
  ('ar-manual-count-followup', 1, 'ASKP1-C000168'),
  ('ar-production-supports-claim', 0, 'ASKP1-C000168'),
  ('ar-dropped-meal-recording', 0, 'ASKP1-C000168'),
  ('ar-edit-check-transfer', 0, 'ASKP1-C000171'),
  ('ar-central-event-retention', 0, 'ASKP1-C000172'),
  ('ar-field-trip-request-scenario', 3, 'ASKP1-C000299'),
  ('ar-field-trip-pos-purpose', 0, 'ASKP1-C000300'),
  ('ar-field-trip-four-hours-scenario', 1, 'ASKP1-C000300'),
  ('ar-field-trip-special-diet-record', 0, 'ASKP1-C000301')
on conflict (question_id) do update set
  correct_index = excluded.correct_index,
  approved_source_chunk_id = excluded.approved_source_chunk_id,
  active = true;
