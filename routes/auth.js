import { Router } from 'express';
import bcryptjs from 'bcryptjs';
import db from '../database.js';
import { generateToken, authenticate } from '../middleware/auth.js';

const router = Router();

/* ──────────────────────────────────────────
   POST /api/auth/register
   ────────────────────────────────────────── */
router.post('/register', (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    // Validation
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required.' });
    }

    if (typeof name !== 'string' || name.trim().length < 2) {
      return res.status(400).json({ error: 'Name must be at least 2 characters.' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Please provide a valid email address.' });
    }

    if (typeof password !== 'string' || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }

    // Only allow 'customer' role for self-registration (restaurant accounts are admin-created)
    const userRole = (role === 'restaurant') ? 'restaurant' : 'customer';

    // Check for existing user
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.trim());
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    // Hash password and insert
    const salt = bcryptjs.genSaltSync(10);
    const hashedPassword = bcryptjs.hashSync(password, salt);

    const result = db.prepare(
      'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)'
    ).run(name.trim(), email.trim(), hashedPassword, userRole);

    const newUser = {
      id: result.lastInsertRowid,
      name: name.trim(),
      email: email.trim(),
      role: userRole,
    };

    const token = generateToken(newUser);

    res.status(201).json({
      user: newUser,
      token,
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
});

/* ──────────────────────────────────────────
   POST /api/auth/login
   ────────────────────────────────────────── */
router.post('/login', (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.trim());

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const validPassword = bcryptjs.compareSync(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const payload = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    };

    const token = generateToken(payload);

    res.json({
      user: payload,
      token,
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

/* ──────────────────────────────────────────
   GET /api/auth/me  –  validate token & get user
   ────────────────────────────────────────── */
router.get('/me', authenticate, (req, res) => {
  try {
    const user = db.prepare('SELECT id, name, email, role FROM users WHERE id = ?').get(req.user.id);

    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    res.json({ user });
  } catch (err) {
    console.error('Auth/me error:', err);
    res.status(500).json({ error: 'Failed to fetch user data.' });
  }
});

/* ──────────────────────────────────────────
   PUT /api/auth/profile  –  authenticated (any role)
   Update profile name and/or email
   ────────────────────────────────────────── */
router.put('/profile', authenticate, (req, res) => {
  try {
    const { name, email } = req.body;

    if (!name && !email) {
      return res.status(400).json({ error: 'At least one field (name or email) is required to update.' });
    }

    const currentUser = db.prepare('SELECT id, name, email, role FROM users WHERE id = ?').get(req.user.id);
    if (!currentUser) {
      return res.status(404).json({ error: 'User not found.' });
    }

    let newName = currentUser.name;
    let newEmail = currentUser.email;

    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length < 2) {
        return res.status(400).json({ error: 'Name must be at least 2 characters.' });
      }
      newName = name.trim();
    }

    if (email !== undefined) {
      const trimmedEmail = email.trim().toLowerCase();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(trimmedEmail)) {
        return res.status(400).json({ error: 'Please provide a valid email address.' });
      }

      // Check if email is already taken by another account
      const conflict = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?')
        .get(trimmedEmail, req.user.id);
      if (conflict) {
        return res.status(409).json({ error: 'An account with this email already exists.' });
      }
      newEmail = trimmedEmail;
    }

    db.prepare('UPDATE users SET name = ?, email = ? WHERE id = ?').run(newName, newEmail, req.user.id);

    const updatedUser = {
      id: currentUser.id,
      name: newName,
      email: newEmail,
      role: currentUser.role,
    };

    res.json({ user: updatedUser });
  } catch (err) {
    console.error('PUT /api/auth/profile error:', err);
    res.status(500).json({ error: 'Failed to update profile.' });
  }
});

/* ──────────────────────────────────────────
   PUT /api/auth/password  –  authenticated (any role)
   Change user password after verifying current password
   ────────────────────────────────────────── */
router.put('/password', authenticate, (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Both currentPassword and newPassword are required.' });
    }

    if (typeof newPassword !== 'string' || newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters.' });
    }

    const user = db.prepare('SELECT password FROM users WHERE id = ?').get(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const isMatch = bcryptjs.compareSync(currentPassword, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Current password is incorrect.' });
    }

    const salt = bcryptjs.genSaltSync(10);
    const hashed = bcryptjs.hashSync(newPassword, salt);

    db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashed, req.user.id);

    res.json({ message: 'Password updated successfully.' });
  } catch (err) {
    console.error('PUT /api/auth/password error:', err);
    res.status(500).json({ error: 'Failed to update password.' });
  }
});

export default router;
