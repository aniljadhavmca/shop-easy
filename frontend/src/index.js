import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';

const API = '';
const USER_ID = 1;

function App() {
  const [page, setPage] = useState('products');
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [orders, setOrders] = useState([]);
  const [notification, setNotification] = useState('');

  useEffect(() => { fetchProducts(); fetchCart(); }, []);

  const fetchProducts = () => fetch(`${API}/api/products`).then(r => r.json()).then(setProducts).catch(() => {});
  const fetchCart = () => fetch(`${API}/api/cart/${USER_ID}`).then(r => r.json()).then(setCart).catch(() => {});
  const fetchOrders = () => fetch(`${API}/api/orders/${USER_ID}`).then(r => r.json()).then(setOrders).catch(() => {});

  const notify = (msg) => { setNotification(msg); setTimeout(() => setNotification(''), 3000); };

  const addToCart = (productId) => {
    fetch(`${API}/api/cart`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: USER_ID, product_id: productId, quantity: 1 })
    }).then(() => { fetchCart(); notify('Added to cart!'); });
  };

  const removeFromCart = (id) => {
    fetch(`${API}/api/cart/${id}`, { method: 'DELETE' }).then(() => fetchCart());
  };

  const checkout = () => {
    fetch(`${API}/api/orders`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: USER_ID })
    }).then(r => r.json()).then(order => {
      if (order.error) { notify(order.error); return; }
      return fetch(`${API}/api/payments`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: order.id, method: 'card' })
      });
    }).then(() => { fetchCart(); fetchOrders(); setPage('orders'); notify('Payment successful!'); });
  };

  const cartTotal = cart.reduce((sum, i) => sum + i.price * i.quantity, 0);

  return (
    <div className="app">
      {notification && <div className="notification">{notification}</div>}
      <header>
        <h1 onClick={() => setPage('products')}>🛍️ Shop Easy</h1>
        <nav>
          <button className={page === 'products' ? 'active' : ''} onClick={() => setPage('products')}>Products</button>
          <button className={page === 'cart' ? 'active' : ''} onClick={() => setPage('cart')}>
            Cart {cart.length > 0 && <span className="badge">{cart.length}</span>}
          </button>
          <button className={page === 'orders' ? 'active' : ''} onClick={() => { setPage('orders'); fetchOrders(); }}>Orders</button>
        </nav>
      </header>

      <main>
        {page === 'products' && (
          <div className="products-grid">
            {products.map(p => (
              <div key={p.id} className="product-card">
                <img src={p.image} alt={p.name} />
                <div className="product-info">
                  <span className="category">{p.category}</span>
                  <h3>{p.name}</h3>
                  <p>{p.description}</p>
                  <div className="product-footer">
                    <span className="price">${p.price}</span>
                    <button onClick={() => addToCart(p.id)} disabled={p.stock === 0}>
                      {p.stock === 0 ? 'Out of Stock' : 'Add to Cart'}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {page === 'cart' && (
          <div className="cart-page">
            <h2>Your Cart</h2>
            {cart.length === 0 ? <p className="empty">Your cart is empty</p> : (
              <>
                <div className="cart-items">
                  {cart.map(item => (
                    <div key={item.id} className="cart-item">
                      <div className="cart-item-info">
                        <h4>{item.name}</h4>
                        <p>Qty: {item.quantity} × ${item.price}</p>
                      </div>
                      <div className="cart-item-actions">
                        <span>${(item.price * item.quantity).toFixed(2)}</span>
                        <button className="remove" onClick={() => removeFromCart(item.id)}>✕</button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="cart-summary">
                  <div className="total">Total: <strong>${cartTotal.toFixed(2)}</strong></div>
                  <button className="checkout-btn" onClick={checkout}>Proceed to Payment</button>
                </div>
              </>
            )}
          </div>
        )}

        {page === 'orders' && (
          <div className="orders-page">
            <h2>Your Orders</h2>
            {orders.length === 0 ? <p className="empty">No orders yet</p> : (
              <div className="orders-list">
                {orders.map(o => (
                  <div key={o.id} className="order-card">
                    <div className="order-header">
                      <span>Order #{o.id}</span>
                      <span className={`status ${o.status}`}>{o.status}</span>
                    </div>
                    <div className="order-details">
                      <span>${o.total}</span>
                      <span>{new Date(o.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
