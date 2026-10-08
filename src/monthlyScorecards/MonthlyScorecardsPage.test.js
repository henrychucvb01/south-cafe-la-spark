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
