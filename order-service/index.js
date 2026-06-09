const express = require('express');
const mysql = require('mysql2/promise');
const Stripe = require('stripe');

const app = express();
app.use(express.json());

// Structured logging for CloudWatch Logs Insights
const log = (event, data) => console.log(JSON.stringify({ timestamp: new Date().toISOString(), event, ...data }));

const stripe = Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder');

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
  catch (e) { res.status(503).json({ status: 'unhealthy' }); }
});

// ─── Orders ───
app.get('/orders/:userId', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC', [req.params.userId]);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/orders', async (req, res) => {
  const { user_id, shipping_name, shipping_email, shipping_address } = req.body;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [cartItems] = await conn.query(
      `SELECT ci.*, p.price FROM cart_items ci
       JOIN products p ON ci.product_id = p.id WHERE ci.user_id = ?`, [user_id]
    );
    if (!cartItems.length) { conn.release(); return res.status(400).json({ error: 'Cart is empty' }); }

    const total = cartItems.reduce((sum, i) => sum + parseFloat(i.price) * i.quantity, 0);
    const [order] = await conn.query(
      'INSERT INTO orders (user_id, total, shipping_name, shipping_email, shipping_address) VALUES (?, ?, ?, ?, ?)',
      [user_id, total, shipping_name, shipping_email, shipping_address]
    );

    for (const item of cartItems) {
      await conn.query('INSERT INTO order_items (order_id, product_id, quantity, price) VALUES (?, ?, ?, ?)',
        [order.insertId, item.product_id, item.quantity, item.price]);
      await conn.query('UPDATE products SET stock = stock - ? WHERE id = ?', [item.quantity, item.product_id]);
    }
    await conn.commit();
    log('ORDER_PENDING', { order_id: order.insertId, user_id, amount: total });
    res.status(201).json({ id: order.insertId, total, status: 'pending' });
  } catch (e) {
    await conn.rollback();
    log('ORDER_ERROR', { user_id, error: e.message });
    res.status(500).json({ error: e.message });
  } finally { conn.release(); }
});

// ─── Stripe: Create Payment Intent ───
app.post('/payments/create-intent', async (req, res) => {
  try {
    const { order_id } = req.body;
    const [order] = await pool.query('SELECT * FROM orders WHERE id = ?', [order_id]);
    if (!order.length) return res.status(404).json({ error: 'Order not found' });
    if (order[0].status !== 'pending') return res.status(400).json({ error: 'Order already processed' });

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(order[0].total * 100), // cents
      currency: 'usd',
      metadata: { order_id: String(order_id) },
    });

    res.json({ clientSecret: paymentIntent.client_secret });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Stripe: Confirm Payment ───
app.post('/payments/confirm', async (req, res) => {
  try {
    const { order_id, payment_intent_id } = req.body;
    const [order] = await pool.query('SELECT * FROM orders WHERE id = ?', [order_id]);
    if (!order.length) return res.status(404).json({ error: 'Order not found' });

    const paymentIntent = await stripe.paymentIntents.retrieve(payment_intent_id);

    if (paymentIntent.status === 'succeeded') {
      await pool.query(
        'INSERT INTO payments (order_id, amount, status, method) VALUES (?, ?, "completed", "stripe")',
        [order_id, order[0].total]
      );
      await pool.query('UPDATE orders SET status = "paid" WHERE id = ?', [order_id]);
      await pool.query('DELETE FROM cart_items WHERE user_id = ?', [order[0].user_id]);
      log('ORDER_BOOKED', { order_id, user_id: order[0].user_id, amount: parseFloat(order[0].total) });
      res.json({ status: 'completed', amount: order[0].total });
    } else {
      await pool.query(
        'INSERT INTO payments (order_id, amount, status, method) VALUES (?, ?, "failed", "stripe")',
        [order_id, order[0].total]
      );
      log('ORDER_FAILED', { order_id, user_id: order[0].user_id, amount: parseFloat(order[0].total), stripe_status: paymentIntent.status });
      res.status(400).json({ status: 'failed', stripe_status: paymentIntent.status });
    }
  } catch (e) {
    log('ORDER_ERROR', { order_id: req.body.order_id, error: e.message });
    res.status(500).json({ error: e.message });
  }
});

// ─── Legacy payment endpoint (fallback) ───
app.post('/payments', async (req, res) => {
  try {
    const { order_id, method } = req.body;
    const [order] = await pool.query('SELECT * FROM orders WHERE id = ?', [order_id]);
    if (!order.length) return res.status(404).json({ error: 'Order not found' });
    if (order[0].status !== 'pending') return res.status(400).json({ error: 'Order already processed' });

    const [result] = await pool.query(
      'INSERT INTO payments (order_id, amount, status, method) VALUES (?, ?, "completed", ?)',
      [order_id, order[0].total, method || 'card']
    );
    await pool.query('UPDATE orders SET status = "paid" WHERE id = ?', [order_id]);
    res.status(201).json({ id: result.insertId, status: 'completed', amount: order[0].total });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.listen(4002, () => console.log('Order service on :4002'));
