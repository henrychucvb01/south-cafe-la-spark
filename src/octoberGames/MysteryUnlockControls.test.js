import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import MysteryUnlockControls from './MysteryUnlockControls';

let host,root,data,run,confirm;
const round={id:3,unlocked:4,photo_url:'masked.webp'};
beforeEach(()=>{
  globalThis.IS_REACT_ACT_ENVIRONMENT=true;
  host=document.createElement('div');document.body.append(host);root=createRoot(host);
  data={identified:true,participating:true,settings:{mystery_state:'active'},unlock_shop:{balance:3,points:25,next_piece_cost:2}};
  run=jest.fn(async()=>true);confirm=jest.spyOn(window,'confirm').mockReturnValue(true);
  Object.defineProperty(window,'crypto',{configurable:true,value:{randomUUID:jest.fn(()=>`test-${Math.random()}`)}});
});
afterEach(()=>{act(()=>root.unmount());host.remove();confirm.mockRestore();globalThis.IS_REACT_ACT_ENVIRONMENT=false;});
const render=props=>act(()=>root.render(<MysteryUnlockControls data={data} round={round} preview={false} busy={false} run={run} {...props}/>));
const button=prefix=>[...host.querySelectorAll('button')].find(button=>button.textContent.startsWith(prefix));
const click=prefix=>act(async()=>button(prefix).click());

test('school balances, daily information and exact package prices are visible',()=>{
  render();expect(host.textContent).toContain('3 unlock credits');expect(host.textContent).toContain('25 SPARK Points');
  expect(host.textContent).toContain('1 free credit each school day');expect(host.textContent).toContain('automatically');
  expect(button('Buy 1').textContent).toContain('5 Points');expect(button('Buy 5').textContent).toContain('20 Points');
  expect(button('Reveal').textContent).toContain('2 credits');
});
test('confirmation is required and payload uses the server package rather than a school id',async()=>{
  render();confirm.mockReturnValue(false);await click('Buy 1');expect(run).not.toHaveBeenCalled();
  confirm.mockReturnValue(true);await click('Buy 1');expect(run).toHaveBeenLastCalledWith('buy_unlocks',{credits:1,expected_price:5,confirmed:true,request_id:expect.any(String)});
  await click('Buy 5');expect(run).toHaveBeenLastCalledWith('buy_unlocks',{credits:5,expected_price:20,confirmed:true,request_id:expect.any(String)});
});
test('failed purchases retry the same id and successful purchases allow a fresh id',async()=>{
  run.mockResolvedValueOnce(false);render();await click('Buy 1');const id=run.mock.calls[0][1].request_id;
  await click('Buy 1');expect(run.mock.calls[1][1].request_id).toBe(id);
  await click('Buy 1');expect(run.mock.calls[2][1].request_id).not.toBe(id);
});
test('double clicks during an unresolved purchase make only one request',async()=>{
  let resolve;run.mockImplementation(()=>new Promise(done=>{resolve=done;}));render();
  act(()=>{button('Buy 5').click();button('Buy 5').click();});expect(run).toHaveBeenCalledTimes(1);
  await act(async()=>resolve(true));
});
test('insufficient balances and unidentified managers disable spending',()=>{
  data.unlock_shop.points=4;data.unlock_shop.balance=1;render();expect(button('Buy 1').disabled).toBe(true);expect(button('Buy 5').disabled).toBe(true);expect(button('Reveal').disabled).toBe(true);
  data.identified=false;data.unlock_shop.points=100;render();expect(button('Buy 1').disabled).toBe(true);
});
test('reveals include the observed puzzle revision and piece cost',async()=>{
  render();await click('Reveal');expect(run).toHaveBeenCalledWith('reveal_piece',{round:3,expected_unlocked:4,expected_cost:2,request_id:expect.any(String)});
  data.settings.mystery_state='paused';render();expect(button('Reveal').disabled).toBe(true);
});
test('all-solved collection retains the balance and purchase controls',()=>{
  render({round:null});expect(button('Reveal')).toBeUndefined();expect(button('Buy 5').disabled).toBe(false);
});
