import React,{act} from 'react';import {createRoot} from 'react-dom/client';
import MonthlyScorecardsPage from './MonthlyScorecardsPage';
import {loadMonthlyImports,loadScorecardRange} from './monthlyScorecardService';
jest.mock('./monthlyScorecardService',()=>({loadMonthlyImports:jest.fn(),loadScorecardRange:jest.fn(),saveMonthlyImport:jest.fn(),checksumText:jest.fn()}));
jest.mock('./scorecardPdfGenerator',()=>({isExcludedSchool:()=>false,exportSingleSchoolPdf:jest.fn(),exportAllSchoolsPdf:jest.fn()}));
test('initial scorecard refresh derives its reporting month from the view range',async()=>{
 global.IS_REACT_ACT_ENVIRONMENT=true;loadMonthlyImports.mockResolvedValue([]);loadScorecardRange.mockResolvedValue({schools:[]});const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 await act(async()=>root.render(<MonthlyScorecardsPage supervisorPin="test"/>));
 expect(loadMonthlyImports).toHaveBeenCalled();expect(loadScorecardRange).toHaveBeenCalledWith('test',expect.stringMatching(/^20\d\d-\d\d-01$/),expect.stringMatching(/^20\d\d-\d\d-\d\d$/));expect(host.textContent).not.toContain('reportingMonth is not defined');
 await act(async()=>root.unmount());host.remove();
});

test('successful import offers the SPARK-only download with the existing upload controls',async()=>{
 const {saveMonthlyImport,checksumText}=require('./monthlyScorecardService');
 global.IS_REACT_ACT_ENVIRONMENT=true;loadMonthlyImports.mockResolvedValue([]);loadScorecardRange.mockResolvedValue({schools:[]});checksumText.mockResolvedValue('checksum');
 saveMonthlyImport.mockResolvedValue({saved:1,months:['2026-09'],excluded:10,rows:[{source_site_id:'10001',production_date:'2026-09-01',meal_type:'lunch',food_cost:10}]});
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 await act(async()=>root.render(<MonthlyScorecardsPage supervisorPin="test"/>));
 const input=host.querySelectorAll('input[type="file"]')[1];
 const file={name:'district.csv',text:async()=> 'Daily Production Cost\nCost of Goods\nProduced by (10001) SCHOOL,,,,Lunch,,,Service Date: 9/1/2026\nCost of Food Used,10'};
 Object.defineProperty(input,'files',{value:[file]});
 await act(async()=>input.dispatchEvent(new Event('change',{bubbles:true})));
 expect(host.textContent).toContain('10 unrelated records skipped');
 expect([...host.querySelectorAll('button')].some(button=>button.textContent==='Download SPARK-only CSV')).toBe(true);
 expect(saveMonthlyImport).toHaveBeenCalledWith(expect.objectContaining({filename:'district.csv',checksum:'checksum'}));
 await act(async()=>root.unmount());host.remove();
});
