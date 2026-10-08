// A jittered 4 × 4 grid split along random diagonals covers the entire image:
// exactly 32 triangles, with shared vertices and no gaps or overlaps.
export function makePieces(random = Math.random) {
 const grid=Array.from({length:5},(_,y)=>Array.from({length:5},(_,x)=>[
  (x===0||x===4?x:x+(random()-.5)*.3)*250,
  (y===0||y===4?y:y+(random()-.5)*.3)*250]));
 const pieces=[];
 for(let y=0;y<4;y++)for(let x=0;x<4;x++){
  const a=grid[y][x],b=grid[y][x+1],c=grid[y+1][x+1],d=grid[y+1][x];
  pieces.push(...(random()<.5?[[a,b,c],[a,c,d]]:[[a,b,d],[b,c,d]]));
 }
 for(let i=pieces.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[pieces[i],pieces[j]]=[pieces[j],pieces[i]];}
 return pieces;
}
export function maskSvg(pieces,unlocked,width,height){
 return Buffer.from(`<svg width="${width}" height="${height}" viewBox="0 0 1000 1000" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">${unlocked>=pieces.length?'<rect width="1000" height="1000" fill="white"/>':pieces.slice(0,unlocked).map(p=>`<polygon points="${p.map(v=>v.join(',')).join(' ')}" fill="white"/>`).join('')}</svg>`);
}
