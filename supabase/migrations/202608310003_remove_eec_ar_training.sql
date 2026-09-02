-- EEC applies only to a small subset of sites and should not appear in the general AR Training quiz.
-- Keep historical attempts/progress intact; deactivate only the EEC-specific question keys.
update public.ar_training_question_keys
set active = false
where question_id in (
  'ar-eec-production-daily',
  'ar-eec-temp-timing',
  'ar-eec-record-retention',
  'ar-eec-leftovers-scenario',
  'ar-special-diet-first-step',
  'ar-civil-rights-poster'
);
