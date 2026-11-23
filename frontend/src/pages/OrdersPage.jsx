import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import StatusMessage from '../components/StatusMessage.jsx';
import { api } from '../services/api.js';

const formatPeso = (amount) => `₱${Number(amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;

export default function OrdersPage() {
  const [orders, setOrders] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    api.getOrders()
      .then((data) => active && setOrders(data.orders))
      .catch((caught) => active && setError(caught.message));
    return () => { active = false; };
  }, []);

  return (
    <section>
      <div className="page-heading"><p className="eyebrow">YOUR ACCOUNT</p><h1>My orders</h1></div>
      <StatusMessage type="error">{error}</StatusMessage>
      {!orders && !error && <StatusMessage>Loading your orders…</StatusMessage>}
      {orders?.length === 0 && (
        <div className="empty-state"><h2>You have no orders yet</h2><Link className="button" to="/">Browse products</Link></div>
      )}
      {orders?.length > 0 && (
        <div className="order-list">
          {orders.map((order) => (
            <article className="order-row" key={order.id}>
              <div>
                <h2>Order #{order.id}</h2>
                <p>{new Date(order.createdAt).toLocaleString('en-PH')} · {order.items.length} product(s) · {order.status}</p>
              </div>
              <strong>{formatPeso(order.total)}</strong>
              <Link className="button secondary" to={`/orders/${order.id}`}>View</Link>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
