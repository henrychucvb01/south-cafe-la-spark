import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import App from '../App';

jest.mock('../pages/LoginPage',()=>props=><><button onClick={()=>props.onLocationSelected({id:1,school_name:'School'})}>Manager sign in</button><button onClick={props.onSupervisor}>Supervisor sign in</button></>);
jest.mock('../pages/EmployeeSelectPage',()=>props=><button onClick={()=>props.onEmployeeSelected({id:2,employee_name:'Manager'})}>Choose manager</button>);
jest.mock('../pages/ManagerPinPage',()=>props=><button onClick={()=>props.onSuccess('manager-session')}>Verify manager</button>);
jest.mock('../pages/SupervisorPinPage',()=>props=><button onClick={()=>props.onSuccess('supervisor-session')}>Verify supervisor</button>);
jest.mock('../pages/HomeBase',()=>props=><><h1>Manager Hub</h1><button onClick={props.onManagerResources}>Resources</button><button onClick={props.onSchoolHub}>School</button></>);
jest.mock('../pages/ManagerResourcesPage',()=>props=><button onClick={props.onAskSpark}>Ask</button>);
jest.mock('../pages/AskSparkPage',()=>()=> <h1>Ask SPARK</h1>);
jest.mock('../pages/SchoolHub',()=>props=><button onClick={props.onMealAnalytics}>Analytics</button>);
jest.mock('../pages/CommandCenter',()=>props=><><h1>Supervisor root</h1><p>{props.supervisorPin}</p><button onClick={()=>props.onOpenSchoolAnalytics({id:1,school_name:'School'})}>School analytics</button><button onClick={props.onExit}>Exit Supervisor</button></>);
jest.mock('../pages/MealAnalyticsPage',()=>props=><><h1>School analytics page</h1><button onClick={props.onBack}>Header: {props.backLabel}</button></>);
jest.mock('../feedback/ManagerFeedback',()=>()=> <div data-testid="manager-feedback"/>);

let root, host;
beforeEach(()=>{globalThis.IS_REACT_ACT_ENVIRONMENT=true;host=document.createElement('div');document.body.append(host);root=createRoot(host);act(()=>root.render(<App/>));});
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
