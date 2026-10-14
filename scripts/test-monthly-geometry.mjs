import assert from 'node:assert/strict';
import {makeMonthlyPieces,polygonArea,initialCosts,seededRandom} from '../lib/monthlyPuzzleGeometry.js';
for(let n=2;n<=48;n++)for(let attempt=0;attempt<25;attempt++){
 const pieces=makeMonthlyPieces(n);assert.equal(pieces.length,n);
 assert(Math.abs(pieces.reduce((a,p)=>a+polygonArea(p),0)-1e6)<.01);
 assert(pieces.every(p=>p.length>=3&&polygonArea(p)>0&&p.every(v=>v.every(x=>x>=-1e-7&&x<=1000.0000001))));
 // Each random probe belongs to exactly one cell (excluding boundary coincidences).
 for(let j=0;j<100;j++){const x=Math.random()*1000,y=Math.random()*1000;const inside=p=>{let hit=false;for(let a=0,b=p.length-1;a<p.length;b=a++){const [ax,ay]=p[a],[bx,by]=p[b];if((ay>y)!==(by>y)&&x<(bx-ax)*(y-ay)/(by-ay)+ax)hit=!hit;}return hit;};assert.equal(pieces.filter(inside).length,1);}
 for(let difficulty=1;difficulty<=3;difficulty++){const costs=initialCosts(pieces,difficulty);assert.equal(costs.length,n);assert(costs.every(c=>Number.isInteger(c)&&c>=1&&c<=[2,3,5][difficulty-1]));}
}
assert.notDeepEqual(makeMonthlyPieces(12),makeMonthlyPieces(12));
console.log('PASS: 1175 layouts, full coverage, 117,500 non-overlap probes, counts 2–48 and difficulty costs.');

assert.equal(seededRandom(1234)(),0.07329497812315822);
assert.throws(()=>makeMonthlyPieces(49),/2–48/);
