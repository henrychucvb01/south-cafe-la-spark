import {getFinishLinePointAward, isStreakEligibleCheck} from './sparkPolicy';
test('full rollout credit through September 2, normal timing from September 3',()=>{
  expect(getFinishLinePointAward('2026-08-20','2026-09-20T20:00:00Z').points).toBe(5);
  expect(getFinishLinePointAward('2026-09-02','2026-09-20T20:00:00Z').points).toBe(5);
  expect(getFinishLinePointAward('2026-09-03','2026-09-04T20:00:00Z').points).toBe(2);
  expect(getFinishLinePointAward('2026-09-03','2026-09-04T05:00:00Z').points).toBe(5);
  expect(isStreakEligibleCheck({status:'complete',service_date:'2026-09-03',submitted_at:'2026-09-04T05:00:00Z'})).toBe(true);
});
