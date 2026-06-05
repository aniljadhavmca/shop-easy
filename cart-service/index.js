const express = require('express');
const mysql = require('mysql2/promise');

const app = express();
app.use(express.json());

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'password',
  database: process.env.DB_NAME || 'shop_easy',
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.get('/cart/:userId', async (req, res) => {
  const [rows] = await pool.query(
    `SELECT ci.*, p.name, p.price FROM cart_items ci
     JOIN products p ON ci.product_id = p.id
     WHERE ci.user_id = ?`,
    [req.params.userId]
  );
  res.json(rows);
});

app.post('/cart', async (req, res) => {
  const { user_id, product_id, quantity } = req.body;
  const [existing] = await pool.query(
    'SELECT id, quantity FROM cart_items WHERE user_id = ? AND product_id = ?',
    [user_id, product_id]
  );
  if (existing.length) {
    await pool.query('UPDATE cart_items SET quantity = quantity + ? WHERE id = ?', [quantity, existing[0].id]);
  } else {
    await pool.query('INSERT INTO cart_items (user_id, product_id, quantity) VALUES (?, ?, ?)', [user_id, product_id, quantity]);
  }
  res.status(201).json({ message: 'Added to cart' });
});

app.delete('/cart/:id', async (req, res) => {
  await pool.query('DELETE FROM cart_items WHERE id = ?', [req.params.id]);
  res.status(204).end();
});

app.delete('/cart/user/:userId', async (req, res) => {
  await pool.query('DELETE FROM cart_items WHERE user_id = ?', [req.params.userId]);
  res.status(204).end();
});

app.listen(4002, () => console.log('Cart service on :4002'));
