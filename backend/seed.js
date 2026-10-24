// backend/seed.js
// Run with: npm run seed
// Wipes products and re-inserts sample data; creates an admin only when the
// configured email is unused. Use `npm run admin:provision` for admin setup.
require('dotenv').config();
const bcrypt = require('bcryptjs');
const connectDB = require('./config/db');
const Product = require('./models/Product');
const User = require('./models/User');

const img = (product) => `/images/${product}.jpg`;

const products = [
  // Coffee
  { name: 'Classic Cappuccino', category: 'Coffee', price: 149, rating: 4.6, badge: 'bestseller', isVeg: true, image: img('classic-cappuccino'), description: 'Espresso with steamed milk and a thick layer of velvety foam.' },
  { name: 'Café Latte', category: 'Coffee', price: 159, rating: 4.5, isVeg: true, image: img('cafe-latte'), description: 'Smooth espresso balanced with generous steamed milk.' },
  { name: 'Espresso', category: 'Coffee', price: 99, rating: 4.4, isVeg: true, image: img('espresso'), description: 'A bold, concentrated shot for the purists.' },
  { name: 'Mocha', category: 'Coffee', price: 179, rating: 4.7, badge: 'favorite', isVeg: true, image: img('mocha'), description: 'Espresso meets rich chocolate and steamed milk.' },
  { name: 'Caramel Macchiato', category: 'Coffee', price: 189, rating: 4.6, badge: 'new', isVeg: true, image: img('caramel-macchiato'), description: 'Vanilla-kissed espresso layered with caramel drizzle.' },
  { name: 'Filter Coffee', category: 'Coffee', price: 89, rating: 4.8, badge: 'bestseller', isVeg: true, image: img('filter-coffee'), description: 'Traditional South Indian style, strong and frothy.' },

  // Cold Drinks
  { name: 'Iced Americano', category: 'Cold Drinks', price: 139, rating: 4.3, isVeg: true, image: img('iced-americano'), description: 'Chilled espresso over ice, crisp and refreshing.' },
  { name: 'Cold Brew', category: 'Cold Drinks', price: 169, rating: 4.6, badge: 'favorite', isVeg: true, image: img('cold-brew'), description: 'Slow-steeped for 18 hours — smooth, low-acid, bold.' },
  { name: 'Iced Caramel Frappe', category: 'Cold Drinks', price: 199, rating: 4.5, isVeg: true, image: img('iced-caramel-frappe'), description: 'Blended coffee, caramel, and a whipped cream top.' },
  { name: 'Classic Iced Tea', category: 'Cold Drinks', price: 119, rating: 4.2, isVeg: true, image: img('classic-iced-tea'), description: 'Refreshing black tea served chilled over ice.' },

  // Burgers
  { name: 'Classic Veg Burger', category: 'Burgers', price: 179, rating: 4.3, isVeg: true, image: img('classic-veg-burger'), description: 'A hearty veg patty with fresh lettuce, tomato, and house sauce.' },
  { name: 'Crispy Chicken Burger', category: 'Burgers', price: 229, rating: 4.6, badge: 'bestseller', isVeg: false, image: img('crispy-chicken-burger'), description: 'Golden crispy chicken, pickles, and a spiced mayo.' },
  { name: 'Mushroom Melt Burger', category: 'Burgers', price: 199, rating: 4.4, isVeg: true, image: img('mushroom-melt-burger'), description: 'Sautéed mushrooms and melted cheese on a toasted bun.' },

  // Sandwiches
  { name: 'Grilled Cheese Sandwich', category: 'Sandwiches', price: 159, rating: 4.4, isVeg: true, image: img('grilled-cheese-sandwich'), description: 'Three-cheese blend, grilled golden on sourdough.' },
  { name: 'Club Sandwich', category: 'Sandwiches', price: 219, rating: 4.5, badge: 'favorite', isVeg: false, image: img('club-sandwich'), description: 'Triple-decker with chicken, egg, and fresh vegetables.' },
  { name: 'Paneer Tikka Sandwich', category: 'Sandwiches', price: 189, rating: 4.3, isVeg: true, image: img('paneer-tikka-sandwich'), description: 'Spiced grilled paneer with mint chutney.' },

  // Pizza
  { name: 'Margherita Pizza', category: 'Pizza', price: 249, rating: 4.5, badge: 'bestseller', isVeg: true, image: img('margherita-pizza'), description: 'Classic tomato, mozzarella, and fresh basil.' },
  { name: 'Farmhouse Pizza', category: 'Pizza', price: 289, rating: 4.4, isVeg: true, image: img('farmhouse-pizza'), description: 'Loaded with bell peppers, onion, corn, and olives.' },
  { name: 'Pepperoni Pizza', category: 'Pizza', price: 319, rating: 4.6, isVeg: false, image: img('pepperoni-pizza'), description: 'Classic pepperoni with a rich tomato base.' },

  // Desserts
  { name: 'Chocolate Truffle Cake', category: 'Desserts', price: 179, rating: 4.7, badge: 'favorite', isVeg: true, image: img('chocolate-truffle-cake'), description: 'Dense chocolate sponge layered with silky ganache.' },
  { name: 'New York Cheesecake', category: 'Desserts', price: 199, rating: 4.6, isVeg: true, image: img('new-york-cheesecake'), description: 'Creamy and rich, on a buttery biscuit base.' },
  { name: 'Brownie with Ice Cream', category: 'Desserts', price: 189, rating: 4.8, badge: 'bestseller', isVeg: true, image: img('brownie-with-ice-cream'), description: 'Warm fudge brownie topped with vanilla ice cream.' },

  // Bakery
  { name: 'Butter Croissant', category: 'Bakery', price: 129, rating: 4.5, isVeg: true, image: img('butter-croissant'), description: 'Flaky, buttery, baked fresh every morning.' },
  { name: 'Chocolate Muffin', category: 'Bakery', price: 119, rating: 4.3, isVeg: true, image: img('chocolate-muffin'), description: 'Moist chocolate muffin studded with choco chips.' },
  { name: 'Blueberry Muffin', category: 'Bakery', price: 139, rating: 4.4, badge: 'new', isVeg: true, image: img('blueberry-muffin'), description: 'Bursting with real blueberries, lightly sweet.' },

  // Tea
  { name: 'Masala Chai', category: 'Tea', price: 79, rating: 4.7, badge: 'bestseller', isVeg: true, image: img('masala-chai'), description: 'Spiced Indian tea, simmered with milk and warm spices.' },
  { name: 'Green Tea', category: 'Tea', price: 89, rating: 4.2, isVeg: true, image: img('green-tea'), description: 'Light, antioxidant-rich, and gently grassy.' },
];

async function run() {
  await connectDB();

  const adminEmail = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD || '';
  if (!adminEmail || adminPassword.length < 12) {
    throw new Error('Set ADMIN_EMAIL and a unique ADMIN_PASSWORD of at least 12 characters in .env before seeding.');
  }
  const existingAdmin = await User.findOne({ email: adminEmail }).select('_id role');
  if (existingAdmin && existingAdmin.role !== 'admin') {
    throw new Error('ADMIN_EMAIL belongs to a non-admin account. No products were changed; choose another email.');
  }

  // Idempotent upsert: keep existing _id so cart references stay valid.
  // Products are matched by name; details are updated if changed.
  for (const product of products) {
    await Product.updateOne(
      { name: product.name },
      { $set: product },
      { upsert: true, setDefaultsOnInsert: true }
    );
  }
  console.log(`Seeded ${products.length} products (idempotent upsert).`);

  if (existingAdmin) {
    console.log(`Existing administrator account retained: ${adminEmail}.`);
  } else {
    const hash = await bcrypt.hash(adminPassword, 12);
    await User.create({ name: (process.env.ADMIN_NAME || 'Café Admin').trim(), email: adminEmail, password: hash, role: 'admin' });
    console.log(`Administrator account created: ${adminEmail}`);
  }

  process.exit(0);
}

run().catch((err) => { console.error(err); process.exit(1); });
