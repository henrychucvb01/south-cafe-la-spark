import { rotatePoint, rotateAnnotations, validateRotations } from './pdfRotation';
test('quarter-turns preserve location comments and freehand drawings',()=>{
 const marks=[{type:'comment',page:2,x:.2,y:.3,text:'Signature'},{type:'draw',page:2,points:[[.1,.2],[.4,.6]]},{type:'comment',page:1,x:.7,y:.8,text:'Unchanged'}];
 const turned=rotateAnnotations(marks,{2:90});
 expect(turned[0]).toMatchObject({x:.7,y:.2});expect(turned[1].points).toEqual([[.8,.1],[.4,.4]]);expect(turned[2]).toEqual(marks[2]);
 for(const angle of [0,90,180,270]){const p=rotatePoint(rotatePoint([.2,.3],angle),-angle);expect(p[0]).toBeCloseTo(.2);expect(p[1]).toBeCloseTo(.3);}
 expect(marks[0].x).toBe(.2);
});
test('invalid rotation inputs are rejected',()=>{
 for(const value of [null,[],{'0':90},{'3':90},{'1':45},{'1':'90'},{'01':90}])expect(()=>validateRotations(value,2)).toThrow();
 expect(()=>validateRotations({1:270,2:0},2)).not.toThrow();
});
