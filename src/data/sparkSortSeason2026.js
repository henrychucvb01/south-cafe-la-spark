// Familiar, disjoint categories for easier days; associations and word patterns
// for harder days. Four-of-six selections vary the actual items, not just order.
const templates = [
  ['market-basket','easy',[
    ['Orchard fruit',['Apple','Pear','Peach','Plum','Apricot','Cherry']],
    ['Eating utensils',['Fork','Spoon','Chopsticks','Soup Spoon','Teaspoon','Dessert Fork']],
    ['Kitchen appliances',['Oven','Mixer','Blender','Toaster','Steamer','Freezer']],
    ['Herbs',['Basil','Mint','Parsley','Dill','Thyme','Rosemary']],
  ]],
  ['rainbow-produce','easy',[
    ['Citrus fruit',['Lemon','Lime','Orange','Grapefruit','Tangerine','Mandarin']],
    ['Leafy greens',['Spinach','Kale','Lettuce','Chard','Arugula','Collards']],
    ['Root vegetables',['Carrot','Beet','Turnip','Radish','Parsnip','Rutabaga']],
    ['Berries',['Strawberry','Blueberry','Raspberry','Blackberry','Cranberry','Gooseberry']],
  ]],
  ['kitchen-stations','medium',[
    ['Measuring tools',['Measuring Cup','Measuring Spoon','Scale','Thermometer','Ruler','Graduated Pitcher']],
    ['Cutting tools',['Chef Knife','Paring Knife','Bread Knife','Kitchen Shears','Pizza Cutter','Peeler']],
    ['Cleaning tools',['Mop','Broom','Scrub Brush','Squeegee','Dustpan','Cleaning Cloth']],
    ['Cooking methods',['Bake','Roast','Steam','Simmer','Grill','Braise']],
  ]],
  ['word-menu','hard',[
    ['Can come before CAKE',['Pan','Cup','Cheese','Short','Fruit','Carrot']],
    ['Can come before CORN',['Pop','Sweet','Candy','Field','Baby','Flint']],
    ['Can come before BOARD',['Cutting','Chopping','Serving','Menu','Bulletin','White']],
    ['Can come before ROOM',['Dining','Class','Break','Store','Rest','Lunch']],
  ]],
  ['pantry-labels','easy',[
    ['Pasta shapes',['Penne','Rotini','Spaghetti','Farfalle','Macaroni','Rigatoni']],
    ['Dried seasonings',['Cinnamon','Paprika','Cumin','Turmeric','Nutmeg','Ginger']],
    ['Beans',['Black Beans','Pinto Beans','Kidney Beans','Navy Beans','Lima Beans','Cannellini Beans']],
    ['Container types',['Can','Jar','Bottle','Carton','Pouch','Tin']],
  ]],
  ['bakery-counter','medium',[
    ['Bread shapes',['Loaf','Baguette','Boule','Roll','Breadstick','Bagel']],
    ['Baking ingredients',['Flour','Yeast','Baking Powder','Baking Soda','Sugar','Shortening']],
    ['Baking tools',['Rolling Pin','Dough Scraper','Pastry Brush','Cooling Rack','Muffin Tin','Pastry Bag']],
    ['Bakery treats',['Cookie','Brownie','Cupcake','Doughnut','Eclair','Tart']],
  ]],
  ['food-word-endings','hard',[
    ['End in BERRY',['Strawberry','Blueberry','Blackberry','Raspberry','Cranberry','Gooseberry']],
    ['End in NUT',['Walnut','Hazelnut','Chestnut','Coconut','Peanut','Butternut']],
    ['End in MELON',['Watermelon','Honeydew Melon','Winter Melon','Bitter Melon','Horned Melon','Canary Melon']],
    ['End in PEPPER',['Bell Pepper','Black Pepper','White Pepper','Cayenne Pepper','Banana Pepper','Cherry Pepper']],
  ]],
  ['soup-and-salad','easy',[
    ['Salad greens',['Romaine','Iceberg','Arugula','Spinach','Butter Lettuce','Spring Mix']],
    ['Salad dressings',['Ranch','Italian','Caesar','Balsamic Vinaigrette','French','Thousand Island']],
    ['Soup varieties',['Minestrone','Tomato Soup','Chicken Noodle','Lentil Soup','Split Pea','Vegetable Soup']],
    ['Serving dishes',['Soup Bowl','Salad Plate','Platter','Tureen','Ramekin','Serving Tray']],
  ]],
  ['school-day','medium',[
    ['Places at school',['Cafeteria','Library','Gym','Classroom','Office','Playground']],
    ['School supplies',['Pencil','Notebook','Eraser','Crayon','Marker','Glue Stick']],
    ['Ways to travel',['Walk','Bike','Bus','Car','Train','Scooter']],
    ['Meal times or occasions',['Breakfast','Brunch','Lunch','Supper','Snack','Picnic']],
  ]],
  ['small-and-large','hard',[
    ['Small amount words',['Pinch','Dash','Drop','Smidgen','Touch','Trace']],
    ['Groups or quantities',['Batch','Bunch','Dozen','Pair','Trio','Quartet']],
    ['Words for reducing size',['Chop','Dice','Mince','Grate','Shred','Crush']],
    ['Words for combining',['Mix','Blend','Stir','Fold','Toss','Whisk']],
  ]],
  ['delivery-day','easy',[
    ['Wheeled transport',['Truck','Van','Cart','Dolly','Hand Truck','Pallet Jack']],
    ['Packaging materials',['Cardboard','Bubble Wrap','Packing Paper','Foam','Stretch Wrap','Packing Tape']],
    ['Delivery paperwork',['Invoice','Packing Slip','Purchase Order','Receipt','Delivery Note','Bill of Lading']],
    ['Count or measure units',['Each','Case','Dozen','Pound','Ounce','Gallon']],
  ]],
  ['menu-variety','medium',[
    ['Rice dishes',['Pilaf','Risotto','Paella','Fried Rice','Rice Pudding','Jambalaya']],
    ['Pasta dishes',['Lasagna','Mac and Cheese','Spaghetti Marinara','Pasta Primavera','Baked Ziti','Pasta Salad']],
    ['Potato preparations',['Mashed Potatoes','Baked Potato','Potato Wedges','Hash Browns','Roasted Potatoes','Potato Salad']],
    ['Egg preparations',['Scrambled Eggs','Omelet','Frittata','Poached Egg','Hard-Boiled Egg','Deviled Eggs']],
  ]],
  ['can-follow-food','hard',[
    ['Can come after FOOD',['Service','Safety','Court','Truck','Bank','Chain']],
    ['Can come after LUNCH',['Box','Bag','Break','Money','Hour','Lady']],
    ['Can come after TABLE',['Cloth','Spoon','Top','Tennis','Manners','Setting']],
    ['Can come after WATER',['Bottle','Melon','Fall','Proof','Color','Front']],
  ]],
  ['breakfast-shelves','easy',[
    ['Cereal grains',['Wheat','Oats','Rice','Corn','Barley','Rye']],
    ['Dairy foods',['Milk','Yogurt','Cheese','Butter','Cottage Cheese','Sour Cream']],
    ['Tropical fruit',['Banana','Mango','Pineapple','Papaya','Guava','Passion Fruit']],
    ['Fruit spreads',['Strawberry Jam','Grape Jelly','Orange Marmalade','Apple Butter','Apricot Jam','Peach Preserves']],
  ]],
  ['food-descriptions','medium',[
    ['Taste words',['Sweet','Sour','Salty','Bitter','Savory','Tangy']],
    ['Texture words',['Crunchy','Smooth','Creamy','Chewy','Crisp','Tender']],
    ['Shape words',['Round','Square','Oval','Triangular','Flat','Cylindrical']],
    ['Color words',['Red','Green','Yellow','Orange','Purple','Brown']],
  ]],
  ['kitchen-phrases','hard',[
    ['Can come before POT',['Coffee','Tea','Stock','Flower','Crack','Honey']],
    ['Can come before PAN',['Frying','Sauce','Sheet','Cake','Loaf','Roasting']],
    ['Can come before BOWL',['Mixing','Soup','Salad','Cereal','Sugar','Punch']],
    ['Can come before SPOON',['Table','Dessert','Serving','Slotted','Wooden','Measuring']],
  ]],
  ['garden-groups','easy',[
    ['Plant parts',['Root','Stem','Leaf','Flower','Seed','Bud']],
    ['Garden tools',['Shovel','Rake','Hoe','Trowel','Watering Can','Pruners']],
    ['Fruit trees',['Apple Tree','Pear Tree','Peach Tree','Plum Tree','Cherry Tree','Apricot Tree']],
    ['Garden helpers',['Bee','Butterfly','Earthworm','Ladybug','Lacewing','Hoverfly']],
  ]],
  ['ready-for-service','medium',[
    ['Actions with a knife',['Slice','Dice','Chop','Mince','Julienne','Trim']],
    ['Actions with liquid',['Pour','Drain','Strain','Ladle','Splash','Drizzle']],
    ['Service supplies',['Napkin','Straw','Tray','Cup','Fork','Spoon']],
    ['Schedule words',['Morning','Noon','Afternoon','Evening','Weekday','Weekend']],
  ]],
  ['food-or-something-else','hard',[
    ['Foods also used as colors',['Peach','Olive','Salmon','Plum','Chocolate','Cream']],
    ['Can come before BREAK',['Coffee','Tea','Lunch','Day','Fast','Spring']],
    ['Menu headings',['Appetizers','Entrees','Side Dishes','Beverages','Desserts','Specials']],
    ['Parts of a recipe',['Title','Ingredients','Directions','Yield','Prep Time','Cook Time']],
  ]],
  ['menu-map','medium',[
    ['Leaf herbs',['Basil','Parsley','Cilantro','Mint','Dill','Sage']],
    ['Noodle shapes',['Spaghetti','Linguine','Fettuccine','Vermicelli','Bucatini','Capellini']],
    ['Winter squash',['Butternut','Acorn','Spaghetti Squash','Delicata','Kabocha','Hubbard']],
    ['Fruit with a stone or pit',['Peach','Plum','Apricot','Cherry','Nectarine','Mango']],
  ]],
];
// All 15 combinations of four out of six items, stable across releases.
const combinations=[];
for(let a=0;a<3;a++)for(let b=a+1;b<4;b++)for(let c=b+1;c<5;c++)for(let d=c+1;d<6;d++)combinations.push([a,b,c,d]);
export const SPARK_SORT_SEASON_PUZZLES = Array.from({length:180},(_,index)=>{
  const [name,difficulty,groups]=templates[index%templates.length];
  const variant=Math.floor(index/templates.length);
  return {id:`season-${name}-${variant+1}`,difficulty,groups:groups.map(([category,items],groupIndex)=>({category,items:combinations[(variant+groupIndex*3)%combinations.length].map(i=>items[i])}))};
});
