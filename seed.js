/**
 * Farsly Database Seeding Script
 * Idempotent: seeds initial users, menu items, and demo orders only if they do not already exist.
 * Safe to run multiple times: npm run seed
 */

import bcryptjs from 'bcryptjs';
import { db, getDatabasePath } from './database.js';

export function runSeed(database = db) {
  const dbPath = getDatabasePath();
  console.log(`\n🌱 Seeding database at: ${dbPath}`);

  let usersAdded = 0;
  let menuAdded = 0;
  let ordersAdded = 0;

  try {
    /* ──────────────────────────────────────────
       1. Default Users
       ────────────────────────────────────────── */
    const checkUser = database.prepare('SELECT id FROM users WHERE email = ?');
    const insertUser = database.prepare(
      'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)'
    );

    const salt = bcryptjs.genSaltSync(10);
    const customerPassword = process.env.SEED_CUSTOMER_PASSWORD || 'password123';
    const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'password123';

    const defaultUsers = [
      {
        name: 'Sarah Customer',
        email: 'customer@farsly.com',
        password: bcryptjs.hashSync(customerPassword, salt),
        role: 'customer',
      },
      {
        name: 'Farsly Admin',
        email: 'restaurant@farsly.com',
        password: bcryptjs.hashSync(adminPassword, salt),
        role: 'restaurant',
      },
    ];

    for (const u of defaultUsers) {
      const existing = checkUser.get(u.email);
      if (!existing) {
        insertUser.run(u.name, u.email, u.password, u.role);
        usersAdded++;
      }
    }
    console.log(`  ✓ Users: ${usersAdded} added (existing preserved)`);

    /* ──────────────────────────────────────────
       2. Default Menu Items
       ────────────────────────────────────────── */
    const checkMenuItem = database.prepare('SELECT id FROM menu_items WHERE id = ?');
    const insertMenu = database.prepare(`
      INSERT INTO menu_items (id, name, category, description, price, calories, protein, rating, review_count, badge, ingredients, image, available)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const defaultMenuItems = [
      {
        id: 'salmon-signature', name: 'Salmon Signature', category: 'Poke',
        description: 'Wild-caught salmon, avocado, edamame, and house ponzu over seasoned sushi rice.',
        price: 16.90, calories: '520', protein: '42g', rating: 4.9, reviewCount: 124,
        badge: 'POPULAR', ingredients: ['Salmon', 'Avocado', 'Edamame', 'Ponzu'],
        image: '/assets/images/salmon-signature.jpg',
      },
      {
        id: 'shrimp-garden', name: 'Shrimp Garden', category: 'Poke',
        description: 'Poached shrimp, mango, cucumber, and spicy mayo on a bed of mixed greens.',
        price: 15.50, calories: '440', protein: '34g', rating: 4.8, reviewCount: 98,
        badge: null, ingredients: ['Shrimp', 'Mango', 'Cucumber', 'Spicy Mayo'],
        image: '/assets/images/shrimp-garden.jpg',
      },
      {
        id: 'teriyaki-chicken', name: 'Teriyaki Chicken', category: 'Poke',
        description: 'Grilled chicken, broccoli, carrots, and sweet teriyaki glaze over brown rice.',
        price: 14.90, calories: '580', protein: '48g', rating: 4.7, reviewCount: 87,
        badge: null, ingredients: ['Chicken', 'Broccoli', 'Carrots', 'Teriyaki'],
        image: '/assets/images/teriyaki-chicken.jpg',
      },
      {
        id: 'earth-bowl', name: 'Earth Bowl', category: 'Salads',
        description: 'Roasted sweet potato, chickpeas, kale, tahini, and pickled onion over quinoa.',
        price: 14.50, calories: '460', protein: '18g', rating: 4.6, reviewCount: 63,
        badge: 'VEGAN', ingredients: ['Sweet Potato', 'Chickpeas', 'Kale', 'Tahini'],
        image: '/assets/images/earth-bowl.jpg',
      },
      {
        id: 'sunset-harvest', name: 'Sunset Harvest Salad', category: 'Salads',
        description: 'Fresh mixed greens, roasted beets, goat cheese, and balsamic vinaigrette.',
        price: 13.50, calories: '320', protein: '12g', rating: 4.5, reviewCount: 42,
        badge: null, ingredients: ['Greens', 'Beets', 'Goat Cheese', 'Balsamic'],
        image: '/assets/images/hero-bowl.jpg',
      },
      {
        id: 'citrus-glow', name: 'Citrus Glow Bowl', category: 'Seasonal',
        description: 'Seasonal citrus, seared tuna, avocado, and jalapeño over cilantro lime rice.',
        price: 17.50, calories: '490', protein: '38g', rating: 4.9, reviewCount: 28,
        badge: 'SEASONAL', ingredients: ['Seared Tuna', 'Citrus', 'Avocado', 'Jalapeño'],
        image: '/assets/images/salmon-signature.jpg',
      },
      {
        id: 'mediterranean-wrap', name: 'Mediterranean Chicken Wrap', category: 'Wraps',
        description: 'Grilled herb chicken, kalamata olives, cucumber, and feta wrapped in a warm artisan tortilla.',
        price: 13.90, calories: '480', protein: '36g', rating: 4.8, reviewCount: 54,
        badge: 'POPULAR', ingredients: ['Chicken', 'Feta', 'Olives', 'Cucumber', 'Tahini'],
        image: '/assets/images/farm-to-bowl.jpg',
      },
      {
        id: 'tofu-teriyaki-wrap', name: 'Crispy Tofu Avocado Wrap', category: 'Wraps',
        description: 'Organic baked tofu, smashed avocado, shredded carrots, and sesame ginger glaze in a spinach wrap.',
        price: 12.90, calories: '420', protein: '22g', rating: 4.6, reviewCount: 39,
        badge: 'ORGANIC', ingredients: ['Tofu', 'Avocado', 'Carrots', 'Sesame'],
        image: '/assets/images/earth-bowl.jpg',
      },
      {
        id: 'matcha-lemonade', name: 'Iced Matcha Lemonade', category: 'Drinks',
        description: 'Premium ceremonial grade matcha layered with fresh squeezed lemonade.',
        price: 5.50, calories: '120', protein: '1g', rating: 4.8, reviewCount: 156,
        badge: null, ingredients: ['Matcha', 'Lemon', 'Organic Cane Sugar'],
        image: null,
      },
      {
        id: 'ginger-kombucha', name: 'Ginger Peach Kombucha', category: 'Drinks',
        description: 'Locally brewed kombucha with real ginger and peach puree.',
        price: 6.00, calories: '60', protein: '0g', rating: 4.7, reviewCount: 89,
        badge: 'ORGANIC', ingredients: ['Kombucha', 'Ginger', 'Peach'],
        image: null,
      },
    ];

    for (const item of defaultMenuItems) {
      const existing = checkMenuItem.get(item.id);
      if (!existing) {
        insertMenu.run(
          item.id, item.name, item.category, item.description,
          item.price, item.calories, item.protein, item.rating,
          item.reviewCount, item.badge, JSON.stringify(item.ingredients),
          item.image, 1
        );
        menuAdded++;
      }
    }
    console.log(`  ✓ Menu Items: ${menuAdded} added (existing preserved)`);

    /* ──────────────────────────────────────────
       3. Demo Orders
       ────────────────────────────────────────── */
    const checkOrder = database.prepare('SELECT id FROM orders WHERE id = ?');
    const insertOrder = database.prepare(`
      INSERT INTO orders (id, customer_id, customer_name, order_type, items, total_price, status, notes, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // Fetch customer ID
    const customer = database.prepare('SELECT id FROM users WHERE email = ?').get('customer@farsly.com');
    const customerId = customer ? customer.id : 1;

    const defaultOrders = [
      {
        id: 'ORD-1006', customer_id: customerId, customer_name: 'Fajar Nugraha',
        order_type: 'Delivery', items: [
          { id: 'item-6a', name: 'Almond Berry Acai Bowl', quantity: 1, price: 62000 },
          { id: 'item-6b', name: 'Immunity Boost Orange Ginger', quantity: 1, price: 34000 }
        ],
        total_price: 96000, status: 'pending', notes: 'Leave package at reception desk',
        created_at: '2026-09-28T10:50:00.000Z'
      },
      {
        id: 'ORD-1005', customer_id: customerId, customer_name: 'Elena Wijaya',
        order_type: 'Dine-in', items: [
          { id: 'item-5a', name: 'Grilled Salmon Poke Bowl', quantity: 1, price: 78000 },
          { id: 'item-5b', name: 'Matcha Chia Seed Pudding', quantity: 1, price: 35000 }
        ],
        total_price: 113000, status: 'processing', notes: 'Table 05. Less dressing on salmon',
        created_at: '2026-09-28T10:35:00.000Z'
      },
      {
        id: 'ORD-1004', customer_id: customerId, customer_name: 'Dimas Anggara',
        order_type: 'Takeaway', items: [
          { id: 'item-4a', name: 'Mediterranean Herb Chicken Wrap', quantity: 2, price: 52000 },
          { id: 'item-4b', name: 'Cold-Pressed Green Detox Juice', quantity: 2, price: 32000 }
        ],
        total_price: 168000, status: 'pending', notes: 'Cut wrap into halves',
        created_at: '2026-09-28T10:20:00.000Z'
      },
      {
        id: 'ORD-1003', customer_id: customerId, customer_name: 'Citra Dewi',
        order_type: 'Dine-in', items: [
          { id: 'item-3a', name: 'Tofu Tempeh Teriyaki Bowl', quantity: 1, price: 48000 },
          { id: 'item-3b', name: 'Coconut Water Hydrator', quantity: 1, price: 25000 }
        ],
        total_price: 73000, status: 'completed', notes: 'Table 02. No peanuts due to allergy',
        created_at: '2026-09-28T09:55:00.000Z'
      },
      {
        id: 'ORD-1002', customer_id: customerId, customer_name: 'Budi Pratama',
        order_type: 'Delivery', items: [
          { id: 'item-2a', name: 'Warm Quinoa Veggie Bowl', quantity: 1, price: 55000 },
          { id: 'item-2b', name: 'Turmeric Ginger Tonic', quantity: 1, price: 30000 }
        ],
        total_price: 85000, status: 'completed', notes: 'Ring door bell upon arrival',
        created_at: '2026-09-28T09:40:00.000Z'
      },
      {
        id: 'ORD-1001', customer_id: customerId, customer_name: 'Aulia Rahma',
        order_type: 'Dine-in', items: [
          { id: 'item-1a', name: 'Avocado Quinoa Salad Bowl', quantity: 1, price: 58000 },
          { id: 'item-1b', name: 'Cold-Pressed Green Detox Juice', quantity: 1, price: 32000 }
        ],
        total_price: 90000, status: 'completed', notes: 'Table 04. Extra virgin olive oil',
        created_at: '2026-09-28T09:15:00.000Z'
      },
    ];

    for (const order of defaultOrders) {
      const existing = checkOrder.get(order.id);
      if (!existing) {
        insertOrder.run(
          order.id, order.customer_id, order.customer_name, order.order_type,
          JSON.stringify(order.items), order.total_price, order.status,
          order.notes, order.created_at
        );
        ordersAdded++;
      }
    }
    console.log(`  ✓ Orders: ${ordersAdded} added (existing preserved)`);

    console.log('✓ Seeding completed successfully.\n');
    return { success: true, usersAdded, menuAdded, ordersAdded };
  } catch (err) {
    console.error('❌ Seeding failed:', err);
    throw err;
  }
}

// Auto-run if executed directly via node seed.js
const isDirectExecution = process.argv[1] && process.argv[1].endsWith('seed.js');
if (isDirectExecution) {
  try {
    runSeed();
    process.exit(0);
  } catch (err) {
    console.error('Fatal seed error:', err);
    process.exit(1);
  }
}
