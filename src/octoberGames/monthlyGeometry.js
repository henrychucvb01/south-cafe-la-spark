// Bounded Voronoi cells partition the photograph. Shared clipped edges cover it exactly.
export function polygonArea(p){return Math.abs(p.reduce((n,a,i)=>{const b=p[(i+1)%p.length];return n+a[0]*b[1]-b[0]*a[1];},0)/2);}
function voronoiPieces(count,random){
 if(!Number.isInteger(count)||count<2||count>48)throw Error('Choose 2–48 pieces.');
 const cols=Math.ceil(Math.sqrt(count)),rows=Math.ceil(count/cols),seeds=Array.from({length:count},(_,i)=>[(i%cols+.2+random()*.6)*1000/cols,(Math.floor(i/cols)+.2+random()*.6)*1000/rows]);
 return seeds.map((a,i)=>{let cell=[[0,0],[1000,0],[1000,1000],[0,1000]];for(let j=0;j<seeds.length;j++){if(i===j)continue;const b=seeds[j],nx=b[0]-a[0],ny=b[1]-a[1],limit=(b[0]**2+b[1]**2-a[0]**2-a[1]**2)/2,out=[];for(let k=0;k<cell.length;k++){const p=cell[k],q=cell[(k+1)%cell.length],dp=nx*p[0]+ny*p[1]-limit,dq=nx*q[0]+ny*q[1]-limit;if(dp<=1e-8)out.push(p);if((dp<0&&dq>0)||(dp>0&&dq<0)){const t=dp/(dp-dq);out.push([p[0]+t*(q[0]-p[0]),p[1]+t*(q[1]-p[1])]);}}cell=out;}return cell.map(p=>p.map(x=>Math.round(x*1e7)/1e7));});
}
export function initialCosts(pieces,difficulty){const max=[2,3,5][Number(difficulty)-1];if(!max)throw Error('Choose a difficulty.');const areas=pieces.map(polygonArea),largest=Math.max(...areas);return areas.map(area=>Math.max(1,Math.min(max,Math.ceil(area/largest*max))));}

// Deterministic layout: the server regenerates the exact supervisor preview.
export function seededRandom(seed){let n=Number(seed)>>>0;return ()=>{n+=0x6D2B79F5;let t=n;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};}
export function makeMonthlyPieces(count,random=Math.random){
 const cells=voronoiPieces(count,random),edges=new Map();
 const key=p=>p.map(x=>x.toFixed(5)).join(',');
 const centers=cells.map(p=>[p.reduce((n,v)=>n+v[0],0)/p.length,p.reduce((n,v)=>n+v[1],0)/p.length]);
 cells.forEach((cell,i)=>cell.forEach((a,j)=>{const b=cell[(j+1)%cell.length],ka=key(a),kb=key(b),id=[ka,kb].sort().join('|');if(!edges.has(id))edges.set(id,{a,b,owner:i,neighbors:[],ka});edges.get(id).neighbors.push(i);}));
 // Bend each shared edge inside one adjacent cell's centroid triangle.
 // Those triangles have disjoint interiors, so bends cannot intersect each other.
 for(const edge of edges.values()){
  const {a,b}=edge;edge.path=[a,b];if(edge.neighbors.length!==2||random()<.2)continue;
  const center=centers[edge.neighbors[Math.floor(random()*2)]],mid=[(a[0]+b[0])/2,(a[1]+b[1])/2],style=Math.floor(random()*3),depth=.25+random()*.35;
  edge.path=Array.from({length:17},(_,k)=>{const t=k/16,envelope=2*Math.min(t,1-t);const wave=style===0?Math.sin(Math.PI*t):style===1?(k%4===2?1:.15):Math.sin(Math.PI*t)**2;const f=depth*envelope*wave;return [a[0]+(b[0]-a[0])*t+(center[0]-mid[0])*f,a[1]+(b[1]-a[1])*t+(center[1]-mid[1])*f];});
 }
 return cells.map(cell=>cell.flatMap((a,j)=>{const b=cell[(j+1)%cell.length],e=edges.get([key(a),key(b)].sort().join('|'));const points=key(a)===e.ka?e.path:[...e.path].reverse();return points.slice(0,-1);}));
}
