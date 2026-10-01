import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import ArTrainingQuiz from './ArTrainingQuiz';
let host,root;
beforeEach(()=>{globalThis.IS_REACT_ACT_ENVIRONMENT=true;host=document.createElement('div');document.body.appendChild(host);root=createRoot(host);});
afterEach(()=>{act(()=>root.unmount());host.remove();});
const question={id:'q1',prompt:'Test question',choices:['A','B'],source:{},explanation:'Test'};
test('October cap shows five points and weekend earning is enabled',()=>{
 act(()=>root.render(<ArTrainingQuiz serviceDate="2026-10-03" dailyPoints={4} weekday={false} questions={[question]}/>));
 expect(host.textContent).toContain('4 / 5');
 expect(host.textContent).toContain('up to 5 per day');
 expect(host.textContent).not.toContain('resume Monday');
 expect(host.querySelector('.ar-progress-track span').style.width).toBe('80%');
 act(()=>root.render(<ArTrainingQuiz serviceDate="2026-10-03" dailyPoints={5} weekday={false} questions={[question]}/>));
 expect(host.textContent).toContain('Daily points complete');
 expect(host.querySelector('.ar-progress-track span').style.width).toBe('100%');
});
test('September remains on the existing ten-point rule',()=>{
 act(()=>root.render(<ArTrainingQuiz serviceDate="2026-09-30" dailyPoints={10} weekday questions={[question]}/>));
 expect(host.textContent).toContain('10 / 10');
});
