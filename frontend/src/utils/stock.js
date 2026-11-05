export function getStockLabel(stock) {
  if (stock < 1) return 'Out of stock';
  if (stock <= 8) return `Only ${stock} left`;
  return `${stock} in stock`;
}
