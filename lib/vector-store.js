import { GoogleGenerativeAI } from '@google/generative-ai';

// In-memory cache for embeddings: cacheKey -> Array of { chunk, embedding, terms }
const storeCache = new Map();

/**
 * Tokenize and calculate term frequency vector
 */
function extractTerms(text) {
  const terms = new Map();
  const words = text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2);

  for (const w of words) {
    terms.set(w, (terms.get(w) || 0) + 1);
  }
  return terms;
}

/**
 * Cosine similarity between two vectors
 */
function cosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * BM25 / Term overlap scoring
 */
function termScore(queryTerms, docTerms, totalDocTerms) {
  let score = 0;
  for (const [qTerm, qCount] of queryTerms.entries()) {
    if (docTerms.has(qTerm)) {
      const tf = docTerms.get(qTerm) / (totalDocTerms || 1);
      score += tf * qCount * 10;
    }
  }
  return score;
}

export class MemoryVectorStore {
  constructor(chunks = [], apiKey = process.env.GOOGLE_API_KEY) {
    this.chunks = chunks;
    this.apiKey = apiKey;
    this.embeddings = [];
    this.docTerms = [];
    this.genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;
  }

  async initialize() {
    if (this.chunks.length === 0) return;

    for (const chunk of this.chunks) {
      const terms = extractTerms(chunk.pageContent);
      let totalTerms = 0;
      for (const count of terms.values()) totalTerms += count;
      this.docTerms.push({ terms, totalTerms });
    }

    // Try embedding with Google GenAI if API key exists
    if (this.genAI) {
      try {
        const model = this.genAI.getGenerativeModel({ model: 'text-embedding-004' });
        // Embed in batches to avoid payload limits
        const batchSize = 10;
        for (let i = 0; i < this.chunks.length; i += batchSize) {
          const batch = this.chunks.slice(i, i + batchSize);
          const promises = batch.map(async (c) => {
            try {
              const res = await model.embedContent(c.pageContent.slice(0, 2048));
              return res.embedding?.values || [];
            } catch {
              return [];
            }
          });
          const batchEmbeddings = await Promise.all(promises);
          this.embeddings.push(...batchEmbeddings);
        }
      } catch (err) {
        console.warn('Google Embedding failed or skipped, using semantic term frequency retrieval:', err.message);
      }
    }
  }

  async similaritySearch(query, k = 5) {
    if (this.chunks.length === 0) return [];

    let queryEmbedding = null;
    if (this.genAI && this.embeddings.length === this.chunks.length) {
      try {
        const model = this.genAI.getGenerativeModel({ model: 'text-embedding-004' });
        const res = await model.embedContent(query.slice(0, 2048));
        queryEmbedding = res.embedding?.values || null;
      } catch {
        queryEmbedding = null;
      }
    }

    const queryTerms = extractTerms(query);
    const scoredDocs = [];

    for (let i = 0; i < this.chunks.length; i++) {
      const chunk = this.chunks[i];
      let vectorScore = 0;
      if (queryEmbedding && this.embeddings[i] && this.embeddings[i].length > 0) {
        vectorScore = cosineSimilarity(queryEmbedding, this.embeddings[i]);
      }

      const bm25Score = termScore(
        queryTerms,
        this.docTerms[i]?.terms || new Map(),
        this.docTerms[i]?.totalTerms || 1
      );

      // Hybrid rank score (RRF style)
      const combinedScore = vectorScore * 0.7 + bm25Score * 0.3;
      scoredDocs.push({
        ...chunk,
        score: combinedScore,
        vectorScore,
        bm25Score,
      });
    }

    scoredDocs.sort((a, b) => b.score - a.score);
    return scoredDocs.slice(0, k);
  }
}

/**
 * Build or retrieve cached vector store
 */
export async function buildVectorStore(chunks, cacheKey = '') {
  if (cacheKey && storeCache.has(cacheKey)) {
    return storeCache.get(cacheKey);
  }

  const store = new MemoryVectorStore(chunks);
  await store.initialize();

  if (cacheKey) {
    storeCache.set(cacheKey, store);
  }

  return store;
}
