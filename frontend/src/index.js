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

  useEffect(() => { fetchProducts(); fetchCart(); }, []);

  const fetchProducts = () => fetch(`${API}/products`).then(r => r.json()).then(setProducts).catch(() => {});
  const fetchCart = () => fetch(`${API}/cart/${USER_ID}`).then(r => r.json()).then(setCart).catch(() => {});
  const fetchOrders = () => fetch(`${API}/orders/${USER_ID}`).then(r => r.json()).then(setOrders).catch(() => {});

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
    fetchCart(); fetchOrders(); setShipping({ name: '', email: '', address: '' });
    setPage('orders'); notify('🎉 Payment successful!', 'success');
  };

  const cartTotal = cart.reduce((sum, i) => sum + i.price * i.quantity, 0);

  return (
    <div className="app">
      {notification.msg && <div className={`notification ${notification.type}`}>{notification.msg}</div>}
      
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
            <button className={page === 'orders' ? 'active' : ''} onClick={() => { setPage('orders'); fetchOrders(); }}>
              <span>📦</span> Orders
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
                  <div key={p.id} className="product-card">
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
                        <button className="add-btn" onClick={() => addToCart(p.id)} disabled={p.stock === 0}>
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

        {page === 'orders' && (
          <div className="page-container">
            <div className="page-header">
              <h2>📦 Your Orders</h2>
            </div>
            {orders.length === 0 ? (
              <div className="empty-state">
                <span className="empty-icon">📦</span>
                <h3>No orders yet</h3>
                <p>Your order history will appear here</p>
                <button className="shop-btn" onClick={() => setPage('products')}>Start Shopping</button>
              </div>
            ) : (
              <div className="orders-list">
                {orders.map(o => (
                  <div key={o.id} className="order-card">
                    <div className="order-top">
                      <div className="order-left">
                        <span className="order-id">Order #{o.id}</span>
                        <span className="order-date">{new Date(o.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                      </div>
                      <div className="order-right">
                        <span className="order-amount">${parseFloat(o.total).toFixed(2)}</span>
                        <span className={`status-badge ${o.status}`}>{o.status}</span>
                      </div>
                    </div>
                    {o.shipping_name && (
                      <div className="order-shipping">
                        <span>📬 {o.shipping_name}</span>
                        <span>✉️ {o.shipping_email}</span>
                        <span>📍 {o.shipping_address}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
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
            <a href="#!" onClick={() => setPage('orders')}>Orders</a>
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
