import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import Bell,{NotificationSettings} from './SupervisorNotifications';
import {loadCounts,enablePush,disablePush} from './service';
jest.mock('./service',()=>({loadCounts:jest.fn(),enablePush:jest.fn(),disablePush:jest.fn(),updateBadge:jest.fn()}));
let root,host;
beforeEach(()=>{jest.useFakeTimers();global.IS_REACT_ACT_ENVIRONMENT=true;host=document.createElement('div');document.body.append(host);root=createRoot(host);loadCounts.mockReset().mockResolvedValue({quests:2,monitoring:3,feedback:1,total:6,version:1});});
afterEach(()=>{act(()=>root.unmount());host.remove();jest.useRealTimers();});
const click=async text=>act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent.includes(text)).click());
test('shows all counts, routes to existing reviews, and updates without refresh',async()=>{
 const navigate=jest.fn();await act(async()=>root.render(<Bell supervisorPin="session" onCategory={navigate}/>));
 expect(loadCounts).toHaveBeenCalledWith('session');expect(host.querySelector('.notification-badge').textContent).toBe('6');
 await act(async()=>host.querySelector('.notification-bell').click());
 for(const label of ['Photo Side Quests','Monitoring','Feedback'])expect(host.textContent).toContain(label);
 await click('Photo Side Quests');expect(navigate).toHaveBeenCalledWith('quests');
 loadCounts.mockResolvedValue({quests:1,monitoring:2,feedback:0,total:3,version:4});
 await act(async()=>window.dispatchEvent(new Event('supervisor-notifications-updated')));
 expect(host.querySelector('.notification-badge').textContent).toBe('3');
 loadCounts.mockResolvedValue({quests:0,monitoring:0,feedback:0,total:0,version:5});
 await act(async()=>jest.advanceTimersByTime(30000));expect(host.querySelector('.notification-badge')).toBeNull();
});
test('counts fail visibly instead of pretending nothing is pending',async()=>{
 loadCounts.mockRejectedValue(Error('offline'));await act(async()=>root.render(<Bell supervisorPin="session"/>));
 await act(async()=>host.querySelector('.notification-bell').click());expect(host.textContent).toContain('Counts unavailable');
});
test('notification permission is requested only from explicit settings action',async()=>{
 await act(async()=>root.render(<NotificationSettings supervisorPin="session"/>));expect(enablePush).not.toHaveBeenCalled();
 await click('Enable Notifications');expect(enablePush).toHaveBeenCalledWith('session');
 await click('Turn off');expect(disablePush).toHaveBeenCalled();expect(host.textContent).toContain('iOS 16.4');
});
