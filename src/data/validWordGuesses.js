// Curated common five-letter English words accepted by Cafeteria Word.
// Keep this separate from the themed answer bank so the accepted-guess list
// can grow without changing puzzle rotation.
const VALID_FIVE_LETTER_WORDS = `
about above abuse actor acute admit adopt adult after again agent agree ahead alarm album alert alike alive allow alone along alter among anger angle angry apart apple apply apron arena argue arise armor aroma array aside asset atlas audio audit avoid awake award aware awful
bacon badge badly baker bases basic basin basis beach beads beans beard beast began begin begun being below bench berry birth black blade blame blank blast blend bless blind block blood bloom blown blues blunt board boast bonus books boost booth bound bowel brain brake brand brass brave bread break breed brick bride brief bring broad broke brown brush build built bunch burst buyer
cabin cable cacao cache cafes camel candy cargo carry carve cases catch cause cedar chain chair chalk charm chart chase cheap check cheek cheer chess chest chick chief child chili chill choir chose cider civil claim class clean clear clerk click climb clock close cloth cloud coach coast cocoa colon color comet comic coral could count court cover crane crate cream crisp crops crowd crown crude crush crust curly curry curve cycle
dairy dance dates dealt death debut delay depth diary dirty disco ditch dizzy dough dozen draft drain drama drank dream dress dried drink drive drove drum dryer
eager early earth eaten eight elbow elder elect elite empty enact enemy enjoy enter entry equal error essay event every exact exist extra
facts faint fairy faith false fancy farms fault favor feast fiber field fiery fifth fifty fight final first flame flash fleet flesh float flour focus force forty forum found frame fresh fried front frost fruit funny
giant given glass glaze globe glove goals grace grade grain grand grant grape graph grasp grass grave great green greet grill grind gross group grown guard guess guest guide
habit happy hardy heard heart heavy hello herbs hobby honey honor horse hotel house human
ideal image imply inbox index inert input issue items
joint judge juice
kebab knife known
label labor ladle large laser later laugh layer learn lease least leave lemon light limit linen liner links liver local lodge logic loose lunch
magic maize major maker mango maple March match meals medal media melon menus metal meter might mixer model money month moral motor mount mouse mouth movie
nacho names nerve never night ninth noise north notes novel nurse
oasis occur ocean offer often olive onion opera order other ounce ovens owner
packs paint panel paper pasta paste patch peach pears phase phone piece pilot pinch pizza place plain plane plant plate point porch pound power press price pride prime print prior prize probe proof proud pulse puree
quail quart queen quick quiet quilt quota
radar radio raise ranch range rapid ratio reach ready recipe refer rinse risen roast rolls rough round route royal ruler rural
salad salsa sauce scale scene scoop score scrub seeds serve seven shake shall shape share sharp sheet shelf shells shift shine short shown sides skill slice small smart smell smile snack soap solar solid solve sound soups south space spare speak speed spice spoon sport staff stage stain stand start state steak steam steel steep steps still stock stone store stove straw strip sugar suite sweet syrup
table taste teach teams thank their theme there these thick thing think third those three toast today tongs tools tooth total touch towel tower track trade trays treat trend trial truck truly trust twice types
under union unity upper urban usage usual
valid value vegan video visit vital
wagon waste watch water wheat wheel whisk white whole woman words world worth would wound write wrong
yeast yield young youth
zesty
`.trim().split(/\s+/);

export const VALID_WORD_GUESSES = new Set(VALID_FIVE_LETTER_WORDS.map((word) => word.toUpperCase()));

export function isValidWordGuess(word) {
  return VALID_WORD_GUESSES.has(String(word || "").toUpperCase());
}
