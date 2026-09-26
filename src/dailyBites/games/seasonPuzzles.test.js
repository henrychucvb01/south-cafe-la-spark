import { selectSeasonPuzzle, SEASON_PUZZLE_START, SEASON_PUZZLE_END } from './seasonPuzzles';
import { WORD_SEASON_PUZZLES } from '../../data/dailyBitesSeason2026';
import { WORD_GAME_PUZZLES, SPARK_SORT_PUZZLES } from '../../data/dailyBitesGames';
import { isValidWordGuess } from '../../data/validWordGuesses';
import { selectDailyPuzzle } from './gameUtils';
const dates=[];
for(const d=new Date(`${SEASON_PUZZLE_START}T12:00:00Z`);d.toISOString().slice(0,10)<=SEASON_PUZZLE_END;d.setUTCDate(d.getUTCDate()+1))if(d.getUTCDay()>0&&d.getUTCDay()<6)dates.push(d.toISOString().slice(0,10));
test('all 180 weekdays through June 4 have distinct valid five-letter answers',()=>{
 expect(dates).toHaveLength(180);expect(dates.at(-1)).toBe('2027-06-04');
 const puzzles=dates.map(d=>selectSeasonPuzzle('word',d));
 expect(new Set(puzzles.map(p=>p.answer)).size).toBe(180);
 expect(new Set(WORD_SEASON_PUZZLES.map(p=>p.answer)).size).toBe(WORD_SEASON_PUZZLES.length);
 for(const p of WORD_SEASON_PUZZLES){expect(p.answer).toMatch(/^[A-Z]{5}$/);expect(isValidWordGuess(p.answer)).toBe(true);expect(p.hint.trim().length).toBeGreaterThan(0);}
});
test('all 180 Sort boards have distinct content, sixteen distinct items and clear ratings',()=>{
 const boards=dates.map(d=>selectSeasonPuzzle('spark-sort',d));
 const content=p=>p.groups.map(g=>g.items.slice().sort().join('|')).sort().join(';');
 expect(new Set(boards.map(content)).size).toBe(180);
 expect(new Set(boards.map(p=>p.id)).size).toBe(180);
 for(const p of boards){expect(['easy','medium','hard']).toContain(p.difficulty);expect(p.groups).toHaveLength(4);expect(new Set(p.groups.flatMap(g=>g.items.map(w=>w.toLowerCase()))).size).toBe(16);for(const g of p.groups)expect(g.items).toHaveLength(4);}
 for(let i=0;i<boards.length;i+=5){const levels=boards.slice(i,i+5).map(p=>p.difficulty);expect(levels).toContain('easy');expect(levels).toContain('hard');}
});
test('refreshes and weekends keep the same puzzle; old progress IDs remain stable',()=>{
 for(const type of ['word','spark-sort']){
  expect(selectSeasonPuzzle(type,'2026-10-02')).toEqual(selectSeasonPuzzle(type,'2026-10-03'));
  expect(selectSeasonPuzzle(type,'2027-06-04')).toEqual(selectSeasonPuzzle(type,'2027-06-06'));
  expect(selectSeasonPuzzle(type,'2026-09-25')).toEqual(selectDailyPuzzle(type==='word'?WORD_GAME_PUZZLES:SPARK_SORT_PUZZLES,type,'2026-09-25'));
  expect(selectSeasonPuzzle(type,'2027-06-04')).toEqual(selectSeasonPuzzle(type,'2027-06-04'));
 }
});
