const express = require('express');
const mysql = require('mysql2/promise');
const Stripe = require('stripe');
const { collectDefaultMetrics, register, Counter, Histogram } = require('prom-client');

const app = express();
app.use(express.json({ limit: '1mb' }));

// Input sanitization
const sanitize = (str) => typeof str === 'string' ? str.replace(/[<>"';]/g, '').trim() : str;

// Prometheus metrics
collectDefaultMetrics({ prefix: 'order_svc_' });
const httpRequests = new Counter({ name: 'order_svc_http_requests_total', help: 'Total HTTP requests', labelNames: ['method', 'route', 'status'] });
const httpDuration = new Histogram({ name: 'order_svc_http_duration_seconds', help: 'HTTP request duration', labelNames: ['method', 'route'], buckets: [0.01, 0.05, 0.1, 0.5, 1, 5] });
const ordersCreated = new Counter({ name: 'orders_created_total', help: 'Total orders created' });
const ordersPaid = new Counter({ name: 'orders_paid_total', help: 'Total orders paid' });
const ordersFailed = new Counter({ name: 'orders_failed_total', help: 'Total orders failed' });
const paymentAmount = new Histogram({ name: 'payment_amount_dollars', help: 'Payment amounts', buckets: [10, 50, 100, 250, 500, 1000] });

app.use((req, res, next) => {
  const end = httpDuration.startTimer({ method: req.method, route: req.path });
  res.on('finish', () => { end(); httpRequests.inc({ method: req.method, route: req.path, status: res.statusCode }); });
  next();
});

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

// Structured logging for CloudWatch Logs Insights
const log = (event, data) => console.log(JSON.stringify({ timestamp: new Date().toISOString(), event, ...data }));

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

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

app.get('/health', async (req, res) => {
  try { await pool.query('SELECT 1'); res.json({ status: 'ok' }); }
  catch (e) { res.status(503).json({ status: 'unhealthy' }); }
});

// ─── Admin Auth ───
const ADMIN_USER = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASSWORD || 'ShopEasy2026';

app.post('/auth/admin', (req, res) => {
  const { username, password } = req.body;
  if (username === ADMIN_USER && password === ADMIN_PASS) {
    res.json({ success: true });
  } else {
    res.status(401).json({ success: false, error: 'Invalid credentials' });
  }
});

// ─── Orders by Email (Customer Portal) ───
app.get('/orders/by-email/:email', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM orders WHERE shipping_email = ? ORDER BY created_at DESC', [req.params.email]);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Orders ───
app.get('/orders/stats/summary', async (req, res) => {
  try {
    const [totals] = await pool.query(`SELECT 
      COUNT(*) as total_orders,
      SUM(CASE WHEN status='paid' THEN 1 ELSE 0 END) as paid_orders,
      SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) as failed_orders,
      SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) as pending_orders,
      SUM(CASE WHEN status='paid' THEN total ELSE 0 END) as total_revenue
      FROM orders`);
    res.json(totals[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/orders/stats/timeseries', async (req, res) => {
  try {
    const minutes = parseInt(req.query.minutes) || 60;
    const [rows] = await pool.query(
      `SELECT 
        FLOOR(UNIX_TIMESTAMP(created_at) / (? * 60 / 20)) as bucket,
        MIN(created_at) as time,
        SUM(CASE WHEN status IN ('paid','shipped','delivered') THEN total ELSE 0 END) as revenue,
        SUM(CASE WHEN status='failed' THEN total ELSE 0 END) as failed,
        SUM(CASE WHEN status='pending' THEN total ELSE 0 END) as pending,
        COUNT(CASE WHEN status IN ('paid','shipped','delivered') THEN 1 END) as revenue_count,
        COUNT(CASE WHEN status='failed' THEN 1 END) as failed_count,
        COUNT(CASE WHEN status='pending' THEN 1 END) as pending_count
      FROM orders 
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? MINUTE)
      GROUP BY bucket ORDER BY bucket`,
      [Math.max(minutes / 20, 1), minutes]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/orders/all', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM orders ORDER BY created_at DESC');
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/orders/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const allowed = ['pending', 'paid', 'failed', 'shipped', 'delivered'];
    if (!allowed.includes(status)) return res.status(400).json({ error: 'Invalid status' });
    await pool.query('UPDATE orders SET status = ? WHERE id = ?', [status, req.params.id]);
    res.json({ id: parseInt(req.params.id), status });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/orders/:userId', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC', [req.params.userId]);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/orders', async (req, res) => {
  const user_id = parseInt(req.body.user_id);
  const shipping_name = sanitize(req.body.shipping_name);
  const shipping_email = sanitize(req.body.shipping_email);
  const shipping_phone = sanitize(req.body.shipping_phone);
  const shipping_address = sanitize(req.body.shipping_address);
  if (!user_id || !shipping_name || !shipping_email || !shipping_address) {
    return res.status(400).json({ error: 'Missing required shipping fields' });
  }
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
      'INSERT INTO orders (user_id, total, shipping_name, shipping_email, shipping_phone, shipping_address) VALUES (?, ?, ?, ?, ?, ?)',
      [user_id, total, shipping_name, shipping_email, shipping_phone || '', shipping_address]
    );

    for (const item of cartItems) {
      await conn.query('INSERT INTO order_items (order_id, product_id, quantity, price) VALUES (?, ?, ?, ?)',
        [order.insertId, item.product_id, item.quantity, item.price]);
      await conn.query('UPDATE products SET stock = stock - ? WHERE id = ?', [item.quantity, item.product_id]);
    }
    await conn.commit();
    ordersCreated.inc();
    log('ORDER_PENDING', { order_id: order.insertId, user_id, amount: total, customer: shipping_name, email: shipping_email, reason: 'Awaiting payment' });
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
    const order_id = parseInt(req.body.order_id);
    if (!order_id) return res.status(400).json({ error: 'Invalid order_id' });
    const [order] = await pool.query('SELECT * FROM orders WHERE id = ?', [order_id]);
    if (!order.length) return res.status(404).json({ error: 'Order not found' });
    if (order[0].status !== 'pending') return res.status(400).json({ error: 'Order already processed' });

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(order[0].total * 100), // cents
      currency: 'usd',
      receipt_email: order[0].shipping_email,
      shipping: {
        name: order[0].shipping_name,
        phone: order[0].shipping_phone || '',
        address: { line1: order[0].shipping_address }
      },
      metadata: { order_id: String(order_id), customer: order[0].shipping_name, email: order[0].shipping_email, phone: order[0].shipping_phone || '', address: order[0].shipping_address },
    });

    res.json({ clientSecret: paymentIntent.client_secret });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Stripe: Log Failed Payment (called by frontend on card error) ───
app.post('/payments/failed', async (req, res) => {
  try {
    const order_id = parseInt(req.body.order_id);
    const reason = sanitize(req.body.reason || 'Unknown');
    if (!order_id) return res.status(400).json({ error: 'Invalid order_id' });
    const [order] = await pool.query('SELECT * FROM orders WHERE id = ?', [order_id]);
    if (!order.length) return res.status(404).json({ error: 'Order not found' });

    await pool.query(
      'INSERT INTO payments (order_id, amount, status, method) VALUES (?, ?, "failed", "stripe")',
      [order_id, order[0].total]
    );
    await pool.query('UPDATE orders SET status = "failed" WHERE id = ?', [order_id]);
    ordersFailed.inc();
    log('ORDER_FAILED', { order_id, user_id: order[0].user_id, amount: parseFloat(order[0].total), customer: order[0].shipping_name, email: order[0].shipping_email, reason });
    res.json({ status: 'failed' });
  } catch (e) {
    log('ORDER_ERROR', { order_id: req.body.order_id, error: e.message });
    res.status(500).json({ error: e.message });
  }
});

// ─── Stripe: Confirm Payment ───
app.post('/payments/confirm', async (req, res) => {
  try {
    const order_id = parseInt(req.body.order_id);
    const payment_intent_id = req.body.payment_intent_id;
    if (!order_id || !payment_intent_id) return res.status(400).json({ error: 'Missing order_id or payment_intent_id' });
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
      ordersPaid.inc();
      paymentAmount.observe(parseFloat(order[0].total));
      log('ORDER_BOOKED', { order_id, user_id: order[0].user_id, amount: parseFloat(order[0].total), customer: order[0].shipping_name, email: order[0].shipping_email, reason: 'Payment successful' });
      res.json({ status: 'completed', amount: order[0].total });
    } else {
      await pool.query(
        'INSERT INTO payments (order_id, amount, status, method) VALUES (?, ?, "failed", "stripe")',
        [order_id, order[0].total]
      );
      const failReason = paymentIntent.last_payment_error
        ? paymentIntent.last_payment_error.message
        : `Payment ${paymentIntent.status}`;
      ordersFailed.inc();
      log('ORDER_FAILED', { order_id, user_id: order[0].user_id, amount: parseFloat(order[0].total), reason: failReason, stripe_status: paymentIntent.status });
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
