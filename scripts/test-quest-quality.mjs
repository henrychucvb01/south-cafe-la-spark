import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {generateChallenges} from '../src/sparkGames/challengeLibrary.mjs';
import {categoryOf,conceptOf,improvePrompt} from '../src/sparkGames/creativePrompts.mjs';
const examples=JSON.parse(await readFile('src/sparkGames/approvedQuestReferences.json','utf8'));
assert.equal(examples.length,10);
const before=JSON.stringify(examples),sample=generateChallenges('2026-10',20,[],{history:examples,examples});
assert.equal(sample.length,20);assert.equal(new Set(sample.map(q=>q.title)).size,20);assert.equal(new Set(sample.map(conceptOf)).size,20);
assert(new Set(sample.map(q=>q.category)).size>=10);
for(const q of sample){assert(q.title.length<=100&&q.description.length<=1000&&q.goal.length<=300);assert.equal((q.description.match(/[.!?](?:\s|$)/g)||[]).length,2);assert(q.description.length>90);assert(!examples.some(e=>conceptOf(e)===conceptOf(q)));}
for(let n=1;n<=12;n++){const month='2027-'+String(n).padStart(2,'0'),batch=generateChallenges(month,50);assert.equal(batch.length,50);assert(batch.some(q=>q.month===n));assert(batch.every(q=>!q.month||q.month===n));}
const original={id:'keep-id',title:'Serving Area Welcome',description:'Take a photo of your serving area.',goal:'Welcome students.',reward_points:75,monday:'2027-11-01',state:'approved',revision:8};
const improved=improvePrompt(original);assert(improved.description.includes('welcoming display'));assert.equal(improved.title,original.title);assert.equal(improved.reward_points,75);assert.equal(improved.monday,original.monday);assert.equal(original.description,'Take a photo of your serving area.');
const custom={...original,title:'My special school idea',description:'Celebrate our school library with a reusable display.',goal:'Make reading inviting.'};assert(improvePrompt(custom).description.includes(custom.description));assert.equal(improvePrompt(custom).title,custom.title);
for(const row of sample){const other=generateChallenges('2026-10',1,[],{history:[...sample,...examples],avoidCategory:categoryOf(row),examples})[0];assert(other);assert.notEqual(other.category,row.category);assert.notEqual(other.concept,row.concept);}
assert.equal(generateChallenges('2026-10',50,[],{history:sample}).some(q=>sample.some(r=>r.title===q.title)),false);
const included=generateChallenges('2027-03',10,[],{examples:[{title:'Team Thank You'}]}),excluded=generateChallenges('2027-03',10,[],{examples:[{title:'Team Thank You',example_excluded:true}]});assert.notDeepEqual(included.map(q=>q.category),excluded.map(q=>q.category));
assert.equal(JSON.stringify(examples),before);
console.log('PASS approved style references, 20 distinct concepts across '+new Set(sample.map(q=>q.category)).size+' categories, monthly themes, category-changing alternatives, concept-preserving improvements, exclusions, no mutations or publishing.');
export {sample};
