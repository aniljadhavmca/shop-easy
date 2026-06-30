const express = require('express');
const mysql = require('mysql2/promise');
const Redis = require('ioredis');
const { collectDefaultMetrics, register, Counter, Histogram } = require('prom-client');

const app = express();
app.use(express.json({ limit: '1mb' }));

// Prometheus metrics
collectDefaultMetrics({ prefix: 'product_svc_' });
const httpRequests = new Counter({ name: 'product_svc_http_requests_total', help: 'Total HTTP requests', labelNames: ['method', 'route', 'status'] });
const httpDuration = new Histogram({ name: 'product_svc_http_duration_seconds', help: 'HTTP request duration', labelNames: ['method', 'route'], buckets: [0.01, 0.05, 0.1, 0.5, 1, 5] });

app.use((req, res, next) => {
  const end = httpDuration.startTimer({ method: req.method, route: req.path });
  res.on('finish', () => { end(); httpRequests.inc({ method: req.method, route: req.path, status: res.statusCode }); });
  next();
});

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

// ─── Database Connection ───
let pool;
const connectDB = () => {
  pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'shop_easy',
    waitForConnections: true,
    connectionLimit: 5,
    connectTimeout: 30000,
    enableKeepAlive: true,
  });
};
connectDB();

// ─── Redis Connection ───
const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  retryStrategy: (times) => Math.min(times * 50, 2000),
  maxRetriesPerRequest: 3,
});

redis.on('connect', () => console.log('Redis connected'));
redis.on('error', (err) => console.error('Redis error:', err.message));

// ─── Cache Configuration ───
const CACHE_TTL = {
  PRODUCTS_LIST: 300,
  PRODUCT_DETAIL: 600,
  CATEGORIES: 900,
};

// ─── Cache Helper Functions ───
const getCache = async (key) => {
  try {
    const data = await redis.get(key);
    if (data) return JSON.parse(data);
    return null;
  } catch (err) {
    console.error('Cache get error:', err.message);
    return null;
  }
};

const setCache = async (key, data, ttl) => {
  try {
    await redis.setex(key, ttl, JSON.stringify(data));
  } catch (err) {
    console.error('Cache set error:', err.message);
  }
};

const invalidateCache = async (patterns) => {
  try {
    for (const pattern of patterns) {
      const keys = await redis.keys(pattern);
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    }
  } catch (err) {
    console.error('Cache invalidate error:', err.message);
  }
};

// ─── Health Check ───
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    const redisStatus = redis.status === 'ready' ? 'ok' : 'degraded';
    res.json({ status: 'ok', redis: redisStatus });
  } catch {
    res.status(503).json({ status: 'unhealthy' });
  }
});

// ─── Cache Stats ───
app.get('/cache/stats', async (req, res) => {
  try {
    const info = await redis.info('stats');
    const dbSize = await redis.dbsize();
    res.json({
      totalKeys: dbSize,
      info: info.split('\n').filter(l => l.includes('hits') || l.includes('misses')),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Categories (with Cache) ───
app.get('/categories', async (req, res) => {
  try {
    const cacheKey = 'categories:all';
    const cached = await getCache(cacheKey);
    if (cached) return res.json(cached);

    const [rows] = await pool.query('SELECT * FROM categories ORDER BY name');
    await setCache(cacheKey, rows, CACHE_TTL.CATEGORIES);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/categories', async (req, res) => {
  try {
    const { name, icon, image } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    const [result] = await pool.query('INSERT INTO categories (name, icon, image) VALUES (?, ?, ?)', [name, icon || '📦', image || '']);
    await invalidateCache(['categories:all']);
    res.status(201).json({ id: result.insertId, name, icon: icon || '📦', image: image || '' });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: 'Category already exists' });
    res.status(500).json({ error: e.message });
  }
});

app.put('/categories/:id', async (req, res) => {
  try {
    const { name, image } = req.body;
    await pool.query('UPDATE categories SET name=COALESCE(?,name), image=COALESCE(?,image) WHERE id=?', [name, image, req.params.id]);
    await invalidateCache(['categories:all']);
    res.json({ id: parseInt(req.params.id), name, image });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/categories/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM categories WHERE id = ?', [req.params.id]);
    await invalidateCache(['categories:all']);
    res.status(204).end();
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Products (with Cache) ───
app.get('/products', async (req, res) => {
  try {
    const cacheKey = 'products:all';
    const cached = await getCache(cacheKey);
    if (cached) return res.json(cached);

    const [rows] = await pool.query('SELECT * FROM products');
    await setCache(cacheKey, rows, CACHE_TTL.PRODUCTS_LIST);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/products/:id', async (req, res) => {
  try {
    const cacheKey = `products:${req.params.id}`;
    const cached = await getCache(cacheKey);
    if (cached) return res.json(cached);

    const [rows] = await pool.query('SELECT * FROM products WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });

    await setCache(cacheKey, rows[0], CACHE_TTL.PRODUCT_DETAIL);
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/products', async (req, res) => {
  try {
    const { name, description, price, image, category, stock } = req.body;
    if (!name || !price) return res.status(400).json({ error: 'Name and price are required' });
    const [result] = await pool.query(
      'INSERT INTO products (name, description, price, image, category, stock) VALUES (?, ?, ?, ?, ?, ?)',
      [name, description || '', price, image || '', category || 'General', stock || 0]
    );
    await invalidateCache(['products:all']);
    res.status(201).json({ id: result.insertId, name, description, price, image, category, stock });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/products/:id', async (req, res) => {
  try {
    const { name, description, price, image, category, stock } = req.body;
    await pool.query(
      'UPDATE products SET name=?, description=?, price=?, image=?, category=?, stock=? WHERE id=?',
      [name, description, price, image, category, stock, req.params.id]
    );
    await invalidateCache(['products:all', `products:${req.params.id}`]);
    res.json({ id: parseInt(req.params.id), name, description, price, image, category, stock });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/products/:id', async (req, res) => {
  try {
    const [orders] = await pool.query('SELECT COUNT(*) as count FROM order_items WHERE product_id = ?', [req.params.id]);
    if (orders[0].count > 0) {
      await pool.query('UPDATE products SET stock = 0 WHERE id = ?', [req.params.id]);
      await pool.query('DELETE FROM cart_items WHERE product_id = ?', [req.params.id]);
      await invalidateCache(['products:all', `products:${req.params.id}`]);
      return res.json({ message: 'Product deactivated (has order history)' });
    }
    await pool.query('DELETE FROM cart_items WHERE product_id = ?', [req.params.id]);
    await pool.query('DELETE FROM products WHERE id = ?', [req.params.id]);
    await invalidateCache(['products:all', `products:${req.params.id}`]);
    res.status(204).end();
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Cart (No cache — user-specific, frequently changing) ───
app.get('/cart/:userId', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT ci.*, p.name, p.price, p.image FROM cart_items ci
       JOIN products p ON ci.product_id = p.id WHERE ci.user_id = ?`,
      [req.params.userId]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/cart', async (req, res) => {
  try {
    const { user_id, product_id, quantity } = req.body;
    const [existing] = await pool.query(
      'SELECT id FROM cart_items WHERE user_id = ? AND product_id = ?', [user_id, product_id]
    );
    if (existing.length) {
      await pool.query('UPDATE cart_items SET quantity = quantity + ? WHERE id = ?', [quantity, existing[0].id]);
    } else {
      await pool.query('INSERT INTO cart_items (user_id, product_id, quantity) VALUES (?, ?, ?)', [user_id, product_id, quantity]);
    }
    res.status(201).json({ message: 'Added to cart' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/cart/:id', async (req, res) => {
  try { await pool.query('DELETE FROM cart_items WHERE id = ?', [req.params.id]); res.status(204).end(); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Manual Cache Clear (Admin) ───
app.delete('/cache/flush', async (req, res) => {
  try {
    await redis.flushdb();
    res.json({ message: 'Cache flushed successfully' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(4001, () => console.log('Product service on :4001 (Redis cache enabled)'));
