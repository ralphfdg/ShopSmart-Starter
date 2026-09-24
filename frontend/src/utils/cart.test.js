import { describe, expect, it } from 'vitest';
import { addProductToCart, calculateCartTotal, updateCartQuantity } from './cart.js';

describe('cart utilities', () => {
  it('calculates the cart total', () => {
    expect(calculateCartTotal([
      { price: 100, quantity: 2 },
      { price: 50, quantity: 3 }
    ])).toBe(350);
  });

  it('adds a new product', () => {
    const result = addProductToCart([], { id: 1, name: 'Mouse', price: 500, stock: 2 });
    expect(result.error).toBe('');
    expect(result.cart[0].quantity).toBe(1);
  });

  it('prevents a quantity above stock', () => {
    const cart = [{ productId: 1, name: 'Mouse', price: 500, stock: 1, quantity: 1 }];
    expect(updateCartQuantity(cart, 1, 2).error).toContain('Only 1');
  });
});
