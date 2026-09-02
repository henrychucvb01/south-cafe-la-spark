export const WORD_GAME_PUZZLES = [
  { id: "apple", answer: "APPLE", category: "Produce", hint: "A crisp fruit found in many school meals." },
  { id: "apron", answer: "APRON", category: "Kitchen", hint: "Wear this to help protect clothing." },
  { id: "beans", answer: "BEANS", category: "Nutrition", hint: "A food that brings both protein and fiber." },
  { id: "bread", answer: "BREAD", category: "Meal service", hint: "Whole-grain varieties add fiber to a tray." },
  { id: "clean", answer: "CLEAN", category: "Sanitation", hint: "A key condition for safe food-contact surfaces." },
  { id: "crate", answer: "CRATE", category: "Inventory", hint: "Produce may arrive in one of these containers." },
  { id: "dairy", answer: "DAIRY", category: "Meal programs", hint: "Milk and yogurt belong to this food group." },
  { id: "dates", answer: "DATES", category: "Produce", hint: "Naturally sweet fruit that grows on palms." },
  { id: "farms", answer: "FARMS", category: "Agriculture", hint: "Places where food is grown or raised." },
  { id: "fiber", answer: "FIBER", category: "Nutrition", hint: "A nutrient in fruits, vegetables, beans, and whole grains." },
  { id: "glove", answer: "GLOVE", category: "Food safety", hint: "A barrier sometimes used for ready-to-eat food." },
  { id: "grape", answer: "GRAPE", category: "Produce", hint: "A small fruit that grows in bunches." },
  { id: "grain", answer: "GRAIN", category: "Nutrition", hint: "Rice, oats, and wheat are examples." },
  { id: "ladle", answer: "LADLE", category: "Equipment", hint: "A long-handled tool for serving soup or sauce." },
  { id: "lemon", answer: "LEMON", category: "Produce", hint: "A bright yellow citrus fruit." },
  { id: "melon", answer: "MELON", category: "Produce", hint: "A juicy fruit with a firm rind." },
  { id: "mixer", answer: "MIXER", category: "Equipment", hint: "Equipment that combines ingredients quickly." },
  { id: "onion", answer: "ONION", category: "Produce", hint: "A layered vegetable that can make eyes water." },
  { id: "peach", answer: "PEACH", category: "Produce", hint: "A fuzzy stone fruit." },
  { id: "plate", answer: "PLATE", category: "Meal service", hint: "Food may be served on this reusable item." },
  { id: "scoop", answer: "SCOOP", category: "Portioning", hint: "A tool that helps serve consistent portions." },
  { id: "serve", answer: "SERVE", category: "Meal service", hint: "The action at the heart of the cafeteria line." },
  { id: "steam", answer: "STEAM", category: "Production", hint: "A moist-heat cooking method." },
  { id: "stock", answer: "STOCK", category: "Inventory", hint: "Supplies currently available on hand." },
  { id: "tongs", answer: "TONGS", category: "Equipment", hint: "A gripping utensil useful on a serving line." },
  { id: "trays", answer: "TRAYS", category: "Meal service", hint: "Students carry meals on these." },
  { id: "waste", answer: "WASTE", category: "Operations", hint: "Careful forecasting can help reduce this." },
  { id: "wheat", answer: "WHEAT", category: "Agriculture", hint: "A crop commonly milled into flour." },
  { id: "whisk", answer: "WHISK", category: "Equipment", hint: "A looped tool used to blend or aerate." },
  { id: "yield", answer: "YIELD", category: "Production", hint: "The amount a recipe produces." },
];

export const SPARK_SORT_PUZZLES = [
  {
    id: "produce-colors",
    groups: [
      { category: "Red produce", items: ["Apple", "Tomato", "Strawberry", "Radish"] },
      { category: "Leafy greens", items: ["Spinach", "Kale", "Lettuce", "Chard"] },
      { category: "Citrus fruits", items: ["Orange", "Lemon", "Lime", "Grapefruit"] },
      { category: "Root vegetables", items: ["Carrot", "Beet", "Turnip", "Parsnip"] },
    ],
  },
  {
    id: "kitchen-tools",
    groups: [
      { category: "Measuring tools", items: ["Scale", "Cup", "Spoon", "Thermometer"] },
      { category: "Serving tools", items: ["Ladle", "Tongs", "Scoop", "Spatula"] },
      { category: "Cleaning supplies", items: ["Brush", "Mop", "Squeegee", "Bucket"] },
      { category: "Large equipment", items: ["Oven", "Mixer", "Steamer", "Freezer"] },
    ],
  },
  {
    id: "farm-to-tray",
    groups: [
      { category: "Tree fruits", items: ["Peach", "Pear", "Plum", "Apple"] },
      { category: "Grown underground", items: ["Potato", "Carrot", "Onion", "Radish"] },
      { category: "Grain crops", items: ["Wheat", "Oats", "Rice", "Corn"] },
      { category: "Farm jobs", items: ["Plant", "Water", "Harvest", "Pack"] },
    ],
  },
  {
    id: "meal-programs",
    groups: [
      { category: "Breakfast favorites", items: ["Oatmeal", "Yogurt", "Toast", "Cereal"] },
      { category: "Lunch line items", items: ["Entrée", "Fruit", "Vegetable", "Milk"] },
      { category: "After-school snacks", items: ["Crackers", "Cheese", "Juice", "Hummus"] },
      { category: "Meal service actions", items: ["Greet", "Portion", "Count", "Serve"] },
    ],
  },
  {
    id: "food-safety-fun",
    groups: [
      { category: "Wash hands", items: ["Wet", "Soap", "Scrub", "Rinse"] },
      { category: "Temperature words", items: ["Hot", "Cold", "Chill", "Heat"] },
      { category: "Keep food protected", items: ["Cover", "Label", "Wrap", "Store"] },
      { category: "Things to inspect", items: ["Seal", "Date", "Package", "Surface"] },
    ],
  },
  {
    id: "inventory-day",
    groups: [
      { category: "Counting words", items: ["Each", "Case", "Dozen", "Pound"] },
      { category: "Storage areas", items: ["Pantry", "Cooler", "Freezer", "Shelf"] },
      { category: "Inventory actions", items: ["Count", "Rotate", "Record", "Order"] },
      { category: "Package types", items: ["Can", "Box", "Bag", "Carton"] },
    ],
  },
  {
    id: "production-flow",
    groups: [
      { category: "Before cooking", items: ["Read", "Gather", "Measure", "Prep"] },
      { category: "Cooking methods", items: ["Bake", "Steam", "Roast", "Simmer"] },
      { category: "Recipe information", items: ["Yield", "Portion", "Time", "Ingredient"] },
      { category: "After service", items: ["Cool", "Store", "Clean", "Record"] },
    ],
  },
  {
    id: "nutrition-mix",
    groups: [
      { category: "Protein foods", items: ["Beans", "Eggs", "Chicken", "Tofu"] },
      { category: "Whole grains", items: ["Oats", "Quinoa", "Brown Rice", "Whole Wheat"] },
      { category: "Calcium sources", items: ["Milk", "Yogurt", "Cheese", "Fortified Soy"] },
      { category: "Hydrating produce", items: ["Melon", "Cucumber", "Orange", "Lettuce"] },
    ],
  },
  {
    id: "cafeteria-sounds",
    groups: [
      { category: "Things that beep", items: ["Timer", "Oven", "Scanner", "Thermometer"] },
      { category: "Things that roll", items: ["Cart", "Rack", "Dolly", "Tray Line"] },
      { category: "Things with handles", items: ["Ladle", "Pan", "Mop", "Pitcher"] },
      { category: "Things that stack", items: ["Trays", "Cups", "Bowls", "Crates"] },
    ],
  },
  {
    id: "clean-team",
    groups: [
      { category: "Dish area", items: ["Scrape", "Rack", "Wash", "Air Dry"] },
      { category: "Floor care", items: ["Sweep", "Mop", "Sign", "Squeegee"] },
      { category: "Sanitation words", items: ["Contact Time", "Solution", "Test Strip", "Concentration"] },
      { category: "End-of-day actions", items: ["Empty", "Wipe", "Return", "Lock"] },
    ],
  },
];
