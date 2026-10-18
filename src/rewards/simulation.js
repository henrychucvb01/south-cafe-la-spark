// Supervisor-only, in-memory workflow rehearsal. Never connected to a points writer.
import {defaultSegments,eligibleSegments} from './model';
const copy=value=>JSON.parse(JSON.stringify(value));
const integer=(value,min=1)=>{if(!Number.isSafeInteger(value)||value<min)throw Error('Enter a positive whole number of points.');return value;};
export function createSimulation(catalog=[],now=Date.now()){
 const template=(id,type,name,config)=>({id,type,name,description:'Synthetic workflow example. No real points are spent.',config,active:true,status:'published',fulfillment:'not_started',icon:'🎁',...(type==='auction'?{opens_at:new Date(now-60000).toISOString(),closes_at:new Date(now+120000).toISOString()}:{} )});
 const defaults=[template('demo-fixed','fixed','Example Single-Claim Reward',{price:100}),template('demo-pool','pool','Example Community Reward',{goal:200,show_names:true}),template('demo-wheel','wheel','Example Pull Wheel',{goal:200,wheel_type:'pull',session_limit:10,segments:defaultSegments('pull')}),template('demo-auction','auction','Example Anonymous Auction',{starting_bid:100,reserve:300,increment:50,anti_sniping:true,trigger_minutes:2,extension_minutes:2})];
 return {now,schools:{a:{name:'Practice School A',balance:10000},b:{name:'Practice School B',balance:8000}},catalog:copy([...catalog,...defaults]),claims:{},contributions:[],bids:[],auctions:{},sessions:{},events:[],requests:{}};
}
export function available(state,school){return (state.schools[school]?.balance||0)-Object.values(state.auctions).filter(a=>!a.closed&&a.leader===school).reduce((sum,a)=>sum+a.highest,0);}
export function totalContributed(state,id){return state.contributions.filter(c=>c.reward_id===id&&!c.refunded).reduce((sum,c)=>sum+c.amount,0);}
export function simulationAction(state,action){
 const fingerprint=JSON.stringify({...action,request_id:undefined}),prior=state.requests[action.request_id];
 if(!action.request_id)throw Error('A request ID is required.');
 if(prior){if(prior!==fingerprint)throw Error('Request ID was reused with different details.');return state;}
 const next=copy(state),r=next.catalog.find(r=>r.id===action.reward_id),school=next.schools[action.school];
 if(!r)throw Error('Select a reward.');
 const event=(kind,extra={})=>next.events.push({kind,reward_id:r.id,school:action.school,at:next.now,...extra});
 const spend=amount=>{integer(amount);if(!school||available(next,action.school)<amount)throw Error('Insufficient available SPARK Points.');school.balance-=amount;};
 const usable=()=>{if(!r.active||r.status!=='published'||['canceled','fulfilled'].includes(r.fulfillment))throw Error('Reward is not active and published.');};
 if(action.kind==='claim'){
  usable();if(r.type!=='fixed')throw Error('Not a fixed reward.');if(next.claims[r.id])throw Error('Reward already claimed.');
  const cost=integer(Number(r.config.price));spend(cost);next.claims[r.id]={school:action.school,cost,at:next.now};r.fulfillment='in_progress';event('claimed',{amount:cost});
 }else if(action.kind==='contribute'){
  usable();if(!['pool','wheel'].includes(r.type))throw Error('Not a contribution reward.');const goal=integer(Number(r.config.goal)),amount=integer(action.amount),remaining=goal-totalContributed(next,r.id);
  if(remaining<=0)throw Error('Goal already reached.');if(amount>remaining)throw Error('Contribution exceeds the remaining goal.');spend(amount);next.contributions.push({reward_id:r.id,school:action.school,name:school.name,amount,at:next.now});event('contributed',{amount});if(amount===remaining){r.fulfillment='in_progress';event('goal_reached');}
 }else if(action.kind==='bid'){
  usable();if(r.type!=='auction')throw Error('Not an auction.');
  const a=next.auctions[r.id]||{highest:0,leader:null,closes:Date.parse(r.closes_at),closed:false,extended:false};
  if(!Number.isFinite(a.closes)||!Number.isFinite(Date.parse(r.opens_at))||next.now<Date.parse(r.opens_at)||next.now>=a.closes||a.closed)throw Error('Auction is not open.');
  const amount=integer(action.amount),minimum=a.highest?a.highest+integer(Number(r.config.increment)):integer(Number(r.config.starting_bid));
  if(amount<minimum)throw Error('Bid is below the minimum next bid.');const ownReservation=a.leader===action.school?a.highest:0;
  if(!school||amount>available(next,action.school)+ownReservation)throw Error('Insufficient available SPARK Points.');
  if(a.leader&&a.leader!==action.school)next.events.push({kind:'outbid',reward_id:r.id,school:a.leader,at:next.now});
  a.highest=amount;a.leader=action.school;
  if(r.config.anti_sniping!==false&&a.closes-next.now<=Number(r.config.trigger_minutes??2)*60000){a.closes+=Number(r.config.extension_minutes??2)*60000;a.extended=true;}
  next.auctions[r.id]=a;next.bids.push({reward_id:r.id,school:action.school,amount,at:next.now});event('bid_reserved',{amount});
 }else if(action.kind==='settle'){
  if(r.type!=='auction')throw Error('Not an auction.');const a=next.auctions[r.id]||{highest:0,leader:null,closes:Date.parse(r.closes_at)};if(!Number.isFinite(a.closes)||next.now<a.closes)throw Error('Auction is still open.');if(a.closed)throw Error('Auction already settled.');
  const reserve=integer(Number(r.config.reserve));a.closed=true;a.winner=a.leader&&a.highest>=reserve?a.leader:null;next.auctions[r.id]=a;
  if(a.winner){next.schools[a.winner].balance-=a.highest;r.fulfillment='in_progress';event('auction_won',{school:a.winner,amount:a.highest});}else event('auction_no_winner');
 }else if(action.kind==='start_session'){
  usable();if(r.type!=='wheel'||totalContributed(next,r.id)<integer(Number(r.config.goal)))throw Error('Wheel goal has not been reached.');if(next.sessions[r.id])throw Error('This goal already unlocked its session.');
  const segments=eligibleSegments(r.config);if(segments.length<2||segments.length>12)throw Error('Enable at least two approved segments.');
  next.sessions[r.id]={remaining:1,used:0,limit:integer(Number(r.config.session_limit)),segments:copy(segments),results:[],closed:false};event('session_started');
 }else if(action.kind==='spin'){
  const session=next.sessions[r.id];if(!session||session.closed||session.remaining<1||session.used>=session.limit)throw Error('No spins remain.');
  const selected=session.segments[action.index];if(!selected)throw Error('Invalid simulated outcome.');session.remaining--;session.used++;
  const extra=r.config.wheel_type==='pull'&&selected.outcome==='extra_spins'?integer(selected.value):0;
  session.remaining+=Math.min(extra,Math.max(0,session.limit-session.used-session.remaining));
  session.results.push({...copy(selected),at:next.now,follow_up:selected.outcome==='prize'||selected.outcome==='activity'||selected.outcome==='challenge'});event('session_spin',{label:selected.label});
 }else if(action.kind==='close_session'){
  const session=next.sessions[r.id];if(!session||session.closed)throw Error('No open session.');session.closed=true;session.remaining=0;event('session_closed');
 }else if(action.kind==='fulfill'){
  if(r.type==='fixed'&&!next.claims[r.id])throw Error('Reward has not been claimed.');if(['pool','wheel'].includes(r.type)&&totalContributed(next,r.id)<Number(r.config.goal))throw Error('Goal has not been reached.');if(r.type==='wheel'&&!next.sessions[r.id]?.closed)throw Error('Close the wheel session first.');if(r.type==='auction'&&!next.auctions[r.id]?.winner)throw Error('Auction has no settled winner.');r.fulfillment='fulfilled';event('fulfilled');
 }else if(action.kind==='cancel'){
  if(r.fulfillment==='fulfilled')throw Error('A fulfilled reward cannot be canceled.');if(next.auctions[r.id]?.closed)throw Error('Settled auctions require a separate refund review.');if(next.sessions[r.id]?.used)throw Error('Used wheel sessions require Supervisor refund review.');if(r.fulfillment==='canceled')throw Error('Already canceled.');
  const claim=next.claims[r.id];if(claim&&!claim.refunded){next.schools[claim.school].balance+=claim.cost;claim.refunded=true;}
  next.contributions.filter(c=>c.reward_id===r.id&&!c.refunded).forEach(c=>{next.schools[c.school].balance+=c.amount;c.refunded=true;});if(next.auctions[r.id])next.auctions[r.id].closed=true;r.fulfillment='canceled';r.active=false;event('canceled_refunded');
 }else throw Error('Unknown simulation action.');
 next.requests[action.request_id]=fingerprint;return next;
}
// Only explicitly allowed, public card fields leave the Supervisor simulation.
export function simulationCard(state,reward,school){const r=copy(reward),a=state.auctions[r.id],own=state.bids.filter(b=>b.reward_id===r.id&&b.school===school).at(-1);r.claimed=!!state.claims[r.id]&&!state.claims[r.id].refunded;r.contributed=totalContributed(state,r.id);if(r.config.show_names)r.contributions=state.contributions.filter(c=>c.reward_id===r.id&&!c.refunded).map(c=>({name:c.name,amount:c.amount}));if(r.type==='auction')r.auction={highest_bid:a?.highest||0,reserve_met:!!a&&a.highest>=Number(r.config.reserve),own_bid:own?.amount||0,leading:!!a&&!a.closed&&a.leader===school,extended:!!a?.extended,closes_at:a?new Date(a.closes).toISOString():r.closes_at,settled:!!a?.closed};delete r.config.reserve;return r;}
