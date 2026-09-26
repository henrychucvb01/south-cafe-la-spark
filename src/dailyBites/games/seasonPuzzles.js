import { WORD_GAME_PUZZLES, SPARK_SORT_PUZZLES } from '../../data/dailyBitesGames';
import { WORD_SEASON_PUZZLES } from '../../data/dailyBitesSeason2026';
import { SPARK_SORT_SEASON_PUZZLES } from '../../data/sparkSortSeason2026';
import { selectDailyPuzzle, seededShuffle } from './gameUtils';

export const SEASON_PUZZLE_START = '2026-09-28';
export const SEASON_PUZZLE_END = '2027-06-04';
// A frozen seed and date offset keep every school's puzzle stable on refresh.
const words=seededShuffle(WORD_SEASON_PUZZLES,'spark-word-school-year-2026-v1');
export function selectSeasonPuzzle(gameType,dateString) {
  const target=new Date(`${dateString}T12:00:00Z`);
  while(target.getUTCDay()===0||target.getUTCDay()===6)target.setUTCDate(target.getUTCDate()-1);
  dateString=target.toISOString().slice(0,10);
  const legacy=gameType==='word'?WORD_GAME_PUZZLES:SPARK_SORT_PUZZLES;
  if(dateString<SEASON_PUZZLE_START||dateString>SEASON_PUZZLE_END)return selectDailyPuzzle(legacy,gameType,dateString);
  let index=-1;
  for(const date=new Date(`${SEASON_PUZZLE_START}T12:00:00Z`);date.toISOString().slice(0,10)<=dateString;date.setUTCDate(date.getUTCDate()+1)) {
    if(date.getUTCDay()>0&&date.getUTCDay()<6)index++;
  }
  const puzzle=(gameType==='word'?words:SPARK_SORT_SEASON_PUZZLES)[index];
  if(!puzzle)throw new Error('The school-year puzzle schedule is incomplete.');
  return {...puzzle,puzzleId:`${gameType}-${dateString}-${puzzle.id}`};
}
