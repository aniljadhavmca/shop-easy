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

app.get('/products', async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM products');
  res.json(rows);
});

app.get('/products/:id', async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM products WHERE id = ?', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
});

app.post('/products', async (req, res) => {
  const { name, description, price, image, category, stock } = req.body;
  const [result] = await pool.query(
    'INSERT INTO products (name, description, price, image, category, stock) VALUES (?, ?, ?, ?, ?, ?)',
    [name, description, price, image, category, stock]
  );
  res.status(201).json({ id: result.insertId, name, description, price, image, category, stock });
});

app.put('/products/:id', async (req, res) => {
  const { name, description, price, image, category, stock } = req.body;
  await pool.query(
    'UPDATE products SET name=?, description=?, price=?, image=?, category=?, stock=? WHERE id=?',
    [name, description, price, image, category, stock, req.params.id]
  );
  res.json({ id: +req.params.id, name, description, price, image, category, stock });
});

app.delete('/products/:id', async (req, res) => {
  await pool.query('DELETE FROM products WHERE id = ?', [req.params.id]);
  res.status(204).end();
});

app.listen(4001, () => console.log('Product service on :4001'));
