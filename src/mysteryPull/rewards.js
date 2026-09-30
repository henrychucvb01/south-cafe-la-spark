export const digitalRewards = new Set(['late_checklist','bingo_change','bingo_free','streak_shield']);
export const rewardLabels = {
 points_pull: '+5 SPARK Points + Extra Pull',
 late_checklist: 'Make-Up Late Checklist',
 bingo_change: 'Change a Bingo Square',
 bingo_free: 'Bingo Free Space',
 double_bites: 'Double Daily Bites for 1 Month',
 streak_shield: 'Streak Shield',
 candy_bar: 'Candy Bar',
};
export function prizeStatus(prize) {
 if(prize.status==='received') return digitalRewards.has(prize.reward_type)?'Redeemed ✓':'Received ✓';
 return digitalRewards.has(prize.reward_type)?'Ready to redeem':'Waiting for supervisor';
}
