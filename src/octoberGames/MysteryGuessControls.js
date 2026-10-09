import React,{useRef,useState} from 'react';

export default function MysteryGuessControls({data,round,preview,busy,run}){
 const [guess,setGuess]=useState(''),[prize,setPrize]=useState(null);
 const requests=useRef({});
 const shop=data.guess_shop;
 const ready=preview||(data.identified&&data.participating&&data.settings.mystery_state==='active'&&!!round.photo_url&&!!shop);
 const canGuess=ready&&(preview||(!shop.used_today&&(shop.free_available||shop.available>0||prize)));
 const price=shop?.next_price;
 function request(action,payload){
  const key=JSON.stringify(payload);
  if(requests.current[action]?.key!==key)requests.current[action]={key,id:crypto.randomUUID()};
  return {...payload,request_id:requests.current[action].id};
 }
 async function buy(){
  if(!ready||!price||busy)return;
  if(!window.confirm(`Spend ${price} SPARK Points from your school's season total for one extra guess? It becomes available tomorrow. Only one guess per school per day. Unused guesses are refunded when this photo is solved.`))return;
  if(await run('buy_guess',request('buy_guess',{round:round.id,expected_price:price,confirmed:true})))delete requests.current.buy_guess;
 }
 return <div className="og-mystery-controls">
  <form className="og-guess" onSubmit={async e=>{
   e.preventDefault();if(!canGuess||busy||!guess.trim())return;
   if(!window.confirm(prize?'Use one Extra Mystery Guess prize and submit your school’s guess for today?':'Submit your school’s guess for today?'))return;
   if(await run('guess',request('guess',{round:round.id,guess,...(prize?{extra_guess_win:prize}:{})}))){setGuess('');setPrize(null);delete requests.current.guess;}
  }}>
   <label>{preview?'Preview your guess':prize?'Your extra prize guess':'Your school’s guess'}<input maxLength={120} required disabled={!canGuess||busy} value={guess} onChange={e=>setGuess(e.target.value)}/></label>
   <div className="og-actions"><button disabled={!canGuess||busy}>{prize?'Use prize & submit guess':'Submit guess'}</button>
    <button type="button" disabled={!ready||busy||!price||(!preview&&shop.balance<price)} onClick={buy}>Extra guess{price?` · ${price} SPARK Points`:''}</button></div>
  </form>
  {shop&&<p className="og-guess-summary">Season balance: <strong>{shop.balance.toLocaleString()} SPARK Points</strong>{shop.available>0&&` · ${shop.available} extra ${shop.available===1?'guess':'guesses'} ready`}{shop.tomorrow>0&&` · ${shop.tomorrow} available tomorrow`}</p>}
  {!preview&&shop?.used_today&&<p>Your school’s guess is saved for today. Guess again tomorrow with an available extra guess.</p>}
  {!preview&&shop&&!shop.used_today&&!shop.free_available&&!shop.available&&!prize&&<p>Your school has used its free guess for this photo. Purchased guesses become available tomorrow.</p>}
  {!preview&&ready&&!shop.free_available&&!shop.used_today&&data.extra_guess_prizes?.length>0&&<div className="og-actions">{prize?<button disabled={busy} onClick={()=>setPrize(null)}>Keep prize</button>:<button disabled={busy} onClick={()=>setPrize(data.extra_guess_prizes[0].id)}>Use extra guess prize ({data.extra_guess_prizes.length} available)</button>}</div>}
  {!ready&&<p>Guessing opens when your school is participating and this mystery is active with its photo ready.</p>}
  <small>One guess per school per day (Los Angeles time). Purchases unlock tomorrow; unused purchases are refunded when this photo is solved. Prices reset for each photo.</small>
 </div>;
}
