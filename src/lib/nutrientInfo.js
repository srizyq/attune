// What each nutrient does and where it comes from, for the nutrient's own page,
// and the health goals the Nutrients page can group them by. Plain-language
// summaries of standard nutrition references (NHMRC / NIH); not medical advice.

// Nutrients to keep under a limit rather than reach.
export const LIMIT_KEYS = new Set(['sodium', 'sugar', 'addedSugar', 'saturatedFat', 'transFat', 'cholesterol', 'caffeine', 'alcohol']);

export const NUTRIENT_INFO = {
  fibre: { does: 'Keeps digestion regular, feeds gut bacteria, helps you feel full and slows how fast sugar enters the blood.', sources: ['Oats and wholegrain bread', 'Beans, lentils and chickpeas', 'Vegetables and fruit with the skin', 'Nuts and seeds'] },
  sodium: { does: 'Balances fluids and supports nerves and muscles. Most people eat far more than they need, which raises blood pressure over time.', sources: ['Bread, cereals and processed meats', 'Sauces, stock and instant noodles', 'Cheese, chips and takeaway'] },
  sugar: { does: 'A quick source of energy. Sugar that occurs naturally in fruit and milk comes with other nutrients; the main concern is added sugar.', sources: ['Fruit and milk (natural)', 'Soft drinks, juice and lollies', 'Cakes, biscuits and sweetened yoghurt'] },
  addedSugar: { does: 'Sugar added to food and drink, with no other nutrients. Eating less of it protects teeth and helps keep weight and blood sugar steady.', sources: ['Soft drinks and energy drinks', 'Confectionery and desserts', 'Sweetened breakfast cereal and yoghurt'] },
  saturatedFat: { does: 'A type of fat that raises LDL ("bad") cholesterol when eaten in excess. Swapping it for unsaturated fat helps heart health.', sources: ['Butter, cream and cheese', 'Fatty meat and sausages', 'Pastries, pies and fried food', 'Coconut and palm oil'] },
  transFat: { does: 'An artificial or naturally small amount of fat that raises LDL and lowers HDL cholesterol. Keep it as low as you can.', sources: ['Some pastries and biscuits', 'Deep-fried takeaway', 'Small natural amounts in dairy and beef'] },
  cholesterol: { does: 'Your body makes what it needs. For most people saturated fat affects blood cholesterol more than dietary cholesterol does.', sources: ['Eggs', 'Prawns and organ meats', 'Meat, cheese and full-fat dairy'] },
  monounsaturatedFat: { does: 'A heart-friendly fat that helps lower LDL cholesterol when it replaces saturated fat.', sources: ['Olive and canola oil', 'Avocado', 'Almonds, peanuts and cashews'] },
  polyunsaturatedFat: { does: 'Includes the essential omega-3 and omega-6 fats your body cannot make. Supports the heart and brain.', sources: ['Oily fish', 'Walnuts, flaxseed and chia', 'Sunflower and soybean oil'] },
  potassium: { does: 'Balances fluids and sodium, supports muscles and nerves, and helps keep blood pressure in check.', sources: ['Bananas, potatoes and sweet potato', 'Spinach and tomatoes', 'Beans, yoghurt and milk', 'Salmon'] },
  vitaminD: { does: 'Helps your body absorb calcium for strong bones and muscles, and supports immunity. Most comes from sunlight rather than food.', sources: ['Sunlight on skin', 'Oily fish', 'Eggs', 'Fortified milk and margarine'] },
  calcium: { does: 'Builds and maintains bones and teeth, and helps muscles and nerves work.', sources: ['Milk, yoghurt and cheese', 'Calcium-fortified soy milk', 'Tinned fish with bones', 'Tofu set with calcium, almonds, broccoli'] },
  iron: { does: 'Carries oxygen in the blood. Low iron causes tiredness and poor concentration. Iron from meat is absorbed better than from plants; vitamin C helps plant iron absorb.', sources: ['Red meat and liver', 'Chicken and fish', 'Lentils, beans and tofu', 'Spinach and fortified cereal'] },
  vitaminA: { does: 'Supports vision (especially in low light), skin, growth and the immune system.', sources: ['Liver', 'Carrots, sweet potato and pumpkin', 'Spinach and kale', 'Eggs and dairy'] },
  vitaminC: { does: 'An antioxidant that helps heal wounds, makes collagen for skin and joints, and helps you absorb iron from plant foods.', sources: ['Citrus fruit and kiwifruit', 'Capsicum and broccoli', 'Strawberries', 'Tomatoes and potatoes'] },
  vitaminB12: { does: 'Needed for nerves, red blood cells and DNA. Found almost only in animal foods, so vegans usually need fortified food or a supplement.', sources: ['Meat, fish and eggs', 'Milk, yoghurt and cheese', 'Fortified plant milks and nutritional yeast'] },
  folate: { does: 'Needed to make DNA and new cells. Very important before and during early pregnancy to help prevent neural tube defects.', sources: ['Leafy greens', 'Legumes', 'Fortified bread and cereal', 'Oranges and avocado'] },
  magnesium: { does: 'Involved in hundreds of reactions: muscle and nerve function, steady energy, bone health and sleep.', sources: ['Nuts and seeds', 'Wholegrains', 'Legumes', 'Leafy greens and dark chocolate'] },
  zinc: { does: 'Supports immunity, wound healing, taste and smell, and growth.', sources: ['Oysters and red meat', 'Chicken', 'Pumpkin seeds and cashews', 'Legumes and wholegrains'] },
  thiamin: { does: 'Vitamin B1. Helps turn carbohydrate into energy and keeps nerves working.', sources: ['Pork', 'Wholegrains and fortified bread', 'Legumes', 'Sunflower seeds'] },
  riboflavin: { does: 'Vitamin B2. Helps release energy from food and supports skin and eyes.', sources: ['Milk and yoghurt', 'Eggs', 'Meat and mushrooms', 'Fortified cereal'] },
  niacin: { does: 'Vitamin B3. Helps release energy from food and supports skin, nerves and digestion.', sources: ['Chicken and turkey', 'Tuna and salmon', 'Peanuts', 'Wholegrains and mushrooms'] },
  vitaminB6: { does: 'Helps your body use protein and make brain chemicals and red blood cells.', sources: ['Chicken, turkey and fish', 'Potatoes and bananas', 'Chickpeas', 'Fortified cereal'] },
  vitaminE: { does: 'An antioxidant that protects cells from damage and supports the immune system.', sources: ['Sunflower seeds and almonds', 'Vegetable oils', 'Avocado', 'Spinach'] },
  vitaminK: { does: 'Needed for blood to clot properly and for bones. Vitamin K from greens is the main source; gut bacteria make a little.', sources: ['Spinach, kale and broccoli', 'Brussels sprouts and cabbage', 'Vegetable oils', 'Natto'] },
  choline: { does: 'Used to build cell membranes and the brain chemical acetylcholine, which supports memory and mood. Also helps move fat out of the liver.', sources: ['Eggs (a big source)', 'Beef and chicken', 'Fish', 'Soybeans and peanuts'] },
  phosphorus: { does: 'Works with calcium to build bones and teeth, and is part of how cells store energy.', sources: ['Dairy', 'Meat, fish and poultry', 'Nuts and legumes', 'Wholegrains'] },
  selenium: { does: 'An antioxidant mineral that supports the thyroid and immune system. Brazil nuts are very high — one or two a day is plenty.', sources: ['Brazil nuts', 'Seafood', 'Meat and eggs', 'Wholegrain bread'] },
  iodine: { does: 'Needed to make thyroid hormones, which control metabolism. Important in pregnancy for the baby\'s brain.', sources: ['Seafood and seaweed', 'Dairy', 'Eggs', 'Bread made with iodised salt'] },
  copper: { does: 'Helps your body use iron, make connective tissue and keep nerves and the immune system healthy.', sources: ['Shellfish and liver', 'Nuts and seeds', 'Legumes', 'Dark chocolate'] },
  manganese: { does: 'Helps form bone, break down nutrients and protect cells as part of antioxidant enzymes.', sources: ['Wholegrains and oats', 'Nuts', 'Tea', 'Legumes and leafy greens'] },
  omega3: { does: 'Long-chain omega-3 (EPA, DPA and DHA) supports the heart, brain and eyes and helps control inflammation.', sources: ['Salmon, sardines and mackerel', 'Tuna and trout', 'Oysters', 'Omega-3 enriched eggs'] },
  alphaLinolenicAcid: { does: 'A plant omega-3 your body can partly convert to EPA and DHA. Supports the heart.', sources: ['Flaxseed and chia', 'Walnuts', 'Canola oil', 'Soybeans'] },
  omega6: { does: 'An essential fat (linoleic acid) needed for skin and cell membranes. Most people already get enough.', sources: ['Sunflower, safflower and soybean oil', 'Nuts and seeds', 'Margarine and mayonnaise'] },
  caffeine: { does: 'A stimulant that boosts alertness. Up to about 400mg a day is generally considered safe for adults; it can disturb sleep if taken late.', sources: ['Coffee', 'Tea', 'Energy drinks and cola', 'Dark chocolate'] },
  alcohol: { does: 'Provides calories but no nutrients. Australian guidelines advise no more than 10 standard drinks a week and no more than 4 on any day.', sources: ['Beer, wine and spirits', 'Pre-mixed drinks'] },
};

// Health goals the Nutrients page can group by. A nutrient can sit in several.
export const HEALTH_GOALS = [
  { id: 'bones', label: 'Bone health', icon: 'ti-bone', keys: ['calcium', 'vitaminD', 'magnesium', 'phosphorus', 'vitaminK', 'manganese'] },
  { id: 'energy', label: 'Energy & metabolism', icon: 'ti-bolt', keys: ['thiamin', 'riboflavin', 'niacin', 'vitaminB6', 'vitaminB12', 'folate', 'iron', 'iodine'] },
  { id: 'immunity', label: 'Immunity', icon: 'ti-shield', keys: ['vitaminC', 'vitaminA', 'vitaminD', 'zinc', 'selenium', 'copper'] },
  { id: 'heart', label: 'Heart health', icon: 'ti-heart', keys: ['sodium', 'potassium', 'fibre', 'saturatedFat', 'transFat', 'cholesterol', 'monounsaturatedFat', 'polyunsaturatedFat', 'omega3', 'alphaLinolenicAcid', 'omega6'] },
  { id: 'brain', label: 'Brain & mood', icon: 'ti-brain', keys: ['choline', 'omega3', 'vitaminB12', 'folate', 'vitaminB6', 'iodine', 'iron'] },
  { id: 'sleep', label: 'Sleep & recovery', icon: 'ti-moon', keys: ['magnesium', 'potassium', 'vitaminB6', 'zinc', 'caffeine', 'alcohol'] },
  { id: 'skin', label: 'Skin, eyes & antioxidants', icon: 'ti-eye', keys: ['vitaminA', 'vitaminC', 'vitaminE', 'selenium', 'zinc', 'copper'] },
  { id: 'gut', label: 'Gut & blood sugar', icon: 'ti-apple', keys: ['fibre', 'sugar', 'addedSugar', 'magnesium'] },
];
