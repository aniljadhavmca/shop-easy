const express = require('express');
const mysql = require('mysql2/promise');

const app = express();
app.use(express.json());

let pool;
const connectDB = () => {
  pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'password',
    database: process.env.DB_NAME || 'shop_easy',
    waitForConnections: true,
    connectionLimit: 5,
  });
};
connectDB();

app.get('/health', async (req, res) => {
  try { await pool.query('SELECT 1'); res.json({ status: 'ok' }); }
  catch { res.status(503).json({ status: 'unhealthy' }); }
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
