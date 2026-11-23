import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../src/app.js';
import { hashPassword, verifyPassword } from '../src/lib/password.js';
import { hashToken } from '../src/lib/session.js';

const PASSWORD = 'correct-horse-battery';
const customerOne = { id: 1, email: 'test.customer.one@example.com', name: 'Test Customer One' };
const customerTwo = { id: 2, email: 'test.customer.two@example.com', name: 'Test Customer Two' };
const sessions = new Map([
  [hashToken('token-one'), { userId: 1, user: customerOne, expiresAt: new Date(Date.now() + 60_000) }],
  [hashToken('token-two'), { userId: 2, user: customerTwo, expiresAt: new Date(Date.now() + 60_000) }],
  [hashToken('token-expired'), { userId: 1, user: customerOne, expiresAt: new Date(Date.now() - 60_000) }]
]);
const orders = [
  { id: 10, userId: 1, customerName: 'Test Customer One', email: customerOne.email, address: '123 Sample Street, Testville', status: 'PENDING', total: '650.00', createdAt: new Date(), items: [{ id: 1, orderId: 10, productId: 13, quantity: 1, unitPrice: '650.00', product: { name: 'Wireless Mouse', emoji: '🖱️' } }] }
];

// A stand-in for Prisma that follows the same query rules, so these tests run without PostgreSQL.
function fakeDb(overrides = {}) {
  const created = [];
  return {
    created,
    session: {
      findUnique: async ({ where }) => sessions.get(where.tokenHash) ?? null,
      create: async ({ data }) => { created.push(data); return data; },
      deleteMany: async () => ({ count: 1 })
    },
    user: { findUnique: async ({ where }) => (where.email === customerOne.email ? { ...customerOne, passwordHash: await hashPassword(PASSWORD) } : null) },
    order: {
      findMany: async ({ where }) => orders.filter((order) => order.userId === where.userId),
      findFirst: async ({ where }) => orders.find((order) => order.id === where.id && order.userId === where.userId) ?? null
    },
    $queryRaw: async () => [{ '?column?': 1 }],
    ...overrides
  };
}

async function withServer(db, run) {
  const server = createApp({ db }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    return await run(`http://127.0.0.1:${server.address().port}/api`);
  } finally {
    server.close();
    server.closeAllConnections();
  }
}

const asCustomer = (token) => ({ headers: { cookie: `shopsmart_session=${token}` } });

test('passwords are hashed with a salt and verified', async () => {
  const first = await hashPassword(PASSWORD);
  const second = await hashPassword(PASSWORD);
  assert.notEqual(first, second);
  assert.ok(!first.includes(PASSWORD));
  assert.equal(await verifyPassword(PASSWORD, first), true);
  assert.equal(await verifyPassword('wrong-password', first), false);
  assert.equal(await verifyPassword(PASSWORD, 'not-a-hash'), false);
});

test('a guest is refused private order data', async () => {
  await withServer(fakeDb(), async (api) => {
    assert.equal((await fetch(`${api}/orders`)).status, 401);
    const response = await fetch(`${api}/orders/10`);
    assert.equal(response.status, 401);
    assert.equal((await response.json()).error.code, 'SIGN_IN_REQUIRED');
  });
});

test('a guest cannot place an order', async () => {
  await withServer(fakeDb(), async (api) => {
    const response = await fetch(`${api}/orders`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(response.status, 401);
  });
});

test('an expired session counts as a guest', async () => {
  await withServer(fakeDb(), async (api) => {
    assert.equal((await fetch(`${api}/orders/10`, asCustomer('token-expired'))).status, 401);
  });
});

test('the owner can list and read their own order', async () => {
  await withServer(fakeDb(), async (api) => {
    const list = await (await fetch(`${api}/orders`, asCustomer('token-one'))).json();
    assert.deepEqual(list.orders.map((order) => order.id), [10]);
    const response = await fetch(`${api}/orders/10`, asCustomer('token-one'));
    assert.equal(response.status, 200);
    const order = await response.json();
    assert.equal(order.total, 650);
    assert.equal(order.items[0].unitPrice, 650);
  });
});

test('another customer is denied by a direct API request', async () => {
  await withServer(fakeDb(), async (api) => {
    const response = await fetch(`${api}/orders/10`, asCustomer('token-two'));
    assert.equal(response.status, 404);
    assert.equal((await response.json()).error.code, 'ORDER_NOT_FOUND');
    const list = await (await fetch(`${api}/orders`, asCustomer('token-two'))).json();
    assert.deepEqual(list.orders, []);
  });
});

test('sign-in sets a secure session cookie and reports the customer', async () => {
  const db = fakeDb();
  await withServer(db, async (api) => {
    const response = await fetch(`${api}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: ' Test.Customer.One@example.com ', password: PASSWORD }) });
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).user, customerOne);
    const cookie = response.headers.get('set-cookie');
    assert.match(cookie, /^shopsmart_session=[a-f0-9]{64};/);
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Lax/);
    // Only the hash of the token is stored.
    assert.equal(db.created.length, 1);
    assert.ok(!cookie.includes(db.created[0].tokenHash));
  });
});

test('a wrong password and an unknown email get the same answer', async () => {
  await withServer(fakeDb(), async (api) => {
    const attempt = (email, password) => fetch(`${api}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
    const wrongPassword = await attempt(customerOne.email, 'wrong-password');
    const unknownEmail = await attempt('nobody@example.com', PASSWORD);
    assert.equal(wrongPassword.status, 401);
    assert.equal(unknownEmail.status, 401);
    assert.deepEqual(await wrongPassword.json(), await unknownEmail.json());
    assert.equal(wrongPassword.headers.get('set-cookie'), null);
  });
});

test('the session check reports a guest or the signed-in customer', async () => {
  await withServer(fakeDb(), async (api) => {
    assert.deepEqual(await (await fetch(`${api}/auth/me`)).json(), { user: null });
    assert.deepEqual(await (await fetch(`${api}/auth/me`, asCustomer('token-two'))).json(), { user: customerTwo });
  });
});

test('the readiness check reports when the database is unreachable', async () => {
  await withServer(fakeDb(), async (api) => {
    const response = await fetch(`${api}/health/ready`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'ok', database: 'ok' });
  });
  const failing = fakeDb({ $queryRaw: async () => { throw Object.assign(new Error('connection refused'), { code: 'P1001' }); } });
  const originalError = console.error;
  console.error = () => {};
  try {
    await withServer(failing, async (api) => {
      const response = await fetch(`${api}/health/ready`);
      assert.equal(response.status, 503);
      const body = await response.json();
      assert.equal(body.database, 'unavailable');
      assert.ok(!JSON.stringify(body).includes('connection refused'));
    });
  } finally {
    console.error = originalError;
  }
});

test('private account and order responses are never cached', async () => {
  await withServer(fakeDb(), async (api) => {
    for (const [path, options] of [['/orders', asCustomer('token-one')], ['/orders/10', asCustomer('token-one')], ['/orders', {}], ['/auth/me', asCustomer('token-one')]]) {
      const response = await fetch(`${api}${path}`, options);
      assert.equal(response.headers.get('cache-control'), 'no-store', path);
    }
    // Public responses are not affected.
    assert.notEqual((await fetch(`${api}/health`)).headers.get('cache-control'), 'no-store');
  });
});

test('CORS lets the shop send its sign-in cookie', async () => {
  await withServer(fakeDb(), async (api) => {
    const shop = process.env.FRONTEND_URL || 'http://localhost:5173';
    const response = await fetch(`${api}/health`, { headers: { Origin: shop } });
    assert.equal(response.headers.get('access-control-allow-origin'), shop);
    assert.equal(response.headers.get('access-control-allow-credentials'), 'true');
  });
});
