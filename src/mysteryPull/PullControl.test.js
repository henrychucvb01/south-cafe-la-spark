import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import PullControl from './PullControl';
let host,root;
beforeEach(()=>{globalThis.IS_REACT_ACT_ENVIRONMENT=true;host=document.createElement('div');document.body.appendChild(host);root=createRoot(host);});
afterEach(()=>{act(()=>root.unmount());host.remove();});
function pointer(el,type,y){const e=new Event(type,{bubbles:true});Object.defineProperties(e,{clientY:{value:y},pointerId:{value:1},button:{value:0}});act(()=>el.dispatchEvent(e));}
test('a partial slide never pulls; only reaching the bottom and releasing does',()=>{
 const onPull=jest.fn();act(()=>root.render(<PullControl onPull={onPull}/>));const slider=host.querySelector('[role=slider]');slider.setPointerCapture=()=>{};slider.getBoundingClientRect=()=>({top:0,height:300});
 pointer(slider,'pointerdown',20);pointer(slider,'pointermove',120);pointer(slider,'pointerup',120);expect(onPull).not.toHaveBeenCalled();
 pointer(slider,'pointerdown',20);pointer(slider,'pointermove',244);expect(onPull).not.toHaveBeenCalled();pointer(slider,'pointerup',244);expect(onPull).toHaveBeenCalledTimes(1);
});
test('bottom taps and cancelled drags never pull',()=>{
 const onPull=jest.fn();act(()=>root.render(<PullControl onPull={onPull}/>));const slider=host.querySelector('[role=slider]');slider.setPointerCapture=()=>{};slider.getBoundingClientRect=()=>({top:0,height:300});
 pointer(slider,'pointerdown',290);pointer(slider,'pointerup',290);expect(onPull).not.toHaveBeenCalled();pointer(slider,'pointerdown',20);pointer(slider,'pointermove',300);pointer(slider,'pointercancel',300);pointer(slider,'pointerup',300);expect(onPull).not.toHaveBeenCalled();
});
test('keyboard access completes a pull and disabled control never activates',()=>{
 const onPull=jest.fn();act(()=>root.render(<PullControl onPull={onPull}/>));const slider=host.querySelector('[role=slider]');act(()=>slider.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true})));expect(onPull).not.toHaveBeenCalled();act(()=>slider.dispatchEvent(new KeyboardEvent('keydown',{key:'End',bubbles:true})));expect(onPull).toHaveBeenCalledTimes(1);
 act(()=>root.render(<PullControl onPull={onPull} disabled/>));act(()=>slider.dispatchEvent(new KeyboardEvent('keydown',{key:'End',bubbles:true})));expect(onPull).toHaveBeenCalledTimes(1);expect(host.querySelector('button')).toBeNull();
});
