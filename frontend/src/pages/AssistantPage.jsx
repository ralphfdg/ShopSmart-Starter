import { useState } from 'react';
import { Link } from 'react-router-dom';
import StatusMessage from '../components/StatusMessage.jsx';
import { api } from '../services/api.js';
import { getStockLabel } from '../utils/stock.js';

export default function AssistantPage() {
  const [question, setQuestion] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function ask(event) {
    event.preventDefault(); setError(''); setResult(null); setLoading(true);
    try { setResult(await api.askAssistant(question)); }
    catch (caught) { setError(caught.status ? caught.message : 'ShopSmart could not be reached. Please try again.'); }
    finally { setLoading(false); }
  }

  const usedFallback = result && !result.aiGenerated && result.recommendedProducts.length > 0;

  return (
    <section className="assistant-layout">
      <div>
        <p className="eyebrow">PRODUCT ASSISTANT</p>
        <h1>Find a product</h1>
        <p>Ask about ShopSmart products. Answers are checked against our current catalog.</p>
        <form onSubmit={ask}>
          <label>Your question<textarea value={question} onChange={(event) => setQuestion(event.target.value)} minLength="3" maxLength="300" placeholder="Which keyboard is below ₱2,000?" required /></label>
          <p className="assistant-note">Please don&apos;t include personal details. Questions may be sent to Google&apos;s AI service.</p>
          <button disabled={loading}>{loading ? 'Searching…' : 'Ask ShopSmart'}</button>
        </form>
      </div>
      <div className="assistant-answer">
        <h2>Assistant response</h2>
        <StatusMessage type="error">{error}</StatusMessage>
        {loading && <StatusMessage>Checking the catalog and preparing your answer…</StatusMessage>}
        {!result && !error && !loading && <p>Your answer will appear here.</p>}
        {result && <>
          <p>{result.answer}</p>
          {usedFallback && <p className="assistant-note">Our AI helper is unavailable right now, so this answer comes directly from the catalog.</p>}
          <div className="recommendations">
            {result.recommendedProducts.map((product) => (
              <div className="recommendation" key={product.id}>
                <div>
                  <p className="recommendation-name">{product.name}</p>
                  <p className="recommendation-facts">
                    ₱{Number(product.price).toLocaleString('en-PH')} · <span className="stock">{getStockLabel(product.stock)}</span>
                  </p>
                </div>
                <Link className="button check-product" to={`/products/${product.id}`} aria-label={`Check product: ${product.name}`}>
                  Check product <span className="check-product-arrow" aria-hidden="true">→</span>
                </Link>
              </div>
            ))}
          </div>
          {result.sources.length > 0 && (
            <div className="assistant-sources">
              <h3>Sources</h3>
              <ul>
                {result.sources.map((source) => (
                  <li key={source.id}>Catalog product #{source.id}: {source.name}</li>
                ))}
              </ul>
            </div>
          )}
        </>}
      </div>
    </section>
  );
}
