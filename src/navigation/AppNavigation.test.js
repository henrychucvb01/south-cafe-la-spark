import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import App from '../App';
import {qrEnabled,managerEnabled,openSession,closeSession} from '../breakfast/service';

jest.mock('../supabaseClient',()=>({supabase:{rpc:jest.fn(async()=>({data:null,error:null}))}}));
jest.mock('../security/SecurityReadiness',()=>({__esModule:true,default:()=>null,useSecurityReady:()=>true}));
jest.mock('../breakfast/service',()=>({openSession:jest.fn(async()=> 'test-school-session'),closeSession:jest.fn(async()=>{}),managerEnabled:jest.fn(async()=>true),qrEnabled:jest.fn(async()=>true)}));

jest.mock('../pages/LoginPage',()=>props=><><button onClick={()=>props.onLocationSelected({id:1,school_name:'School'})}>Manager sign in</button><button onClick={props.onSupervisor}>Supervisor sign in</button></>);
jest.mock('../pages/EmployeeSelectPage',()=>props=><button onClick={()=>props.onEmployeeSelected({id:2,employee_name:'Manager'})}>Choose manager</button>);
jest.mock('../pages/ManagerPinPage',()=>props=><button onClick={()=>props.onSuccess('manager-session')}>Verify manager</button>);
jest.mock('../pages/SupervisorPinPage',()=>props=><button onClick={()=>props.onSuccess('supervisor-session')}>Verify supervisor</button>);
jest.mock('../pages/HomeBase',()=>props=><><h1>Manager Hub</h1><button onClick={props.onBreakfast}>Breakfast</button><button onClick={props.onManagerResources}>Resources</button><button onClick={props.onSchoolHub}>School</button></>);
jest.mock('../breakfast/BreakfastPage',()=>()=> <h1>Breakfast Accountability</h1>);
jest.mock('../breakfast/TeacherPage',()=>({__esModule:true,...jest.requireActual('../breakfast/TeacherPage'),default:()=> <h1>Teacher breakfast counter</h1>}));
jest.mock('../pages/ManagerResourcesPage',()=>props=><button onClick={props.onAskSpark}>Ask</button>);
jest.mock('../pages/AskSparkPage',()=>()=> <h1>Ask SPARK</h1>);
jest.mock('../pages/SchoolHub',()=>props=><button onClick={props.onMealAnalytics}>Analytics</button>);
jest.mock('../pages/CommandCenter',()=>props=><><h1>Supervisor root</h1><p>{props.supervisorPin}</p><button onClick={()=>props.onOpenSchoolAnalytics({id:1,school_name:'School'})}>School analytics</button><button onClick={props.onExit}>Exit Supervisor</button></>);
jest.mock('../pages/MealAnalyticsPage',()=>props=><><h1>School analytics page</h1><button onClick={props.onBack}>Header: {props.backLabel}</button></>);
jest.mock('../feedback/ManagerFeedback',()=>()=> <div data-testid="manager-feedback"/>);

let root, host;
beforeEach(async()=>{qrEnabled.mockResolvedValue(true);managerEnabled.mockResolvedValue(true);openSession.mockResolvedValue('test-school-session');closeSession.mockResolvedValue();window.history.replaceState(null,'',window.location.pathname);globalThis.IS_REACT_ACT_ENVIRONMENT=true;host=document.createElement('div');document.body.append(host);root=createRoot(host);await act(async()=>root.render(<App/>));});
afterEach(()=>{act(()=>root.unmount());host.remove();globalThis.IS_REACT_ACT_ENVIRONMENT=false;});
function click(text){const button=[...host.querySelectorAll('button')].find(b=>b.textContent===text);expect(button).toBeTruthy();act(()=>button.click());}
test('Supervisor school analytics returns to Command Center with its session, using either navigation control',()=>{
 click('Supervisor sign in');click('Verify supervisor');
 for(const label of ['← Command Center','Header: Command Center']){
   click('School analytics');expect(host.querySelector('[data-testid="manager-feedback"]')).toBeNull();click(label);
   expect(host.textContent).toContain('Supervisor root');expect(host.textContent).toContain('supervisor-session');expect(host.textContent).not.toContain('Verify supervisor');
 }
 click('Exit Supervisor');expect(host.textContent).toContain('Supervisor sign in');expect(host.querySelector('nav')).toBeNull();
});
test('Manager tools return through resources and school dashboard without selecting a location or PIN again',()=>{
 click('Manager sign in');click('Choose manager');click('Verify manager');click('Resources');click('Ask');click('← Manager Resources');expect(host.textContent).toContain('Resources');click('← Manager Hub');expect(host.textContent).toContain('Manager Hub');
 click('School');click('Analytics');click('← School Dashboard');expect(host.textContent).toContain('Analytics');click('← Manager Hub');expect(host.textContent).not.toContain('Verify manager');expect(host.textContent).not.toContain('Choose manager');
});

test('Breakfast uses the authenticated Manager Hub route and returns without signing in again',async()=>{
 click('Manager sign in');click('Choose manager');click('Verify manager');await act(async()=>click('Breakfast'));expect(host.textContent).toContain('Breakfast Accountability');click('← Manager Hub');expect(host.textContent).toContain('Manager Hub');expect(host.textContent).not.toContain('Verify manager');
});

test('classroom QR opens the teacher page without a Manager login or Manager navigation',async()=>{
 await act(async()=>{window.location.hash='breakfast/00000000-0000-4000-8000-000000000001';window.dispatchEvent(new Event('hashchange'));});
 expect(host.textContent).toContain('Teacher breakfast counter');expect(host.textContent).not.toContain('Manager sign in');expect(host.querySelector('nav')).toBeNull();
 act(()=>{window.location.hash='';window.dispatchEvent(new Event('hashchange'));});
 expect(host.textContent).toContain('Manager sign in');
});

test('disabled classroom QR remains unavailable without showing a login',async()=>{
 qrEnabled.mockResolvedValueOnce(false);
 await act(async()=>{window.location.hash='breakfast/00000000-0000-4000-8000-000000000002';window.dispatchEvent(new Event('hashchange'));});
 expect(host.textContent).toContain('not currently available');expect(host.textContent).not.toContain('Teacher breakfast counter');expect(host.textContent).not.toContain('Manager sign in');
 act(()=>{window.location.hash='';window.dispatchEvent(new Event('hashchange'));});
});
