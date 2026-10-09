// Credits are spent in the same piece order as the server's reveal calculation.
export function remainingUnlocks(round) {
 let credits=Math.max(0,Number(round.unlock_credits)||0);
 return (round.pieces||[]).map((piece,index)=>{
  const cost=Number(round.piece_costs?.[index])||1;
  const used=Math.min(cost,credits);credits-=used;
  return {piece,remaining:index<(round.unlocked||0)?0:cost-used,
   x:piece.reduce((sum,p)=>sum+p[0],0)/piece.length,
   y:piece.reduce((sum,p)=>sum+p[1],0)/piece.length};
 });
}
