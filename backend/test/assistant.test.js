import test from 'node:test';
import assert from 'node:assert/strict';
import { answerQuestion, buildAssistantResponse, maskPersonalDetails, parseBudget, parsePriceLimits, rankProducts } from '../src/services/assistant.js';

const products = [
  { id: 1, name: 'Keyboard', category: 'Accessories', description: 'Mechanical keyboard', price: 1800, stock: 2 },
  { id: 2, name: 'Mouse', category: 'Accessories', description: 'Wireless mouse', price: 600, stock: 3 }
];

const catalog = [
  { id: 13, name: 'Wireless Mouse', description: 'Quiet wireless mouse with adjustable sensitivity and USB receiver.', category: 'Accessories', price: '650.00', stock: 12, active: true },
  { id: 14, name: 'Compact Mechanical Keyboard', description: 'Hot-swappable compact keyboard with tactile switches.', category: 'Accessories', price: '1850.00', stock: 8, active: true },
  { id: 15, name: 'USB-C Study Lamp', description: 'Adjustable desk lamp with three brightness levels.', category: 'Study', price: '900.00', stock: 10, active: true },
  { id: 16, name: '1080p Webcam', description: 'Full HD webcam with privacy cover and built-in microphone.', category: 'Video', price: '1450.00', stock: 6, active: true },
  { id: 17, name: 'Laptop Stand', description: 'Foldable aluminum stand for laptops up to 16 inches.', category: 'Study', price: '1200.00', stock: 9, active: true },
  { id: 18, name: 'Sold Out Headset', description: 'Over-ear headset.', category: 'Audio', price: '1350.00', stock: 0, active: true },
  { id: 19, name: 'Retired Tablet', description: 'Old tablet.', category: 'Video', price: '1000.00', stock: 5, active: false }
];

const KEYBOARD_QUESTION = 'Which keyboard is below ₱2,000?';
const goodDraft = { answer: 'The Compact Mechanical Keyboard costs ₱1,850 and is below your budget.', productIds: [14] };

// Runs a question against a fake provider and records whether it was called.
async function ask(question, draftResult) {
  const calls = [];
  const draft = async (...args) => {
    calls.push(args);
    if (draftResult instanceof Error) throw draftResult;
    return draftResult;
  };
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    return { response: await answerQuestion(catalog, question, { draft }), calls };
  } finally {
    console.warn = originalWarn;
  }
}

function assertUsesFallback(response) {
  assert.equal(response.aiGenerated, false);
  assert.match(response.answer, /Compact Mechanical Keyboard \(₱1,850\)/);
  assert.deepEqual(response.recommendedProducts.map((product) => product.id), [14]);
  assert.deepEqual(response.sources.map((source) => source.id), [14]);
}

test('parseBudget extracts a peso budget', () => assert.equal(parseBudget('below ₱2,000'), 2000));
test('rankProducts respects the budget', () => assert.deepEqual(rankProducts(products, 'mouse below 700').map((p) => p.id), [2]));
test('assistant response contains traceable sources', () => assert.equal(buildAssistantResponse(products, 'keyboard').sources[0].id, 1));

test('numbers in product names are not read as a budget', () => {
  assert.equal(parseBudget('1080p webcam'), null);
  assert.equal(parseBudget('stand for a 16 inch laptop'), null);
  assert.deepEqual(rankProducts(catalog, '1080p webcam').map((p) => p.id), [16]);
});

test('"above" sets a minimum price instead of a budget', () => {
  assert.deepEqual(parsePriceLimits('keyboard above ₱5,000'), { max: null, min: 5000 });
  assert.deepEqual(rankProducts(catalog, 'keyboard above ₱5,000'), []);
});

test('other budget wordings are understood', () => {
  assert.equal(parseBudget('keyboard for P2000'), 2000);
  assert.equal(parseBudget('keyboard, 2000 pesos'), 2000);
  assert.equal(parseBudget('no more than 900'), 900);
});

test('rankProducts ignores common words and handles plurals', () => {
  assert.deepEqual(rankProducts(catalog, 'Which keyboards do you have for me?').map((p) => p.id), [14]);
});

test('rankProducts answers a budget-only question, cheapest first', () => {
  assert.deepEqual(rankProducts(catalog, 'anything under ₱1,000?').map((p) => p.id), [13, 15]);
});

test('rankProducts excludes out-of-stock and inactive products', () => {
  assert.deepEqual(rankProducts(catalog, 'headset'), []);
  assert.deepEqual(rankProducts(catalog, 'tablet'), []);
});

test('a verified draft is used and its links come from the catalog', async () => {
  const { response } = await ask(KEYBOARD_QUESTION, goodDraft);
  assert.equal(response.answer, goodDraft.answer);
  assert.equal(response.aiGenerated, true);
  assert.deepEqual(response.recommendedProducts, [{ id: 14, name: 'Compact Mechanical Keyboard', price: 1850, category: 'Accessories', stock: 8 }]);
  assert.deepEqual(response.sources, [{ type: 'product', id: 14, name: 'Compact Mechanical Keyboard' }]);
});

test('the provider receives only public fields with a numeric price', async () => {
  const { calls } = await ask(KEYBOARD_QUESTION, goodDraft);
  assert.deepEqual(calls[0][1], [{ id: 14, name: 'Compact Mechanical Keyboard', description: 'Hot-swappable compact keyboard with tactile switches.', category: 'Accessories', price: 1850, stock: 8 }]);
});

test('personal details are masked before the provider sees the question', async () => {
  assert.equal(maskPersonalDetails('ana@example.com or 0917 123 4567'), '[email] or [phone]');
  const { calls } = await ask('keyboard for ana@example.com, call 0917-123-4567', goodDraft);
  assert.equal(calls[0][0], 'keyboard for [email], call [phone]');
});

test('no match is answered honestly without calling the provider', async () => {
  const { response, calls } = await ask('Do you sell tents?', goodDraft);
  assert.equal(calls.length, 0);
  assert.match(response.answer, /could not find/);
  assert.deepEqual(response.recommendedProducts, []);
  assert.deepEqual(response.sources, []);
});

test('a draft saying nothing fits becomes the honest no-match answer', async () => {
  const { response } = await ask('mechanical pencil', { answer: 'Nothing fits.', productIds: [] });
  assert.match(response.answer, /could not find/);
  assert.deepEqual(response.sources, []);
});

const rejectedDrafts = {
  'an invented product id': { answer: 'The Compact Mechanical Keyboard costs ₱1,850.', productIds: [999] },
  'a real product that was not selected': { answer: 'The Compact Mechanical Keyboard costs ₱1,850.', productIds: [14, 13] },
  'a wrong price': { answer: 'The Compact Mechanical Keyboard costs ₱999.', productIds: [14] },
  'an unselected product named in the text': { answer: 'The Compact Mechanical Keyboard costs ₱1,850, or try the Laptop Stand.', productIds: [14] },
  'no product name in the text': { answer: 'Here is a poem about the sea.', productIds: [14] },
  'an unsupported specification': { answer: 'The Compact Mechanical Keyboard costs ₱1,850 and has RGB lighting.', productIds: [14] },
  'an unsupported policy': { answer: 'The Compact Mechanical Keyboard costs ₱1,850 with free shipping.', productIds: [14] },
  'a false availability claim': { answer: 'The Compact Mechanical Keyboard is sold out.', productIds: [14] },
  'an injected link': { answer: 'The Compact Mechanical Keyboard: https://example.com', productIds: [14] },
  'an empty answer': { answer: '   ', productIds: [14] },
  'an overly long answer': { answer: `The Compact Mechanical Keyboard ${'x'.repeat(600)}`, productIds: [14] },
  'the wrong shape': { text: 'hello' },
  'text instead of JSON': 'not json'
};

for (const [name, draft] of Object.entries(rejectedDrafts)) {
  test(`falls back on ${name}`, async () => assertUsesFallback((await ask(KEYBOARD_QUESTION, draft)).response));
}

test('falls back when the provider fails', async () => {
  const failure = Object.assign(new Error('secret provider detail'), { status: 429 });
  const logged = [];
  const originalWarn = console.warn;
  console.warn = (message) => logged.push(message);
  try {
    assertUsesFallback(await answerQuestion(catalog, KEYBOARD_QUESTION, { draft: async () => { throw failure; } }));
  } finally {
    console.warn = originalWarn;
  }
  assert.deepEqual(logged, ['Assistant fallback used: 429']);
});

test('falls back when no API key is configured', async () => {
  const savedKey = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    assertUsesFallback(await answerQuestion(catalog, KEYBOARD_QUESTION));
  } finally {
    console.warn = originalWarn;
    if (savedKey !== undefined) process.env.GEMINI_API_KEY = savedKey;
  }
});

test('falls back when the provider takes too long', async () => {
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    const neverFinishes = () => new Promise(() => {});
    assertUsesFallback(await answerQuestion(catalog, KEYBOARD_QUESTION, { draft: neverFinishes, timeoutMs: 10 }));
  } finally {
    console.warn = originalWarn;
  }
});
