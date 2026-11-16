import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import SupervisorPhotoLibrary from './SupervisorPhotoLibrary';
import {gamesRequest} from '../octoberGames/service';
import {saveBlob,photoFilename,photoZip} from './downloads';
jest.mock('../octoberGames/service',()=>({gamesRequest:jest.fn()}));
jest.mock('./downloads',()=>({photoFilename:jest.fn(()=> 'photo.webp'),photoZip:jest.fn(()=>new Blob()),saveBlob:jest.fn()}));
let host,root;const photo={id:'entry:one',school:'School One',school_id:1,contest:'Halloween',contest_id:'door:1',category:'decoration',date:'2026-10-20',url:'https://private.test/one'};
const result={photos:[photo],total:1,page:1,page_size:18,schools:[{id:'1',name:'School One'}],contests:[{id:'door:1',name:'Halloween'}]};
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;host=document.createElement('div');document.body.append(host);root=createRoot(host);jest.clearAllMocks();photoFilename.mockReturnValue('photo.webp');photoZip.mockReturnValue(new Blob());gamesRequest.mockImplementation(async action=>action==='photo_library_download'?{photos:[photo]}:result);});
afterEach(()=>{act(()=>root.unmount());host.remove();});
const render=()=>act(async()=>root.render(<SupervisorPhotoLibrary supervisorPin="supervisor"/>));
const click=text=>act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent===text).click());
test('library loads once on open, shows metadata and lazy photos without background polling',async()=>{
 await render();expect(gamesRequest).toHaveBeenCalledTimes(1);expect(gamesRequest).toHaveBeenCalledWith('photo_library',{pin:'supervisor'},expect.objectContaining({page:1}));expect(host.textContent).toContain('School One');expect(host.querySelector('img').getAttribute('loading')).toBe('lazy');expect(host.textContent).toContain('Mystery answers and pending submissions stay private');
 await act(async()=>root.render(<SupervisorPhotoLibrary supervisorPin="supervisor"/>));expect(gamesRequest).toHaveBeenCalledTimes(1);
});
test('school filters reload metadata and clear selection',async()=>{
 await render();await click('Select this page');expect(host.textContent).toContain('1/30 selected');
 await act(async()=>{const select=host.querySelector('select');select.value='1';select.dispatchEvent(new Event('change',{bubbles:true}));});
 expect(gamesRequest).toHaveBeenLastCalledWith('photo_library',{pin:'supervisor'},expect.objectContaining({school:'1',page:1}));expect(host.textContent).toContain('0/30 selected');
});
test('individual and ZIP downloads reauthorize selected IDs',async()=>{
 const originalFetch=global.fetch;global.fetch=jest.fn().mockResolvedValue({ok:true,arrayBuffer:async()=>new Uint8Array([1,2]).buffer});
 try{await render();await click('Download photo');expect(gamesRequest).toHaveBeenLastCalledWith('photo_library_download',{pin:'supervisor'},{ids:['entry:one']});expect(saveBlob).toHaveBeenCalledWith(expect.any(Blob),'photo.webp');await click('Select this page');await click('Download selected ZIP');expect(saveBlob).toHaveBeenLastCalledWith(expect.any(Blob),'SPARK-game-photos.zip');}finally{global.fetch=originalFetch;}
});
test('permission failure displays an actionable error without images',async()=>{
 gamesRequest.mockRejectedValueOnce(Error('Supervisor authorization required'));await render();expect(host.querySelector('[role=alert]').textContent).toBe('Supervisor authorization required');expect(host.querySelector('img')).toBeNull();
});

test('an expired download link is reauthorized once before retrying',async()=>{
 const originalFetch=global.fetch;global.fetch=jest.fn().mockResolvedValueOnce({ok:false,status:403}).mockResolvedValueOnce({ok:true,status:200,arrayBuffer:async()=>new Uint8Array([1]).buffer});
 try{await render();await click('Download photo');expect(gamesRequest.mock.calls.filter(([action])=>action==='photo_library_download')).toHaveLength(2);expect(saveBlob).toHaveBeenCalledWith(expect.any(Blob),'photo.webp');}finally{global.fetch=originalFetch;}
});
