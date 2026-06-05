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

app.get('/orders/:userId', async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM orders WHERE user_id = ?', [req.params.userId]);
  res.json(rows);
});

app.get('/orders/detail/:id', async (req, res) => {
  const [order] = await pool.query('SELECT * FROM orders WHERE id = ?', [req.params.id]);
  if (!order.length) return res.status(404).json({ error: 'Not found' });
  const [items] = await pool.query(
    `SELECT oi.*, p.name FROM order_items oi
     JOIN products p ON oi.product_id = p.id
     WHERE oi.order_id = ?`,
    [req.params.id]
  );
  res.json({ ...order[0], items });
});

app.post('/orders', async (req, res) => {
  const { user_id } = req.body;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [cartItems] = await conn.query(
      `SELECT ci.*, p.price FROM cart_items ci
       JOIN products p ON ci.product_id = p.id
       WHERE ci.user_id = ?`,
      [user_id]
    );
    if (!cartItems.length) return res.status(400).json({ error: 'Cart is empty' });

    const total = cartItems.reduce((sum, i) => sum + i.price * i.quantity, 0);
    const [order] = await conn.query('INSERT INTO orders (user_id, total) VALUES (?, ?)', [user_id, total]);

    for (const item of cartItems) {
      await conn.query(
        'INSERT INTO order_items (order_id, product_id, quantity, price) VALUES (?, ?, ?, ?)',
        [order.insertId, item.product_id, item.quantity, item.price]
      );
      await conn.query('UPDATE products SET stock = stock - ? WHERE id = ?', [item.quantity, item.product_id]);
    }
    await conn.query('DELETE FROM cart_items WHERE user_id = ?', [user_id]);
    await conn.commit();
    res.status(201).json({ id: order.insertId, total, status: 'pending' });
  } catch (e) {
    await conn.rollback();
    res.status(500).json({ error: e.message });
  } finally {
    conn.release();
  }
});

app.listen(4003, () => console.log('Order service on :4003'));
