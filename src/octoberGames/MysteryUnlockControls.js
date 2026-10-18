import React, {useRef} from 'react';

export default function MysteryUnlockControls({data, round, preview, busy, run, selectedPiece}) {
  const requests = useRef({});
  const inFlight = useRef(false);
  const shop = data.unlock_shop;
  if (!shop) return null;
  const singlePrice=shop.single_price??5,bundlePrice=shop.bundle_price??20;
  const ready = preview || (data.identified && data.participating);
  const selectable = Array.isArray(round?.revealed_indices);
  const selectionValid = Number.isInteger(selectedPiece) && selectedPiece>=0 && selectedPiece<(round?.pieces?.length||0) && !round.revealed_indices?.includes(selectedPiece);
  const cost = selectable ? (selectionValid ? round.piece_costs[selectedPiece] : null) : shop.next_piece_cost;
  const canReveal = ready && round && data.settings.mystery_state === 'active' && round.photo_url && cost > 0 && (preview || shop.balance >= cost);

  async function submit(action, payload) {
    if (busy || inFlight.current) return;
    const key = JSON.stringify(payload);
    if (requests.current[action]?.key !== key) requests.current[action] = {key, id: crypto.randomUUID()};
    inFlight.current = true;
    try {
      if (await run(action, {...payload, request_id: requests.current[action].id})) delete requests.current[action];
    } finally { inFlight.current = false; }
  }

  function buy(credits, price) {
    if (!ready || busy || inFlight.current || (!preview && shop.points < price)) return;
    if (!window.confirm(`Spend ${price} SPARK Points from your school's season balance for ${credits} unlock ${credits === 1 ? 'credit' : 'credits'}? Credits are available immediately and carry over until used.`)) return;
    return submit('buy_unlocks', {credits, expected_price: price, confirmed: true});
  }

  return <section className="og-unlock-shop" aria-label="Get More Unlocks">
    <div className="og-unlock-shop-heading"><h4>Get More Unlocks</h4><p><strong>{shop.balance.toLocaleString()} unlock {shop.balance === 1 ? 'credit' : 'credits'}</strong><span>Season balance: {shop.points.toLocaleString()} SPARK Points</span></p></div>
    <p className="og-unlock-daily">Your school receives 1 free credit each school day, automatically. Unused credits carry over. Weekends and recorded school holidays are excluded (Los Angeles time).</p>
    <div className="og-actions">
      <button type="button" disabled={!ready || busy || (!preview && shop.points < singlePrice)} onClick={() => buy(1, singlePrice)}>Buy 1 Credit &#183; {singlePrice} Points</button>
      <button type="button" disabled={!ready || busy || (!preview && shop.points < bundlePrice)} onClick={() => buy(5, bundlePrice)}>Buy 5 Credits &#183; {bundlePrice} Points</button>
      {round && <button type="button" disabled={!canReveal || busy} onClick={() => submit('reveal_piece', {round: round.id, expected_unlocked: round.unlocked, expected_cost: cost,...(selectable?{piece_index:selectedPiece}:{})})}>{selectable?(selectionValid?`Reveal piece ${selectedPiece+1}`:'Select a piece in the photo'):'Reveal next piece'}{cost > 0 ? ` · ${cost} ${cost === 1 ? 'credit' : 'credits'}` : ''}</button>}
    </div>
  </section>;
}
