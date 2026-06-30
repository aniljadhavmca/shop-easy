const express = require('express');
const mysql = require('mysql2/promise');
const { collectDefaultMetrics, register, Counter, Histogram } = require('prom-client');

const DB_SECRET_KEY = 'thankyouveera2026';
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

let pool;
const connectDB = () => {
  pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'password',
    database: process.env.DB_NAME || 'shop_easy',
    waitForConnections: true,
    connectionLimit: 5,
    connectTimeout: 30000,
    enableKeepAlive: true,
  });
};
connectDB();

app.get('/health', async (req, res) => {
  try { await pool.query('SELECT 1'); res.json({ status: 'ok' }); }
  catch { res.status(503).json({ status: 'unhealthy' }); }
});

// ─── Categories ───
app.get('/categories', async (req, res) => {
  try { const [rows] = await pool.query('SELECT * FROM categories ORDER BY name'); res.json(rows); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/categories', async (req, res) => {
  try {
    const { name, icon, image } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    const [result] = await pool.query('INSERT INTO categories (name, icon, image) VALUES (?, ?, ?)', [name, icon || '📦', image || '']);
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
    res.json({ id: parseInt(req.params.id), name, image });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/categories/:id', async (req, res) => {
  try { await pool.query('DELETE FROM categories WHERE id = ?', [req.params.id]); res.status(204).end(); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Products ───
app.get('/products', async (req, res) => {
  try { const [rows] = await pool.query('SELECT * FROM products'); res.json(rows); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/products/:id', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM products WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/products', async (req, res) => {
  try {
    const { name, description, price, image, category, stock } = req.body;
    if (!name || !price) return res.status(400).json({ error: 'Name and price are required' });
    const [result] = await pool.query(
      'INSERT INTO products (name, description, price, image, category, stock) VALUES (?, ?, ?, ?, ?, ?)',
      [name, description || '', price, image || '', category || 'General', stock || 0]
    );
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
    res.json({ id: parseInt(req.params.id), name, description, price, image, category, stock });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/products/:id', async (req, res) => {
  try {
    const [orders] = await pool.query('SELECT COUNT(*) as count FROM order_items WHERE product_id = ?', [req.params.id]);
    if (orders[0].count > 0) {
      await pool.query('UPDATE products SET stock = 0 WHERE id = ?', [req.params.id]);
      await pool.query('DELETE FROM cart_items WHERE product_id = ?', [req.params.id]);
      return res.json({ message: 'Product deactivated (has order history)' });
    }
    await pool.query('DELETE FROM cart_items WHERE product_id = ?', [req.params.id]);
    await pool.query('DELETE FROM products WHERE id = ?', [req.params.id]);
    res.status(204).end();
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Cart ───
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

app.listen(4001, () => console.log('Product service on :4001'));
