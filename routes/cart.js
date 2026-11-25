import { Router } from 'express';
import db from '../database.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = Router();

/**
 * Format a DB cart item row for JSON response.
 */
function formatCartItem(row) {
  const numericPrice = Number(row.price || 0);
  const qty = Number(row.quantity || 1);
  const lineSubtotal = Number((numericPrice * qty).toFixed(2));

  return {
    id: row.id,
    userId: row.user_id,
    menuItemId: row.menu_item_id,
    quantity: qty,
    notes: row.notes || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    item: {
      id: row.menu_item_id,
      name: row.name,
      category: row.category,
      description: row.description,
      price: `$${numericPrice.toFixed(2)}`,
      numericPrice,
      calories: row.calories,
      protein: row.protein,
      badge: row.badge || null,
      ingredients: JSON.parse(row.ingredients || '[]'),
      image: row.image || null,
      available: Boolean(row.available),
    },
    subtotal: `$${lineSubtotal.toFixed(2)}`,
    numericSubtotal: lineSubtotal,
  };
}

/* ──────────────────────────────────────────
   GET /api/cart  –  customer only
   Fetch the authenticated user's cart items
   ────────────────────────────────────────── */
router.get('/', authenticate, authorize('customer'), (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT 
        c.id, c.user_id, c.menu_item_id, c.quantity, c.notes, c.created_at, c.updated_at,
        m.name, m.category, m.description, m.price, m.calories, m.protein,
        m.badge, m.ingredients, m.image, m.available
      FROM cart_items c
      JOIN menu_items m ON c.menu_item_id = m.id
      WHERE c.user_id = ?
      ORDER BY c.created_at ASC
    `).all(req.user.id);

    const items = rows.map(formatCartItem);
    const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
    const numericSubtotal = Number(
      items.reduce((sum, item) => sum + item.numericSubtotal, 0).toFixed(2)
    );

    res.json({
      items,
      itemCount,
      subtotal: `$${numericSubtotal.toFixed(2)}`,
      numericSubtotal,
    });
  } catch (err) {
    console.error('GET /api/cart error:', err);
    res.status(500).json({ error: 'Failed to fetch cart items.' });
  }
});

/* ──────────────────────────────────────────
   POST /api/cart  –  customer only
   Add an item to the cart or increment quantity
   ────────────────────────────────────────── */
router.post('/', authenticate, authorize('customer'), (req, res) => {
  try {
    const { menuItemId, quantity = 1, notes = '' } = req.body;

    if (!menuItemId || typeof menuItemId !== 'string') {
      return res.status(400).json({ error: 'menuItemId is required.' });
    }

    const qty = parseInt(quantity, 10);
    if (Number.isNaN(qty) || qty < 1) {
      return res.status(400).json({ error: 'Quantity must be at least 1.' });
    }

    // Verify menu item exists
    const menuItem = db.prepare('SELECT id, available FROM menu_items WHERE id = ?').get(menuItemId.trim());
    if (!menuItem) {
      return res.status(404).json({ error: 'Menu item not found.' });
    }
    if (!menuItem.available) {
      return res.status(400).json({ error: 'This menu item is currently sold out.' });
    }

    // Upsert into cart_items
    const existing = db.prepare('SELECT id, quantity FROM cart_items WHERE user_id = ? AND menu_item_id = ?')
      .get(req.user.id, menuItemId.trim());

    if (existing) {
      db.prepare(`
        UPDATE cart_items 
        SET quantity = quantity + ?, notes = CASE WHEN ? != '' THEN ? ELSE notes END, updated_at = datetime('now')
        WHERE id = ?
      `).run(qty, notes.trim(), notes.trim(), existing.id);
    } else {
      db.prepare(`
        INSERT INTO cart_items (user_id, menu_item_id, quantity, notes, created_at, updated_at)
        VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
      `).run(req.user.id, menuItemId.trim(), qty, notes.trim());
    }

    // Fetch and return the updated/created item
    const row = db.prepare(`
      SELECT 
        c.id, c.user_id, c.menu_item_id, c.quantity, c.notes, c.created_at, c.updated_at,
        m.name, m.category, m.description, m.price, m.calories, m.protein,
        m.badge, m.ingredients, m.image, m.available
      FROM cart_items c
      JOIN menu_items m ON c.menu_item_id = m.id
      WHERE c.user_id = ? AND c.menu_item_id = ?
    `).get(req.user.id, menuItemId.trim());

    res.status(201).json(formatCartItem(row));
  } catch (err) {
    console.error('POST /api/cart error:', err);
    res.status(500).json({ error: 'Failed to add item to cart.' });
  }
});

/* ──────────────────────────────────────────
   PUT /api/cart/:itemId  –  customer only
   Update quantity or notes (removes if qty <= 0)
   Accepts either cart_item.id (number) or menuItemId (string)
   ────────────────────────────────────────── */
router.put('/:itemId', authenticate, authorize('customer'), (req, res) => {
  try {
    const { itemId } = req.params;
    const { quantity, notes } = req.body;

    if (quantity === undefined && notes === undefined) {
      return res.status(400).json({ error: 'quantity or notes is required to update.' });
    }

    // Find cart item belonging to this user by either cart_items.id or menu_item_id
    const existing = db.prepare(`
      SELECT id, quantity, notes FROM cart_items 
      WHERE (id = ? OR menu_item_id = ?) AND user_id = ?
    `).get(itemId, itemId, req.user.id);

    if (!existing) {
      return res.status(404).json({ error: 'Cart item not found.' });
    }

    const newQty = quantity !== undefined ? parseInt(quantity, 10) : existing.quantity;

    // If quantity is reduced to 0 or less, remove item
    if (newQty <= 0) {
      db.prepare('DELETE FROM cart_items WHERE id = ?').run(existing.id);
      return res.json({ message: 'Item removed from cart', id: existing.id });
    }

    const newNotes = notes !== undefined ? String(notes).trim() : existing.notes;

    db.prepare(`
      UPDATE cart_items 
      SET quantity = ?, notes = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(newQty, newNotes, existing.id);

    const row = db.prepare(`
      SELECT 
        c.id, c.user_id, c.menu_item_id, c.quantity, c.notes, c.created_at, c.updated_at,
        m.name, m.category, m.description, m.price, m.calories, m.protein,
        m.badge, m.ingredients, m.image, m.available
      FROM cart_items c
      JOIN menu_items m ON c.menu_item_id = m.id
      WHERE c.id = ?
    `).get(existing.id);

    res.json(formatCartItem(row));
  } catch (err) {
    console.error('PUT /api/cart/:itemId error:', err);
    res.status(500).json({ error: 'Failed to update cart item.' });
  }
});

/* ──────────────────────────────────────────
   DELETE /api/cart/:itemId  –  customer only
   Remove a single item from the cart
   Accepts either cart_item.id (number) or menuItemId (string)
   ────────────────────────────────────────── */
router.delete('/:itemId', authenticate, authorize('customer'), (req, res) => {
  try {
    const { itemId } = req.params;

    const existing = db.prepare(`
      SELECT id FROM cart_items 
      WHERE (id = ? OR menu_item_id = ?) AND user_id = ?
    `).get(itemId, itemId, req.user.id);

    if (!existing) {
      return res.status(404).json({ error: 'Cart item not found.' });
    }

    db.prepare('DELETE FROM cart_items WHERE id = ?').run(existing.id);
    res.json({ message: 'Item removed from cart', id: existing.id });
  } catch (err) {
    console.error('DELETE /api/cart/:itemId error:', err);
    res.status(500).json({ error: 'Failed to remove item from cart.' });
  }
});

/* ──────────────────────────────────────────
   DELETE /api/cart  –  customer only
   Clear the logged-in user's entire cart
   ────────────────────────────────────────── */
router.delete('/', authenticate, authorize('customer'), (req, res) => {
  try {
    const result = db.prepare('DELETE FROM cart_items WHERE user_id = ?').run(req.user.id);
    res.json({ message: 'Cart cleared successfully', deletedCount: result.changes });
  } catch (err) {
    console.error('DELETE /api/cart error:', err);
    res.status(500).json({ error: 'Failed to clear cart.' });
  }
});

export default router;
