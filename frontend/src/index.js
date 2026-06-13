import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
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

    if (!shipping.name || !shipping.email || !shipping.address) {
      onError('Please fill all shipping details', 'warning'); return;
    }

    setProcessing(true);
    try {
      // 1. Create order
      const orderRes = await fetch(`${API}/orders`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: USER_ID, shipping_name: shipping.name, shipping_email: shipping.email, shipping_address: shipping.address })
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
        payment_method: { card: elements.getElement(CardElement) }
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
  const [shipping, setShipping] = useState({ name: '', email: '', address: '' });
  const [activeFilter, setActiveFilter] = useState('All');
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [adminPage, setAdminPage] = useState('dashboard');
  const [adminStats, setAdminStats] = useState({});
  const [allOrders, setAllOrders] = useState([]);
  const [editingProduct, setEditingProduct] = useState(null);
  const [productForm, setProductForm] = useState({ name: '', description: '', price: '', image: '', category: '', stock: '' });
  const [productSearch, setProductSearch] = useState('');

  useEffect(() => { fetchProducts(); fetchCart(); }, []);

  const fetchProducts = () => fetch(`${API}/products`).then(r => r.json()).then(setProducts).catch(() => {});
  const fetchCart = () => fetch(`${API}/cart/${USER_ID}`).then(r => r.json()).then(setCart).catch(() => {});
  const fetchOrders = () => fetch(`${API}/orders/${USER_ID}`).then(r => r.json()).then(setOrders).catch(() => {});
  const fetchAdminStats = () => fetch(`${API}/orders/stats/summary`).then(r => r.json()).then(setAdminStats).catch(() => {});
  const fetchAllOrders = () => fetch(`${API}/orders/all`).then(r => r.json()).then(setAllOrders).catch(() => {});

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
    fetchCart(); setShipping({ name: '', email: '', address: '' });
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
            <button className={page === 'admin' ? 'active' : ''} onClick={() => { setPage('admin'); fetchAdminStats(); fetchAllOrders(); fetchProducts(); }}>
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
                  <label>Full Name</label>
                  <input type="text" placeholder="John Smith" value={shipping.name}
                    onChange={e => setShipping({...shipping, name: e.target.value})} />
                </div>
                <div className="form-group">
                  <label>Email</label>
                  <input type="email" placeholder="john@example.com" value={shipping.email}
                    onChange={e => setShipping({...shipping, email: e.target.value})} />
                </div>
                <div className="form-group">
                  <label>Shipping Address</label>
                  <textarea placeholder="123 Main St, City, State, ZIP" value={shipping.address}
                    onChange={e => setShipping({...shipping, address: e.target.value})} />
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
                <button className={adminPage === 'dashboard' ? 'active' : ''} onClick={() => { setAdminPage('dashboard'); fetchAdminStats(); }}>
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

              {adminPage === 'dashboard' && (
                <div className="admin-dashboard">
                  <h2>Dashboard</h2>
                  <p className="admin-subtitle">Overview of your store</p>
                  <div className="stats-grid">
                    <div className="stat-card stat-blue">
                      <span className="stat-icon">📦</span>
                      <div className="stat-info">
                        <span className="stat-value">{products.length}</span>
                        <span className="stat-label">Products</span>
                      </div>
                    </div>
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
                        <span className="stat-label">Paid Orders</span>
                      </div>
                    </div>
                    <div className="stat-card stat-orange">
                      <span className="stat-icon">💰</span>
                      <div className="stat-info">
                        <span className="stat-value">${parseFloat(adminStats.total_revenue || 0).toFixed(2)}</span>
                        <span className="stat-label">Revenue</span>
                      </div>
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
              )}

              {adminPage === 'products' && (
                <div className="admin-products">
                  <div className="admin-page-header">
                    <div>
                      <h2>Products</h2>
                      <p className="admin-subtitle">{products.length} products in catalog</p>
                    </div>
                    <button className="admin-add-btn" onClick={() => { setEditingProduct(null); setProductForm({ name: '', description: '', price: '', image: '', category: '', stock: '' }); }}>
                      + Add Product
                    </button>
                  </div>

                  {(editingProduct !== null || productForm.name !== '' || productForm.price !== '') && (
                    <div className="admin-section product-form-card">
                      <h3>{editingProduct ? `✏️ Edit: ${editingProduct.name}` : '➕ New Product'}</h3>
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
                        fetchProducts();
                      }}>
                        <div className="admin-form-grid">
                          <div className="form-group"><label>Name *</label><input type="text" value={productForm.name} onChange={e => setProductForm({...productForm, name: e.target.value})} placeholder="Product name" /></div>
                          <div className="form-group"><label>Category</label><input type="text" value={productForm.category} onChange={e => setProductForm({...productForm, category: e.target.value})} placeholder="Electronics" /></div>
                          <div className="form-group"><label>Price ($) *</label><input type="number" step="0.01" value={productForm.price} onChange={e => setProductForm({...productForm, price: e.target.value})} placeholder="99.99" /></div>
                          <div className="form-group"><label>Stock</label><input type="number" value={productForm.stock} onChange={e => setProductForm({...productForm, stock: e.target.value})} placeholder="100" /></div>
                        </div>
                        <div className="form-group"><label>Description</label><textarea value={productForm.description} onChange={e => setProductForm({...productForm, description: e.target.value})} placeholder="Product description..." /></div>
                        <div className="form-group"><label>Image URL</label><input type="text" value={productForm.image} onChange={e => setProductForm({...productForm, image: e.target.value})} placeholder="https://..." /></div>
                        {productForm.image && <div className="admin-img-preview"><img src={productForm.image} alt="Preview" onError={e => e.target.style.display='none'} onLoad={e => e.target.style.display='block'} /></div>}
                        <div className="admin-form-actions">
                          <button type="submit" className="admin-save-btn">{editingProduct ? 'Update Product' : 'Add Product'}</button>
                          <button type="button" className="admin-cancel-btn" onClick={() => { setEditingProduct(null); setProductForm({ name: '', description: '', price: '', image: '', category: '', stock: '' }); }}>Cancel</button>
                        </div>
                      </form>
                    </div>
                  )}

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
                                <button className="admin-edit-btn" onClick={() => { setEditingProduct(p); setProductForm({ name: p.name, description: p.description || '', price: p.price, image: p.image || '', category: p.category || '', stock: p.stock }); window.scrollTo(0, 200); }}>✏️</button>
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

              {adminPage === 'orders' && (
                <div className="admin-orders">
                  <h2>Orders</h2>
                  <p className="admin-subtitle">Manage all customer orders</p>
                  <div className="admin-section">
                    <div className="admin-table-wrapper">
                      <table className="admin-table">
                        <thead><tr><th>ID</th><th>Customer</th><th>Email</th><th>Total</th><th>Status</th><th>Date</th><th>Action</th></tr></thead>
                        <tbody>
                          {allOrders.map(o => (
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
                      {allOrders.length === 0 && <p className="admin-empty">No orders yet</p>}
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
            <a href="#!" onClick={() => { setPage('admin'); fetchAdminStats(); fetchAllOrders(); fetchProducts(); }}>Admin</a>
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
