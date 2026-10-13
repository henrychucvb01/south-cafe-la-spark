import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import SnpMonitoringPage from './SnpMonitoringPage';
import * as service from './service';
import * as auth from '../supperMonitoring/service';
import {newDraft} from './model';
jest.mock('./service',()=>({sites:jest.fn(),list:jest.fn(),get:jest.fn(),save:jest.fn(),report:jest.fn(),completeFollowup:jest.fn()}));
jest.mock('../supperMonitoring/service',()=>({openSession:jest.fn(),openSupervisorSession:jest.fn(),closeSession:jest.fn()}));
jest.mock('../supperMonitoring/SignaturePad',()=>()=> <div>Signature pad</div>);
jest.mock('../supperMonitoring/PdfMarkupViewer',()=>()=> <div>PDF viewer</div>);
let root,container;
const site={key:'dolores-eec',name:'Dolores EEC',staff:'Parent Manager'};
beforeEach(()=>{globalThis.IS_REACT_ACT_ENVIRONMENT=true;jest.useFakeTimers();jest.clearAllMocks();global.crypto={randomUUID:()=> '00000000-0000-4000-8000-000000000001'};container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);auth.openSupervisorSession.mockResolvedValue('supervisor');auth.openSession.mockResolvedValue('manager');auth.closeSession.mockResolvedValue();service.sites.mockResolvedValue([site]);service.list.mockResolvedValue([]);service.save.mockImplementation(async(_t,r,payload,section)=>({...r,revision:r.revision+1,payload,section}));});
afterEach(()=>{act(()=>root.unmount());container.remove();jest.useRealTimers();globalThis.IS_REACT_ACT_ENVIRONMENT=false;});
async function render(supervisor=true,program='snp'){await act(async()=>root.render(<SnpMonitoringPage program={program} location={{id:1,school_name:'Dolores El'}} employee={{id:11,employee_name:'Parent Manager'}} supervisorPin={supervisor?'session':undefined} managerPin="session" onBack={()=>{}}/>));}
async function click(prefix){const b=[...container.querySelectorAll('button')].find(x=>x.textContent.startsWith(prefix));expect(b).toBeDefined();await act(async()=>b.click());}
async function input(label,value){const el=[...container.querySelectorAll('label')].find(l=>l.textContent.startsWith(label)).querySelector('input,textarea');await act(async()=>{Object.getOwnPropertyDescriptor(el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));});}
test('opens with existing sign-in, inherits parent staff, autosaves and resumes the section',async()=>{
 await render();await click('Dolores EEC');expect(container.querySelector('input[type=password]')).toBeNull();expect(container.textContent).toContain('0 of 42');expect([...container.querySelectorAll('input')].some(x=>x.value==='Parent Manager')).toBe(true);
 await click('2. Meal');await input('Today’s menu','Cereal and milk');await act(async()=>jest.advanceTimersByTime(900));expect(service.save).toHaveBeenCalledWith('supervisor',expect.anything(),expect.objectContaining({menu:'Cereal and milk'}),1);
 const saved=service.save.mock.results[0].value;service.get.mockResolvedValue(await saved);service.list.mockResolvedValue([{id:'saved',site_name:'Dolores EEC',status:'draft'}]);await click('← SNP history');await click('Dolores EEC ·');expect(container.querySelector('#snp-section-1')).not.toBeNull();expect(container.querySelector('textarea').value).toBe('Cereal and milk');
});
test('keeps one accordion open; findings share the inline observation',async()=>{
 await render();await click('Dolores EEC');await click('2. Meal');expect(container.querySelectorAll('[id^=snp-section-]')).toHaveLength(1);
 const q=[...container.querySelectorAll('.snp-question')].find(n=>n.textContent.startsWith('4.'));await act(async()=>[...q.querySelectorAll('button')].find(b=>b.textContent==='No').click());await input('Observation for 4','Portion needs correction');await click('5. Findings');expect(container.querySelector('textarea').value).toBe('Portion needs correction');expect(container.querySelector('input[type=checkbox]')).toBeNull();expect(container.textContent).not.toContain('Minor Observation / No Formal Finding');
});
test('failed save preserves data and blocks leaving',async()=>{
 await render();await click('Dolores EEC');await input('Site staff','Edited staff');service.save.mockRejectedValue(Error('Offline'));await click('← SNP history');expect(container.textContent).toContain('Offline');expect([...container.querySelectorAll('input')].some(x=>x.value==='Edited staff')).toBe(true);expect(container.textContent).toContain('Save draft');
});
test('typing during an autosave is saved after the pending request',async()=>{
 await render();await click('Dolores EEC');let release;service.save.mockImplementationOnce((_t,r,payload,section)=>new Promise(resolve=>{release=()=>resolve({...r,payload,section,revision:1});}));
 await act(async()=>jest.advanceTimersByTime(900));await input('Site staff','Latest edit');await act(async()=>release());expect(service.save).toHaveBeenCalledTimes(2);expect(service.save.mock.calls[1][2].staff).toBe('Latest edit');expect(container.textContent).toContain('Saved');
});
test('manager finalized records have no editing or finalization controls',async()=>{
 const payload=newDraft(site,'Parent Manager');service.list.mockResolvedValue([{id:'final',site_name:'Dolores EEC',status:'finalized'}]);service.get.mockResolvedValue({id:'final',status:'finalized',payload,section:0});await render(false);expect(container.textContent).not.toContain('Start a site visit');await click('Dolores EEC ·');expect([...container.querySelectorAll('input')].every(x=>x.disabled)).toBe(true);expect(container.textContent).not.toContain('Save draft');await click('6. Signatures');expect(container.textContent).not.toContain('Signature pad');expect(container.textContent).not.toContain('Finalize monitoring');expect(service.save).not.toHaveBeenCalled();
});

test('snack uses the existing sign-in and separate history with 17 responses',async()=>{
 await render(true,'eec-snack');expect(service.list).toHaveBeenCalledWith('supervisor','eec-snack');expect(service.sites).toHaveBeenCalledWith('supervisor','eec-snack');await click('Dolores EEC');expect(container.textContent).toContain('0 of 17');expect(container.textContent).not.toContain('Meal observed');await click('2. Meal');await input('Attendance today','22');expect([...container.querySelectorAll('input')].some(x=>x.disabled&&x.value==='0')).toBe(true);await act(async()=>jest.advanceTimersByTime(900));expect(service.save).toHaveBeenLastCalledWith('supervisor',expect.anything(),expect.objectContaining({program:'eec-snack',meal:'Snack',attendance:'22',adults:'0'}),1);
});
test('snack training Yes creates a finding and asks how and when',async()=>{
 await render(true,'eec-snack');await click('Dolores EEC');await click('4. Food');const q=[...container.querySelectorAll('.snp-question')].find(n=>n.textContent.startsWith('17.'));await act(async()=>[...q.querySelectorAll('button')].find(b=>b.textContent==='Yes').click());expect(container.textContent).toContain('How and when will training be provided?');await input('Observation for 17','Training required');await click('5. Findings');expect(container.querySelector('textarea').value).toBe('Training required');
});
