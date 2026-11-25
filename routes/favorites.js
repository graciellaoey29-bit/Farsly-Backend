import { Router } from 'express';
import db from '../database.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = Router();

/**
 * Format a favorited menu item row.
 */
function formatFavoriteItem(row) {
  return {
    favoriteId: row.favorite_id,
    favoritedAt: row.favorited_at,
    id: row.id,
    name: row.name,
    category: row.category,
    description: row.description,
    price: `$${Number(row.price).toFixed(2)}`,
    numericPrice: Number(row.price),
    calories: row.calories,
    protein: row.protein,
    rating: row.rating,
    reviewCount: row.review_count,
    badge: row.badge || null,
    ingredients: JSON.parse(row.ingredients || '[]'),
    image: row.image || null,
    available: Boolean(row.available),
  };
}

/* ──────────────────────────────────────────
   GET /api/favorites  –  customer only
   Fetch all favorited menu items for the user
   ────────────────────────────────────────── */
router.get('/', authenticate, authorize('customer'), (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT 
        f.id AS favorite_id, f.created_at AS favorited_at,
        m.id, m.name, m.category, m.description, m.price, m.calories,
        m.protein, m.rating, m.review_count, m.badge, m.ingredients,
        m.image, m.available
      FROM favorites f
      JOIN menu_items m ON f.menu_item_id = m.id
      WHERE f.user_id = ?
      ORDER BY f.created_at DESC
    `).all(req.user.id);

    res.json(rows.map(formatFavoriteItem));
  } catch (err) {
    console.error('GET /api/favorites error:', err);
    res.status(500).json({ error: 'Failed to fetch favorites.' });
  }
});

/* ──────────────────────────────────────────
   POST /api/favorites/:menuId  –  customer only
   Add a menu item to the user's favorites (idempotent)
   ────────────────────────────────────────── */
router.post('/:menuId', authenticate, authorize('customer'), (req, res) => {
  try {
    const { menuId } = req.params;

    const menuItem = db.prepare('SELECT id FROM menu_items WHERE id = ?').get(menuId);
    if (!menuItem) {
      return res.status(404).json({ error: 'Menu item not found.' });
    }

    db.prepare(`
      INSERT OR IGNORE INTO favorites (user_id, menu_item_id, created_at)
      VALUES (?, ?, datetime('now'))
    `).run(req.user.id, menuId);

    res.status(201).json({
      message: 'Item added to favorites',
      menuItemId: menuId,
    });
  } catch (err) {
    console.error('POST /api/favorites/:menuId error:', err);
    res.status(500).json({ error: 'Failed to add item to favorites.' });
  }
});

/* ──────────────────────────────────────────
   DELETE /api/favorites/:menuId  –  customer only
   Remove a menu item from the user's favorites
   ────────────────────────────────────────── */
router.delete('/:menuId', authenticate, authorize('customer'), (req, res) => {
  try {
    const { menuId } = req.params;

    const result = db.prepare('DELETE FROM favorites WHERE user_id = ? AND menu_item_id = ?')
      .run(req.user.id, menuId);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Favorite not found.' });
    }

    res.json({
      message: 'Item removed from favorites',
      menuItemId: menuId,
    });
  } catch (err) {
    console.error('DELETE /api/favorites/:menuId error:', err);
    res.status(500).json({ error: 'Failed to remove favorite.' });
  }
});

export default router;
