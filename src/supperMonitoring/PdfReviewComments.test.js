import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import PdfReviewWorkspace from './PdfReviewWorkspace';
import {pdfReviews,reportBytes,savePdfReview,clearReviewComments} from './service';
jest.mock('../navigation/PageNavigation',()=>({usePageNavigation:()=>{}}));
jest.mock('./PdfMarkupViewer',()=>()=> <div>PDF viewer</div>);
jest.mock('./service',()=>({pdfReviews:jest.fn(),reportBytes:jest.fn(),savePdfReview:jest.fn(),clearReviewComments:jest.fn(),reviewAction:jest.fn()}));
let root,host;
beforeAll(()=>{HTMLDialogElement.prototype.close=jest.fn();HTMLDialogElement.prototype.showModal=jest.fn();});
const record={id:'record',revision:3,document_version:1,status:'accepted',locked:true,review_comments:'Old correction',monitoring_type:'supper',monitoring_number:1};
const marks=[{type:'comment',text:'Time is incorrect.',page:1},{type:'draw',page:1,points:[[0,0],[1,1]]}];
beforeEach(()=>{globalThis.IS_REACT_ACT_ENVIRONMENT=true;jest.clearAllMocks();host=document.createElement('div');document.body.appendChild(host);root=createRoot(host);pdfReviews.mockResolvedValue([{document_version:1,annotations:marks}]);reportBytes.mockResolvedValue(new Uint8Array([1]));clearReviewComments.mockResolvedValue({...record,revision:4,review_comments:''});});
afterEach(()=>{act(()=>root.unmount());host.remove();});
async function render(value=record,supervisor=true){await act(async()=>{root.render(<PdfReviewWorkspace token="supervisor-session" initialRecord={value} supervisor={supervisor} school={{school_name:'School'}} onBack={()=>{}}/>);});}
const button=name=>[...host.querySelectorAll('button')].find(b=>b.textContent===name);
test('Supervisor can clear locked comments without saving or unlocking the PDF',async()=>{
 await render();expect(host.querySelector('textarea').readOnly).toBe(true);expect(host.querySelector('[aria-label="Supervisor location comments"]').textContent).toContain('Time is incorrect.');
 await act(async()=>button('Clear Supervisor Comments').click());
 expect(clearReviewComments).toHaveBeenCalledWith('supervisor-session',record);expect(savePdfReview).not.toHaveBeenCalled();expect(host.querySelector('textarea').value).toBe('');expect(host.querySelector('[aria-label="Supervisor location comments"]')).toBeNull();expect(host.textContent).toContain('monitoring remains locked');
});
test('Manager has no comment-clearing control',async()=>{await render(record,false);expect(button('Clear Supervisor Comments')).toBeUndefined();});
test('a location-only explanation is included when returning a monitoring',async()=>{
 const submitted={...record,status:'submitted',locked:false,review_comments:''};savePdfReview.mockResolvedValue({...submitted,status:'corrections_requested',revision:4});await render(submitted);
 expect(button('Return for Correction').disabled).toBe(false);await act(async()=>button('Return for Correction').click());
 expect(savePdfReview).toHaveBeenCalledWith('supervisor-session',submitted,marks,'PDF location comments:\n1. Time is incorrect. (Page 1)','return',{});
});
