jest.mock('../octoberGames/service',()=>({useOctoberAvailable:()=>false}));
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import SpotlightManager from './SpotlightManager';
import SpotlightFeed from './SpotlightFeed';
import {spotlightRequest,preparePhoto} from './service';
import {openSession,closeSession} from '../supperMonitoring/service';
jest.mock('./service',()=>({...jest.requireActual('./service'),spotlightRequest:jest.fn(),preparePhoto:jest.fn()}));
jest.mock('../supperMonitoring/service',()=>({openSession:jest.fn(),closeSession:jest.fn()}));
let host,root;
const post={id:'p1',revision:1,headline:'Cup winner',body:'Congratulations!',category:'SPARK Cup',published:true,published_at:'2026-09-30T20:00Z',counts:{love:2},mine:null};
beforeEach(()=>{HTMLElement.prototype.scrollIntoView=jest.fn();globalThis.IS_REACT_ACT_ENVIRONMENT=true;host=document.createElement('div');document.body.appendChild(host);root=createRoot(host);openSession.mockResolvedValue('manager-session');closeSession.mockResolvedValue();spotlightRequest.mockImplementation(async action=>action==='list'?[post]:{});window.confirm=jest.fn(()=>false);});
afterEach(()=>{act(()=>root.unmount());host.remove();});
const button=text=>[...host.querySelectorAll('button')].find(b=>b.textContent===text);
test('supervisor can edit/publish/unpublish and deletion requires confirmation',async()=>{
 await act(async()=>root.render(<SpotlightManager supervisorPin="admin"/>));
 await act(async()=>button('Edit').click());expect(host.querySelector('input').value).toBe('Cup winner');
 await act(async()=>host.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 expect(spotlightRequest).toHaveBeenCalledWith('save',expect.objectContaining({pin:'admin',payload:expect.objectContaining({published:true,headline:'Cup winner'})}));
 await act(async()=>button('Unpublish').click());expect(spotlightRequest).toHaveBeenCalledWith('unpublish',expect.objectContaining({id:'p1'}));
 await act(async()=>button('Delete').click());expect(spotlightRequest.mock.calls.filter(c=>c[0]==='delete')).toHaveLength(0);
 window.confirm.mockReturnValue(true);await act(async()=>button('Delete').click());expect(spotlightRequest).toHaveBeenCalledWith('delete',expect.objectContaining({id:'p1'}));
});
test('photo preview supports replacement and removal before publishing',async()=>{
 preparePhoto.mockResolvedValueOnce({preview:'data:image/jpeg;base64,first',base64:'first'}).mockResolvedValueOnce({preview:'data:image/jpeg;base64,second',base64:'second'});
 await act(async()=>root.render(<SpotlightManager supervisorPin="admin"/>));
 const input=host.querySelector('input[type=file]');Object.defineProperty(input,'files',{configurable:true,value:[new File(['x'],'photo.jpg',{type:'image/jpeg'})]});
 await act(async()=>input.dispatchEvent(new Event('change',{bubbles:true})));
 expect(host.querySelector('img[alt="Spotlight photo preview"]').src).toContain('first');
 await act(async()=>input.dispatchEvent(new Event('change',{bubbles:true})));
 expect(host.querySelector('img[alt="Spotlight photo preview"]').src).toContain('second');
 await act(async()=>button('Remove photo').click());expect(host.querySelector('img[alt="Spotlight photo preview"]')).toBeNull();
});
test('manager feed requests three posts, has no publishing controls, and updates reaction counts',async()=>{
 spotlightRequest.mockImplementation(async action=>action==='list'?[post]:{mine:'love',counts:{love:3}});const all=jest.fn();
 await act(async()=>root.render(<SpotlightFeed location={{id:1}} employee={{id:2}} managerPin="pin" onViewAll={all}/>));
 expect(spotlightRequest).toHaveBeenCalledWith('list',{token:'manager-session',limit:3});expect(host.textContent).not.toMatch(/Publish|Unpublish|Delete|Edit/);
 await act(async()=>host.querySelector('.spotlight-reactions button').click());expect(host.querySelector('.spotlight-reactions button').getAttribute('aria-pressed')).toBe('true');expect(host.querySelector('.spotlight-reactions strong').textContent).toBe('3');
 await act(async()=>button('View All Spotlights →').click());expect(all).toHaveBeenCalledTimes(1);
});
test('archive uses published-post API with pagination',async()=>{
 spotlightRequest.mockResolvedValueOnce(Array.from({length:20},(_,i)=>({...post,id:'p'+i}))).mockResolvedValueOnce([]);
 await act(async()=>root.render(<SpotlightFeed location={{id:1}} employee={{id:2}} managerPin="pin" archive/>));
 expect(host.querySelectorAll('article')).toHaveLength(20);
 await act(async()=>button('Load older Spotlights').click());expect(spotlightRequest).toHaveBeenLastCalledWith('list',{token:'manager-session',offset:20,limit:20});
});
