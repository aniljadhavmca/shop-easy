import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, BarChart, Bar } from 'recharts';
import './index.css';

const API = '';
const USER_ID = 1;
const stripePromise = loadStripe(process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY || 'pk_test_placeholder');

function CheckoutForm({ cart, cartTotal, shipping, onSuccess, onError }) {
  const stripe = useStripe();
  const elements = useElements();
  const [processing, setProcessing] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    if (!shipping.name || !shipping.email || !shipping.phone || !shipping.address) {
      onError('Please fill all shipping details', 'warning'); return;
    }

    setProcessing(true);
    try {
      // 1. Create order
      const orderRes = await fetch(`${API}/orders`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: USER_ID, shipping_name: shipping.name, shipping_email: shipping.email, shipping_phone: shipping.phone, shipping_address: shipping.address })
      });
      const order = await orderRes.json();
      if (order.error) { onError(order.error, 'error'); setProcessing(false); return; }

      // 2. Create payment intent
      const intentRes = await fetch(`${API}/payments/create-intent`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: order.id })
      });
      const intentData = await intentRes.json();
      if (intentData.error) { onError(intentData.error, 'error'); setProcessing(false); return; }

      // 3. Confirm card payment
      const { error, paymentIntent } = await stripe.confirmCardPayment(intentData.clientSecret, {
        payment_method: {
          card: elements.getElement(CardElement),
          billing_details: { name: shipping.name, email: shipping.email, phone: shipping.phone, address: { line1: shipping.address } }
        }
      });

      if (error) {
        // Report failure to backend for CloudWatch logging
        await fetch(`${API}/payments/failed`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ order_id: order.id, reason: error.message })
        });
        onError(error.message, 'error'); setProcessing(false); return;
      }

      // 4. Confirm on backend
      await fetch(`${API}/payments/confirm`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: order.id, payment_intent_id: paymentIntent.id })
      });

      onSuccess();
    } catch (err) {
      onError('Payment failed. Please try again.', 'error');
    }
    setProcessing(false);
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="stripe-card-wrapper">
        <label>Card Details</label>
        <div className="stripe-card-element">
          <CardElement options={{ hidePostalCode: true, style: { base: { fontSize: '16px', color: '#1a1a2e', '::placeholder': { color: '#9ca3af' } } } }} />
        </div>
        <p className="stripe-test-hint">Test card: 4242 4242 4242 4242 | Any future date | Any CVC</p>
      </div>
      <button type="submit" className="checkout-btn stripe-pay-btn" disabled={!stripe || processing}>
        {processing ? '⏳ Processing...' : `💳 Pay $${cartTotal.toFixed(2)}`}
      </button>
    </form>
  );
}

function App() {
  const [page, setPage] = useState('products');
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [orders, setOrders] = useState([]);
  const [notification, setNotification] = useState({ msg: '', type: '' });
  const [shipping, setShipping] = useState({ name: '', email: '', phone: '', address: '' });
  const [activeFilter, setActiveFilter] = useState('All');
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [adminPage, setAdminPage] = useState('dashboard');
  const [adminStats, setAdminStats] = useState({});
  const [allOrders, setAllOrders] = useState([]);
  const [chartData, setChartData] = useState([]);
  const [timeRange, setTimeRange] = useState(60);
  const [editingProduct, setEditingProduct] = useState(null);
  const [showProductForm, setShowProductForm] = useState(false);
  const [productForm, setProductForm] = useState({ name: '', description: '', price: '', image: '', category: '', stock: '' });
  const [productSearch, setProductSearch] = useState('');
  const [orderFilter, setOrderFilter] = useState('all');

  useEffect(() => { fetchProducts(); fetchCart(); }, []);

  const fetchProducts = () => fetch(`${API}/products`).then(r => r.json()).then(setProducts).catch(() => {});
  const fetchCart = () => fetch(`${API}/cart/${USER_ID}`).then(r => r.json()).then(setCart).catch(() => {});
  const fetchOrders = () => fetch(`${API}/orders/${USER_ID}`).then(r => r.json()).then(setOrders).catch(() => {});
  const fetchAdminStats = () => fetch(`${API}/orders/stats/summary`).then(r => r.json()).then(setAdminStats).catch(() => {});
  const fetchAllOrders = () => fetch(`${API}/orders/all`).then(r => r.json()).then(setAllOrders).catch(() => {});
  const fetchChartData = (mins) => fetch(`${API}/orders/stats/timeseries?minutes=${mins}`).then(r => r.json()).then(data => {
    setChartData(data.map(d => ({ ...d, time: new Date(d.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), paid: parseFloat(d.paid) || 0, failed: parseFloat(d.failed) || 0, pending: parseFloat(d.pending) || 0 })));
  }).catch(() => {});

  const notify = (msg, type = 'success') => { setNotification({ msg, type }); setTimeout(() => setNotification({ msg: '', type: '' }), 3000); };

  const addToCart = (productId) => {
    fetch(`${API}/cart`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: USER_ID, product_id: productId, quantity: 1 })
    }).then(() => { fetchCart(); notify('✓ Added to cart!', 'success'); });
  };

  const removeFromCart = (id) => {
    fetch(`${API}/cart/${id}`, { method: 'DELETE' }).then(() => fetchCart());
  };

  const handlePaymentSuccess = () => {
    fetchCart(); setShipping({ name: '', email: '', phone: '', address: '' });
    setPage('products'); notify('🎉 Payment successful! Your order is confirmed.', 'success');
  };

  const cartTotal = cart.reduce((sum, i) => sum + i.price * i.quantity, 0);

  return (
    <div className="app">
      {notification.msg && <div className={`notification ${notification.type}`}>{notification.msg}</div>}

      {selectedProduct && (
        <div className="modal-overlay" onClick={() => setSelectedProduct(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setSelectedProduct(null)}>✕</button>
            <div className="modal-body">
              <div className="modal-image">
                <img src={selectedProduct.image} alt={selectedProduct.name} />
              </div>
              <div className="modal-details">
                <span className="category">{selectedProduct.category}</span>
                <h2>{selectedProduct.name}</h2>
                <p className="modal-description">{selectedProduct.description}</p>
                <div className="modal-meta">
                  <span className="modal-stock">{selectedProduct.stock > 0 ? `✓ ${selectedProduct.stock} in stock` : '✕ Out of stock'}</span>
                </div>
                <div className="modal-footer">
                  <div className="price-tag">
                    <span className="currency">$</span>
                    <span className="amount">{Math.floor(selectedProduct.price)}</span>
                    <span className="cents">.{(selectedProduct.price % 1).toFixed(2).slice(2)}</span>
                  </div>
                  <button className="add-btn" onClick={() => { addToCart(selectedProduct.id); setSelectedProduct(null); }} disabled={selectedProduct.stock === 0}>
                    {selectedProduct.stock === 0 ? 'Sold Out' : '🛒 Add to Cart'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      
      <header className="header">
        <div className="header-inner">
          <div className="logo" onClick={() => setPage('products')}>
            <span className="logo-icon">🛍️</span>
            <span className="logo-text">ShopEasy</span>
          </div>
          <nav>
            <button className={page === 'products' ? 'active' : ''} onClick={() => setPage('products')}>
              <span>🏪</span> Shop
            </button>
            <button className={page === 'cart' ? 'active' : ''} onClick={() => setPage('cart')}>
              <span>🛒</span> Cart
              {cart.length > 0 && <span className="badge">{cart.length}</span>}
            </button>
            <button className={page === 'admin' ? 'active' : ''} onClick={() => { setPage('admin'); fetchAdminStats(); fetchAllOrders(); fetchProducts(); fetchChartData(timeRange); }}>
              <span>⚙️</span> Admin
            </button>
          </nav>
        </div>
      </header>

      <main>
        {page === 'products' && (
          <>
            <section className="hero">
              <div className="hero-content">
                <h1>Discover Premium Tech</h1>
                <p>Curated selection of the best gadgets & accessories</p>
              </div>
            </section>
            <section className="products-section">
              <div className="section-header">
                <h2>Featured Products</h2>
                <span className="product-count">{products.filter(p => activeFilter === 'All' || p.category === activeFilter).length} items</span>
              </div>
              <div className="filter-bar">
                {['All', ...new Set(products.map(p => p.category))].map(cat => (
                  <button key={cat} className={`filter-btn ${activeFilter === cat ? 'active' : ''}`} onClick={() => setActiveFilter(cat)}>{cat}</button>
                ))}
              </div>
              <div className="products-grid">
                {products.filter(p => activeFilter === 'All' || p.category === activeFilter).map(p => (
                  <div key={p.id} className="product-card" onClick={() => setSelectedProduct(p)}>
                    <div className="product-image">
                      <img src={p.image} alt={p.name} />
                      {p.stock < 10 && <span className="low-stock">Few left</span>}
                    </div>
                    <div className="product-info">
                      <span className="category">{p.category}</span>
                      <h3>{p.name}</h3>
                      <p className="description">{p.description}</p>
                      <div className="product-footer">
                        <div className="price-tag">
                          <span className="currency">$</span>
                          <span className="amount">{Math.floor(p.price)}</span>
                          <span className="cents">.{(p.price % 1).toFixed(2).slice(2)}</span>
                        </div>
                        <button className="add-btn" onClick={(e) => { e.stopPropagation(); addToCart(p.id); }} disabled={p.stock === 0}>
                          {p.stock === 0 ? 'Sold Out' : '+ Add'}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}

        {page === 'cart' && (
          <div className="page-container">
            <div className="page-header">
              <h2>🛒 Shopping Cart</h2>
              <span className="item-count">{cart.length} item{cart.length !== 1 ? 's' : ''}</span>
            </div>
            {cart.length === 0 ? (
              <div className="empty-state">
                <span className="empty-icon">🛒</span>
                <h3>Your cart is empty</h3>
                <p>Add some products to get started</p>
                <button className="shop-btn" onClick={() => setPage('products')}>Continue Shopping</button>
              </div>
            ) : (
              <div className="cart-layout">
                <div className="cart-items">
                  {cart.map(item => (
                    <div key={item.id} className="cart-item">
                      <img src={item.image} alt={item.name} className="cart-item-img" />
                      <div className="cart-item-info">
                        <h4>{item.name}</h4>
                        <p>Qty: {item.quantity}</p>
                      </div>
                      <div className="cart-item-actions">
                        <span className="item-total">${(item.price * item.quantity).toFixed(2)}</span>
                        <button className="remove-btn" onClick={() => removeFromCart(item.id)}>✕</button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="cart-summary">
                  <h3>Order Summary</h3>
                  <div className="summary-row"><span>Subtotal</span><span>${cartTotal.toFixed(2)}</span></div>
                  <div className="summary-row"><span>Shipping</span><span className="free">FREE</span></div>
                  <div className="summary-total"><span>Total</span><span>${cartTotal.toFixed(2)}</span></div>
                  <button className="checkout-btn" onClick={() => setPage('checkout')}>
                    Proceed to Checkout
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {page === 'checkout' && (
          <div className="page-container">
            <div className="page-header">
              <h2>📋 Checkout</h2>
            </div>
            <div className="checkout-layout">
              <div className="checkout-form">
                <h3>Shipping Details</h3>
                <div className="form-group">
                  <label>Full Name *</label>
                  <input type="text" placeholder="John Smith" value={shipping.name}
                    onChange={e => setShipping({...shipping, name: e.target.value})} required />
                </div>
                <div className="form-group">
                  <label>Email *</label>
                  <input type="email" placeholder="john@example.com" value={shipping.email}
                    onChange={e => setShipping({...shipping, email: e.target.value})} required />
                </div>
                <div className="form-group">
                  <label>Phone *</label>
                  <input type="tel" placeholder="+1 (555) 123-4567" value={shipping.phone}
                    onChange={e => setShipping({...shipping, phone: e.target.value})} required />
                </div>
                <div className="form-group">
                  <label>Shipping Address *</label>
                  <textarea placeholder="123 Main St, City, State, ZIP" value={shipping.address}
                    onChange={e => setShipping({...shipping, address: e.target.value})} required />
                </div>
                <Elements stripe={stripePromise}>
                  <CheckoutForm cart={cart} cartTotal={cartTotal} shipping={shipping}
                    onSuccess={handlePaymentSuccess} onError={(msg, type) => notify(msg, type || 'error')} />
                </Elements>
              </div>
              <div className="cart-summary">
                <h3>Order Summary</h3>
                {cart.map(item => (
                  <div key={item.id} className="summary-row">
                    <span>{item.name} × {item.quantity}</span>
                    <span>${(item.price * item.quantity).toFixed(2)}</span>
                  </div>
                ))}
                <div className="summary-total"><span>Total</span><span>${cartTotal.toFixed(2)}</span></div>
              </div>
            </div>
          </div>
        )}

        {page === 'admin' && (
          <div className="admin-wrapper">
            <aside className="admin-sidebar">
              <div className="admin-sidebar-header">
                <span className="admin-logo">🔧</span>
                <span>Admin Panel</span>
              </div>
              <nav className="admin-nav">
                <button className={adminPage === 'dashboard' ? 'active' : ''} onClick={() => { setAdminPage('dashboard'); fetchAdminStats(); fetchAllOrders(); fetchChartData(timeRange); }}>
                  <span>📊</span> Dashboard
                </button>
                <button className={adminPage === 'products' ? 'active' : ''} onClick={() => { setAdminPage('products'); fetchProducts(); }}>
                  <span>📦</span> Products
                </button>
                <button className={adminPage === 'orders' ? 'active' : ''} onClick={() => { setAdminPage('orders'); fetchAllOrders(); }}>
                  <span>📃</span> Orders
                </button>
              </nav>
              <button className="admin-back-btn" onClick={() => setPage('products')}>
                ← Back to Store
              </button>
            </aside>
            <div className="admin-content">

              {adminPage === 'dashboard' && (() => {
                const paidRevenue = allOrders.filter(o => o.status === 'paid').reduce((s, o) => s + parseFloat(o.total), 0);
                const failedAmount = allOrders.filter(o => o.status === 'failed').reduce((s, o) => s + parseFloat(o.total), 0);
                const pendingAmount = allOrders.filter(o => o.status === 'pending').reduce((s, o) => s + parseFloat(o.total), 0);
                const timeRanges = [
                  { label: '10m', value: 10 },
                  { label: '1h', value: 60 },
                  { label: '4h', value: 240 },
                  { label: '6h', value: 360 },
                  { label: '12h', value: 720 },
                  { label: '1d', value: 1440 },
                  { label: '3d', value: 4320 },
                ];
                return (
                <div className="admin-dashboard">
                  <h2>Dashboard</h2>
                  <p className="admin-subtitle">Overview of your store</p>
                  <div className="stats-grid">
                    <div className="stat-card stat-purple">
                      <span className="stat-icon">📃</span>
                      <div className="stat-info">
                        <span className="stat-value">{adminStats.total_orders || 0}</span>
                        <span className="stat-label">Total Orders</span>
                      </div>
                    </div>
                    <div className="stat-card stat-green">
                      <span className="stat-icon">✅</span>
                      <div className="stat-info">
                        <span className="stat-value">{adminStats.paid_orders || 0}</span>
                        <span className="stat-label">Paid</span>
                      </div>
                    </div>
                    <div className="stat-card stat-red">
                      <span className="stat-icon">❌</span>
                      <div className="stat-info">
                        <span className="stat-value">{adminStats.failed_orders || 0}</span>
                        <span className="stat-label">Failed</span>
                      </div>
                    </div>
                    <div className="stat-card stat-blue">
                      <span className="stat-icon">🛒</span>
                      <div className="stat-info">
                        <span className="stat-value">{products.length}</span>
                        <span className="stat-label">Products Live</span>
                      </div>
                    </div>
                  </div>

                  <div className="admin-section grafana-panel">
                    <div className="panel-header">
                      <h3>📈 Revenue Over Time</h3>
                      <div className="time-range-selector">
                        {timeRanges.map(t => (
                          <button key={t.value} className={timeRange === t.value ? 'active' : ''}
                            onClick={() => { setTimeRange(t.value); fetchChartData(t.value); }}>{t.label}</button>
                        ))}
                      </div>
                    </div>
                    <div className="chart-wrapper">
                      {chartData.length > 0 ? (
                        <ResponsiveContainer width="100%" height={280}>
                          <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                            <defs>
                              <linearGradient id="colorPaid" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                                <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                              </linearGradient>
                              <linearGradient id="colorFailed" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3}/>
                                <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                              </linearGradient>
                              <linearGradient id="colorPending" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3}/>
                                <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                            <XAxis dataKey="time" tick={{ fontSize: 11, fill: '#6b7280' }} />
                            <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} tickFormatter={v => `$${v}`} />
                            <Tooltip contentStyle={{ background: '#1a1a2e', border: 'none', borderRadius: 8, color: '#fff' }}
                              labelStyle={{ color: '#9ca3af' }} formatter={(v) => [`$${v.toFixed(2)}`]} />
                            <Legend wrapperStyle={{ fontSize: 12 }} />
                            <Area type="monotone" dataKey="paid" name="Paid" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorPaid)" />
                            <Area type="monotone" dataKey="failed" name="Failed" stroke="#ef4444" strokeWidth={2} fillOpacity={1} fill="url(#colorFailed)" />
                            <Area type="monotone" dataKey="pending" name="Pending" stroke="#f59e0b" strokeWidth={2} fillOpacity={1} fill="url(#colorPending)" />
                          </AreaChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="chart-empty">No data in selected time range</div>
                      )}
                    </div>
                  </div>

                  <div className="admin-section grafana-panel">
                    <div className="panel-header">
                      <h3>📊 Revenue Breakdown</h3>
                    </div>
                    <div className="chart-wrapper">
                      <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={[{ name: 'Revenue', Paid: paidRevenue, Failed: failedAmount, Pending: pendingAmount }]} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                          <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#6b7280' }} />
                          <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} tickFormatter={v => `$${v}`} />
                          <Tooltip contentStyle={{ background: '#1a1a2e', border: 'none', borderRadius: 8, color: '#fff' }} formatter={(v) => [`$${v.toFixed(2)}`]} />
                          <Legend wrapperStyle={{ fontSize: 12 }} />
                          <Bar dataKey="Paid" fill="#10b981" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="Failed" fill="#ef4444" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="Pending" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="admin-section">
                    <h3>Recent Orders</h3>
                    <div className="admin-table-wrapper">
                      <table className="admin-table">
                        <thead><tr><th>ID</th><th>Customer</th><th>Total</th><th>Status</th><th>Date</th></tr></thead>
                        <tbody>
                          {allOrders.slice(0, 10).map(o => (
                            <tr key={o.id}>
                              <td>#{o.id}</td>
                              <td>{o.shipping_name || 'Guest'}</td>
                              <td>${parseFloat(o.total).toFixed(2)}</td>
                              <td><span className={`status-badge ${o.status}`}>{o.status}</span></td>
                              <td>{new Date(o.created_at).toLocaleDateString()}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {allOrders.length === 0 && <p className="admin-empty">No orders yet</p>}
                    </div>
                  </div>
                </div>
                );
              })()}

              {adminPage === 'products' && !showProductForm && (
                <div className="admin-products">
                  <div className="admin-page-header">
                    <div>
                      <h2>Products</h2>
                      <p className="admin-subtitle">{products.length} products in catalog</p>
                    </div>
                    <button className="admin-add-btn" onClick={() => { setEditingProduct(null); setShowProductForm(true); setProductForm({ name: '', description: '', price: '', image: '', category: '', stock: '' }); }}>
                      + Add Product
                    </button>
                  </div>

                  <div className="admin-section">
                    <div className="admin-search">
                      <input type="text" placeholder="🔍 Search products..." value={productSearch} onChange={e => setProductSearch(e.target.value)} />
                    </div>
                    <div className="admin-table-wrapper">
                      <table className="admin-table">
                        <thead><tr><th>Image</th><th>Name</th><th>Category</th><th>Price</th><th>Stock</th><th>Actions</th></tr></thead>
                        <tbody>
                          {products.filter(p => p.name.toLowerCase().includes(productSearch.toLowerCase()) || p.category.toLowerCase().includes(productSearch.toLowerCase())).map(p => (
                            <tr key={p.id}>
                              <td><img src={p.image} alt={p.name} className="admin-tbl-img" /></td>
                              <td><strong>{p.name}</strong><br/><small className="text-muted">{p.description?.substring(0, 50)}...</small></td>
                              <td><span className="admin-category-badge">{p.category}</span></td>
                              <td>${parseFloat(p.price).toFixed(2)}</td>
                              <td><span className={p.stock < 10 ? 'stock-low' : 'stock-ok'}>{p.stock}</span></td>
                              <td className="admin-actions-cell">
                                <button className="admin-edit-btn" onClick={() => { setEditingProduct(p); setShowProductForm(true); setProductForm({ name: p.name, description: p.description || '', price: p.price, image: p.image || '', category: p.category || '', stock: p.stock }); }}>✏️</button>
                                <button className="admin-delete-btn" onClick={async () => { if (window.confirm(`Delete "${p.name}"?`)) { await fetch(`${API}/products/${p.id}`, { method: 'DELETE' }); fetchProducts(); notify('Product deleted', 'success'); } }}>🗑️</button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {adminPage === 'products' && showProductForm && (
                <div className="admin-product-form-page">
                  <div className="admin-page-header">
                    <div>
                      <h2>{editingProduct ? `✏️ Edit Product` : '➕ Add New Product'}</h2>
                      <p className="admin-subtitle">{editingProduct ? `Editing: ${editingProduct.name}` : 'Fill in the product details below'}</p>
                    </div>
                    <button className="admin-cancel-btn" onClick={() => { setEditingProduct(null); setShowProductForm(false); setProductForm({ name: '', description: '', price: '', image: '', category: '', stock: '' }); }}>
                      ← Back to Products
                    </button>
                  </div>
                  <div className="admin-section product-form-card">
                    <form onSubmit={async (e) => {
                      e.preventDefault();
                      if (!productForm.name || !productForm.price) { notify('Name and price required', 'warning'); return; }
                      const payload = { ...productForm, price: parseFloat(productForm.price), stock: parseInt(productForm.stock) || 0 };
                      if (editingProduct) {
                        await fetch(`${API}/products/${editingProduct.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
                        notify('✓ Product updated!', 'success');
                      } else {
                        await fetch(`${API}/products`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
                        notify('✓ Product added!', 'success');
                      }
                      setProductForm({ name: '', description: '', price: '', image: '', category: '', stock: '' });
                      setEditingProduct(null);
                      setShowProductForm(false);
                      fetchProducts();
                    }}>
                      <div className="admin-form-grid">
                        <div className="form-group"><label>Name *</label><input type="text" value={productForm.name} onChange={e => setProductForm({...productForm, name: e.target.value})} placeholder="Product name" /></div>
                        <div className="form-group"><label>Category</label><input type="text" value={productForm.category} onChange={e => setProductForm({...productForm, category: e.target.value})} placeholder="Electronics" /></div>
                        <div className="form-group"><label>Price ($) *</label><input type="number" step="0.01" value={productForm.price} onChange={e => setProductForm({...productForm, price: e.target.value})} placeholder="99.99" /></div>
                        <div className="form-group"><label>Stock</label><input type="number" value={productForm.stock} onChange={e => setProductForm({...productForm, stock: e.target.value})} placeholder="100" /></div>
                      </div>
                      <div className="form-group"><label>Description</label><textarea value={productForm.description} onChange={e => setProductForm({...productForm, description: e.target.value})} placeholder="Product description..." rows="4" /></div>
                      <div className="form-group"><label>Image URL</label><input type="text" value={productForm.image} onChange={e => setProductForm({...productForm, image: e.target.value})} placeholder="https://..." /></div>
                      {productForm.image && <div className="admin-img-preview"><img src={productForm.image} alt="Preview" onError={e => e.target.style.display='none'} onLoad={e => e.target.style.display='block'} /></div>}
                      <div className="admin-form-actions">
                        <button type="submit" className="admin-save-btn">{editingProduct ? 'Update Product' : 'Add Product'}</button>
                        <button type="button" className="admin-cancel-btn" onClick={() => { setEditingProduct(null); setShowProductForm(false); setProductForm({ name: '', description: '', price: '', image: '', category: '', stock: '' }); }}>Cancel</button>
                      </div>
                    </form>
                  </div>
                </div>
              )}

              {adminPage === 'orders' && (
                <div className="admin-orders">
                  <div className="admin-page-header">
                    <div>
                      <h2>Orders</h2>
                      <p className="admin-subtitle">Manage all customer orders</p>
                    </div>
                    <div className="order-filter-bar">
                      {['all', 'paid', 'pending', 'failed', 'shipped', 'delivered'].map(f => (
                        <button key={f} className={orderFilter === f ? 'active' : ''} onClick={() => setOrderFilter(f)}>{f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}</button>
                      ))}
                    </div>
                  </div>
                  <div className="admin-section">
                    <div className="admin-table-wrapper">
                      <table className="admin-table">
                        <thead><tr><th>ID</th><th>Customer</th><th>Email</th><th>Total</th><th>Status</th><th>Date</th><th>Action</th></tr></thead>
                        <tbody>
                          {allOrders.filter(o => orderFilter === 'all' || o.status === orderFilter).map(o => (
                            <tr key={o.id}>
                              <td>#{o.id}</td>
                              <td>{o.shipping_name || 'Guest'}</td>
                              <td>{o.shipping_email || '-'}</td>
                              <td>${parseFloat(o.total).toFixed(2)}</td>
                              <td><span className={`status-badge ${o.status}`}>{o.status}</span></td>
                              <td>{new Date(o.created_at).toLocaleDateString()}</td>
                              <td>
                                <select value={o.status} onChange={async (e) => {
                                  await fetch(`${API}/orders/${o.id}/status`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: e.target.value }) });
                                  fetchAllOrders(); notify(`Order #${o.id} → ${e.target.value}`, 'success');
                                }} className="admin-status-select">
                                  <option value="pending">Pending</option>
                                  <option value="paid">Paid</option>
                                  <option value="failed">Failed</option>
                                  <option value="shipped">Shipped</option>
                                  <option value="delivered">Delivered</option>
                                </select>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {allOrders.filter(o => orderFilter === 'all' || o.status === orderFilter).length === 0 && <p className="admin-empty">No {orderFilter} orders</p>}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      <footer className="footer">
        <div className="footer-inner">
          <div className="footer-brand">
            <span className="logo-icon">🛍️</span> ShopEasy
            <p>Your one-stop shop for premium tech</p>
          </div>
          <div className="footer-links">
            <h4>Quick Links</h4>
            <a href="#!" onClick={() => setPage('products')}>Products</a>
            <a href="#!" onClick={() => setPage('cart')}>Cart</a>
            <a href="#!" onClick={() => { setPage('admin'); fetchAdminStats(); fetchAllOrders(); fetchProducts(); fetchChartData(timeRange); }}>Admin</a>
          </div>
          <div className="footer-links">
            <h4>Built With</h4>
            <span>React + Node.js</span>
            <span>AWS ECS Fargate</span>
            <span>MySQL RDS</span>
          </div>
        </div>
        <div className="footer-bottom">
          <p>© 2024 ShopEasy. Microservices Demo on AWS.</p>
        </div>
      </footer>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
