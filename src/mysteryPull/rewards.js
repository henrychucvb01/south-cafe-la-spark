export const digitalRewards = new Set(['late_checklist','bingo_change','bingo_free','streak_shield','extra_guess']);
export const isPhysicalPrize=type=>['candy_bar','physical'].includes(type);
export const prizeIcons=['🎁','⭐','🎯','🔍','🧩','✨','🎟️','🍫','🍬','☕','🏆','💡','🔄','🍎','📋','🛡️'];
export const prizeEffects={
 physical:{label:'Physical prize',description:'Add stock after saving. Mark received after delivery.',icon:'🎁'},
 extra_guess:{label:'Extra Mystery Guess',description:'Use once in Mystery Photos after your first guess. The prize stays in school inventory until used.',icon:'🔍'},
 points_pull:{label:'+5 SPARK Points + Extra Pull',description:'Adds 5 school points and one extra pull immediately.',icon:'⭐'},
 bingo_free:{label:'Bingo Free Space',description:'Complete one incomplete Bingo square.',icon:'✨'},
 bingo_change:{label:'Change a Bingo Square',description:'Replace one incomplete Bingo task.',icon:'🔄'},
 double_bites:{label:'Double Daily Bites for 1 Month',description:'Starts when won; doubles eligible Daily Bites rewards.',icon:'🍎'},
 late_checklist:{label:'Make-Up Late Checklist',description:'Redeem for one eligible late checklist.',icon:'📋'},
 streak_shield:{label:'Streak Shield',description:'Protect one missed qualifying day.',icon:'🛡️'},
 candy_bar:{label:'Candy Bar',description:'Requires stock; mark received after delivery.',icon:'🍫'}
};
export const rewardLabels = {
 points_pull: '+5 SPARK Points + Extra Pull',
 late_checklist: 'Make-Up Late Checklist',
 bingo_change: 'Change a Bingo Square',
 bingo_free: 'Bingo Free Space',
 double_bites: 'Double Daily Bites for 1 Month',
 streak_shield: 'Streak Shield',
 candy_bar: 'Candy Bar',
 extra_guess: 'Extra Mystery Guess',
 physical: 'Physical prize',
};
export function prizeStatus(prize) {
 if(prize.status==='received') return digitalRewards.has(prize.reward_type)?'Redeemed ✓':'Received ✓';
 if(prize.reward_type==='extra_guess')return 'Ready to use in Mystery Photos';
 return digitalRewards.has(prize.reward_type)?'Ready to redeem':'Waiting for supervisor';
}
