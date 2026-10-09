import {remainingUnlocks} from './mysteryUnlocks';
const piece=[[0,0],[200,0],[0,200]];
test('covered pieces count down as credits are spent and revealed pieces lose their numbers',()=>{
 const round={pieces:[piece,piece,piece],piece_costs:[1,3,2],unlocked:1};
 expect(remainingUnlocks({...round,unlock_credits:1}).map(p=>p.remaining)).toEqual([0,3,2]);
 expect(remainingUnlocks({...round,unlock_credits:2}).map(p=>p.remaining)).toEqual([0,2,2]);
 expect(remainingUnlocks({...round,unlock_credits:3}).map(p=>p.remaining)).toEqual([0,1,2]);
 expect(remainingUnlocks({...round,unlocked:2,unlock_credits:4}).map(p=>p.remaining)).toEqual([0,0,2]);
 expect(remainingUnlocks({...round,unlocked:3,unlock_credits:6}).map(p=>p.remaining)).toEqual([0,0,0]);
});
