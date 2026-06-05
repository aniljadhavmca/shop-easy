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

app.post('/payments', async (req, res) => {
  const { order_id, method } = req.body;
  const [order] = await pool.query('SELECT * FROM orders WHERE id = ?', [order_id]);
  if (!order.length) return res.status(404).json({ error: 'Order not found' });
  if (order[0].status !== 'pending') return res.status(400).json({ error: 'Order not payable' });

  const [result] = await pool.query(
    'INSERT INTO payments (order_id, amount, status, method) VALUES (?, ?, "completed", ?)',
    [order_id, order[0].total, method || 'card']
  );
  await pool.query('UPDATE orders SET status = "paid" WHERE id = ?', [order_id]);
  res.status(201).json({ id: result.insertId, status: 'completed', amount: order[0].total });
});

app.get('/payments/:orderId', async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM payments WHERE order_id = ?', [req.params.orderId]);
  res.json(rows);
});

app.listen(4004, () => console.log('Payment service on :4004'));
