// Food category icons — shared between FoodSearch (search results, add
// flow) and Dashboard (Favourites row), so a given food always gets the
// same icon wherever it appears. Tabler icon-font icons, not emoji —
// emoji render as blank "tofu" boxes for a lot of glyphs, especially the
// ones dynamically assigned to arbitrary search results, so this always
// renders and looks intentional rather than broken.
//
// Split out several specific, visually-distinct categories (burger,
// pizza, cheese, soup, dessert, nuts) that used to fall under a broader
// one (meat, grain, dairy, sweet) with a much less recognisable icon —
// most real search results are branded/packaged products whose names
// don't literally contain a broad category's keyword ("Big Mac" has no
// "burger" in it), so "other" (a plain package icon) ended up covering
// a large share of results. More specific keyword coverage, not a
// smarter matching algorithm, is what actually moves foods out of that
// bucket.
export const CATEGORY_STYLES = {
  burger:    { icon: "ti-burger",    color: "#c17a4a" },
  meat:      { icon: "ti-meat",      color: "#8fbc8f" },
  seafood:   { icon: "ti-fish",      color: "#6aabcf" },
  egg:       { icon: "ti-egg",       color: "#e8c468" },
  cheese:    { icon: "ti-cheese",    color: "#e8b84a" },
  dairy:     { icon: "ti-milk",      color: "#9f97e8" },
  fruit:     { icon: "ti-apple",     color: "#c07070" },
  vegetable: { icon: "ti-carrot",    color: "#7fae5f" },
  nuts:      { icon: "ti-nut",       color: "#a67c52" },
  pizza:     { icon: "ti-pizza",     color: "#c07070" },
  grain:     { icon: "ti-bread",     color: "#b48250" },
  soup:      { icon: "ti-soup",      color: "#b48250" },
  sweet:     { icon: "ti-cookie",    color: "#d98fb0" },
  dessert:   { icon: "ti-ice-cream", color: "#d98fb0" },
  beverage:  { icon: "ti-cup",       color: "#6aabcf" },
  alcohol:   { icon: "ti-beer",      color: "#c17a4a" },
  other:     { icon: "ti-package",   color: "#888888" },
  custom:    { icon: "ti-stars",     color: "#b48fd9" },
};

// Checked in order — more specific categories first, so e.g. "Big Mac"
// hits burger before a generic term could, and "Pepperoni Pizza" hits
// pizza before "meat" would claim "pepperoni". Alcohol is deliberately
// checked after every food category (not just beverage), so e.g. "fruit
// cocktail" or "prawn cocktail" hit their real category via an earlier,
// more specific keyword before "cocktail" is ever tested — and "gin" is
// deliberately NOT a keyword here despite being a common spirit, since
// it's a substring of both "ginger" and "virgin" (as in a non-alcoholic
// "virgin mojito"), which would misclassify far more often than it
// would correctly classify.
export const CATEGORY_KEYWORDS = [
  ["burger", ["burger", "big mac", "whopper", "cheeseburger", "mcdouble", "quarter pounder"]],
  ["pizza", ["pizza", "calzone"]],
  // Soup/dessert checked before meat/seafood/dairy — a soup's name usually
  // names its protein too ("Chicken Soup", "Prawn Bisque"), and "ice
  // cream"/"whipped cream" contain dairy's own "cream" keyword, so either
  // being checked later would misclassify the dish as its ingredient.
  ["soup", ["soup", "broth", "bisque", "chowder", "stew", "laksa", "ramen", "pho"]],
  ["dessert", ["ice cream", "gelato", "sorbet", "sundae", "frozen yogurt", "popsicle"]],
  ["seafood", ["fish", "salmon", "tuna", "prawn", "shrimp", "crab", "lobster", "oyster", "mussel", "squid", "calamari", "cod", "barramundi", "trout", "sardine", "anchovy", "sushi", "sashimi", "seafood"]],
  ["meat", ["chicken", "beef", "pork", "lamb", "turkey", "bacon", "sausage", "mince", "steak", "ham", "meat", "veal", "duck", "mutton", "sirloin", "brisket", "rib", "salami", "chorizo", "pepperoni", "jerky", "schnitzel", "kebab", "meatball", "nugget"]],
  ["egg", ["egg"]],
  // Checked before dairy — "peanut butter" and "almond milk" would
  // otherwise match dairy's "butter"/"milk" first. "nut" itself isn't a
  // keyword (bare, it'd match "coconut", "donut" and "peanut" all being
  // real substrings of it) — " nuts" (leading space) catches "Mixed Nuts"
  // / "Roasted Nuts" without that.
  ["nuts", ["almond", "cashew", "peanut", "walnut", "pistachio", "hazelnut", "macadamia", "pecan", " nuts", "trail mix"]],
  ["cheese", ["cheese", "cheddar", "mozzarella", "parmesan", "brie", "feta", "haloumi", "halloumi", "ricotta", "camembert", "gouda"]],
  ["dairy", ["milk", "yoghurt", "yogurt", "cream", "butter", "custard"]],
  ["fruit", ["apple", "banana", "orange", "berry", "grape", "mango", "pineapple", "melon", "watermelon", "pear", "peach", "plum", "kiwi", "cherry", "fruit", "avocado", "lemon", "lime", "strawberry", "blueberry", "raspberry", "pomegranate", "fig", "coconut", "papaya", "guava", "passionfruit", "lychee", "date", "raisin", "cranberry", "apricot", "nectarine"]],
  ["vegetable", ["broccoli", "spinach", "carrot", "potato", "tomato", "lettuce", "cabbage", "onion", "garlic", "capsicum", "cucumber", "zucchini", "pumpkin", "corn", "bean", "vegetable", "salad", "kale", "mushroom", "eggplant", "beetroot", "asparagus", "celery", "cauliflower", "leek", "radish", "sprout", "chickpea", "lentil", "pea"]],
  ["grain", ["bread", "rice", "oats", "oatmeal", "pasta", "spaghetti", "noodle", "cereal", "toast", "bagel", "muffin", "cake", "pastry", "pie", "naan", "roti", "wrap", "bun", "biscuit", "cracker", "flour", "wheat", "quinoa", "granola", "sandwich", "tortilla", "burrito", "taco"]],
  ["sweet", ["chocolate", "candy", "lolly", "sweet", "dessert", "honey", "sugar", "jam", "syrup", "cookie", "donut", "doughnut", "brownie", "marshmallow", "caramel", "fudge", "gummy", "licorice", "liquorice"]],
  // " ale" and " ipa" (with a leading space, not bare "ale"/"ipa") so real
  // products like "Original Pale Ale (Coopers)" and "XYZ IPA" match without
  // "ale" alone catching "tamale" or "kale" (the latter is moot anyway
  // since "vegetable" is checked first, but "tamale" has no such guard).
  ["alcohol", ["beer", "wine", "cider", "vodka", "whiskey", "whisky", "rum", "tequila", "bourbon", "champagne", "prosecco", "liqueur", "cocktail", "sangria", "spritz", "negroni", "margarita", "martini", "mojito", "sherry", "brandy", "schnapps", "lager", "stout", "porter", " ale", " ipa", "alcohol", "spirits"]],
  ["beverage", ["juice", "soda", "drink", "water", "coffee", "tea", "smoothie", "milkshake", "cola", "cordial", "kombucha", "energy drink", "sports drink", "gatorade", "powerade"]],
];

export function guessCategory(name) {
  const n = name.toLowerCase();
  for (const [category, keywords] of CATEGORY_KEYWORDS) {
    if (keywords.some(k => n.includes(k))) return category;
  }
  return "other";
}

export function getCategoryStyle(food) {
  return CATEGORY_STYLES[food.category || guessCategory(food.name)] || CATEGORY_STYLES.other;
}
