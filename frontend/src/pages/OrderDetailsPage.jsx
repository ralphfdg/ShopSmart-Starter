import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import StatusMessage from '../components/StatusMessage.jsx';
import { api } from '../services/api.js';

const formatPeso = (amount) => `₱${Number(amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;

export default function OrderDetailsPage() {
  const { orderId } = useParams();
  const [order, setOrder] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setOrder(null);
    setError('');
    api.getOrder(orderId)
      .then((data) => active && setOrder(data))
      .catch((caught) => active && setError(caught.message));
    return () => { active = false; };
  }, [orderId]);

  if (error) return <section><StatusMessage type="error">{error}</StatusMessage><Link to="/orders">Back to my orders</Link></section>;
  if (!order) return <section><StatusMessage>Loading order…</StatusMessage></section>;

  return (
    <section>
      <div className="page-heading">
        <p className="eyebrow">SIMULATED ORDER · {order.status}</p>
        <h1>Order #{order.id}</h1>
        <p>Placed {new Date(order.createdAt).toLocaleString('en-PH')}</p>
      </div>
      <div className="cart-layout">
        <div className="cart-items">
          {order.items.map((item) => (
            <article className="cart-item" key={item.id}>
              <div><h2>{item.product?.emoji} {item.product?.name ?? `Product #${item.productId}`}</h2><p>{formatPeso(item.unitPrice)} each</p></div>
              <p>Quantity: {item.quantity}</p>
              <strong>{formatPeso(item.unitPrice * item.quantity)}</strong>
            </article>
          ))}
        </div>
        <aside className="summary">
          <h2>Delivery</h2>
          <p><span>Name</span><strong>{order.customerName}</strong></p>
          <p><span>Email</span><strong>{order.email}</strong></p>
          <p><span>Address</span><strong>{order.address}</strong></p>
          <p className="summary-total"><span>Total</span><strong>{formatPeso(order.total)}</strong></p>
          <Link className="button full secondary" to="/orders">Back to my orders</Link>
        </aside>
      </div>
    </section>
  );
}
