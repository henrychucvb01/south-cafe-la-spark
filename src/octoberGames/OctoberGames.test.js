import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import OctoberGames,{OctoberBadge} from './OctoberGames';
import * as api from './service';
import * as sessions from '../supperMonitoring/service';
jest.mock('./service',()=>({useOctoberAvailable:jest.fn(()=>true),gamesRequest:jest.fn(),prepareGamePhoto:jest.fn()}));
jest.mock('../supperMonitoring/service',()=>({openSession:jest.fn(),closeSession:jest.fn()}));
const location={id:1,school_name:'School A'},employee={id:11,employee_name:'Manager'};
const initial=()=>({admin:false,location_id:1,identified:true,participating:true,server_time:'2026-10-15T12:00:00Z',new_challenge:true,guess_shop:{next_price:10,balance:500,used_today:false,free_available:true,available:0,tomorrow:0},
 unlock_shop:{balance:2,points:500,next_piece_cost:1},
 settings:{revision:1,quests_state:'active',door_state:'active',mystery_state:'active',submission_start:'2026-10-01T00:00:00Z',submission_end:'2026-10-14T00:00:00Z',voting_start:'2026-10-14T00:00:00Z',voting_end:'2026-10-30T00:00:00Z',champion:null},
 schools:Array.from({length:28},(_,i)=>({id:i+1,school_name:'School '+String.fromCharCode(65+i),participating:true})),
 quests:[{id:1,name:'Team Spirit',description:'A team photo',eligible:null,enabled:true,revision:1}],entries:[],rounds:[{id:1,unlocked:0,piece_count:32,guessed:false}],current_round:1,rewards:[],guesses:[],unlock_events:[]});
let host,root,data;
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;Object.defineProperty(window,'crypto',{configurable:true,value:{randomUUID:jest.fn(()=> '11111111-1111-4111-8111-111111111111')}});host=document.createElement('div');document.body.append(host);root=createRoot(host);data=initial();jest.clearAllMocks();api.useOctoberAvailable.mockReturnValue(true);api.gamesRequest.mockImplementation(async()=>JSON.parse(JSON.stringify(data)));sessions.openSession.mockResolvedValue('scoped-token');sessions.closeSession.mockResolvedValue();api.prepareGamePhoto.mockResolvedValue({base64:'compressed',preview:'data:image/webp;base64,compressed',size:180000});});
afterEach(()=>{act(()=>root.unmount());host.remove();});
const render=async props=>act(async()=>root.render(<OctoberGames location={location} employee={employee} managerPin="test-pin" {...props}/>));
const button=text=>[...host.querySelectorAll('button')].find(b=>b.textContent===text);
const click=async text=>act(async()=>button(text).click());
const openReview=async()=>act(async()=>[...host.querySelectorAll('.og-management-tabs button')].find(b=>b.textContent.startsWith('Photo Review')).click());

test('supervisor sections group quest controls and collapse monthly mysteries',async()=>{
 data.games_planning={drafts:[],waves:[],warnings:[]};await render({supervisorPin:'admin-test'});await click('Games & Challenges');
 const quests=host.querySelector('.og-quest-management'),mysteries=host.querySelector('.og-mystery-management');
 expect(quests.open).toBe(false);expect(quests.querySelector('.sg-planner')).not.toBeNull();expect(quests.textContent).toContain('Quest History');
 expect(mysteries.open).toBe(false);expect(host.textContent).toContain('Confirm the door champion');
 await click('Guesses, Unlocks & Points');expect(host.textContent).toContain('Points and corrections');expect(host.querySelector('.sg-planner')).toBeNull();
 await click('Settings');expect(host.querySelector('.og-quest-management')).not.toBeNull();
});

test('photo review badge counts pending entries and clears after approval',async()=>{
 data.entries=[{id:'pending',location_id:1,quest:1,state:'pending',revision:1,feedback:'',photo_url:'test.webp'},{id:'reviewed',location_id:2,quest:0,state:'approved',feedback:'',photo_url:'door.webp'}];
 await render({supervisorPin:'admin-test'});await click('Games & Challenges');
 expect(host.querySelector('.og-review-count').textContent).toBe('1');await openReview();expect(host.querySelectorAll('img[alt="Submission for review"]')).toHaveLength(1);
 data.entries[0].state='approved';await click('Approve');expect(host.querySelector('.og-review-count')).toBeNull();expect(host.textContent).toContain('No photos awaiting review.');
 expect(api.gamesRequest).toHaveBeenLastCalledWith('review',{pin:'admin-test'},expect.objectContaining({id:'pending',state:'approved',revision:1}),undefined);
 await act(async()=>host.querySelector('.og-check input').click());expect(host.querySelectorAll('img[alt="Submission for review"]')).toHaveLength(2);
});

test.each([false,true])('Test High School can open Mystery Photos without a current puzzle (preview: %s)',async preview=>{
 data.location_id=32;data.participating=false;data.current_round=null;data.rounds=[];
 await render({location:{id:32,school_name:'Test High School'}});
 if(preview)await click('Preview manager experience');
 await click('Mystery Photos');
 expect(host.textContent).toContain('Mystery Photo Unlock');
 expect(host.textContent).toContain('Get More Unlocks');
 expect(button('Side Quests')).toBeDefined();
 expect(button('Buy 1 Credit · 5 Points').disabled).toBe(!preview);
 await click('Side Quests');expect(host.textContent).toContain('Team Spirit');
 expect(api.gamesRequest.mock.calls.every(([action])=>['seen','list'].includes(action))).toBe(true);
});

test('a completed collection remains navigable when no current round is returned',async()=>{
 data.current_round=null;data.rounds[0]={...data.rounds[0],solved_at:'2026-10-15',answer:'A completed mystery',winner:2};
 await render();await click('Mystery Photos');
 expect(host.textContent).toContain('Collection complete');expect(host.textContent).toContain('A completed mystery');
 await click('Door Contest');expect(host.querySelector('.og-door')).not.toBeNull();
});
test('development gate hides Games entirely outside preview',async()=>{api.useOctoberAvailable.mockReturnValue(false);await render();expect(host.textContent).toBe('');expect(sessions.openSession).not.toHaveBeenCalled();});
test('manager sees 28 named blank frames and no supervisor controls',async()=>{await render();await click('Door Contest');expect(host.querySelectorAll('.og-door')).toHaveLength(28);expect(host.querySelectorAll('.og-door-photo span')).toHaveLength(28);expect(host.textContent).not.toContain('Games & Challenges');expect(api.gamesRequest).toHaveBeenCalledWith('seen',{token:'scoped-token'});});
test('approved photos fit frames; own pending status is private and no own-school vote',async()=>{data.entries=[{id:'own',location_id:1,quest:0,state:'pending',feedback:'',photo_url:'private.webp'},{id:'other',location_id:2,quest:0,state:'approved',photo_url:'approved.webp',votes:null}];await render();await click('Door Contest');expect(host.querySelectorAll('.og-door-photo img')).toHaveLength(1);expect(host.textContent).toContain('Submitted — Pending Approval');expect(host.querySelectorAll('.og-door button')).toHaveLength(1);expect(host.textContent).not.toContain('0 votes');});
test('sessions without game identity remain blocked from voting',async()=>{data.identified=false;data.entries=[{id:'other',location_id:2,quest:0,state:'approved',photo_url:'approved.webp',votes:null}];await render();await click('Door Contest');expect(button('Vote for this school').disabled).toBe(true);expect(host.textContent).toContain('Sign in as a manager');});
test('upload prepares preview and requires consent; submitted photos await approval',async()=>{await render();await click('Upload photo');const input=host.querySelector('input[type=file]');Object.defineProperty(input,'files',{value:[new File(['photo'],'test.jpg',{type:'image/jpeg'})]});await act(async()=>input.dispatchEvent(new Event('change',{bubbles:true})));expect(api.prepareGamePhoto).toHaveBeenCalledTimes(1);expect(host.querySelector('.og-photo-picker img')).not.toBeNull();expect(button('Submit for approval').disabled).toBe(true);await act(async()=>host.querySelector('input[type=checkbox]').click());expect(button('Submit for approval').disabled).toBe(false);data.entries=[{id:'new',location_id:1,quest:1,state:'pending'}];await act(async()=>host.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));expect(api.gamesRequest).toHaveBeenLastCalledWith('submit',{token:'scoped-token'},expect.objectContaining({quest:1,consent:true}),expect.objectContaining({base64:'compressed'}));expect(host.textContent).toContain('Submitted — Pending Approval');});
test('school daily limit disables guessing',async()=>{data.guess_shop.used_today=true;data.guess_shop.free_available=false;await render();await click('Mystery Photos');expect(host.textContent).toContain('Your school’s free guess is saved for today');expect(button('Submit guess').disabled).toBe(true);});
test('supervisor has review, eligibility, dates, artwork and corrections',async()=>{data.admin=true;data.rounds[0].answer='Jack-o-lantern';data.entries=[{id:'pending',location_id:1,quest:1,state:'pending',revision:1,photo_url:'test.webp',feedback:''}];await render({supervisorPin:'admin-test'});await click('Games & Challenges');expect(button('Approve')).toBeUndefined();expect(host.textContent).toContain('Participating schools');expect(host.textContent).toContain('Quest History');expect(host.textContent).toContain('accepted answers');expect(sessions.openSession).not.toHaveBeenCalled();await openReview();await click('Approve');expect(api.gamesRequest).toHaveBeenLastCalledWith('review',{pin:'admin-test'},expect.objectContaining({id:'pending',state:'approved',revision:1}),undefined);});
test('game standings use earning month and exclude voided rewards',async()=>{data.rewards=[{location_id:1,points:25,service_date:'2026-10-15',voided:false},{location_id:1,points:25,service_date:'2026-09-15',voided:false},{location_id:1,points:10,service_date:'2026-10-15',voided:true}];await render();await click('SPARK Standings');expect(host.querySelector('tbody tr').textContent).toBe('1School A25');});
test('new challenge badge uses registered manager identity',async()=>{await act(async()=>root.render(<OctoberBadge location={location} employee={employee} managerPin="pin"/>));expect(host.textContent).toBe('NEW CHALLENGE');expect(sessions.openSession).toHaveBeenCalledWith(location,employee,'pin');});

test('nonparticipating manager previews uploads and guesses without any mutation request',async()=>{
 data.participating=false;data.settings.quests_state='paused';data.settings.door_state='paused';data.settings.mystery_state='paused';
 await render();await click('Preview manager experience');await click('Upload photo');expect(host.querySelector('input[type=file]')).not.toBeNull();
 await click('Door Contest');await click('Submit your school’s door');expect(host.querySelector('form.og-submit')).not.toBeNull();
 await click('Mystery Photos');expect(button('Submit guess').disabled).toBe(false);
 jest.spyOn(window,'confirm').mockReturnValue(true);
 await changeInput(host.querySelector('form.og-guess input'),'preview answer');
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

test('historical completion restores only the winning approved photo and supports optional manual flips',async()=>{
 data.quests[0].first_school=2;data.entries=[{id:'pending',quest:1,location_id:1,state:'pending',photo_url:'private.webp'},{id:'winner',quest:1,location_id:2,state:'approved',photo_url:'winner.webp'}];
 await render();const card=host.querySelector('.og-completed');expect(card.getAttribute('aria-pressed')).toBe('false');expect(card.querySelector('img').getAttribute('src')).toBe('winner.webp');
 expect(card.textContent).toContain('Completed by: School B');
 await act(async()=>card.click());expect(card.classList.contains('is-flipped')).toBe(true);await act(async()=>card.click());expect(card.getAttribute('aria-pressed')).toBe('false');
 await click('Refresh');expect(card.getAttribute('aria-pressed')).toBe('false');
});
test('manager preview shows completion details without photos or mutations',async()=>{
 data.participating=false;await render();await click('Preview manager experience');const card=host.querySelector('.og-example .og-completed');expect(card.querySelector('img')).toBeNull();expect(card.getAttribute('aria-pressed')).toBe('false');await act(async()=>card.click());expect(card.getAttribute('aria-pressed')).toBe('true');expect(api.gamesRequest.mock.calls.every(([action])=>['seen','list'].includes(action))).toBe(true);
});

test('completed cards automatically reveal photos after the entry delay and stay there; unfinished cards stay still',async()=>{
 jest.useFakeTimers();
 try{
  data.quests.push({id:2,name:'Second quest',description:'Second task',reward_points:30});await render();
  data.quests[0].first_school=2;await click('Refresh');
  const card=host.querySelector('.og-completed');expect(host.querySelectorAll('.og-completed')).toHaveLength(1);expect(host.querySelectorAll('.og-quest-card')).toHaveLength(1);
  await act(async()=>jest.advanceTimersByTime(1999));expect(card.getAttribute('aria-pressed')).toBe('false');
  await act(async()=>jest.advanceTimersByTime(1));expect(card.getAttribute('aria-pressed')).toBe('true');
  await act(async()=>jest.advanceTimersByTime(2599));expect(card.getAttribute('aria-pressed')).toBe('true');
  await act(async()=>jest.advanceTimersByTime(5201));expect(card.getAttribute('aria-pressed')).toBe('true');
  await click('Refresh');expect(card.getAttribute('aria-pressed')).toBe('true');
 }finally{jest.useRealTimers();}
});

test('reduced motion completes immediately without enabling animation',async()=>{
 const previous=window.matchMedia;window.matchMedia=()=>({matches:true});
 try{await render();data.quests[0].first_school=2;await click('Refresh');const card=host.querySelector('.og-completed');expect(card.getAttribute('aria-pressed')).toBe('true');expect(card.classList.contains('is-animated')).toBe(false);}
 finally{window.matchMedia=previous;}
});

test('only supervisor sees the new quest form',async()=>{
 await render();expect(button('+ Add quest')).toBeUndefined();data.admin=true;await render({supervisorPin:'admin-test'});await click('Games & Challenges');await click('+ Add quest');expect(button('Create quest').disabled).toBe(true);expect(host.textContent).toContain('New Side Quest');await click('Cancel new quest');expect(button('Create quest')).toBeUndefined();
});

test('quest card shows its configured SPARK reward at the bottom',async()=>{
 data.quests[0].reward_points=40;await render();const card=host.querySelector('.og-quest-card');expect(card.lastElementChild.textContent).toBe('Reward: 40 SPARK Points');expect(host.textContent).not.toContain('First school: +10');expect(host.textContent).not.toContain('earn 10 points');
});
test('supervisor Quest History keeps original rewards read-only',async()=>{
 data.admin=true;data.quests[0].reward_points=40;await render({supervisorPin:'admin-test'});await click('Games & Challenges');
 expect(host.querySelector('.sg-history').textContent).toContain('40');expect(host.querySelector('.sg-history input')).toBeNull();
 data.quests[0].first_school=2;data.quests[0].revision++;await click('Refresh');expect(host.querySelector('.sg-history').textContent).toContain('40');expect(api.gamesRequest.mock.calls.some(([action])=>action==='quest')).toBe(false);
});

const changeInput=async(input,value)=>act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));});
test('door gallery uses configured rewards and keeps actual past awards',async()=>{
 data.settings.door_participation_points=35;data.settings.door_champion_points=80;
 data.entries=[{id:'other',location_id:2,quest:0,state:'approved',photo_url:'approved.webp',votes:null,awarded_points:15}];
 await render();await click('Door Contest');expect(host.textContent).toContain('35 SPARK Points for approved participation · 80 additional SPARK Points for the champion');expect(host.textContent).toContain('Approved · +15 SPARK Points');expect(host.textContent).not.toContain('Not set');
});

test('one compact form saves theme, two closing dates and rewards',async()=>{
 data.admin=true;await render({supervisorPin:'admin-test'});await click('Games & Challenges');const form=host.querySelector('.og-door-settings form');expect(form.querySelectorAll('input[type=datetime-local]')).toHaveLength(2);
 const select=form.querySelector('select');await act(async()=>{select.value='winter';select.dispatchEvent(new Event('change',{bubbles:true}));});expect(form.textContent).toContain('Winter Holiday Door Decorating Contest');
 const inputs=form.querySelectorAll('input[type=number]');await changeInput(inputs[0],'35');await changeInput(inputs[1],'80');
 await act(async()=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 expect(api.gamesRequest).toHaveBeenLastCalledWith('door_settings',{pin:'admin-test'},expect.objectContaining({door_theme:'winter',door_participation_points:35,door_champion_points:80,door_background:'#173653'}),undefined);
 expect(host.textContent).toContain('Door contest settings saved');
});
test('missing or reversed closing dates do not save',async()=>{
 data.admin=true;await render({supervisorPin:'admin-test'});await click('Games & Challenges');const form=host.querySelector('.og-door-settings form'),dates=form.querySelectorAll('input[type=datetime-local]');
 await changeInput(dates[1],'');api.gamesRequest.mockClear();await act(async()=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));expect(api.gamesRequest).not.toHaveBeenCalled();expect(host.textContent).toContain('Enter both closing dates');
 await changeInput(dates[1],'2026-10-01T08:00');await act(async()=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));expect(api.gamesRequest).not.toHaveBeenCalled();expect(host.textContent).toContain('Voting must close at or after submissions close');
});
test('submissions and voting overlap, theme reaches gallery and trading cards are removed',async()=>{
 data.server_time='2026-10-10T12:00:00Z';data.settings.door_title='Winter Doors';data.settings.door_theme='winter';data.settings.door_background='#eeeeee';
 data.entries=[{id:'door',quest:0,location_id:2,state:'approved',votes:null},{id:'quest',quest:1,location_id:2,state:'approved'}];
 await render();expect(host.textContent).not.toContain('SPARK Trading Cards');await click('Door Contest');expect(button('Submit your school’s door')).toBeDefined();expect(button('Vote for this school')).toBeDefined();expect(host.textContent).toContain('Winter Doors');expect(host.querySelector('.og-door').style.getPropertyValue('--door-background')).toBe('#eeeeee');expect(host.querySelector('.og-door').style.getPropertyValue('--door-ink')).toBe('#111111');
});
test('hard mystery shows individual reward; supervisor can edit reward without changing photo',async()=>{
 data.current_round=3;data.rounds=[{id:3,revision:1,reward_points:75,unlocked:2,piece_count:32,photo_url:'masked.png'}];await render();await click('Mystery Photos');expect(host.textContent).toContain('Reward: 75 SPARK Points');expect(host.textContent).toContain('inner pieces cost 2 or 3');
 data.admin=true;await render({supervisorPin:'admin-test'});await click('Games & Challenges');const btn=button('Save photo points');await changeInput(btn.closest('form').querySelector('input[type=number]'),'90');await act(async()=>btn.click());expect(api.gamesRequest).toHaveBeenLastCalledWith('round_reward',{pin:'admin-test'},{id:3,revision:1,reward_points:90},undefined);expect(button('Save mystery').disabled).toBe(true);
});

test('extra guess prize is optional and submitted only with its specific inventory id',async()=>{
 data.guess_shop.free_available=false;data.rounds[0].guessed=true;data.rounds[0].photo_url='masked.png';data.extra_guess_prizes=[{id:55,name:'Extra Mystery Guess'}];
 await render();await click('Mystery Photos');await click('Use extra guess prize (1 available)');expect(button('Use prize & submit guess')).toBeDefined();await click('Keep prize');expect(button('Submit guess').disabled).toBe(true);
 await click('Use extra guess prize (1 available)');await changeInput(host.querySelector('.og-guess input'),'my answer');jest.spyOn(window,'confirm').mockReturnValue(true);
 await act(async()=>host.querySelector('.og-guess').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 expect(api.gamesRequest).toHaveBeenLastCalledWith('guess',{token:'scoped-token'},expect.objectContaining({round:1,guess:'my answer',extra_guess_win:55,request_id:expect.any(String)}),undefined);window.confirm.mockRestore();
});


test('confirmed purchase uses season price and canceled purchase spends nothing',async()=>{
 data.rounds[0].photo_url='masked.png';data.guess_shop.next_price=25;await render();await click('Mystery Photos');const confirm=jest.spyOn(window,'confirm').mockReturnValue(false);
 await click('Extra guess · 25 SPARK Points');expect(api.gamesRequest.mock.calls.some(([a])=>a==='buy_guess')).toBe(false);
 confirm.mockReturnValue(true);await click('Extra guess · 25 SPARK Points');expect(confirm).toHaveBeenLastCalledWith(expect.stringContaining('season total'));
 expect(api.gamesRequest).toHaveBeenLastCalledWith('buy_guess',{token:'scoped-token'},expect.objectContaining({round:1,expected_price:25,confirmed:true,request_id:expect.any(String)}),undefined);confirm.mockRestore();
});
test('purchase retry retains request id after lost response',async()=>{
 data.rounds[0].photo_url='masked.png';await render();await click('Mystery Photos');const confirm=jest.spyOn(window,'confirm').mockReturnValue(true);api.gamesRequest.mockRejectedValueOnce(new Error('Connection lost'));
 await click('Extra guess · 10 SPARK Points');const first=api.gamesRequest.mock.calls.at(-1)[2].request_id;await click('Extra guess · 10 SPARK Points');expect(api.gamesRequest.mock.calls.at(-1)[2].request_id).toBe(first);expect(window.crypto.randomUUID).toHaveBeenCalledTimes(1);confirm.mockRestore();
});
test('tomorrow purchases remain locked but matured extras work after daily free guess',async()=>{
 data.rounds[0].photo_url='masked.png';data.guess_shop.free_available=false;data.guess_shop.tomorrow=2;await render();await click('Mystery Photos');expect(button('Submit guess').disabled).toBe(true);expect(host.textContent).toContain('2 available tomorrow');
 data.guess_shop.available=1;data.guess_shop.used_today=true;data.extra_guess_prizes=[{id:55}];await click('Refresh');expect(button('Submit guess').disabled).toBe(false);expect(button('Use extra guess prize (1 available)')).toBeDefined();expect(button('Extra guess · 10 SPARK Points').disabled).toBe(false);
});
test('supervisor accepts an actual submitted guess and collection names winning school',async()=>{
 data.admin=true;data.guesses=[{attempt_key:'original:1:11',round:1,employee_id:'11',location_id:2,guess:'spelling variant',correct:false}];await render({supervisorPin:'admin-test'});await click('Games & Challenges');await click('Guesses, Unlocks & Points');const confirm=jest.spyOn(window,'confirm').mockReturnValue(true);await click('Accept as correct');expect(api.gamesRequest).toHaveBeenLastCalledWith('accept_guess',{pin:'admin-test'},{round:1,attempt_key:'original:1:11'},undefined);
 data.rounds[0]={...data.rounds[0],solved_at:'2026-10-15',winner:2,winner_name:'School B',answer:'Test answer'};await click('Refresh');expect(button('Accept as correct')).toBeUndefined();await click('Mystery Photos');expect(host.textContent).toContain('Solved by: School B');confirm.mockRestore();
});
test('preview purchase never sends a write',async()=>{
 data.participating=false;await render();await click('Preview manager experience');await click('Mystery Photos');const confirm=jest.spyOn(window,'confirm').mockReturnValue(true);await click('Extra guess · 10 SPARK Points');expect(api.gamesRequest.mock.calls.every(([a])=>['seen','list'].includes(a))).toBe(true);expect(host.textContent).toContain('No points were spent');confirm.mockRestore();
});

test('unlock purchase and reveal previews never send mutation requests',async()=>{
 data.participating=false;data.rounds[0].photo_url='masked.png';await render();await click('Preview manager experience');await click('Mystery Photos');
 const confirm=jest.spyOn(window,'confirm').mockReturnValue(true);
 await click('Buy 1 Credit · 5 Points');expect(host.textContent).toContain('No points were spent');
 await click('Reveal next piece · 1 credit');expect(host.textContent).toContain('No credits were used');
 expect(api.gamesRequest.mock.calls.every(([action])=>['seen','list'].includes(action))).toBe(true);confirm.mockRestore();
});

test('recent guesses show other-school labels, text and time without supervisor data',async()=>{data.recent_guesses=[{attempt_key:'example',school_name:'School B',guess:'pumpkin',submitted_at:'2026-10-15T12:00:00Z'}];await render();await click('Mystery Photos');expect(host.textContent).toContain('Last 5 guesses from other schools');expect(host.querySelector('.og-recent-guesses').textContent).toContain('School B: pumpkin');});
test('manager showdowns precede regular quests while supervisor placement stays unchanged',async()=>{
 data.showdowns={champions:[],used:[],eligible_quests:[],submissions:[],rounds:[{id:'active',quest:1,state:'voting',defender:2,closes_at:'2099-01-01T00:00:00Z',photos:[]}]};
 await render();
 const headings=()=>[...host.querySelectorAll('h3')].map(e=>e.textContent);
 expect(headings()[0]).toBe('Side Quest Showdowns');expect(headings()[1]).toContain('Side Quests');expect(host.querySelectorAll('.sd')).toHaveLength(1);
 data.admin=true;await render({supervisorPin:'admin-test'});
 expect(headings()[0]).toContain('Side Quests');expect(headings().at(-1)).toBe('Side Quest Challenges');expect(host.querySelectorAll('.sd')).toHaveLength(1);
});
test('live poll reloads the comparison when cancellation changes revision without restarting voting',async()=>{
 jest.useFakeTimers();
 try{
  data.showdowns={champions:[],used:[],eligible_quests:[],submissions:[],rounds:[{id:'active',quest:1,state:'voting',generation:2,revision:3,defender:2,closes_at:'2099-01-01T00:00:00Z',photos:[{id:'defender',location_id:2,school_name:'School B',role:'defender',votes:1},{id:'withdrawn',location_id:3,school_name:'School C',role:'challenger',votes:1},{id:'remaining',location_id:4,school_name:'School D',role:'challenger',votes:2}]}]};
  await render();expect(host.querySelectorAll('.sd-photo')).toHaveLength(3);
  const round=data.showdowns.rounds[0];round.revision=4;round.photos=round.photos.filter(p=>p.id!=='withdrawn');
  api.gamesRequest.mockImplementation(async action=>action==='showdown_poll'?{showdown_poll:true,server_time:data.server_time,rounds:JSON.parse(JSON.stringify(data.showdowns.rounds))}:JSON.parse(JSON.stringify(data)));
  await act(async()=>jest.advanceTimersByTime(5000));
  expect(api.gamesRequest).toHaveBeenCalledWith('showdown_poll',{token:'scoped-token'});
  expect(api.gamesRequest).toHaveBeenCalledWith('list',{token:'scoped-token'});
  expect(host.querySelectorAll('.sd-photo')).toHaveLength(2);expect(host.querySelector('.sd-comparison').textContent).not.toContain('School C');
 }finally{jest.useRealTimers();}
});

test('temporary managers with school game identity can upload, vote, challenge and guess for the school',async()=>{
 data.game_waves=[];data.identified=true;data.entries=[{id:'other-door',location_id:2,quest:0,state:'approved',photo_url:'approved.webp',votes:null}];data.quests.push({id:7,name:'Completed display',first_school:2});data.showdowns={champions:[],submissions:[],rounds:[],used:[],eligible_quests:[7]};
 const temporary={id:null,covering:true,employee_name:'Temporary Manager'};
 await render({employee:temporary});expect(button('Upload photo')).toBeDefined();expect(button('Challenge')).toBeDefined();
 await click('Door Contest');expect(button('Vote for this school').disabled).toBe(false);
 data.rounds[0].photo_url='masked.png';await click('Refresh');await click('Mystery Photos');expect(button('Submit guess').disabled).toBe(false);expect(host.textContent).not.toContain('Sign in as a manager');
});
test('temporary managers receive the school games badge using their verified school session',async()=>{
 await act(async()=>root.render(<OctoberBadge location={location} employee={{id:null,covering:true,employee_name:'Temporary Manager'}} managerPin="covering-session"/>));
 expect(sessions.openSession).toHaveBeenCalledWith(location,expect.objectContaining({covering:true}),'covering-session');expect(api.gamesRequest).toHaveBeenCalledWith('badge',{token:'scoped-token'});
});

test('supervisor can rotate a pending photo before approval; reviewed photos have no rotate control',async()=>{
 data.admin=true;data.entries=[{id:'pending',location_id:1,quest:1,state:'pending',revision:1,photo_url:'upside-down.webp',feedback:''}];await render({supervisorPin:'admin-test'});await click('Games & Challenges');await openReview();
 data.entries[0]={...data.entries[0],revision:2,photo_url:'rotated.webp'};await click('↻ Rotate 90°');expect(api.gamesRequest).toHaveBeenLastCalledWith('photo_rotate',{pin:'admin-test'},{id:'pending',revision:1,angle:90},undefined);expect(host.querySelector('img[alt="Submission for review"]').getAttribute('src')).toBe('rotated.webp');
 data.entries[0].state='approved';await click('Approve');expect(api.gamesRequest).toHaveBeenLastCalledWith('review',{pin:'admin-test'},expect.objectContaining({id:'pending',revision:2,state:'approved'}),undefined);await act(async()=>host.querySelector('.og-check input').click());expect(button('↻ Rotate 90°')).toBeUndefined();
});

test('hidden tabs pause Games refreshes and resume with current data',async()=>{
 jest.useFakeTimers();let visibility='visible';const original=Object.getOwnPropertyDescriptor(document,'visibilityState');
 Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>visibility});
 try{
  await render();api.gamesRequest.mockClear();visibility='hidden';
  await act(async()=>jest.advanceTimersByTime(60000));expect(api.gamesRequest).not.toHaveBeenCalled();
  visibility='visible';await act(async()=>jest.advanceTimersByTime(30000));
  expect(api.gamesRequest).toHaveBeenCalledWith('list',{token:'scoped-token'});
 }finally{if(original)Object.defineProperty(document,'visibilityState',original);else delete document.visibilityState;jest.useRealTimers();}
});
test('hidden tabs pause badge checks and focus refreshes when visible',async()=>{
 jest.useFakeTimers();let visibility='hidden';const original=Object.getOwnPropertyDescriptor(document,'visibilityState');
 Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>visibility});
 try{
  await act(async()=>root.render(<OctoberBadge location={location} employee={employee} managerPin="test-pin"/>));
  await act(async()=>jest.advanceTimersByTime(60000));expect(api.gamesRequest).not.toHaveBeenCalled();
  visibility='visible';await act(async()=>window.dispatchEvent(new Event('focus')));
  expect(api.gamesRequest).toHaveBeenCalledWith('badge',{token:'scoped-token'});
 }finally{if(original)Object.defineProperty(document,'visibilityState',original);else delete document.visibilityState;jest.useRealTimers();}
});
