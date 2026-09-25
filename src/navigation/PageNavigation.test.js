import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import PageNavigationProvider, { usePageNavigation } from './PageNavigation';

function Page(props) { usePageNavigation(props); return null; }
let root, container;
beforeEach(() => { globalThis.IS_REACT_ACT_ENVIRONMENT = true; container=document.createElement('div');document.body.append(container);root=createRoot(container); });
afterEach(() => { act(()=>root.unmount());container.remove();globalThis.IS_REACT_ACT_ENVIRONMENT=false; });
const back = () => container.querySelector('nav button');
test('nested destinations restore parents without using browser history',()=>{
 const hub=jest.fn(),monitoring=jest.fn(),updated=jest.fn(),history=jest.spyOn(window.history,'back');
 const render=(nested,fn=monitoring,disabled=false)=>act(()=>root.render(<PageNavigationProvider><Page level={0} title="Monitoring" destination="Manager Hub" onNavigate={hub}/>{nested&&<Page level={2} title="Supper 3" destination="Monitoring" onNavigate={fn} disabled={disabled}/>}</PageNavigationProvider>));
 render(true);expect(back().textContent).toBe('← Monitoring');act(()=>back().click());expect(monitoring).toHaveBeenCalledTimes(1);expect(hub).not.toHaveBeenCalled();
 render(true,updated,true);act(()=>back().click());expect(updated).not.toHaveBeenCalled();
 render(true,updated);act(()=>back().click());expect(updated).toHaveBeenCalledTimes(1);
 render(false);expect(back().textContent).toBe('← Manager Hub');act(()=>back().click());expect(hub).toHaveBeenCalledTimes(1);expect(history).not.toHaveBeenCalled();history.mockRestore();
});
test('navigation roots omit Back and retain a separate Back to Top action',()=>{
 const scroll=jest.spyOn(window,'scrollTo').mockImplementation(()=>{});
 act(()=>root.render(<PageNavigationProvider><Page level={0} title="Command Center"/></PageNavigationProvider>));
 expect(container.querySelectorAll('nav button')).toHaveLength(1);act(()=>back().click());expect(scroll).toHaveBeenCalledWith({top:0,behavior:'auto'});scroll.mockRestore();
 act(()=>root.render(<PageNavigationProvider><Page active={false} title="Sign in"/></PageNavigationProvider>));expect(container.querySelector('nav')).toBeNull();
});
