// Gate 1 of the common-dishes seeding pipeline (see the approved plan for
// the full 3-gate design). This step makes zero API calls and costs
// nothing — it just writes out the curated dish-name list for human review
// BEFORE any AI estimate is generated or a cent is spent. Edit the arrays
// below directly (add/remove/rename dishes) and rerun this script as many
// times as needed; nothing downstream runs until 02-generate-estimates.mjs
// is run deliberately against the reviewed output.

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const CATEGORIES = {
  'Australian breakfast & brunch': [
    'Smashed avocado on toast', 'Avocado on toast', 'Bacon and eggs', 'Big breakfast',
    'Eggs benedict', 'Poached eggs on toast', 'Scrambled eggs on toast', 'French toast',
    'Pancakes with maple syrup', 'Bircher muesli', 'Muesli with yoghurt', 'Porridge with honey',
    'Granola with yoghurt', 'Banana bread', 'Banana bread with butter', 'Eggs on toast',
    'Baked beans on toast', 'Toast with vegemite', 'Vegemite on toast', 'Crumpets with butter',
    'English muffin with jam', 'Weet-Bix with milk', 'Cornflakes with milk', 'Bacon and egg roll',
    'Breakfast burrito', 'Smoothie bowl', 'Acai bowl', 'Chia pudding', 'Yoghurt with berries',
    'Fruit salad', 'Hash browns', 'Corn fritters', 'Shakshuka', 'Omelette', 'Cheese omelette',
    'Ham and cheese omelette', 'Bacon and egg muffin', 'Sausage and egg muffin', 'Breakfast wrap',
    'Egg and bacon sandwich', 'Toasted banana bread', 'Croissant with jam', 'Pain au chocolat',
    'Danish pastry', 'Raisin toast', 'Fruit toast', 'Breakfast bruschetta', 'Poached eggs with spinach',
    'Eggs florentine', 'Waffle with syrup', 'Belgian waffle', 'Breakfast quesadilla', 'Overnight oats',
    'Protein pancakes', 'Smashed avo with feta', 'Egg white omelette', 'Breakfast skillet',
    'Sourdough toast with butter', 'Toasted muesli bar', 'Yoghurt parfait', 'Continental breakfast plate',
    // --- added: broad expansion pass ---
    'Breakfast burger', 'Ricotta hotcakes', 'Corn and haloumi fritters', 'Poached eggs with avocado and feta', 'Breakfast bowl with quinoa', 'Chia seed pudding with berries', 'Eggs and soldiers', 'Breakfast panini', 'Sweet potato hash with eggs', 'Turkish eggs', 'Breakfast sausage and eggs', 'Breakfast nachos', 'Coconut yoghurt bowl', 'Green smoothie bowl', 'Egg white and spinach wrap', 'Breakfast tacos',
  ],
  'Sandwiches, wraps, rolls, burgers': [
    'Ham and cheese sandwich', 'Ham and salad sandwich', 'Chicken sandwich', 'Egg and lettuce sandwich',
    'BLT', 'Club sandwich', 'Tuna sandwich', 'Cheese and tomato sandwich', 'Salad sandwich',
    'Chicken schnitzel roll', 'Chicken schnitzel burger', 'Chicken caesar wrap', 'Chicken avocado wrap',
    'Falafel wrap', 'Beef burrito wrap', 'Turkish bread sandwich', 'Toasted cheese sandwich',
    'Ham and cheese toastie', 'Toasted ham and cheese', 'Grilled cheese sandwich', 'Reuben sandwich',
    'Philly cheesesteak', 'Meatball sub', 'Chicken parma roll', 'Vietnamese pork roll', 'Banh mi',
    'Steak sandwich', 'Hamburger', 'Cheeseburger', 'Bacon cheeseburger', 'Double cheeseburger',
    'Veggie burger', 'Chicken burger', 'Fish burger', 'Lamb burger', 'Beef burger with the lot',
    'Aussie burger', 'Big Mac style burger', 'Pulled pork burger', 'Portobello mushroom burger',
    'Falafel burger', 'Hot dog', 'Chilli dog', 'Corn dog', 'Wrap with hummus', 'Greek wrap',
    'Chicken caesar sandwich', 'Egg mayo sandwich', 'Prawn sandwich', 'Smoked salmon bagel',
    'Bagel with cream cheese', 'Toasted turkish wrap', 'Chicken tikka wrap', 'Halloumi wrap',
    'Roast beef sandwich', 'Ham croissant', 'Turkey club sandwich', 'Meatball sandwich',
    'Chicken pesto sandwich', 'Salami sandwich', 'Pastrami sandwich', 'Vegemite and cheese sandwich',
    'Peanut butter sandwich', 'Jam sandwich', 'Nutella sandwich', 'Schnitzel sandwich', 'Pork roll',
    'Chicken salad sandwich', 'BBQ chicken wrap', 'Buffalo chicken wrap', 'Caprese sandwich',
    'Focaccia sandwich',
    // --- added: broad expansion pass ---
    'Mushroom swiss burger', 'Turkey avocado wrap', 'Chicken parmesan sandwich', 'Smoked salmon sandwich', "Ploughman's sandwich", 'Falafel pita pocket', 'BLT wrap', 'Chicken caesar sub', 'Buffalo chicken sandwich', 'Ham and pineapple sandwich', 'Chicken schnitzel sub', 'Beef brisket sandwich', 'Vegan burger patty wrap',
  ],
  'Australian bakery & takeaway classics': [
    'Meat pie', 'Chicken pie', 'Steak pie', 'Party pie', 'Sausage roll', 'Cheese and bacon roll',
    'Vegemite scroll', 'Cheese and vegemite scroll', 'Chicken parma', 'Chicken parmigiana',
    'Chicken schnitzel', 'Dim sim', 'Potato scallop', 'Potato cake', 'Spring roll', 'Curry puff',
    'Pastie', 'Cornish pastie', 'Chiko roll', 'Pluto pup', 'Battered sav', 'Donut', 'Jam donut',
    'Custard tart', 'Vanilla slice', 'Lamington', 'Apple turnover', 'Finger bun', 'Iced bun',
    'Cream bun', 'Hot cross bun', 'Scone with jam and cream', 'Pumpkin scone', 'Cheese scone',
    'Neenish tart', 'Butterfly cake', 'Vovo', 'Rock cake', 'Pikelet', 'Anzac biscuit',
    'Ginger nut biscuit', 'Chocolate eclair', 'Cream puff', 'Donut with sprinkles', 'Cinnamon donut',
    'Bacon and egg pie', 'Meat and vegetable pie', 'Cottage pie roll', 'Chicken and mushroom pie',
    'Beef pie', 'Gravy roll', 'Sausage roll with sauce', 'Pie with mash and gravy',
    'Sweet potato scallop', 'Fish cake', 'Crab stick roll', 'Prawn twister', 'Money bag',
    'Spring roll platter', 'Yum cha dumpling', 'Custard donut', 'Jam tart',
    // --- added: broad expansion pass ---
    'Vegetable pastie', 'Corned beef pie', 'Curry pie', 'Mince and cheese pie', 'Ham and cheese croissant', 'Spinach and fetta roll', 'Vegemite scroll mini', 'Bacon and cheese scroll', 'Lemon curd tart', 'Apple and custard danish', 'Chocolate croissant', 'Passionfruit slice', 'Coffee scroll', 'Chicken and gravy roll', 'Beef and gravy roll', 'Pie floater',
  ],
  'Fish & chips / seafood takeaway': [
    'Fish and chips', 'Grilled fish and chips', 'Battered fish', 'Crumbed fish', 'Calamari rings',
    'Salt and pepper squid', 'Prawn cutlets', 'Fish burger', 'Scallops', 'Seafood basket',
    'Fish cocktail', 'Prawn twister', 'Battered prawns', 'Fish taco', 'Grilled prawns',
    'Oysters natural', 'Oysters kilpatrick', 'Fish and salad', 'Crumbed prawns', 'Squid rings',
    'Whiting fillets', 'Flake and chips', 'Seafood platter', 'Chips with gravy',
    'Chips with chicken salt',
    // --- added: broad expansion pass ---
    'Fish burger with chips', 'Beer battered flake', 'Fish and chips with mushy peas', 'Grilled barramundi and chips', 'Butterflied prawns grilled', 'Battered sausage', 'Dim sim and chips', 'Salt and pepper prawns', 'Mussels in the shell', 'Moreton Bay bug', 'Blue swimmer crab', 'Fish kebab', 'Snapper fillets', 'Garfish fillets', "Fisherman's basket", 'Dory fillets crumbed', 'Prawn cutlets with tartare', 'Lobster mornay', 'Grilled swordfish', 'Battered scallops', 'Whitebait fritters', 'John Dory fillets', 'Crumbed calamari', 'Fish burger with slaw', 'Chips with aioli', 'Grilled fish burger', 'Salmon burger', 'Prawn cutlets crumbed',
  ],
  'Pizza & Italian mains': [
    'Margherita pizza', 'Hawaiian pizza', 'Pepperoni pizza', 'Meat lovers pizza', 'Supreme pizza',
    'BBQ chicken pizza', 'Vegetarian pizza', 'Capricciosa pizza', 'Marinara pizza', 'Prosciutto pizza',
    'Four cheese pizza', 'Garlic pizza', 'Vegan pizza', 'Spaghetti bolognese', 'Spaghetti carbonara',
    'Spaghetti marinara', 'Spaghetti napolitana', 'Fettuccine carbonara', 'Fettuccine alfredo',
    'Penne arrabbiata', 'Penne boscaiola', 'Lasagne', 'Vegetable lasagne', 'Cannelloni', 'Ravioli',
    'Gnocchi', 'Risotto', 'Mushroom risotto', 'Seafood risotto', 'Chicken parmigiana with pasta',
    'Chicken cacciatore', 'Osso buco', 'Veal marsala', 'Eggplant parmigiana', 'Caprese salad',
    'Bruschetta', 'Garlic bread', 'Cheesy garlic bread', 'Minestrone soup', 'Arancini', 'Tiramisu',
    'Panna cotta', 'Gelato', 'Calzone', 'Stromboli', 'Baked ziti', 'Puttanesca', 'Aglio e olio',
    'Pesto pasta', 'Carbonara with bacon', 'Bolognese with parmesan', 'Chicken parmesan pasta bake',
    'Meatball pasta', 'Tortellini', 'Ricotta ravioli', 'Zucchini pasta', 'Vongole', 'Seafood linguine',
    'Pumpkin ravioli', 'Spinach and ricotta cannelloni', 'Osso buco with risotto', 'Chicken saltimbocca',
    'Veal parmigiana', 'Beef ragu pasta', 'Tagliatelle bolognese', 'Polenta with mushrooms',
    'Caprese bruschetta', 'Mozzarella sticks', 'Antipasto platter', 'Focaccia bread',
    // --- added: broad expansion pass ---
    'Diavola pizza', 'Quattro formaggi pizza', 'Prosciutto and rocket pizza', 'Truffle mushroom pizza', 'Pumpkin and sage risotto', 'Beef carpaccio', 'Chicken parmigiana pizza', 'Vegetarian lasagne', 'Spaghetti aglio olio e peperoncino', 'Gnocchi with gorgonzola', 'Saltimbocca alla romana', 'Panzanella salad', 'Fritto misto', 'Prawn linguine', 'Tiramisu cup Italian',
  ],
  'Chinese (Aus-Chinese + authentic)': [
    'Sweet and sour pork', 'Sweet and sour chicken', 'Mongolian beef', 'Beef with black bean sauce',
    'Honey chicken', 'Lemon chicken', 'Salt and pepper chicken', 'Salt and pepper squid',
    'Kung pao chicken', 'Kung pao prawns', 'San choy bow', 'Dim sims', 'Dumplings',
    'Steamed pork buns', 'Char siu pork', 'Char siu bao', 'Wonton soup', 'Hot and sour soup',
    'Chow mein', 'Beef chow mein', 'Chicken chow mein', 'Singapore noodles', 'Hokkien noodles',
    'Egg fu yung', 'Fried rice', 'Chicken fried rice', 'Special fried rice', 'Yang chow fried rice',
    'Mapo tofu', 'Kung pao tofu', 'Braised eggplant', 'Twice cooked pork', 'Peking duck',
    'Crispy skin chicken', "General tso's chicken", 'Sesame chicken', 'Orange chicken',
    'Beef and broccoli', 'Chicken and cashew nuts', 'Prawn crackers', 'Spring rolls', 'Money bags',
    'Wontons fried', 'Steamed dumplings', 'Pan-fried dumplings', 'Xiao long bao', 'Congee',
    'Chicken congee', 'Century egg congee', 'Egg drop soup', 'Sizzling beef', 'Black pepper beef',
    'Claypot rice', 'Char kway teow', 'Beef chow fun', 'Roast duck', 'Salt and pepper tofu',
    'Cantonese chow mein', 'Yum cha assortment', 'Prawn dumplings', 'BBQ pork buns',
    'Sesame prawn toast', 'Prawn toast', 'Lemon tofu', 'Chilli chicken', 'Cumin lamb',
    'Sichuan noodles', 'Dan dan noodles', 'Beef noodle soup', 'Hand pulled noodles',
    'Scallion pancake', 'Chinese greens with oyster sauce', 'Braised beef brisket noodle soup',
    'Ma po eggplant', 'Salt and pepper pork ribs', 'Crispy shredded beef', 'Honey soy chicken',
    'Mongolian lamb', 'Special fried noodles', 'Cantonese fried rice', 'Sichuan hot pot',
    'Chinese BBQ pork',
    // --- added: broad expansion pass ---
    'Beef and snow peas', 'Salt and pepper chips Chinese style', 'Sichuan fish fillet', 'Steamed fish with ginger and shallots', 'Chinese broccoli with garlic', 'Braised pork belly Chinese style', 'Wonton noodle soup', 'Cumin beef', 'Sweet and sour fish', 'Ginger and shallot chicken', 'Stir fried pork with vegetables', 'Chinese sausage fried rice', 'Braised tofu with mushrooms', 'Chilli prawns Chinese style',
  ],
  Thai: [
    'Pad thai', 'Pad see ew', 'Pad kra pao', 'Green curry', 'Red curry', 'Massaman curry',
    'Yellow curry', 'Panang curry', 'Tom yum soup', 'Tom kha soup', 'Larb', 'Som tam',
    'Thai basil chicken', 'Thai fish cakes', 'Satay chicken', 'Chicken satay skewers',
    'Spring rolls Thai style', 'Thai fried rice', 'Pineapple fried rice', 'Pad woon sen',
    'Drunken noodles', 'Thai green papaya salad', 'Thai beef salad', 'Thai chicken curry',
    'Thai red duck curry', 'Crispy pork belly Thai style', 'Thai omelette', 'Mango sticky rice',
    'Thai iced tea', 'Satay beef skewers', 'Thai fishcakes', 'Tom yum goong', 'Massaman beef curry',
    'Khao soi', 'Larb gai', 'Thai basil beef', 'Cashew chicken Thai style', 'Crying tiger beef',
    'Thai crab curry', 'Thai prawn curry', 'Thai spring roll platter',
    'Pad prik king', 'Gaeng som', 'Thai roasted duck curry', 'Thai chicken wings',
    'Thai fried fish', 'Thai steamed fish', 'Thai vegetable curry', 'Thai tofu stir fry',
    'Nam tok', 'Thai chicken larb', 'Fried rice with prawns Thai style',
    'Thai satay skewers with peanut sauce', 'Thai noodle soup', 'Boat noodles',
    // --- added: broad expansion pass ---
    'Thai pumpkin curry', 'Thai crispy pork belly stir fry', 'Thai fried banana', 'Thai basil pork', 'Thai spicy squid salad', 'Thai peanut noodle salad', 'Thai grilled chicken skewers', 'Thai fried spring rolls with sweet chilli', 'Thai jungle curry', 'Thai pork larb', 'Thai mango salad with prawns', 'Thai duck curry noodle soup', 'Thai fried rice with crab', 'Thai chicken wing skewers',
  ],
  Vietnamese: [
    'Pho', 'Beef pho', 'Chicken pho', 'Vegetarian pho', 'Banh mi', 'Rice paper rolls',
    'Vietnamese spring rolls', 'Fresh spring rolls', 'Fried spring rolls', 'Bun cha',
    'Vermicelli noodle bowl', 'Bun bo hue', 'Vietnamese caramel pork', 'Com tam',
    'Broken rice with pork chop', 'Vietnamese lemongrass chicken', 'Vietnamese beef stir fry',
    'Vietnamese pancake', 'Banh xeo', 'Vietnamese noodle salad', 'Vietnamese spring roll salad',
    'Vietnamese grilled pork skewers', 'Bo luc lac', 'Vietnamese caramelised fish', 'Ca kho to',
    'Vietnamese chicken curry', 'Vietnamese sticky rice', 'Xoi', 'Vietnamese iced coffee',
    'Vietnamese fried rice', 'Vietnamese seafood noodle soup', 'Hu tieu',
    'Vietnamese beef noodle soup', 'Goi cuon', 'Cha gio', 'Vietnamese grilled chicken',
    'Vietnamese meatballs', 'Bun rieu', 'Vietnamese pork belly', 'Vietnamese omelette',
    'Vietnamese salad rolls', 'Banh mi with pork', 'Banh mi with chicken', 'Banh mi with tofu',
    'Vietnamese noodle bowl with prawns',
    // --- added: broad expansion pass ---
    'Banh mi op la', 'Ca ri ga', 'Vietnamese grilled fish', 'Bun thit nuong', 'Vietnamese sausage roll', 'Vietnamese pork skewers with vermicelli', 'Bo kho', 'Vietnamese clay pot fish', 'Vietnamese egg coffee', 'Banh cuon', 'Vietnamese grilled prawns', 'Vietnamese beef salad', 'Che dessert', 'Vietnamese sticky rice with pork', 'Vietnamese lemongrass pork chop',
  ],
  Japanese: [
    'Chicken katsu curry', 'Pork katsu curry', 'Katsu curry', 'Sushi rolls', 'California roll',
    'Salmon nigiri', 'Tuna nigiri', 'Sashimi platter', 'Chicken teriyaki', 'Salmon teriyaki',
    'Beef teriyaki', 'Ramen', 'Tonkotsu ramen', 'Miso ramen', 'Shoyu ramen', 'Chicken ramen',
    'Udon noodle soup', 'Soba noodles', 'Yakisoba', 'Yakitori skewers', 'Gyoza', 'Chicken gyoza',
    'Vegetable gyoza', 'Karaage chicken', 'Tempura', 'Vegetable tempura', 'Prawn tempura',
    'Tempura udon', 'Miso soup', 'Edamame', 'Okonomiyaki', 'Takoyaki', 'Onigiri',
    'Chicken teppanyaki', 'Beef teppanyaki', 'Donburi', 'Chicken katsu don', 'Gyudon', 'Unagi don',
    'Tonkatsu', 'Chicken karaage bowl', 'Salmon poke bowl', 'Tuna poke bowl', 'Bento box',
    'Agedashi tofu', 'Chawanmushi', 'Japanese curry rice', 'Beef curry Japanese style',
    'Chirashi bowl', 'Spicy tuna roll', 'Dragon roll', 'Rainbow roll', 'Salmon avocado roll',
    'Katsu sando', 'Wagyu beef bowl', 'Matcha dessert',
    // --- added: broad expansion pass ---
    'Chicken teriyaki don', 'Beef sukiyaki', 'Yakitori chicken skewers set', 'Tempura moriawase', 'Salmon sashimi platter', 'Curry udon Japanese', 'Nikujaga beef and potato stew', 'Oyakodon', 'Katsudon', 'Miso glazed salmon', 'Chirashi sushi bowl', 'Chicken yakitori don', 'Japanese hot pot nabe', 'Kaisen don seafood bowl', 'Vegetable tempura udon', 'Teppanyaki mixed grill', 'Japanese fried chicken karaage bento',
  ],
  Korean: [
    'Bibimbap', 'Korean fried chicken', 'Korean BBQ beef', 'Bulgogi', 'Kimchi jjigae',
    'Kimchi fried rice', 'Japchae', 'Korean spicy pork', 'Dak galbi', 'Tteokbokki',
    'Korean corn dog', 'Sundubu jjigae', 'Korean fried chicken wings', 'Galbi',
    'Korean beef short ribs', 'Kimbap', 'Korean pancake', 'Kimchi pancake', 'Seafood pancake',
    'Korean beef bulgogi bowl', 'Korean spicy noodles', 'Jajangmyeon', 'Korean cold noodles',
    'Naengmyeon', 'Korean fried tofu', 'Korean stir fried glass noodles', 'Doenjang jjigae',
    'Korean beef stew', 'Samgyeopsal', 'Korean grilled pork belly', 'Korean spicy chicken stew',
    'Dakbokkeumtang', 'Korean seaweed soup', 'Bibim guksu', 'Korean BBQ platter',
    // --- added: broad expansion pass ---
    'Ganjang gejang', 'Korean spicy rice cake soup', 'Yangnyeom chicken', 'Korean beef tartare', 'Korean fried squid', 'Jokbal', 'Kongnamul guk', 'Korean fish cake soup', 'Odeng skewers', 'Korean glass noodle stir fry', 'Korean corn cheese', 'Mandu dumplings', 'Korean rice cake skewers', 'Gimbap with tuna', 'Korean spicy rice cakes with fish cake', 'Korean beef ribs soup', 'Korean chicken skewers', 'Korean pancake with kimchi', 'Korean style fried chicken burger', 'Bibim naengmyeon', 'Korean seafood pancake',
  ],
  'Indian & South Asian': [
    'Butter chicken', 'Dal curry', 'Dal makhani', 'Chicken tikka masala', 'Chicken korma',
    'Lamb rogan josh', 'Beef vindaloo', 'Chicken vindaloo', 'Palak paneer', 'Paneer tikka',
    'Paneer butter masala', 'Saag paneer', 'Chana masala', 'Chickpea curry', 'Aloo gobi',
    'Aloo paratha', 'Vegetable samosa', 'Chicken samosa', 'Biryani', 'Chicken biryani',
    'Lamb biryani', 'Vegetable biryani', 'Tandoori chicken', 'Chicken tikka', 'Seekh kebab',
    'Lamb kofta', 'Naan bread', 'Garlic naan', 'Cheese naan', 'Roti', 'Paratha', 'Papadum',
    'Raita', 'Butter naan', 'Chicken makhani', 'Malai kofta', 'Dal tadka', 'Rajma',
    'Mattar paneer', 'Tandoori lamb chops', 'Fish curry Indian style', 'Goan fish curry',
    'Prawn curry Indian style', 'Chicken jalfrezi', 'Chicken saag', 'Lamb curry',
    'Beef curry Indian style', 'Mango lassi', 'Gulab jamun', 'Jalebi', 'Samosa chaat',
    'Pani puri', 'Bhel puri', 'Vada pav', 'Masala dosa', 'Idli', 'Sambar', 'Uttapam',
    'Chicken 65', 'Onion bhaji', 'Vegetable pakora', 'Chicken pakora', 'Aloo tikki',
    'Chole bhature', 'Kadhai chicken', 'Butter paneer', 'Egg curry', 'Keema curry',
    'Mutton curry', 'Chicken korma with rice', 'Prawn biryani', 'Egg biryani',
    'Hyderabadi biryani', 'Rasam', 'Chicken 65 dry', 'Palak chicken',
    'Tandoori prawns', 'Malabar chicken curry', 'Kerala fish curry', 'Punjabi chole',
    'Amritsari fish', 'Lahori chicken', 'Sri Lankan chicken curry', 'Sri Lankan dal curry',
    'Nepalese momos',
    // --- added: broad expansion pass ---
    'Pav bhaji', 'Misal pav', 'Dhokla', 'Kathi roll', 'Chicken chettinad', 'Andhra chicken curry', 'Bombay potatoes', 'Chettinad prawn curry', 'Fish moilee', 'Kadai paneer', 'Amritsari kulcha', 'Sindhi curry', 'Punjabi kadhi', 'Rasgulla', 'Kheer', 'Pindi chana',
  ],
  'Middle Eastern & Mediterranean': [
    'Shawarma plate', 'Chicken shawarma', 'Lamb shawarma', 'Beef shawarma', 'Falafel plate',
    'Hummus with pita', 'Baba ganoush', 'Tabouli', 'Fattoush salad', 'Moussaka', 'Greek salad',
    'Souvlaki', 'Chicken souvlaki', 'Lamb souvlaki', 'Gyros', 'Kebab plate', 'Doner kebab',
    'Lamb kofta kebab', 'Chicken kofta', 'Baklava', 'Spanakopita', 'Dolmades', 'Halloumi salad',
    'Grilled halloumi', 'Lamb tagine', 'Chicken tagine', 'Couscous salad',
    'Falafel wrap Mediterranean', 'Turkish pide', 'Lahmacun', 'Turkish pizza', 'Adana kebab',
    'Turkish delight', 'Manakeesh', 'Zaatar bread', 'Labneh', 'Muhammara', 'Mujadara',
    'Shakshuka Middle Eastern style', 'Kibbeh', 'Fattet hummus', 'Grilled lamb chops',
    'Persian chicken kebab', 'Persian rice', 'Lebanese rice', 'Kofta with rice', 'Sujuk',
    'Mixed grill plate', 'Lamb shoulder tagine', 'Chicken biryani Lebanese style', 'Baklawa',
    'Konafa', 'Umm ali', 'Turkish coffee dessert', 'Halva', 'Stuffed vine leaves',
    'Kibbeh nayeh', 'Falafel salad plate', 'Greek moussaka bake', 'Grilled octopus',
    'Calamari Greek style', 'Feta and olive plate', 'Pita and dips platter',
    'Chicken shish kebab', 'Beef kofta plate', 'Lamb shish kebab',
    // --- added: broad expansion pass ---
    'Musakhan', 'Fatteh', 'Freekeh pilaf', 'Chicken fatteh', 'Lentil kibbeh', 'Baba ganoush plate', 'Batata harra', 'Sujuk with eggs', 'Mansaf', 'Kunafa cheese dessert', 'Warak enab', 'Kofta kebab plate with rice', 'Grilled kafta skewers', 'Zaatar manakish', 'Chicken shawarma plate with rice',
  ],
  'Mexican & Latin American': [
    'Beef burrito', 'Chicken burrito', 'Bean burrito', 'Tacos', 'Beef tacos', 'Chicken tacos',
    'Fish tacos', 'Pork tacos', 'Nachos', 'Loaded nachos', 'Quesadilla', 'Chicken quesadilla',
    'Beef quesadilla', 'Empanada', 'Beef empanada', 'Chicken empanada', 'Enchiladas',
    'Chicken enchiladas', 'Beef enchiladas', 'Burrito bowl', 'Chipotle bowl',
    'Guacamole with chips', 'Mexican rice', 'Refried beans', 'Churros', 'Fajitas',
    'Chicken fajitas', 'Beef fajitas', 'Tamales', 'Chilaquiles', 'Tostadas', 'Ceviche',
    'Pozole', 'Carnitas', 'Al pastor tacos', 'Elote', 'Mexican street corn', 'Arepas',
    'Colombian empanadas', 'Brazilian feijoada', 'Brazilian churrasco', 'Peruvian ceviche',
    'Cuban sandwich', 'Argentinian steak', 'Chimichurri steak', 'Mole chicken',
    // --- added: broad expansion pass ---
    'Birria tacos', 'Chicken tinga tacos', 'Barbacoa tacos', 'Huevos rancheros', 'Tres leches cake', 'Flan', 'Arroz con pollo', 'Pupusas', 'Salvadoran pupusas with curtido', 'Cuban rice and beans', 'Aji de gallina', 'Lomo saltado', 'Peruvian chicken with rice', 'Molcajete', 'Elotes with cotija cheese', 'Chile relleno', 'Sopes', 'Camarones a la diabla', 'Beef birria stew', 'Guacamole and tortilla chips', 'Mexican street tacos platter', 'Tostones',
  ],
  'American/Western comfort & fast food': [
    'Mac and cheese', 'Fried chicken', 'Buffalo wings', 'Chicken tenders', 'Chicken nuggets',
    'Onion rings', 'Chilli con carne', 'Clam chowder',
    'Baked mac and cheese', 'BBQ ribs', 'Pulled pork sandwich', 'Coleslaw', 'Cornbread',
    'Meatloaf', 'Fried chicken sandwich', 'Popcorn chicken', 'Corn on the cob',
    'Baked potato with sour cream', 'Loaded fries', 'Poutine', 'Chicken and waffles',
    'Philly cheesesteak fries', 'Buffalo cauliflower', 'Southern fried chicken',
    'Biscuits and gravy', 'Sloppy joe', 'French fries', 'Curly fries', 'Waffle fries',
    'Cheese fries', 'Jalapeno poppers', 'Chicken fried steak', 'Ribeye steak', 'T-bone steak', 'Steak and eggs',
    'Grilled cheese with tomato soup', 'Turkey club', 'Cobb salad',
    'Pulled pork nachos', 'Brisket sandwich',
    'Smoked brisket', 'Mac and cheese bites', 'Deep dish pizza', 'New york style pizza',
    'Bagel with lox', 'Philadelphia cheesesteak', 'Baked beans American style',
    'Cornbread with butter', 'Fried pickles', 'Hush puppies', 'Shrimp and grits', 'Gumbo',
    'Jambalaya',
    // --- added: broad expansion pass ---
    'Buttermilk fried chicken', 'Chicken and biscuit', 'BBQ pulled pork sliders', 'Loaded nacho fries', 'Chicken pot pie', 'Corn dog bites', 'Bacon cheeseburger sliders', 'Southern biscuits with gravy', 'Buffalo chicken dip', 'Baked beans with bacon', 'Grilled cheese melt', 'Chicken parmesan sub', 'Meatball sub American style', 'Fried green tomatoes', 'Shrimp po boy', 'New england clam chowder bread bowl', 'Cheese steak egg rolls', 'Chicken fried bacon', 'Kansas city BBQ ribs',
  ],
  'British/European classics': [
    'Fish pie', "Shepherd's pie", 'Cottage pie', 'Beef stroganoff', 'Chicken schnitzel European style',
    'Wiener schnitzel', 'Goulash', 'Beef bourguignon', 'Coq au vin', 'Toad in the hole',
    'Bangers and mash', 'Steak and kidney pie', 'Yorkshire pudding', 'Roast beef with Yorkshire pudding',
    "Ploughman's lunch", 'Cornish pasty', 'Full English breakfast', 'Chicken kiev', 'Beef wellington',
    'Sunday roast', 'Pork belly with crackling', 'Duck confit', 'French onion soup', 'Quiche lorraine',
    'Croque monsieur', 'Ratatouille', 'Paella', 'Tortilla espanola', 'Spanish omelette',
    'Chorizo and beans', 'Gazpacho', 'Polish pierogi', 'German sausage with sauerkraut', 'Bratwurst',
    'Schnitzel with chips', 'Beef goulash with dumplings', 'Irish stew', 'Colcannon', 'Haggis',
    'Swedish meatballs',
    // --- added: broad expansion pass ---
    'Toad in the hole with onion gravy', 'Beef and ale pie', 'Kedgeree', 'Welsh rarebit', 'Bubble and squeak', 'Lancashire hotpot', 'Spotted dick', 'Fish and chips British style', 'Steak and ale pie', 'Chicken and leek pie', 'Devilled kidneys', 'Black pudding', 'French cassoulet', 'Beef bourguignon with mash', 'Spanish paella seafood', 'Italian osso buco milanese', 'German bratwurst with sauerkraut', 'Belgian moules frites', 'Portuguese custard tart', 'Greek moussaka', 'Hungarian goulash with noodles', 'Austrian wiener schnitzel with potato salad',
  ],
  'Salads & grain bowls': [
    'Caesar salad', 'Chicken caesar salad', 'Greek salad', 'Garden salad', 'Caprese salad',
    'Poke bowl', 'Salmon poke bowl', 'Buddha bowl', 'Quinoa salad', 'Superfood salad', 'Kale salad',
    'Waldorf salad', 'Coleslaw', 'Potato salad', 'Pasta salad', 'Rice salad', 'Cobb salad',
    'Thai beef salad', 'Vietnamese chicken salad', 'Nicoise salad', 'Grilled chicken salad',
    'Roast pumpkin salad', 'Beetroot and feta salad', 'Chickpea salad', 'Lentil salad',
    'Couscous salad Mediterranean', 'Soba noodle salad', 'Asian slaw', 'Tabbouleh salad',
    'Fattoush', 'Halloumi and roast veg salad', 'Prawn salad', 'Warm quinoa bowl',
    'Falafel salad bowl', 'Mexican salad bowl', 'Grain bowl with tofu', 'Brown rice power bowl',
    'Sweet potato bowl', 'Vegan buddha bowl', 'Roast vegetable salad',
    // --- added: broad expansion pass ---
    'Tuna nicoise bowl', 'Chicken quinoa bowl', 'Roast pumpkin and feta salad', 'Mediterranean grain bowl', 'Warm lentil salad', 'Beetroot quinoa salad', 'Vietnamese vermicelli salad', 'Charred corn salad', 'Roasted cauliflower salad', 'Barley salad', 'Broccolini and almond salad', 'Freekeh salad', 'Edamame and soba salad', 'Chicken avocado salad', 'Watermelon and feta salad', 'Kimchi rice bowl', 'Farro salad', 'Spinach and strawberry salad', 'Chicken cobb salad bowl', 'Roast beetroot and walnut salad',
  ],
  'Soups & stews': [
    'Pumpkin soup', 'Minestrone soup', 'Chicken noodle soup', 'Beef stew', 'Laksa', 'Chicken laksa',
    'Vegetable soup', 'Tomato soup', 'Broccoli and cheese soup', 'Corn soup', 'Lentil soup',
    'Split pea soup', 'Clam chowder soup', 'Seafood chowder',
    'Beef and vegetable soup', 'Chicken and corn soup', 'Miso soup Japanese', 'Pho soup Vietnamese',
    'Goulash soup', 'Irish stew soup', 'Beef bourguignon stew', 'Chicken stew', 'Lamb stew',
    'Curry laksa', 'Asian noodle soup', 'Ramen soup', 'Udon soup', 'Congee soup', 'Mushroom soup',
    'Carrot and ginger soup', 'Sweet potato soup', 'Cauliflower soup', 'Chicken tortilla soup',
    'Black bean soup', 'Gumbo stew', 'Jambalaya stew', 'Beef chilli stew', 'Lamb tagine stew',
    'Massaman beef stew', 'Osso buco stew', 'Vegetable minestrone',
    // --- added: broad expansion pass ---
    'Borscht', 'Minestrone with pasta', 'French onion soup with cheese crouton', 'Butternut squash soup', 'Thai coconut chicken soup', 'Beef and barley soup', 'Split pea and ham soup', 'Cream of mushroom soup', 'Zucchini soup', 'Miso soup with tofu', 'Chicken and sweetcorn soup', 'Vichyssoise', 'Bouillabaisse', 'Goulash soup Hungarian', 'Sancocho stew', 'Groundnut stew', 'Irish beef and Guinness stew', 'Cream of pumpkin soup', 'Curried parsnip soup', 'Beef pho soup',
  ],
  'Rice & noodle dishes': [
    'Fried rice', 'Nasi goreng', 'Congee rice', 'Paella rice', 'Biryani rice',
    'Egg fried rice', 'Vegetable fried rice', 'Pad thai noodles', 'Chow mein noodles',
    'Yaki udon', 'Rice noodle salad',
    'Glass noodle salad', 'Japchae noodles', 'Rice pilaf', 'Coconut rice', 'Lemon rice',
    'Tomato rice', 'Jasmine rice bowl', 'Sticky rice', 'Nasi lemak', 'Mee goreng',
    'Kway teow soup', 'Bihun goreng', 'Claypot chicken rice', 'Hainanese chicken rice',
    'Yangzhou fried rice', 'Bibimbap rice bowl', 'Risotto rice dish',
    // --- added: broad expansion pass ---
    'Fried rice with vegetables', 'Pad woon sen glass noodles', 'Nasi campur', 'Fried rice with char siu', 'Vegetable biryani rice bowl', 'Chicken rice plate', 'Curry rice bowl', 'Duck rice', 'Fried rice with egg and spring onion', 'Rice noodle rolls', 'Rice vermicelli stir fry', 'Nasi padang', 'Tomato egg rice bowl', 'Curry udon', 'Somen noodles cold', 'Cellophane noodle stir fry', 'Fried rice with prawns and peas', 'Rice congee with pork', 'Beef brisket noodle bowl', 'Egg noodle stir fry', 'Fried rice ball onigiri style', 'Steamed rice with stir fried greens',
  ],
  'Vegetarian/vegan composite dishes': [
    'Veggie burger', 'Tofu stir fry', 'Chickpea curry vegan', 'Vegan bolognese', 'Vegan lasagne',
    'Vegan pad thai', 'Vegan butter chicken', 'Vegan mac and cheese', 'Vegan pizza', 'Vegan nachos',
    'Vegan burrito bowl', 'Vegan chilli', 'Vegan curry', "Lentil shepherd's pie",
    "Vegan shepherd's pie", 'Vegan meatballs', 'Falafel bowl vegan', 'Vegan katsu curry',
    'Tempeh stir fry', 'Vegan poke bowl', 'Vegan sushi rolls', 'Vegan pho', 'Vegan ramen',
    'Vegan biryani', 'Vegan dal', 'Vegan korma', 'Jackfruit tacos', 'Vegan pulled pork',
    'Vegan burger with the lot', 'Vegan schnitzel', 'Vegan carbonara', 'Vegan gnocchi',
    'Vegan risotto', 'Vegan stir fry noodles', 'Tofu pad thai', 'Cauliflower buffalo wings',
    'Vegan spring rolls', 'Vegan dumplings', 'Vegan sausage roll', 'Vegan pie',
    'Stuffed capsicum vegan', 'Vegan moussaka', 'Vegan paella', 'Vegan chow mein', 'Vegan fried rice',
    // --- added: broad expansion pass ---
    'Vegan tacos', 'Vegan enchiladas', 'Vegan pizza with vegetables', 'Vegan katsu sando', 'Vegan larb', 'Vegan dumplings fried', 'Vegan cottage pie', 'Tofu katsu curry', 'Vegan carbonara with mushroom', 'Vegan meatball sub', 'Vegan chicken burger', 'Vegan bibimbap', 'Vegan tikka masala', 'Tempeh curry', 'Vegan quiche', 'Vegan lentil bolognese', 'Vegan cauliflower wings', 'Jackfruit curry', 'Vegan beef stroganoff', 'Vegan gyoza',
  ],
  'Desserts, cakes & sweets': [
    'Pavlova', 'Lamington cake', 'Tiramisu', 'Cheesecake', 'New York cheesecake', 'Chocolate cake',
    'Carrot cake', 'Red velvet cake', 'Sticky date pudding', 'Chocolate mud cake', 'Banoffee pie',
    'Apple pie', 'Apple crumble', 'Sticky toffee pudding', 'Creme brulee', 'Panna cotta dessert',
    'Tiramisu cup', 'Brownie', 'Chocolate brownie', 'Blondie', 'Mud cake slice', 'Cupcake',
    'Vanilla cupcake', 'Chocolate cupcake', 'Donut dessert', 'Churros dessert', 'Baklava dessert',
    'Gulab jamun dessert', 'Ice cream sundae', 'Chocolate mousse',
    'Lemon meringue pie', 'Fruit tart', 'Custard tart dessert', 'Eclair', 'Profiteroles',
    'Macarons', 'French macaron', 'Cannoli', 'Gelato scoop', 'Sorbet', 'Affogato', 'Tim tam',
    'Anzac biscuits dessert', 'Chocolate chip cookie', 'Shortbread',
    'Scones with jam and cream dessert', 'Bread and butter pudding', 'Rice pudding', 'Trifle',
    'Pecan pie', 'Key lime pie', 'Black forest cake', 'Opera cake', 'Battenberg cake',
    'Victoria sponge cake', 'Angel food cake', 'Rocky road', 'Fudge', 'Peppermint slice',
    'Caramel slice', 'Chocolate crackle', 'Fairy bread dessert', 'Jelly and ice cream',
    'Pavlova with berries',
    // --- added: broad expansion pass ---
    'Baklava roll', 'Eton mess', 'Banana split', 'Chocolate lava cake', 'Tiramisu cheesecake', 'Mango pudding', 'Coconut ice', 'Basque cheesecake', 'Choc chip cookie sundae', 'Malva pudding', 'Persimmon pudding', 'White chocolate mud cake', 'Ferrero cheesecake', 'Nutella crepe', 'Mochi ice cream', 'Dulce de leche cake',
  ],
  'Snacks, dips & party food': [
    'Party pies', 'Mini sausage rolls', 'Spring rolls party size', 'Arancini balls', 'Nachos platter',
    'Cheese platter', 'Antipasto platter Aus', 'Chips and dip', 'Corn chips with salsa',
    'Sour cream and chive dip', 'French onion dip', 'Spinach and cheese dip', 'Hummus dip',
    'Guacamole dip', 'Vegetable sticks with dip', 'Cheese and crackers', 'Chicken wings party',
    'Mini quiches', 'Sausage rolls party', 'Party sandwiches', 'Cocktail meatballs', 'Vol au vents',
    'Mini spring rolls', 'Prawn twisters party', 'Dim sim party platter', 'Popcorn', 'Pretzels',
    'Potato chips', 'Cheese twists', 'Cheerios biscuits', 'Rice crackers',
    'Chicken satay skewers party', 'Bruschetta party', 'Deviled eggs', 'Sausage sizzle',
    'BBQ sausage on bread', 'Sausage sizzle with onions', 'Mini pizzas', 'Cheese cubes',
    'Pigs in blankets', 'Cheese balls', 'Spinach and ricotta triangles', 'Samosas party platter',
    'Vegetable spring rolls party', 'Cocktail franks', 'Chips and gravy party',
    // --- added: broad expansion pass ---
    'Cheese kransky rolls', 'Mini hot dogs', 'Cocktail spring rolls', 'Mini beef sliders', 'Prawn crackers party', 'Cheese and spinach triangles', 'Chicken drumettes party', 'Mini quiches lorraine', 'Beetroot dip', 'Tzatziki dip with pita', 'Olive tapenade with bread', 'Mini spinach pies', 'Salt and pepper squid party platter', 'Rice paper roll party platter', 'Bacon wrapped dates', 'Cheese fondue with bread', 'Party pinwheels',
  ],
  "Café/pub food & kids'/lunchbox items": [
    'Chicken nuggets kids', 'Fairy bread', 'Vegemite sandwich', 'Ham and cheese toastie kids',
    'Fish fingers', 'Fish finger sandwich', 'Cheese toastie', 'Mac and cheese kids',
    'Spaghetti on toast', 'Baked beans kids', 'Chicken schnitzel kids meal', 'Sausages and mash',
    'Mini pizzas kids', 'Chicken drumsticks', 'Sausage sizzle kids', 'Cheerios kids snack', 'Toasted sandwich', 'Pub parma',
    'Pub schnitzel', 'Chicken parmigiana pub', 'Steak and chips pub', 'Pub burger', 'Pub nachos', 'Pub calamari', 'Chicken wings pub',
    'Pub caesar salad', 'Beer battered fish', 'Pub steak sandwich', 'Loaded potato skins',
    'Pub garlic bread', 'Chicken caesar wrap pub', 'Pub pasta', 'Pub curry',
    'Pub risotto', 'Kids fish and chips', 'School lunchbox sandwich', 'Lunchbox wrap', 'Muesli bar',
    'Fruit box snack', 'Cheese stick snack',
    // --- added: broad expansion pass ---
    'Kids spaghetti bolognese', 'Kids mini pizza', 'Lunchbox fruit pouch', 'Lunchbox cheese and crackers', 'Lunchbox ham sandwich', 'Kids pasta with butter', 'Kids sausages and mash', 'Pub fish and chips', 'Pub chicken schnitzel with chips', 'Pub beef burger', 'Pub seafood basket', 'Pub roast dinner', 'Kids chicken tenders', 'School lunch sushi roll', 'Kids vegemite sandwich', 'Kids yoghurt pouch', 'Pub fish tacos', 'Pub loaded wedges',
  ],
  'BBQ, roasts & grilled mains': [
    'Roast lamb', 'Roast lamb with vegetables', 'BBQ ribs Aus', 'Steak with chips',
    'Sunday roast chicken', 'Roast pork', 'Roast pork with crackling', 'Roast beef', 'Roast chicken',
    'BBQ chicken', 'BBQ pork ribs', 'Grilled steak', 'Ribeye steak grilled', 'T-bone steak grilled',
    'Grilled lamb chops', 'BBQ lamb skewers', 'Grilled sausages', 'BBQ prawns', 'Grilled salmon',
    'Grilled barramundi', 'BBQ chicken skewers', 'Char-grilled chicken', 'Grilled pork chops',
    'BBQ brisket', 'Smoked pork ribs', 'Grilled kangaroo steak', 'BBQ mixed grill',
    'Grilled corn on the cob BBQ', 'Roast vegetables', 'Grilled vegetable skewers',
    // --- added: broad expansion pass ---
    'BBQ pork belly', 'Grilled snapper', 'BBQ lamb cutlets', 'Char-grilled octopus', 'Grilled chicken tenderloins', 'BBQ butterflied chicken', 'Roast turkey', 'Grilled scotch fillet', 'BBQ pork belly skewers', 'Grilled swordfish steak', 'BBQ whole snapper', 'Rotisserie chicken', 'Char-grilled prawns skewers', 'Grilled lamb backstrap', 'Slow cooked pulled lamb', 'Grilled rump steak', 'BBQ butterflied lamb', 'Grilled quail', 'Smoked beef brisket', 'BBQ chicken wings', 'Grilled flathead fillets', 'Char-grilled zucchini and haloumi', 'Whole roast chicken with stuffing', 'Grilled T-bone with chimichurri', 'Beef short ribs BBQ', 'Slow roasted pork shoulder', 'Grilled porterhouse steak',
  ],
};

const dishes = [];
const seen = new Set();
for (const [category, names] of Object.entries(CATEGORIES)) {
  for (const name of names) {
    const key = name.trim().toLowerCase();
    if (seen.has(key)) {
      console.warn(`Duplicate skipped: "${name}" (category: ${category})`);
      continue;
    }
    seen.add(key);
    dishes.push({ name: name.trim(), category });
  }
}

const outPath = join(__dirname, 'dish-list.json');
writeFileSync(outPath, JSON.stringify(dishes, null, 2));

console.log(`Wrote ${dishes.length} dishes across ${Object.keys(CATEGORIES).length} categories to ${outPath}`);
const counts = Object.entries(CATEGORIES).map(([cat, names]) => `  ${cat}: ${names.length}`);
console.log(counts.join('\n'));
