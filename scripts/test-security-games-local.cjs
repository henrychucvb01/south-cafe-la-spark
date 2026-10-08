const assert=require('node:assert/strict');
const {sql,request,rpc}=require('./test-security-auth-local.cjs');
async function main(){
  const token=await rpc('spark_login',{p_role:'employee',p_employee_id:900001,p_pin:'3141'});
  assert.ok(token);
  sql("delete from spark_private.game_requests where location_id=900002; delete from daily_bites_game_progress where location_id=900002; delete from spark_points where location_id=900002 and point_type in('daily_bites_word_game','daily_bites_spark_sort','ar_training'); delete from ar_training_daily_progress where location_id=900002; delete from ar_training_location_cycles where location_id=900002;");
  const puzzles=JSON.parse(sql("select json_agg(puzzle) from spark_private.game_puzzles where service_date=(select max(service_date) from spark_private.game_puzzles where service_date<=(now() at time zone 'America/Los_Angeles')::date)"));
  const word=puzzles.find(p=>p.answer);const sort=puzzles.find(p=>p.groups);assert.ok(word&&sort);
  const payload=(p,action,input,state)=>({p_location_id:900002,p_puzzle_id:p.puzzleId,p_action:action,p_input:input,p_expected_state:state});
  const wrong=sql("select word from spark_private.word_guesses where word<> '"+word.answer+"' order by word limit 1");
  assert.ok((await request('/rpc/spark_game_action',payload(word,'guess',{guess:word.answer},{}))).status>=400,'Anonymous game completion denied');
  let r=await request('/rpc/spark_game_action',payload(word,'guess',{guess:wrong},{}),token);assert.equal(r.status,200,JSON.stringify(r));
  assert.equal(r.data.status,'in_progress');assert.equal(r.data.attempt_count,1);
  assert.ok((await request('/rpc/spark_game_action',payload(word,'guess',{guess:word.answer},{}),token)).status>=400,'Cannot erase a previous failed guess');
  const winning=payload(word,'guess',{guess:word.answer},r.data.state);
  for(const result of await Promise.all(Array.from({length:8},()=>request('/rpc/spark_game_action',winning,token)))){assert.equal(result.status,200,JSON.stringify(result));assert.equal(result.data.status,'won');}
  assert.equal(sql("select count(*)||':'||sum(points) from spark_points where location_id=900002 and point_type='daily_bites_word_game'"),'1:4','Word reward uses the two recorded guesses, exactly once');
  let state={};
  r=await request('/rpc/spark_game_action',payload(sort,'hint',{},state),token);assert.equal(r.status,200,JSON.stringify(r));state=r.data.state;
  assert.equal(state.hintsUsed,1);
  for(const group of sort.groups){r=await request('/rpc/spark_game_action',payload(sort,'group',{items:group.items},state),token);assert.equal(r.status,200,JSON.stringify(r));state=r.data.state;}
  assert.equal(r.data.status,'won');
  assert.equal(sql("select count(*)||':'||sum(points) from spark_points where location_id=900002 and point_type='daily_bites_spark_sort'"),'1:4','Hint deduction is calculated by server');
  assert.ok((await request('/rpc/spark_game_action',payload(sort,'hint',{},state),token)).status>=400,'Finished game is locked');
  sql(`INSERT INTO ar_training_questions(id,bank_order,question_type,category,prompt,choices,correct_index,explanation,source_title,source_locator,source_chunk_id)
  SELECT 'synthetic-'||n,n,'multiple_choice','Synthetic','Synthetic test question','["A","B","C","D"]',0,'Synthetic explanation','Synthetic source','test','test' FROM generate_series(1,4)n ON CONFLICT(id) DO NOTHING;
  INSERT INTO ar_training_question_keys(question_id,correct_index,approved_source_chunk_id) SELECT 'synthetic-'||n,0,'test' FROM generate_series(1,4)n ON CONFLICT(question_id) DO NOTHING;`);
  const date=sql("select (now() at time zone 'America/Los_Angeles')::date");
  const answer={p_location_id:900002,p_employee_id:123,p_employee_name:'Forged name',p_service_date:date,p_question_id:'synthetic-1',p_selected_index:0};
  assert.ok((await request('/rpc/submit_ar_training_answer',answer)).status>=400,'Anonymous AR answer denied');
  for(let n=1;n<=4;n++){r=await request('/rpc/submit_ar_training_answer',{...answer,p_question_id:'synthetic-'+n},token);assert.equal(r.status,200,JSON.stringify(r));}
  assert.equal(sql("select sum(points) from spark_points where location_id=900002 and point_type='ar_training'"),'5','AR daily cap preserved');
  r=await request('/rpc/submit_ar_training_answer',answer,token);assert.equal(r.status,200);
  assert.equal(sql("select sum(points) from spark_points where location_id=900002 and point_type='ar_training'"),'5','Repeated answer cannot duplicate reward');
  assert.equal(sql("select distinct employee_name from ar_training_attempts where location_id=900002"),'Synthetic Manager','AR derives verified actor');
  console.log('PASS: server validates Word guesses and Sort groups; mistakes/hints determine fixed rewards; concurrent game retries are idempotent; completed games lock; unauthorized AR denied; five-point AR cap and actor attribution preserved.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
