import assert from 'node:assert/strict';
import {generateChallenges,mondayDates,challengeLibrary} from '../src/sparkGames/challengeLibrary.mjs';
assert.equal(mondayDates('2026-11').length,5);assert.equal(mondayDates('2026-10').length,4);
const rows=generateChallenges('2026-11');assert.equal(rows.length,50);assert.equal(new Set(rows.map(q=>q.title)).size,50);assert.ok(rows.every(q=>q.description&&q.goal&&q.reward_points===10));
assert.equal(rows.filter(q=>q.monday==='2026-11-02').length,10);assert.equal(generateChallenges('2026-10').filter(q=>!q.monday).length,10);
assert.ok(!generateChallenges('2026-11',50,[rows[0].library_id,rows[1].title]).some(q=>q.library_id===rows[0].library_id||q.title===rows[1].title));
assert.notEqual(generateChallenges('2026-12')[0].title,generateChallenges('2026-04')[0].title);
assert.throws(()=>generateChallenges('2026-13'));assert.throws(()=>generateChallenges('2026-11',51));
assert.ok(challengeLibrary.length>=50);console.log('Challenge library: 50 unique prompts, seasonal priority, repeat avoidance, four/five Mondays passed.');
