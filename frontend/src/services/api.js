const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

const FIELD_LABELS = {
  customerName: 'Full name',
  email: 'Email address',
  address: 'Delivery address',
  items: 'Cart items'
};

function describeError(data, status) {
  const message = data?.error?.message || `Request failed with status ${status}.`;
  const fields = Object.keys(data?.error?.details?.fieldErrors ?? {});
  if (fields.length === 0) return message;
  return `${message} Please fix: ${fields.map((field) => FIELD_LABELS[field] ?? field).join(', ')}.`;
}

async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...options.headers }
    });
  } catch {
    // fetch only rejects when the server cannot be reached (offline, server stopped, CORS).
    const error = new Error('ShopSmart could not be reached. Check that the server is running, then try again.');
    error.code = 'NETWORK_ERROR';
    throw error;
  }

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = describeError(data, response.status);
    const error = new Error(message);
    error.status = response.status;
    error.code = data?.error?.code;
    throw error;
  }
  return data;
}

export const api = {
  getProducts: (query = '') => request(`/products${query ? `?search=${encodeURIComponent(query)}` : ''}`),
  getProduct: (id) => request(`/products/${id}`),
  createOrder: (order) => request('/orders', { method: 'POST', body: JSON.stringify(order) }),
  askAssistant: (question) => request('/assistant/questions', {
    method: 'POST', body: JSON.stringify({ question })
  })
};
