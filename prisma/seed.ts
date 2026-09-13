// Seed: Istanbul Cafe & Restaurant's menu (from their QR menu, August 2026, prices in naira),
// tables in three areas, demo staff accounts, and restaurant settings.
// Safe to re-run: staff and tables are upserted; the menu is only created once.
import "dotenv/config";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { prisma } from "../src/lib/db";

const STAFF = [
  { staffCode: "A001", name: "Restaurant Admin", role: "ADMIN", secret: "admin1234" },
  { staffCode: "M001", name: "Emre Yıldız", role: "MANAGER", secret: "manager123" },
  { staffCode: "W001", name: "Aisha Musa", role: "WAITER", secret: "1111" },
  { staffCode: "W002", name: "Emeka Obi", role: "WAITER", secret: "2222" },
  { staffCode: "W003", name: "Zainab Umar", role: "WAITER", secret: "3333" },
  { staffCode: "W004", name: "Daniel Okon", role: "WAITER", secret: "4444" },
  { staffCode: "K001", name: "Ibrahim Lawal", role: "KITCHEN", station: "KITCHEN", secret: "5555" },
  { staffCode: "B001", name: "Blessing Eze", role: "KITCHEN", station: "BAR", secret: "6666" },
] as const;

// The main hall (crimson banquettes, 6-seaters at the back), the covered terrace
// looking out towards Jabi Lake, and the room they book for private dining.
const TABLES = [
  ...Array.from({ length: 16 }, (_, i) => ({ label: `T${i + 1}`, area: "Main Hall", seats: i >= 12 ? 6 : 4 })),
  ...Array.from({ length: 12 }, (_, i) => ({ label: `P${i + 1}`, area: "Terrace", seats: 4 })),
  ...Array.from({ length: 2 }, (_, i) => ({ label: `VIP${i + 1}`, area: "Private Dining", seats: 10 })),
];

type Group = { name: string; required: boolean; options: { name: string; priceKobo: number }[] };
const choice = (name: string, options: string[], required = true): Group => ({
  name,
  required,
  options: options.map((o) => ({ name: o, priceKobo: 0 })),
});
/** A choice where some options cost more: [name, extra naira]. */
const priced = (name: string, options: [string, number][]): Group => ({
  name,
  required: true,
  options: options.map(([o, naira]) => ({ name: o, priceKobo: naira * 100 })),
});
// Their soups and tirit come "spicy or no spicy".
const SPICE = choice("Spice", ["Spicy", "Mild"]);
const COOKED = choice("Cooked", ["Medium rare", "Medium", "Medium well", "Well done"]);
const SCOOPS = ["Vanilla", "Chocolate", "Strawberry", "Lemon", "Pistachio", "Banana", "Oreo"];
const SUGAR = choice("Sugar", ["No sugar", "With sugar"]);
const LAMB = "Made with lamb.";

type Item = {
  name: string;
  desc?: string;
  naira: number;
  prep?: number;
  tags?: string[];
  photo?: string;
  featured?: boolean;
  options?: Group[];
  /** On the menu but switched off right now (they can turn it back on from the kitchen screen). */
  soldOut?: boolean;
};
type Section = { category: string; station?: "BAR"; prep: number; items: Item[] };

const MENU: Section[] = [
  {
    category: "Breakfast",
    prep: 12,
    items: [
      { name: "Menemen with Bread", desc: "Turkish breakfast of eggs scrambled with tomatoes, peppers, onion and cheddar", naira: 16000, photo: "menemen", tags: ["vegetarian", "signature"] },
      {
        name: "Omelet",
        desc: "Plain, or with cheese, mushrooms or fresh herbs",
        naira: 13000,
        photo: "omelette",
        tags: ["vegetarian"],
        options: [priced("Style", [["Plain", 0], ["Cheese", 2000], ["Mushroom & cheese", 2000], ["Fresh herbs & cheese", 2000]])],
      },
    ],
  },
  {
    category: "Starters & Sides",
    prep: 12,
    items: [
      { name: "Fingers Plate", desc: "Beef sausage, fries, spring rolls and samosa", naira: 28000, photo: "spring-rolls" },
      { name: "Crispy Chicken with Fries", desc: "Extra-crispy chicken strips and fries with our house sauce and creamy garlic sauce", naira: 25000, photo: "crispy-chicken" },
      { name: "Marinated Lamb Liver", desc: "With garlic cauliflower purée and roasted vegetables", naira: 24000 },
      { name: "Sautéed Liver", naira: 24000 },
      { name: "Turkish Bread", desc: "Freshly baked", naira: 600, prep: 3, photo: "turkish-bread", tags: ["vegetarian"] },
      { name: "Garlic Bread", desc: "Price per piece — a freshly baked bun brushed with herb butter and parsley", naira: 2000, prep: 6, photo: "garlic-bread", tags: ["vegetarian"] },
      { name: "French Fries with Special Sauces", naira: 15000, prep: 8, photo: "fries", tags: ["vegetarian"] },
      { name: "Cheddar Cheese Fries", naira: 23500, prep: 8, tags: ["vegetarian"] },
      { name: "Mashed Potato", naira: 12000, prep: 8, tags: ["vegetarian"] },
    ],
  },
  {
    category: "Soups",
    prep: 10,
    items: [
      { name: "Traditional Lamb Tandoori Soup", desc: "Turkish soup of tender lamb in a rich broth — spicy or mild", naira: 18000, tags: ["signature"], options: [SPICE] },
      { name: "Goat Meat Pepper Soup", desc: "Bone-in goat meat simmered in a spicy, aromatic pepper broth with traditional herbs", naira: 18000, photo: "pepper-soup", tags: ["spicy"] },
      { name: "Fish Pepper Soup", desc: "Fresh catfish in a bold, spicy broth with hot peppers and traditional herbs", naira: 16000, tags: ["spicy"] },
      { name: "Soup of the Day", desc: "Ask your waiter what's in the pot today", naira: 16000, photo: "lentil-soup" },
    ],
  },
  {
    category: "Chef's Signature",
    prep: 30,
    items: [
      { name: "Beef Rossini", desc: "South African ribeye tenderloin in demi-glace, finished with butter", naira: 90000, photo: "rib-eye", tags: ["signature"], options: [COOKED] },
      { name: "Salmon with Orange", desc: "Salmon with orange juice, cream, tarragon and peppercorns", naira: 52000, prep: 25, photo: "salmon" },
      { name: "Chef's Combo Platter", naira: 140000, prep: 35, photo: "platter", tags: ["signature"] },
      { name: "Chicken Escalope", desc: "Crispy escalope filled with melted cheese, on a spicy sauce with crunchy cabbage", naira: 32000, prep: 25, photo: "escalope", tags: ["spicy"] },
      { name: "Golden Cream Chicken", desc: "Chicken with mashed potato, creamy curry and pesto sauce, broccoli, cauliflower, green beans and carrots", naira: 30500, prep: 25 },
      { name: "Let the Chef Take Care of You", desc: "The chef cooks for your table. Price per person, groups of 4 or more — order one per guest. Extra drinks not included.", naira: 100000, prep: 45, tags: ["signature"] },
    ],
  },
  {
    category: "Istanbul Selections",
    prep: 25,
    items: [
      { name: "King Lamb Chops", desc: "Grilled lamb chops on creamy hummus, cooked in their own juices, with grilled pepper and parsley", naira: 52000, photo: "lamb-chops", featured: true, tags: ["signature"] },
      { name: "Grilled Lamb Chops", naira: 47000, photo: "lamb-chops" },
      { name: "Ribeye Steak", desc: "South African ribeye with cauliflower purée and fries. Allow 30 minutes.", naira: 90000, prep: 30, photo: "rib-eye", featured: true, options: [COOKED] },
      { name: "Pepper Steak", desc: "South African ribeye tenderloin with mushrooms, black pepper and demi-glace, American potatoes, corn and mustard. Allow 30 minutes.", naira: 85000, prep: 30, photo: "t-bone", options: [COOKED] },
      { name: "Grilled Chicken with Fried Rice", desc: "Grilled chicken in a rich spiced sauce with aromatic rice and roasted seasonal vegetables", naira: 25000, photo: "chicken-breast", tags: ["spicy"] },
      { name: "BBQ Chicken with Curry Pasta", desc: "Chicken strips glazed in BBQ sauce with creamy curry penne and a garden salad", naira: 30000 },
      { name: "Curry Chicken with Penne Arabiata", desc: "Chicken strips in a creamy curry sauce with spicy penne arabiata and a garden salad", naira: 30000, tags: ["spicy"] },
      { name: "Crispy Chicken with Creamy Pasta", desc: "Crispy golden chicken with creamy penne and a garden salad", naira: 30000, photo: "creamy-pasta" },
    ],
  },
  {
    category: "Kebabs",
    prep: 25,
    items: [
      { name: "Istanbul Special Mix Kebab", desc: `Plain Turkish kebab, chicken skewers, chicken wings, lamb skewers and tomato kebab on one plate. ${LAMB}`, naira: 46000, photo: "mix-kebab", featured: true, tags: ["signature", "popular"] },
      { name: "Adana Kebab", desc: `Hand-minced kebab flavoured with red pepper — hot. ${LAMB}`, naira: 30000, photo: "adana-kebab", featured: true, tags: ["spicy"] },
      { name: "Urfa Kebab", desc: `Hand-minced kebab seasoned with just salt — not spicy. ${LAMB}`, naira: 30000, photo: "urfa-kebab" },
      { name: "Sultan's Lamb", desc: `Lamb on a smoky eggplant cream. ${LAMB}`, naira: 42000, photo: "sultans-lamb", featured: true, tags: ["signature"] },
      { name: "Sultan's Kebab", desc: `Adana kebab on a smoky eggplant cream. ${LAMB}`, naira: 38500, tags: ["spicy"] },
      { name: "Ezmeli Kebab", desc: `Minced kebab with pepper, under a tomato, onion and parsley ezme. ${LAMB}`, naira: 36000, tags: ["spicy"] },
      { name: "Pistachio Kebab", desc: `Plain minced kebab cooked with pistachios and just salt. ${LAMB}`, naira: 39000 },
      { name: "Almond Kebab", desc: "Grilled minced lamb with crushed almonds, rice, lavash, roasted vegetables and yoghurt", naira: 37000 },
      { name: "Chef's Kebab", desc: `Minced kebab and cheese wrapped in thin tortilla, served with warm butter. ${LAMB}`, naira: 34000, tags: ["spicy"] },
      { name: "Sarma Couplet", desc: `Adana kebab wrapped in thin tortilla, topped with tomato sauce and yoghurt. ${LAMB}`, naira: 34000, photo: "sarma-couplet", tags: ["spicy"] },
      { name: "Lamb Skewers", desc: "With rice and roasted vegetables", naira: 40000, photo: "lamb-skewers" },
      { name: "Turkish Skewers (Çöp Şiş)", desc: "Little lamb skewers with roasted peppers, onions and rice", naira: 40000, photo: "beef-skewers" },
      { name: "Chicken Skewers", desc: "Marinated in our special sauce, with rice and roasted vegetables", naira: 28000, photo: "chicken-skewers" },
      { name: "Grilled Chicken Wings with Chili Sauce", desc: "Wings marinated in our special sauce, with rice", naira: 32000, photo: "chicken-wings", tags: ["spicy"] },
      { name: "Grilled Chicken with Rocoto Sauce", desc: "Chicken breast marinated in butter, soy and honey, with rocoto sauce, steamed vegetables, rice and potato wedges", naira: 29000 },
      { name: "Platter Istanbul Mix Kebab", desc: `Four portions of Istanbul Mix Kebab on one sharing platter. ${LAMB}`, naira: 180000, prep: 35, photo: "mix-kebab", tags: ["signature"] },
    ],
  },
  {
    category: "Traditional Turkish",
    prep: 25,
    items: [
      { name: "Lamb Shank", desc: "Slow-roasted for 12 hours, with creamy mashed potatoes and rich gravy", naira: 49000, photo: "lamb-shank", featured: true, tags: ["signature"] },
      { name: "Urfa-Style Tirit", desc: "Lavash soaked in bone broth under 12-hour lamb tandır and creamy garlic yoghurt", naira: 24000, photo: "tirit", tags: ["signature"], options: [SPICE] },
      { name: "Belen Tava", desc: "Lamb and vegetables cooked in a clay casserole in the stone oven", naira: 48000, photo: "clay-pot" },
      { name: "Lamb Chops Ankara Tava", desc: "Lamb with tomatoes, peppers, onions and garlic", naira: 48000 },
      { name: "Lamb Tandoori", naira: 34000 },
      { name: "Istanbul Kaşarlı Köfte", desc: "Spiced meatballs under kasseri cheese, baked in the clay oven", naira: 31000, photo: "kofte", tags: ["signature"] },
      { name: "Chicken with Cheese on Stone Plate", naira: 31000 },
    ],
  },
  {
    category: "Butcher's Grill",
    prep: 30,
    items: [
      { name: "Grilled Beef Steak (per kg)", desc: "Priced per kilo — with grilled peppers, onions and bread", naira: 57000, photo: "t-bone", options: [COOKED] },
      { name: "Grilled Lamb Roll Chops (per kg)", desc: "Priced per kilo — with grilled peppers, onions and bread", naira: 83000 },
      { name: "Grilled Lamb Külbastı (per kg)", desc: "Priced per kilo — with grilled peppers, onions and bread", naira: 72000 },
      { name: "Grilled Beef Lokum (per kg)", desc: "Priced per kilo — with grilled peppers, onions and bread", naira: 60000, options: [COOKED] },
      { name: "Grilled Knife-Cut Köfte (per kg)", desc: "Priced per kilo — with grilled peppers, onions and bread", naira: 78000 },
      { name: "Grilled Kasap Köfte (per kg)", desc: "Priced per kilo — with grilled peppers, onions and bread", naira: 51000 },
      { name: "Grilled Chicken Külbastı (per kg)", desc: "Priced per kilo — with grilled peppers, onions and bread", naira: 45000 },
      { name: "Grilled Liver", naira: 30000, prep: 20 },
    ],
  },
  {
    category: "Seafood",
    prep: 20,
    items: [
      { name: "Seafood Platter", desc: "For 2–3: gambel shrimp, crispy prawns, grilled prawns and grilled salmon with Thai rice, roasted vegetables and soy, sweet chilli, oyster and pepper sauces. Allow 30 minutes.", naira: 198000, prep: 30, photo: "grilled-prawns", featured: true, tags: ["signature"] },
      { name: "King Prawns Shot", desc: "Crispy shrimp with six different sauces", naira: 39500, photo: "butterfly-prawns", tags: ["popular"] },
      { name: "Prawns Skewers", desc: "Grilled and glazed with teriyaki, with carrot purée, garlic sauce and parsley", naira: 40000, photo: "grilled-prawns" },
      { name: "Grilled Salmon", desc: "On creamy mashed potatoes with sautéed vegetables and a delicate sweet sauce", naira: 52000, photo: "salmon" },
      { name: "Grilled Salmon with Creamy Beans", desc: "Grilled salmon with green beans sautéed in butter and cream", naira: 56000 },
      { name: "Stroganoff Shrimp", desc: "Shrimp in stroganoff sauce with capers, pickles and vegetables", naira: 37000 },
      { name: "Gambel Shrimp", naira: 39000 },
      { name: "Crispy Prawns", naira: 36000, photo: "butterfly-prawns" },
    ],
  },
  {
    category: "Salads & Mezze",
    prep: 10,
    items: [
      { name: "Hummus with Bread", desc: "Chickpeas blended with tahini, lemon and garlic, extra virgin olive oil, fresh bread", naira: 13000, photo: "hummus", tags: ["vegetarian"] },
      { name: "Hummus with Meat and Bread", desc: "Creamy hummus topped with sautéed spiced beef, warm bread", naira: 15000, photo: "hummus" },
      { name: "Falafel", desc: "Crispy chickpea balls with fresh herbs and spices, tahini sauce", naira: 24500, photo: "falafel", tags: ["vegetarian"] },
      { name: "Istanbul Special Salad", desc: "Beetroot and seasonal greens on a bed of hummus", naira: 20000, tags: ["vegetarian", "signature"] },
      { name: "Fattoush", desc: "Mixed greens, crisp vegetables and toasted pita chips, pomegranate syrup and sumac dressing", naira: 21000, photo: "fattoush", tags: ["vegetarian"] },
      { name: "Tabbouleh", naira: 18000, tags: ["vegetarian"] },
      { name: "Piyaz Salad", desc: "Beans, boiled egg, tomato, cucumber, parsley and onion with tahini", naira: 19000, photo: "egg-salad", tags: ["vegetarian"] },
      { name: "Greek Salad", desc: "Cucumber, tomatoes, olives, peppers, onions and feta, olive oil", naira: 18500, photo: "greek-salad", tags: ["vegetarian"] },
      { name: "Arugula Salad", naira: 22000, photo: "arugula-salad", tags: ["vegetarian"] },
      { name: "Mexican Salad", desc: "Lettuce, avocado, cucumber, cherry tomatoes, sweet corn, kidney beans and cashews", naira: 21000, tags: ["vegetarian"] },
      { name: "Quinoa Chicken Salad", desc: "Cajun chicken and soybeans in a honey-mustard glaze, with quinoa and seasonal greens", naira: 20000, photo: "quinoa-salad" },
      { name: "Caesar Salad", desc: "Grilled chicken, lettuce, croutons, parmesan, radish, pomegranate and grapes, Caesar dressing", naira: 28500, photo: "caesar-salad" },
      { name: "Suya Salad", desc: "Meat suya, lettuce, tomato, cucumber and pickled onions", naira: 28000, tags: ["spicy"] },
      { name: "French Salad with Steak", desc: "Creamy steak with pickled cucumber and mustard on seasonal greens", naira: 26000 },
      { name: "Salad with Shrimp", desc: "Shrimp, lettuce, cherry tomato and grapes", naira: 26000, photo: "shrimp-salad" },
      { name: "Smoked Salmon Salad", desc: "Cold-smoked salmon, avocado, almonds, mint, lettuce, cucumber and cherry tomato, soy and sesame dressing", naira: 29000 },
      { name: "Garden Dream Salad", desc: "Grilled chicken over sweet corn, broccoli, cauliflower, arugula, peppers and spring onion, lemon and olive oil", naira: 29500 },
    ],
  },
  {
    category: "Pizza & Pita",
    prep: 18,
    items: [
      { name: "Istanbul Special Lahmacun", desc: "Thin, crisp Turkish flatbread with spiced minced meat", naira: 28000, photo: "lahmacun", featured: true, tags: ["signature"] },
      { name: "Walnut Lahmacun", desc: "Spicy lahmacun topped with walnuts and pomegranate molasses", naira: 30000, tags: ["spicy"] },
      { name: "Görele-Style Minced Beef Pita", desc: "Handmade Turkish pide filled with seasoned minced beef", naira: 25000, photo: "pide" },
      { name: "Istanbul Special Pita", desc: "Thin-edged crispy pide with pepperoni and mushrooms", naira: 26000, tags: ["signature"] },
      { name: "Cheddar Cheese Pita", naira: 25000, tags: ["vegetarian"] },
      { name: "Mardin-Style Sembusek", desc: "Filled with seasoned minced meat and onions, with tomato, lettuce, onion and lemon", naira: 25000 },
      { name: "Mix Pizza", naira: 30000, photo: "pizza-oven" },
      { name: "Pizza Toscana", desc: "Thin dough, gorgonzola, grana padano, onion, mushroom and chilli oil", naira: 30000, tags: ["vegetarian", "spicy"] },
      { name: "Pizza Palzino", desc: "Thin dough, gorgonzola, cheddar, grana padano and pesto", naira: 30000, tags: ["vegetarian"] },
      { name: "Pepperoni Pizza", desc: "Cheese and beef pepperoni", naira: 26500 },
      { name: "Four Cheese Pizza", desc: "Mozzarella, gorgonzola, parmesan, ricotta and basil", naira: 26500, photo: "pizza", tags: ["vegetarian"] },
      { name: "Chicken Mexicana Pizza", desc: "Chicken, peppers and ranch sauce", naira: 26500 },
      { name: "Chicken Suya Pizza", naira: 26500, tags: ["spicy"] },
      { name: "Margherita Pizza", desc: "Mozzarella and pesto oil", naira: 24000, photo: "margherita", tags: ["vegetarian"] },
      { name: "Nutella Pizza", naira: 20000, tags: ["vegetarian"] },
    ],
  },
  {
    category: "Burgers & Sandwiches",
    prep: 15,
    items: [
      { name: "Istanbul Special Burger", desc: "Beef patty, lettuce, pickled cucumber, tomato and baked onions on a special bun", naira: 26500, photo: "burger", tags: ["signature"] },
      { name: "Double Burger", desc: "Two beef patties, lettuce, pickled cucumber, tomato and baked onions", naira: 30000 },
      { name: "Creamy Mushroom Burger", desc: "Beef patty under a creamy mushroom sauce, with lettuce and tomato", naira: 29000 },
      { name: "Kentucky-Style Spicy Crispy Chicken Burger", desc: "Spicy crispy chicken, lettuce, tomato, onion and pepper sauce", naira: 29000, photo: "chicken-burger", tags: ["spicy"] },
      { name: "Crispy Chicken Burger", desc: "Chicken tenderloin with caramelised onions and BBQ sauce", naira: 26500 },
      { name: "Philly Cheese Steak", desc: "Veal entrecôte, caramelised onions and melted cheese with our special sauces", naira: 26000, photo: "cheesesteak" },
      { name: "Philly Cheese Chicken Sandwich", naira: 26500 },
      { name: "Crispy Chicken Sandwich with BBQ Sauce", naira: 26500 },
      { name: "Club Sandwich", desc: "Chicken, egg, lettuce and pickle", naira: 28500, photo: "club-sandwich" },
    ],
  },
  {
    category: "Pasta",
    prep: 18,
    items: [
      { name: "Seafood Pasta", desc: "Linguine with seafood, parsley and garlic", naira: 33000, photo: "seafood-pasta" },
      { name: "Fettuccine Alfredo", desc: "Creamy Alfredo sauce and basil", naira: 25000, photo: "alfredo", options: [priced("With", [["Chicken", 0], ["Beef", 1000]])] },
      { name: "Penne Arabiata", desc: "In our jollof sauce", naira: 21500, tags: ["spicy"], options: [priced("With", [["Just the pasta", 0], ["Chicken", 2500]])] },
      { name: "Penne with Chicken and Curry Sauce", naira: 25000, photo: "creamy-pasta" },
    ],
  },
  {
    category: "Asian Cuisine",
    prep: 18,
    items: [
      { name: "Chinese-Style Crispy Chicken", desc: "Crispy chicken bites in a sweet and spicy sauce with sesame and spring onion", naira: 30000, photo: "curry", tags: ["spicy"] },
      { name: "Biryani with Chicken", desc: "Basmati rice with saffron, spices and slow-cooked chicken, cooling yoghurt raita", naira: 29500, prep: 20, photo: "biryani" },
      { name: "Chinese Noodles", desc: "With California peppers, zucchini, carrot, bean sprouts and Far Eastern sauces", naira: 27000, photo: "noodles", tags: ["spicy"], options: [priced("With", [["Chicken", 0], ["Beef tenderloin", 3000]])] },
      { name: "Singapore Noodles", naira: 30000, tags: ["spicy"], options: [choice("With", ["Chicken", "Beef"])] },
      { name: "Thai Rice with Prawns", desc: "Sautéed vegetables, basmati rice and boiled egg with prawns in Far Eastern sauces", naira: 35000, photo: "fried-rice" },
      { name: "Thai Rice", naira: 25000, tags: ["spicy"], options: [priced("With", [["Vegetables", 0], ["Beef", 0], ["Shrimp", 0], ["Chicken", 500]])] },
    ],
  },
  {
    category: "Mexican Cuisine",
    prep: 18,
    items: [
      { name: "Mexican Fajitas", desc: "Tenderloin with California peppers, onions and Mexican sauces, in a cast-iron pan with tortillas", naira: 28500, photo: "fajitas", tags: ["spicy"], options: [priced("With", [["Beef", 0], ["Chicken", 500]])] },
      { name: "Mexican Quesadilla", desc: "Tenderloin, peppers, onions, Mexican beans and sauce with cheddar in a tortilla", naira: 24500, photo: "quesadilla", tags: ["spicy"], options: [priced("With", [["Beef", 0], ["Chicken", 1500]])] },
      { name: "Tacos", naira: 25500, photo: "tacos", tags: ["spicy"], options: [priced("Filling", [["Chicken suya", 0], ["Chicken", 1000], ["Meat", 1000], ["Shrimp", 3000]])] },
      { name: "Taco with Sautéed Liver", desc: "Soft tortilla with pan-sautéed beef liver, caramelised onions and Turkish spices, house and garlic sauces", naira: 26000 },
      { name: "Mexican Wrap", desc: "Tenderloin, peppers, onions, Mexican beans and sauce with cheddar in a tortilla", naira: 24500, photo: "wrap", tags: ["spicy"], options: [priced("With", [["Chicken", 0], ["Beef", 1500]])] },
    ],
  },
  {
    category: "Kids",
    prep: 12,
    items: [
      { name: "Kids Burger", desc: "With French fries", naira: 16000, photo: "burger" },
      { name: "Kids Pizza", naira: 18000 },
      { name: "Mac and Cheese", naira: 15000, tags: ["vegetarian"] },
      { name: "Kids Penne Pasta", desc: "Plain pasta with butter", naira: 13000, tags: ["vegetarian"] },
      { name: "Kids French Fries", naira: 9000, prep: 8, photo: "fries", tags: ["vegetarian"] },
    ],
  },
  {
    category: "Desserts & Ice Cream",
    prep: 5,
    items: [
      { name: "Oven-Baked Sütlaç", desc: "Turkish rice pudding baked until the top caramelises. Served cold.", naira: 19500, photo: "rice-pudding", tags: ["signature"] },
      { name: "Trileçe", desc: "Balkan-Turkish milk cake", naira: 18000 },
      { name: "Tiramisu", naira: 18000, photo: "tiramisu" },
      { name: "Profiteroles", naira: 18000, photo: "profiteroles" },
      { name: "Malaga Cake", desc: "Chocolate sponge layered with cream and fresh banana under a silky chocolate glaze", naira: 18000, photo: "chocolate-cake" },
      { name: "French Soufflé", desc: "Baked to order in 15 minutes, with the ice cream of your choice", naira: 19000, prep: 15, photo: "souffle", options: [choice("Ice cream", SCOOPS)] },
      { name: "Cheesecake", desc: "Tangy lemon, real strawberry, or cookies-and-cream Oreo", naira: 18000, photo: "cheesecake", options: [choice("Flavour", ["Lemon", "Strawberry", "Oreo"])] },
      { name: "Baworoski", naira: 20000, options: [choice("Flavour", ["Strawberry", "Chocolate"])] },
      { name: "Slice of Cake", desc: "Kiwi, banana and mango", naira: 13000 },
      { name: "Fruit Plate", desc: "Seasonal fruits", naira: 18500, photo: "fruit-salad", tags: ["vegetarian"] },
      { name: "Ice Cream Bowl", desc: "Three scoops, your choice of flavours", naira: 15000, prep: 3, photo: "ice-cream", options: [choice("1st scoop", SCOOPS), choice("2nd scoop", SCOOPS), choice("3rd scoop", SCOOPS)] },
      { name: "Ice Cream Scoop", desc: "One scoop", naira: 5000, prep: 3, options: [choice("Flavour", SCOOPS)] },
    ],
  },
  {
    category: "Turkish Tea & Hot Drinks",
    station: "BAR",
    prep: 4,
    items: [
      { name: "Turkish Tea", desc: "Served in the tulip glass", naira: 2500, prep: 2, photo: "turkish-tea", tags: ["popular"] },
      // Hidden on their QR menu right now; switch it back on from the kitchen/bar screen.
      { name: "Turkish Coffee", naira: 7000, photo: "turkish-coffee", tags: ["signature"], options: [SUGAR], soldOut: true },
      { name: "Ottoman Herbal Tea", desc: "Linden, rose buds, mulberries, hibiscus, cinnamon, cardamom, cloves, fennel, rosehip, lemongrass and chamomile", naira: 10000, photo: "herbal-tea", tags: ["signature"] },
      { name: "Blue Butterfly Herbal Tea", desc: "Butterfly pea flower and hibiscus", naira: 10000 },
      { name: "Calming Herbal Tea", desc: "Jasmine, lemon balm, daisy and mint", naira: 10000 },
      { name: "Detox Herbal Tea", desc: "Rosemary, cinnamon, vanilla and hibiscus", naira: 10000 },
      { name: "Stomach-Soothing Herbal Tea", desc: "Fennel, cumin, coriander, anise and basil", naira: 10000 },
      { name: "Green Tea", naira: 8000, photo: "tea" },
      { name: "Hot Chocolate", naira: 8500, photo: "hot-chocolate" },
      { name: "Honey Milk", naira: 8000 },
    ],
  },
  {
    category: "Coffee",
    station: "BAR",
    prep: 4,
    items: [
      { name: "Espresso", naira: 5000, photo: "espresso", options: [priced("Size", [["Single", 0], ["Double", 1500]])] },
      { name: "Cappuccino", desc: "Single shot, whole milk and milk foam", naira: 9000, photo: "cappuccino", options: [SUGAR] },
      { name: "Coffee Latte", desc: "Double shot, milk and milk foam", naira: 9000, photo: "latte" },
      { name: "Mocha", desc: "Single shot, chocolate syrup, milk and milk foam", naira: 9000 },
      { name: "Caramel Macchiato", desc: "Double shot, milk, milk foam and caramel syrup", naira: 9000 },
      { name: "Espresso Macchiato", desc: "Double shot, milk and milk foam", naira: 9000 },
      { name: "Caffè Americano", naira: 8000 },
      { name: "French Press Coffee", naira: 8000 },
      { name: "Affogato", desc: "Double shot poured over a scoop of ice cream", naira: 10000 },
      { name: "Iced Americano", desc: "Double shot over ice", naira: 9000, photo: "iced-coffee" },
      { name: "Iced Latte", desc: "Single shot, milk, milk foam and ice", naira: 9000 },
      { name: "Iced Mocha", desc: "Single shot, milk foam, chocolate chips and ice", naira: 10000 },
      { name: "Frappé with Ice Cream", desc: "Chilled Americano, frothed milk and ice cream", naira: 12500, prep: 5 },
    ],
  },
  {
    category: "Fresh Juices",
    station: "BAR",
    prep: 5,
    items: [
      { name: "Orange Juice", naira: 14000, photo: "orange-juice" },
      { name: "Watermelon Juice", naira: 14000, photo: "watermelon-juice" },
      { name: "Cucumber-Watermelon Juice", naira: 14000 },
      { name: "Pineapple Juice", naira: 14000 },
      { name: "Carrot Juice", naira: 14000, photo: "carrot-juice" },
      { name: "Apple Juice", naira: 14000 },
      { name: "Vegetarian Juice", desc: "Cucumber, mint, apple and celery", naira: 17000 },
      { name: "Atom Mix", desc: "Carrot, watermelon, orange, apple and pineapple", naira: 16500 },
      { name: "Splash Smoothie", desc: "Apple, banana, beetroot and pineapple", naira: 16000, photo: "smoothie" },
      { name: "Red Mix", desc: "Beetroot, apple and carrot", naira: 15000 },
      { name: "Pineapple Delight", desc: "Pineapple, coconut milk, coconut syrup and pomegranate", naira: 19500 },
    ],
  },
  {
    category: "Mocktails & Shakes",
    station: "BAR",
    prep: 5,
    items: [
      { name: "Lemonade", naira: 12500, photo: "lemonade" },
      { name: "Mint Lemonade", naira: 13000 },
      { name: "Strawberry Lemonade", desc: "Strawberry, lemon juice, Sprite and soda water", naira: 13000 },
      { name: "Churchill", desc: "Fresh lemon juice, sparkling soda and a pinch of salt — a salty Turkish classic", naira: 12500, tags: ["signature"] },
      { name: "Chapman", desc: "Orange and blackcurrant juice, fruit, lemon and cucumber", naira: 13000, tags: ["popular"] },
      { name: "Mojito", desc: "Soda, mint, sugar and lime over crushed ice", naira: 13000, photo: "mojito" },
      { name: "Strawberry Mojito", desc: "Strawberries, strawberry syrup, lemon and mint, topped with soda", naira: 16500, photo: "strawberry-mojito" },
      { name: "Virgin Piña Colada", desc: "Pineapple juice, coconut and fresh basil over ice", naira: 13500 },
      { name: "Strawberry Passion", desc: "Cherry juice, strawberry purée and coconut milk over ice", naira: 13500 },
      { name: "Punch", desc: "Mango, orange, pineapple, soda and pomegranate syrup", naira: 12500 },
      { name: "Champion", desc: "Coconut, orange juice and grenadine", naira: 13500 },
      { name: "Blue Mix", desc: "Soda, mint, sugar, blue curaçao syrup and lime over ice", naira: 12500 },
      { name: "Strawberry Daiquiri", desc: "Strawberries blended with ice", naira: 12500 },
      { name: "Pineapple Daiquiri", desc: "Pineapple blended with ice", naira: 12500 },
      { name: "Lemon Mint Freeze", desc: "Vanilla ice cream, lemon and fresh mint, blended with ice", naira: 13000 },
      { name: "Strawberry Freeze", desc: "Strawberry ice cream and strawberries blended with ice", naira: 13500 },
      { name: "Banana Freeze", desc: "Vanilla ice cream and banana blended with ice", naira: 13500 },
      { name: "Mixed Freeze", desc: "Vanilla ice cream, raspberry, strawberry, banana and kiwi", naira: 14000 },
      { name: "Milkshake", naira: 13000, prep: 6, photo: "milkshake", options: [choice("Flavour", ["Vanilla", "Chocolate", "Strawberry", "Banana", "Caramel", "Oreo", "Peanut banana"])] },
    ],
  },
  {
    category: "Soft Drinks & Water",
    station: "BAR",
    prep: 1,
    items: [
      { name: "Ayran", desc: "Chilled, lightly salted Turkish yoghurt drink — the classic partner to a kebab", naira: 6000, photo: "ayran", tags: ["signature"] },
      { name: "Hibiscus Juice (Zobo)", naira: 10000 },
      { name: "Soft Drink", naira: 5000, options: [choice("Drink", ["Coke", "Coke Zero", "Pepsi", "Fanta", "Sprite", "Schweppes Soda"])] },
      { name: "Red Bull", naira: 10000 },
      { name: "Water", naira: 2000, options: [priced("Size", [["Small 50cl", 0], ["Big 150cl", 1000]])] },
    ],
  },
  {
    category: "Non-Alcoholic Wine",
    station: "BAR",
    prep: 2,
    items: [
      { name: "Glass of Wine", desc: "Non-alcoholic, by the glass", naira: 18500, options: [choice("Wine", ["Eisberg", "Eisberg Rosé", "St. Lauren Red", "Casa Dorada", "Rochester Ginger"])] },
      { name: "Martinelli's Sparkling Cider", desc: "Bottle · non-alcoholic", naira: 55000 },
      { name: "Eisberg Red", desc: "Bottle · non-alcoholic", naira: 55000 },
      { name: "Eisberg Rosé", desc: "Bottle · non-alcoholic", naira: 55000 },
      { name: "Casa Dorada", desc: "Bottle · fruity, sparkling red, non-alcoholic", naira: 55000 },
      { name: "St. Lauren Red", desc: "Bottle · non-alcoholic", naira: 50000 },
      { name: "St. Lauren White", desc: "Bottle · sparkling, non-alcoholic", naira: 50000 },
    ],
  },
  {
    category: "Hookah",
    station: "BAR",
    prep: 8,
    items: [
      {
        name: "Hookah",
        desc: "Choose your flavour",
        naira: 18000,
        photo: "shisha",
        options: [choice("Flavour", ["Two Apples", "Watermelon", "Blueberry", "Blueberry & Mint", "Strawberry", "Lemon & Mint", "Orange & Mint", "Gum & Mint", "Mint & Cream", "Milk", "Magic Love"])],
      },
      { name: "Extra Head", desc: "A fresh head for your hookah", naira: 9000 },
    ],
  },
];

const PHOTO_DIR = path.join(import.meta.dirname, "seed-assets", "menu");

// `pnpm db:seed -- --replace-menu` switches an existing database to this menu without
// deleting anything: old categories/items are archived (kept for order history),
// restaurant details are updated, and tables not listed above are deactivated.
const REPLACE = process.argv.includes("--replace-menu");

const BRAND = {
  restaurantName: "Istanbul Cafe & Restaurant",
  tagline: "A taste of Turkey, for everyone",
  phone: "0704 831 1111",
  address: "Shop L32/33, Jabi Lake Mall, Bala Sokoto Way, Jabi, Abuja",
  instagram: "istanbulrestaurantcafeng",
  // Their QR menu records 7.5% VAT but lists every price as the final price, so
  // nothing is added on top here. If their receipts add VAT or a service charge,
  // switch it on in Settings.
  vatBps: 0,
  serviceChargeBps: 0,
  openingTime: "10:00",
  closingTime: "23:00",
};

async function main() {
  await prisma.settings.upsert({ where: { id: 1 }, update: REPLACE ? BRAND : {}, create: { id: 1, ...BRAND } });
  if (REPLACE) {
    await prisma.menuItem.updateMany({ data: { active: false, featured: false } });
    await prisma.menuCategory.updateMany({ data: { active: false } });
    await prisma.table.updateMany({ where: { label: { notIn: TABLES.map((t) => t.label) } }, data: { active: false } });
    for (const t of TABLES) await prisma.table.updateMany({ where: { label: t.label }, data: { area: t.area, seats: t.seats, active: true } });
  }

  for (const s of STAFF) {
    const secretHash = await bcrypt.hash(s.secret, 10);
    const station = "station" in s ? s.station : null;
    await prisma.staff.upsert({
      where: { staffCode: s.staffCode },
      update: {},
      create: { staffCode: s.staffCode, name: s.name, role: s.role, station, secretHash },
    });
  }

  for (const [i, t] of TABLES.entries()) {
    await prisma.table.upsert({
      where: { label: t.label },
      update: {},
      create: { ...t, sortOrder: i, qrToken: randomBytes(9).toString("base64url") },
    });
  }

  if (REPLACE || (await prisma.menuCategory.count()) === 0) {
    const photos = new Map<string, string>();
    const photoId = async (key?: string) => {
      if (!key) return null;
      if (photos.has(key)) return photos.get(key)!;
      const file = path.join(PHOTO_DIR, `${key}.jpg`);
      if (!existsSync(file)) return null;
      const img = await prisma.image.create({ data: { mime: "image/jpeg", bytes: readFileSync(file) } });
      photos.set(key, img.id);
      return img.id;
    };
    for (const [ci, section] of MENU.entries()) {
      const cat = await prisma.menuCategory.create({ data: { name: section.category, sortOrder: ci } });
      for (const [ii, it] of section.items.entries()) {
        await prisma.menuItem.create({
          data: {
            categoryId: cat.id,
            name: it.name,
            description: it.desc ?? "",
            priceKobo: it.naira * 100,
            station: section.station ?? "KITCHEN",
            prepMinutes: it.prep ?? section.prep,
            tags: it.tags ?? [],
            featured: it.featured ?? false,
            optionGroups: it.options ?? [],
            isAvailable: !it.soldOut,
            imageId: await photoId(it.photo),
            sortOrder: ii,
          },
        });
      }
    }
  }

  const items = await prisma.menuItem.count({ where: { active: true } });
  console.log(`\nSeeded Istanbul Cafe & Restaurant: ${items} menu items, ${TABLES.length} tables. Demo logins (code / PIN or password):`);
  for (const s of STAFF) console.log(`  ${s.staffCode.padEnd(5)} ${s.secret.padEnd(11)} ${s.role.padEnd(8)} ${s.name}`);
  console.log("\nChange these before going live (Admin → Staff).\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
