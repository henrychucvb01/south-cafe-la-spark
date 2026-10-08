import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import OctoberGames,{OctoberBadge} from './OctoberGames';
import * as api from './service';
import * as sessions from '../supperMonitoring/service';
jest.mock('./service',()=>({useOctoberAvailable:jest.fn(()=>true),gamesRequest:jest.fn(),prepareGamePhoto:jest.fn()}));
jest.mock('../supperMonitoring/service',()=>({openSession:jest.fn(),closeSession:jest.fn()}));
const location={id:1,school_name:'School A'},employee={id:11,employee_name:'Manager'};
const initial=()=>({admin:false,location_id:1,identified:true,participating:true,server_time:'2026-10-15T12:00:00Z',new_challenge:true,
 settings:{revision:1,quests_state:'active',door_state:'active',mystery_state:'active',submission_start:'2026-10-01T00:00:00Z',submission_end:'2026-10-14T00:00:00Z',voting_start:'2026-10-14T00:00:00Z',voting_end:'2026-10-30T00:00:00Z',champion:null},
 schools:Array.from({length:28},(_,i)=>({id:i+1,school_name:'School '+String.fromCharCode(65+i),participating:true})),
 quests:[{id:1,name:'Team Spirit',description:'A team photo',eligible:null,enabled:true,revision:1}],entries:[],rounds:[{id:1,unlocked:0,piece_count:32,guessed:false}],current_round:1,rewards:[],guesses:[],unlock_events:[]});
let host,root,data;
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;host=document.createElement('div');document.body.append(host);root=createRoot(host);data=initial();jest.clearAllMocks();api.useOctoberAvailable.mockReturnValue(true);api.gamesRequest.mockImplementation(async()=>JSON.parse(JSON.stringify(data)));sessions.openSession.mockResolvedValue('scoped-token');sessions.closeSession.mockResolvedValue();api.prepareGamePhoto.mockResolvedValue({base64:'compressed',preview:'data:image/webp;base64,compressed',size:180000});});
afterEach(()=>{act(()=>root.unmount());host.remove();});
const render=async props=>act(async()=>root.render(<OctoberGames location={location} employee={employee} managerPin="test-pin" {...props}/>));
const button=text=>[...host.querySelectorAll('button')].find(b=>b.textContent===text);
const click=async text=>act(async()=>button(text).click());
test('development gate hides Games entirely outside preview',async()=>{api.useOctoberAvailable.mockReturnValue(false);await render();expect(host.textContent).toBe('');expect(sessions.openSession).not.toHaveBeenCalled();});
test('manager sees 28 named blank frames and no supervisor controls',async()=>{await render();await click('Halloween Doors');expect(host.querySelectorAll('.og-door')).toHaveLength(28);expect(host.querySelectorAll('.og-door-photo span')).toHaveLength(28);expect(host.textContent).not.toContain('Games & Challenges');expect(api.gamesRequest).toHaveBeenCalledWith('seen',{token:'scoped-token'});});
test('approved photos fit frames; own pending status is private and no own-school vote',async()=>{data.entries=[{id:'own',location_id:1,quest:0,state:'pending',feedback:'',photo_url:'private.webp'},{id:'other',location_id:2,quest:0,state:'approved',photo_url:'approved.webp',votes:null}];await render();await click('Halloween Doors');expect(host.querySelectorAll('.og-door-photo img')).toHaveLength(1);expect(host.textContent).toContain('Submitted — Pending Approval');expect(host.querySelectorAll('.og-door button')).toHaveLength(1);expect(host.textContent).not.toContain('0 votes');});
test('covering managers see explanation and cannot vote',async()=>{data.identified=false;data.entries=[{id:'other',location_id:2,quest:0,state:'approved',photo_url:'approved.webp',votes:null}];await render();await click('Halloween Doors');expect(button('Vote for this school').disabled).toBe(true);expect(host.textContent).toContain('registered manager login');});
test('upload prepares preview and requires consent; submitted photos await approval',async()=>{await render();await click('Upload photo');const input=host.querySelector('input[type=file]');Object.defineProperty(input,'files',{value:[new File(['photo'],'test.jpg',{type:'image/jpeg'})]});await act(async()=>input.dispatchEvent(new Event('change',{bubbles:true})));expect(api.prepareGamePhoto).toHaveBeenCalledTimes(1);expect(host.querySelector('.og-photo-picker img')).not.toBeNull();expect(button('Submit for approval').disabled).toBe(true);await act(async()=>host.querySelector('input[type=checkbox]').click());expect(button('Submit for approval').disabled).toBe(false);data.entries=[{id:'new',location_id:1,quest:1,state:'pending'}];await act(async()=>host.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));expect(api.gamesRequest).toHaveBeenLastCalledWith('submit',{token:'scoped-token'},expect.objectContaining({quest:1,consent:true}),expect.objectContaining({base64:'compressed'}));expect(host.textContent).toContain('Submitted — Pending Approval');});
test('mystery guess is one per round and winner shows collection',async()=>{data.rounds[0].guessed=true;await render();await click('Mystery Photos');expect(host.textContent).toContain('Your guess is saved');expect(button('Submit guess')).toBeUndefined();});
test('supervisor has review, eligibility, dates, artwork and corrections',async()=>{data.admin=true;data.rounds[0].answer='Jack-o-lantern';data.entries=[{id:'pending',location_id:1,quest:1,state:'pending',revision:1,photo_url:'test.webp',feedback:''}];await render({supervisorPin:'admin-test'});await click('Games & Challenges');expect(button('Approve')).toBeDefined();expect(host.textContent).toContain('Participating schools');expect(host.textContent).toContain('Quest instructions');expect(host.textContent).toContain('accepted answers');expect(sessions.openSession).not.toHaveBeenCalled();await click('Approve');expect(api.gamesRequest).toHaveBeenLastCalledWith('review',{pin:'admin-test'},expect.objectContaining({id:'pending',state:'approved',revision:1}),undefined);});
test('game standings use earning month and exclude voided rewards',async()=>{data.rewards=[{location_id:1,points:25,service_date:'2026-10-15',voided:false},{location_id:1,points:25,service_date:'2026-09-15',voided:false},{location_id:1,points:10,service_date:'2026-10-15',voided:true}];await render();await click('Game Standings');expect(host.querySelector('tbody tr').textContent).toBe('1School A25');});
test('new challenge badge uses registered manager identity',async()=>{await act(async()=>root.render(<OctoberBadge location={location} employee={employee} managerPin="pin"/>));expect(host.textContent).toBe('NEW CHALLENGE');expect(sessions.openSession).toHaveBeenCalledWith(location,employee,'pin');});

test('nonparticipating manager previews uploads and guesses without any mutation request',async()=>{
 data.participating=false;data.settings.quests_state='paused';data.settings.door_state='paused';data.settings.mystery_state='paused';
 await render();await click('Preview manager experience');await click('Upload photo');expect(host.querySelector('input[type=file]')).not.toBeNull();
 await click('Halloween Doors');await click('Submit your school’s door');expect(host.querySelector('form.og-submit')).not.toBeNull();
 await click('Mystery Photos');expect(button('Submit guess').disabled).toBe(false);
 jest.spyOn(window,'confirm').mockReturnValue(true);
 await act(async()=>host.querySelector('form.og-guess').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 expect(host.textContent).toContain('No real guess was used');expect(api.gamesRequest.mock.calls.every(([action])=>['seen','list'].includes(action))).toBe(true);
 window.confirm.mockRestore();
});
test('supervisor mystery uses drag and drop with no camera; quest eligibility has no all-schools checkbox',async()=>{
 data.admin=true;await render({supervisorPin:'admin-test'});await click('Games & Challenges');
 expect(host.textContent).not.toContain('Available to all participating schools');expect(host.querySelector('input[capture]')).toBeNull();
 const drop=host.querySelector('.og-dropzone');const event=new Event('drop',{bubbles:true,cancelable:true});Object.defineProperty(event,'dataTransfer',{value:{files:[new File(['photo'],'test.jpg',{type:'image/jpeg'})]}});
 await act(async()=>drop.dispatchEvent(event));expect(api.prepareGamePhoto).toHaveBeenCalledTimes(1);expect(host.querySelector('.og-photo-picker img')).not.toBeNull();
});

test('a completed quest locks upload controls for every other school',async()=>{
 data.quests[0].first_school=2;await render();expect(host.textContent).toContain('Completed by: School B');expect(host.textContent).toContain('COMPLETED');expect(button('Upload photo')).toBeUndefined();
});

test('completed quest flips only to the winning approved photo',async()=>{
 data.quests[0].first_school=2;data.entries=[{id:'pending',quest:1,location_id:1,state:'pending',photo_url:'private.webp'},{id:'winner',quest:1,location_id:2,state:'approved',photo_url:'winner.webp'}];
 await render();const card=host.querySelector('.og-completed');expect(card.getAttribute('aria-pressed')).toBe('false');expect(card.querySelector('img').getAttribute('src')).toBe('winner.webp');
 await act(async()=>card.click());expect(card.classList.contains('is-flipped')).toBe(true);await act(async()=>card.click());expect(card.getAttribute('aria-pressed')).toBe('false');
});
test('manager preview shows a reversible happy-face example without saving',async()=>{
 data.participating=false;await render();await click('Preview manager experience');const card=host.querySelector('.og-example .og-completed');expect(card.querySelector('[aria-label="Happy face preview"]')).not.toBeNull();await act(async()=>card.click());expect(card.getAttribute('aria-pressed')).toBe('true');expect(api.gamesRequest.mock.calls.every(([action])=>['seen','list'].includes(action))).toBe(true);
});

test('only supervisor sees the new quest form',async()=>{
 await render();expect(button('+ Add quest')).toBeUndefined();data.admin=true;await render({supervisorPin:'admin-test'});await click('Games & Challenges');await click('+ Add quest');expect(button('Create quest').disabled).toBe(true);expect(host.textContent).toContain('New Side Quest');await click('Cancel new quest');expect(button('Create quest')).toBeUndefined();
});

test('quest card shows its configured SPARK reward at the bottom',async()=>{
 data.quests[0].reward_points=40;await render();const card=host.querySelector('.og-quest-card');expect(card.lastElementChild.textContent).toBe('Reward: 40 SPARK Points');expect(host.textContent).not.toContain('First school: +10');expect(host.textContent).not.toContain('earn 10 points');
});
test('supervisor reward setting uses stored amount and completed rewards stay locked',async()=>{
 data.admin=true;data.quests[0].reward_points=40;await render({supervisorPin:'admin-test'});await click('Games & Challenges');let input=host.querySelector('input[type=number]');expect(input.value).toBe('40');expect(input.disabled).toBe(false);
 await act(async()=>input.closest('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));expect(api.gamesRequest).toHaveBeenLastCalledWith('quest',{pin:'admin-test'},expect.objectContaining({reward_points:40}),undefined);
 data.quests[0].first_school=2;data.quests[0].revision++;await click('Refresh');input=host.querySelector('input[type=number]');expect(input.disabled).toBe(true);
});
