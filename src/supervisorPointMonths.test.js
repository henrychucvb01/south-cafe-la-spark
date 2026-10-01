import {adjustmentMonths,adjustmentServiceDate} from './supervisorPointMonths';
test('supervisor can select prior/current months, never future months',()=>{
 expect(adjustmentMonths('2026-10-01')).toEqual([{value:'2026-10',label:'October 2026'},{value:'2026-09',label:'September 2026'},{value:'2026-08',label:'August 2026'}]);
 expect(adjustmentServiceDate('2026-09','2026-10-01')).toBe('2026-09-01');
 expect(adjustmentServiceDate('2026-10','2026-10-15')).toBe('2026-10-15');
 expect(adjustmentServiceDate('2026-08','2026-10-01')).toBe('2026-08-12');
 expect(()=>adjustmentServiceDate('2026-11','2026-10-01')).toThrow();
 expect(()=>adjustmentServiceDate('','2026-10-01')).toThrow();
});
test('options cross the calendar year and use Los Angeles for the default date',()=>{
 expect(adjustmentMonths('2027-01-02')[0]).toEqual({value:'2027-01',label:'January 2027'});
 jest.useFakeTimers().setSystemTime(new Date('2026-11-01T06:30:00Z'));
 expect(adjustmentServiceDate('2026-10')).toBe('2026-10-31');
 jest.useRealTimers();
});
