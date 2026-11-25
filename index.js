import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

// Database & Migrations
import { db, checkDbHealth } from './database.js';
import { runMigrations } from './migrate.js';

// Route modules
import authRoutes from './routes/auth.js';
import menuRoutes from './routes/menu.js';
import orderRoutes from './routes/orders.js';
import cartRoutes from './routes/cart.js';
import favoriteRoutes from './routes/favorites.js';
import uploadRoutes from './routes/upload.js';
import restaurantRoutes from './routes/restaurant.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Run idempotent migrations on startup to guarantee schema integrity
try {
  runMigrations(db);
} catch (err) {
  console.error('❌ Failed to run migrations on startup:', err.message);
}

const app = express();
const PORT = process.env.PORT || 3000;

/* ──────────────────────────────────────────
   Middleware
   ────────────────────────────────────────── */

// CORS – dynamic support for Coolify / production domains + local development
const configuredOrigins = (process.env.CORS_ORIGIN || process.env.FRONTEND_URL || '')
  .split(',')
  .map((s) => s.trim().replace(/\/+$/, ''))
  .filter(Boolean);

const defaultAllowedOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:4173',
  'http://127.0.0.1:5173',
  'http://localhost:8081',
  'http://localhost:8082',
  'http://127.0.0.1:8081',
  'https://farsly.kotaawan.net',
  'https://farsly-api.kotaawan.net',
  /^http:\/\/localhost:\d+$/,
  /^http:\/\/127\.0\.0\.1:\d+$/,
  /^http:\/\/10\.\d+\.\d+\.\d+(:\d+)?$/,
  /^http:\/\/192\.168\.\d+\.\d+(:\d+)?$/,
];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. mobile apps, curl, server-to-server)
      if (!origin) {
        return callback(null, true);
      }

      // Check wildcards or configured production origins from environment
      if (configuredOrigins.includes('*') || configuredOrigins.includes(origin)) {
        return callback(null, true);
      }

      // Check default allowed origins
      const isAllowed = defaultAllowedOrigins.some((allowed) => {
        if (allowed instanceof RegExp) return allowed.test(origin);
        return allowed === origin;
      });

      if (isAllowed) {
        return callback(null, true);
      }

      // In non-production, allow all for easier local testing
      if (process.env.NODE_ENV !== 'production') {
        return callback(null, true);
      }

      console.warn(`[CORS] Blocked request from unauthorized origin: ${origin}`);
      return callback(new Error(`Origin ${origin} not allowed by CORS`));
    },
    credentials: true,
  })
);

// JSON body parser with generous limit for base64 images
app.use(express.json({ limit: '10mb' }));

// Static uploads serving for uploaded files
const uploadsDir = join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir));

/* ──────────────────────────────────────────
   Root & Health check
   ────────────────────────────────────────── */

// Root endpoint: API status overview
app.get('/', (_req, res) => {
  res.json({
    name: 'Farsly API',
    version: '1.0.0',
    status: 'running',
    health: '/api/health',
    endpoints: {
      health: '/api/health',
      menu: '/api/menu',
      auth: '/api/auth',
      orders: '/api/orders',
      cart: '/api/cart',
      favorites: '/api/favorites',
      upload: '/api/upload',
      restaurantStats: '/api/restaurant/stats',
    },
  });
});

// Comprehensive health check verifying Express & Database connectivity
app.get('/api/health', (_req, res) => {
  const dbHealth = checkDbHealth();
  const isHealthy = dbHealth.healthy;

  res.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? 'ok' : 'degraded',
    database: isHealthy ? 'connected' : 'error',
    databasePath: process.env.NODE_ENV === 'production' ? undefined : dbHealth.path,
    error: dbHealth.error || null,
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

/* ──────────────────────────────────────────
   API Routes
   ────────────────────────────────────────── */

app.use('/api/auth', authRoutes);
app.use('/api/menu', menuRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/favorites', favoriteRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/restaurant', restaurantRoutes);

/* ──────────────────────────────────────────
   404 fallback for API routes
   ────────────────────────────────────────── */

app.use('/api/{*path}', (_req, res) => {
  res.status(404).json({ error: 'API endpoint not found.' });
});

/* ──────────────────────────────────────────
   Global error handler
   ────────────────────────────────────────── */

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error.' });
});

/* ──────────────────────────────────────────
   Start
   ────────────────────────────────────────── */

// Explicitly bind to '0.0.0.0' for Docker/Coolify container networking
app.listen(PORT, '0.0.0.0', () => {
  const hostUrl = process.env.PUBLIC_API_URL || `http://localhost:${PORT}`;
  console.log(`\n🍃 Farsly API server listening on 0.0.0.0:${PORT}`);
  console.log(`   Public URL: ${hostUrl}`);
  console.log(`   Health Check: ${hostUrl}/api/health\n`);
});
