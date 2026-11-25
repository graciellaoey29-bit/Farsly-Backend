import { Router } from 'express';
import db from '../database.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = Router();

/* ──────────────────────────────────────────
   GET /api/restaurant/stats  –  restaurant only
   Aggregate kitchen orders, menu inventory, and revenue stats
   ────────────────────────────────────────── */
router.get('/stats', authenticate, authorize('restaurant'), (_req, res) => {
  try {
    // 1. Order status counts
    const orderRows = db.prepare(`
      SELECT status, COUNT(*) AS count
      FROM orders
      GROUP BY status
    `).all();

    const orderStats = {
      total: 0,
      pending: 0,
      processing: 0,
      completed: 0,
      cancelled: 0,
    };

    for (const r of orderRows) {
      if (orderStats[r.status] !== undefined) {
        orderStats[r.status] = r.count;
      }
      orderStats.total += r.count;
    }

    // 2. Revenue (sum of non-cancelled orders)
    const revenueRow = db.prepare(`
      SELECT COALESCE(SUM(total_price), 0) AS total_revenue
      FROM orders
      WHERE status != 'cancelled'
    `).get();

    const totalRevenue = Number((revenueRow.total_revenue || 0).toFixed(2));

    // 3. Menu inventory breakdown
    const menuRows = db.prepare(`
      SELECT available, COUNT(*) AS count
      FROM menu_items
      GROUP BY available
    `).all();

    let totalMenuItems = 0;
    let availableMenuItems = 0;
    let soldOutMenuItems = 0;

    for (const r of menuRows) {
      totalMenuItems += r.count;
      if (r.available === 1) {
        availableMenuItems += r.count;
      } else {
        soldOutMenuItems += r.count;
      }
    }

    // 4. Customer count
    const customerRow = db.prepare(`
      SELECT COUNT(*) AS total_customers
      FROM users
      WHERE role = 'customer'
    `).get();

    res.json({
      orders: orderStats,
      revenue: {
        total: totalRevenue,
        formattedTotal: `$${totalRevenue.toFixed(2)}`,
      },
      menu: {
        total: totalMenuItems,
        available: availableMenuItems,
        soldOut: soldOutMenuItems,
      },
      customers: {
        total: customerRow.total_customers || 0,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('GET /api/restaurant/stats error:', err);
    res.status(500).json({ error: 'Failed to fetch restaurant statistics.' });
  }
});

export default router;
