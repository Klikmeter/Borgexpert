// Eenvoudige rate limiter per IP in het geheugen. Eén replica op Railway, dus dit is genoeg.
export function createRateLimiter({ max, windowMs, now = Date.now }) {
  const hits = new Map();
  const sweep = () => { const t = now() - windowMs; for (const [k, arr] of hits) { const keep = arr.filter((x) => x > t); if (keep.length) hits.set(k, keep); else hits.delete(k); } };
  let n = 0;
  return {
    /** true als het verzoek mag doorgaan */
    allow(key) {
      if (++n % 500 === 0) sweep();
      const t = now();
      const arr = (hits.get(key) || []).filter((x) => x > t - windowMs);
      if (arr.length >= max) { hits.set(key, arr); return false; }
      arr.push(t); hits.set(key, arr); return true;
    },
  };
}
