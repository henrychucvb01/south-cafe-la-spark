import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import Panel from './SupervisorFeedbackPanel';
import {loadSupervisorFeedback,markFeedbackRead} from './feedbackService';
jest.mock('./feedbackService',()=>({loadSupervisorFeedback:jest.fn(),markFeedbackRead:jest.fn(),changeFeedbackStatus:jest.fn(),FEEDBACK_STATUSES:['New','Reviewing','Resolved']}));
test('read save keeps filters disabled until refresh finishes, then allows unread again',async()=>{
 global.IS_REACT_ACT_ENVIRONMENT=true;const host=document.createElement('div'),root=createRoot(host);document.body.append(host);
 const row={id:'one',category:'Bug',status:'New',message:'Example',submitted_at:'2026-10-09',read_at:null};
 let finish;loadSupervisorFeedback.mockResolvedValueOnce([row]).mockImplementationOnce(()=>new Promise(r=>finish=r));markFeedbackRead.mockResolvedValue();
 try{
  await act(async()=>root.render(<Panel supervisorPin="session"/>));
  await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='Mark as read').click());
  expect(host.querySelector('.supervisor-feedback-filters button').disabled).toBe(true);
  await act(async()=>finish([]));expect(host.querySelector('.supervisor-feedback-filters button').disabled).toBe(false);
  expect(markFeedbackRead).toHaveBeenCalledWith('session','one',true);
 }finally{act(()=>root.unmount());host.remove();}
});
