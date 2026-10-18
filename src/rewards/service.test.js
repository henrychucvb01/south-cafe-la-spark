import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {useRewardsAvailable} from './service';

function Probe({supervisor}){return <span>{String(useRewardsAvailable(supervisor))}</span>;}
test.each([[false,false],[true,true]])('Supervisor-only availability for supervisor=%s is %s',async(supervisor,expected)=>{
 global.IS_REACT_ACT_ENVIRONMENT=true;
 const original=global.fetch;
 global.fetch=jest.fn().mockResolvedValue({ok:true,json:async()=>({available:true,supervisor_only:true,manager_enabled:false})});
 const host=document.createElement('div'),root=createRoot(host);
 try{await act(async()=>{root.render(<Probe supervisor={supervisor}/>);});expect(host.textContent).toBe(String(expected));}
 finally{act(()=>root.unmount());global.fetch=original;}
});
