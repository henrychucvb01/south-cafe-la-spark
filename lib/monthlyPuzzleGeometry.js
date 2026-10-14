// Bounded Voronoi cells partition the photograph. Shared clipped edges cover it exactly.
export function polygonArea(p){return Math.abs(p.reduce((n,a,i)=>{const b=p[(i+1)%p.length];return n+a[0]*b[1]-b[0]*a[1];},0)/2);}
export function makeMonthlyPieces(count,random=Math.random){
 if(!Number.isInteger(count)||count<2||count>29)throw Error('Choose 2–29 pieces.');
 const cols=Math.ceil(Math.sqrt(count)),rows=Math.ceil(count/cols),seeds=Array.from({length:count},(_,i)=>[(i%cols+.2+random()*.6)*1000/cols,(Math.floor(i/cols)+.2+random()*.6)*1000/rows]);
 return seeds.map((a,i)=>{let cell=[[0,0],[1000,0],[1000,1000],[0,1000]];for(let j=0;j<seeds.length;j++){if(i===j)continue;const b=seeds[j],nx=b[0]-a[0],ny=b[1]-a[1],limit=(b[0]**2+b[1]**2-a[0]**2-a[1]**2)/2,out=[];for(let k=0;k<cell.length;k++){const p=cell[k],q=cell[(k+1)%cell.length],dp=nx*p[0]+ny*p[1]-limit,dq=nx*q[0]+ny*q[1]-limit;if(dp<=1e-8)out.push(p);if((dp<0&&dq>0)||(dp>0&&dq<0)){const t=dp/(dp-dq);out.push([p[0]+t*(q[0]-p[0]),p[1]+t*(q[1]-p[1])]);}}cell=out;}return cell.map(p=>p.map(x=>Math.round(x*1e7)/1e7));});
}
export function initialCosts(pieces,difficulty){const max=[2,3,5][Number(difficulty)-1];if(!max)throw Error('Choose a difficulty.');const areas=pieces.map(polygonArea),largest=Math.max(...areas);return areas.map(area=>Math.max(1,Math.min(max,Math.ceil(area/largest*max))));}
