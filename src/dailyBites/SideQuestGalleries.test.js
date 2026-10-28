import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import SideQuestGalleries from './SideQuestGalleries';
import {gamesRequest} from '../octoberGames/service';
import {openSession,closeSession} from '../supperMonitoring/service';
jest.mock('../octoberGames/service',()=>({gamesRequest:jest.fn()}));
jest.mock('../supperMonitoring/service',()=>({openSession:jest.fn(),closeSession:jest.fn()}));
test('gallery makes no background requests and loads only on explicit opening or refresh',async()=>{
 global.IS_REACT_ACT_ENVIRONMENT=true;jest.useFakeTimers();const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 openSession.mockResolvedValue('token');closeSession.mockResolvedValue({});gamesRequest.mockResolvedValue({photos:[{id:'one',url:'private-signed',school:'School',quest:'Display'}]});
 const click=async text=>act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent===text).click());
 try{
  await act(async()=>root.render(<SideQuestGalleries location={{id:1}} employee={{id:2}} managerPin="pin"/>));
  await act(async()=>jest.advanceTimersByTime(600000));expect(gamesRequest).not.toHaveBeenCalled();expect(host.querySelector('img')).toBeNull();
  await click('View Side Quest photos');expect(gamesRequest).toHaveBeenCalledTimes(1);expect(gamesRequest).toHaveBeenCalledWith('side_quest_gallery',{token:'token'});
  expect(host.querySelector('img').getAttribute('loading')).toBe('lazy');
  await act(async()=>jest.advanceTimersByTime(600000));expect(gamesRequest).toHaveBeenCalledTimes(1);
  await click('Refresh photos');expect(gamesRequest).toHaveBeenCalledTimes(2);
  await click('Close ×');expect(host.querySelector('img')).toBeNull();
  await act(async()=>jest.advanceTimersByTime(600000));expect(gamesRequest).toHaveBeenCalledTimes(2);
 }finally{act(()=>root.unmount());host.remove();jest.useRealTimers();}
});
