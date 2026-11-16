import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from './api.js';

function mockFetch(implementation) {
  vi.stubGlobal('fetch', vi.fn(implementation));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('api request errors', () => {
  it('turns a network failure into a clear message instead of "Failed to fetch"', async () => {
    mockFetch(() => Promise.reject(new TypeError('Failed to fetch')));

    const error = await api.createOrder({}).catch((caught) => caught);

    expect(error.message).toBe('ShopSmart could not be reached. Check that the server is running, then try again.');
    expect(error.code).toBe('NETWORK_ERROR');
    expect(error.status).toBeUndefined();
  });

  it('names the checkout fields the server rejected', async () => {
    mockFetch(() => Promise.resolve(new Response(JSON.stringify({
      error: {
        code: 'INVALID_ORDER',
        message: 'Check the customer and cart information.',
        details: { formErrors: [], fieldErrors: { email: ['Invalid email address'] } }
      }
    }), { status: 422 })));

    const error = await api.createOrder({}).catch((caught) => caught);

    expect(error.message).toBe('Check the customer and cart information. Please fix: Email address.');
    expect(error.status).toBe(422);
    expect(error.code).toBe('INVALID_ORDER');
  });

  it('keeps the server message when no field details are sent', async () => {
    mockFetch(() => Promise.resolve(new Response(JSON.stringify({
      error: { code: 'INSUFFICIENT_STOCK', message: 'Only 5 unit(s) of 1080p Webcam are available.' }
    }), { status: 409 })));

    const error = await api.createOrder({}).catch((caught) => caught);

    expect(error.message).toBe('Only 5 unit(s) of 1080p Webcam are available.');
    expect(error.status).toBe(409);
  });
});
