import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import GameAnnouncements,{waveAnnouncement} from './GameAnnouncements';
import {gamesRequest} from '../octoberGames/service';
import {openSession,closeSession} from '../supperMonitoring/service';
jest.mock('../octoberGames/service',()=>({gamesRequest:jest.fn()}));
jest.mock('../supperMonitoring/service',()=>({openSession:jest.fn(),closeSession:jest.fn()}));
global.IS_REACT_ACT_ENVIRONMENT=true;
const cycle={id:'cycle',state:'active'};
test('announcement selects one released wave and includes actual released count',()=>{const now=Date.parse('2026-11-02T16:00:00Z');const data={game_cycles:[cycle],game_waves:[{id:'wave',cycle_id:'cycle',state:'released',release_at:'2026-11-02T15:00:00Z',released_at:'2026-11-02T15:00:00Z',released_count:7}]};expect(waveAnnouncement(data,now)).toMatchObject({key:'wave',title:'NEW SIDE QUESTS ARE HERE!',description:'7 new challenges are available.'});});
test('upcoming announcement uses Los Angeles release time across DST',()=>{const data={game_waves:[{id:'w',state:'planned',release_at:'2026-11-02T15:00:00Z',approved_count:10}]};expect(waveAnnouncement(data,Date.parse('2026-11-01T12:00:00Z')).description).toContain('7:00 AM PST');});
test('unapproved and expired wave announcements are absent',()=>{expect(waveAnnouncement({game_waves:[{state:'planned',release_at:'2090-01-01',approved_count:0}]})).toBeNull();});

test('announcement polling pauses when hidden, uses metadata, and does not overlap',async()=>{
 jest.useFakeTimers();let visibility='hidden',resolveSession;
 const original=Object.getOwnPropertyDescriptor(document,'visibilityState');
 Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>visibility});
 const host=document.createElement('div'),root=createRoot(host);
 openSession.mockImplementation(()=>new Promise(resolve=>{resolveSession=resolve;}));
 closeSession.mockResolvedValue({});gamesRequest.mockResolvedValue({participating:false});
 try{
  await act(async()=>root.render(<GameAnnouncements location={{id:1}} employee={{id:2}} managerPin="pin"/>));
  await act(async()=>jest.advanceTimersByTime(120000));expect(openSession).not.toHaveBeenCalled();
  visibility='visible';await act(async()=>window.dispatchEvent(new Event('focus')));
  await act(async()=>window.dispatchEvent(new Event('focus')));expect(openSession).toHaveBeenCalledTimes(1);
  await act(async()=>resolveSession('token'));expect(gamesRequest).toHaveBeenCalledWith('announcements',{token:'token'});
  await act(async()=>jest.advanceTimersByTime(30000));expect(gamesRequest).toHaveBeenCalledTimes(1);
  await act(async()=>jest.advanceTimersByTime(90000));expect(gamesRequest).toHaveBeenCalledTimes(2);
 }finally{
  act(()=>root.unmount());if(original)Object.defineProperty(document,'visibilityState',original);else delete document.visibilityState;jest.useRealTimers();
 }
});
