import { z } from 'zod';
import { draftAnswer } from './gemini.js';

const MAX_RECOMMENDATIONS = 3;
const PROVIDER_TIMEOUT_MS = 8000;

const NO_MATCH_ANSWER = 'I could not find an in-stock product matching that request. Try different words, or browse the full catalog.';

// Words that say nothing about which product the customer wants.
const STOP_WORDS = new Set(`
  a about above after again all also am an and any anything are around at available be below best budget but buy by
  can cheap cheaper cheapest could customer did do does email for from get give good had has have help hello here hi how
  i in is it item items just least less let like looking many max maximum may me min minimum more most much my need
  not of on one ones only or over peso pesos phone php please price priced prices product products really recommend
  sell shopsmart should show some something stock suggest tell than that the their them there these they thing things
  this those to top under up use using very want was we were what when where which who why will with within would you your
`.trim().split(/\s+/));

const MAX_PRICE_CUE = /\b(?:no more than|not more than|less than|cheaper than|under|below|up to|at most|max(?:imum)?(?: of)?|within|budget(?: of| is)?)$/;
const MIN_PRICE_CUE = /\b(?:more than|over|above|at least|min(?:imum)?(?: of)?|starting at|from)$/;
// A standalone amount, so "1080p" and "USB-C" are never read as prices.
const AMOUNT = /(?<![a-z\d.])(₱\s*|php\s*|p(?=\d))?(\d{2,6}(?:\.\d{1,2})?)(?![\da-z-])(\s*(?:pesos?|php)\b)?/gi;

// Claims the catalog rarely supports. A draft may use one only if the product facts do.
const RISKY_CLAIMS = /\b(warrant\w*|guarantee\w*|shipping|delivery|discount\w*|sale|promo\w*|voucher\w*|free|refund\w*|returns?|out of stock|sold out|unavailable|bluetooth|rgb|backlit|wireless|waterproof|rechargeable|battery|ergonomic|noise-cancel\w*|4k|https?:|www\.)/gi;

const draftSchema = z.object({
  answer: z.string().trim().min(1).max(600),
  productIds: z.array(z.number().int())
});

const removeThousandsSeparators = (text) => text.replace(/(\d),(?=\d{3})/g, '$1');
const formatPeso = (price) => `₱${Number(price).toLocaleString('en-PH', { maximumFractionDigits: 2 })}`;
const singular = (word) => (word.length > 3 && word.endsWith('s') && !word.endsWith('ss') ? word.slice(0, -1) : word);
const words = (text) => text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).map(singular);

export function parsePriceLimits(question) {
  const normalized = removeThousandsSeparators(question);
  const limits = { max: null, min: null };
  for (const match of normalized.matchAll(AMOUNT)) {
    const before = normalized.slice(0, match.index).trimEnd().toLowerCase();
    const amount = Number(match[2]);
    if (MAX_PRICE_CUE.test(before)) limits.max = amount;
    else if (MIN_PRICE_CUE.test(before)) limits.min = amount;
    else if (match[1] || match[3]) limits.max = amount;
  }
  return limits;
}

export function parseBudget(question) {
  return parsePriceLimits(question).max;
}

export function rankProducts(products, question) {
  const { max, min } = parsePriceLimits(question);
  const terms = [...new Set(words(question))].filter((term) => term.length > 2 && !/^\d+$/.test(term) && !STOP_WORDS.has(term));
  if (terms.length === 0 && max === null && min === null) return [];

  const eligible = products
    .filter((product) => product.active !== false && product.stock > 0)
    .filter((product) => (max === null || Number(product.price) <= max) && (min === null || Number(product.price) >= min))
    .map((product) => {
      const productWords = new Set(words(`${product.name} ${product.category} ${product.description}`));
      return { ...product, score: terms.filter((term) => productWords.has(term)).length };
    })
    .sort((a, b) => b.score - a.score || Number(a.price) - Number(b.price));

  if (terms.length === 0) return eligible;
  const topScore = eligible[0]?.score ?? 0;
  return topScore === 0 ? [] : eligible.filter((product) => product.score === topScore);
}

function toResponse(answer, chosen, aiGenerated) {
  return {
    answer,
    recommendedProducts: chosen.map(({ id, name, price, category, stock }) => ({ id, name, price: Number(price), category, stock })),
    sources: chosen.map(({ id, name }) => ({ type: 'product', id, name })),
    aiGenerated
  };
}

export function buildAssistantResponse(products, question) {
  const ranked = rankProducts(products, question).slice(0, MAX_RECOMMENDATIONS);
  if (ranked.length === 0) return toResponse(NO_MATCH_ANSWER, [], false);
  const list = ranked.map(({ name, price }) => `${name} (${formatPeso(price)})`).join(', ');
  return toResponse(`Here are the in-stock matches from the ShopSmart catalog: ${list}.`, ranked, false);
}

export function maskPersonalDetails(question) {
  return question
    .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, '[email]')
    .replace(/\+?\d(?:[\s-]?\d){6,}/g, '[phone]');
}

function rejected(code) {
  return Object.assign(new Error(code), { code });
}

// Returns the products a draft may recommend, or throws if the draft cannot be trusted.
export function verifyDraft(draft, selected, allProducts, question) {
  const parsed = draftSchema.safeParse(draft);
  if (!parsed.success) throw rejected('bad_format');
  const { answer, productIds } = parsed.data;

  const selectedById = new Map(selected.map((product) => [product.id, product]));
  if (productIds.some((id) => !selectedById.has(id))) throw rejected('unknown_product_id');
  const chosen = [...new Set(productIds)].map((id) => selectedById.get(id));
  if (chosen.length === 0) return { answer, chosen };

  const lowerAnswer = answer.toLowerCase();
  const chosenIds = new Set(chosen.map((product) => product.id));
  if (chosen.some((product) => !lowerAnswer.includes(product.name.toLowerCase()))) throw rejected('product_not_named');
  if (allProducts.some((product) => !chosenIds.has(product.id) && lowerAnswer.includes(product.name.toLowerCase()))) throw rejected('other_product_named');

  const facts = chosen.map((product) => `${product.name} ${product.category} ${product.description} ${Number(product.price)} ${product.stock}`).join(' ');
  const numbersIn = (text) => (removeThousandsSeparators(text).match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
  const allowedNumbers = new Set([...numbersIn(facts), ...numbersIn(question)]);
  if (numbersIn(answer).some((number) => !allowedNumbers.has(number))) throw rejected('unsupported_number');

  const lowerFacts = facts.toLowerCase();
  if ((lowerAnswer.match(RISKY_CLAIMS) ?? []).some((claim) => !lowerFacts.includes(claim))) throw rejected('unsupported_claim');

  return { answer, chosen };
}

function withTimeout(promise, timeoutMs) {
  let timer;
  const timeout = new Promise((_resolve, reject) => {
    timer = setTimeout(() => reject(rejected('timeout')), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

const PUBLIC_FIELDS = ({ id, name, description, category, price, stock }) => ({ id, name, description, category, price: Number(price), stock });

export async function answerQuestion(products, rawQuestion, { draft = draftAnswer, timeoutMs = PROVIDER_TIMEOUT_MS } = {}) {
  const question = maskPersonalDetails(rawQuestion);
  const selected = rankProducts(products, question).slice(0, MAX_RECOMMENDATIONS);
  if (selected.length === 0) return toResponse(NO_MATCH_ANSWER, [], false);

  try {
    const output = await withTimeout(draft(question, selected.map(PUBLIC_FIELDS)), timeoutMs);
    const { answer, chosen } = verifyDraft(output, selected, products, question);
    if (chosen.length === 0) return toResponse(NO_MATCH_ANSWER, [], false);
    return toResponse(answer, chosen, true);
  } catch (error) {
    // Only the failure type is logged. Provider messages and request details stay out of the logs.
    console.warn(`Assistant fallback used: ${error.code ?? error.status ?? error.name}`);
    return buildAssistantResponse(products, question);
  }
}
