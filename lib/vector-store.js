import { GoogleGenerativeAI } from '@google/generative-ai';

// In-memory cache for embeddings: cacheKey -> Array of { chunk, embedding, terms }
const storeCache = new Map();

// Stopwords to prevent term-frequency pollution from common grammatical words
const STOPWORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are',
  'as', 'at', 'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both',
  'but', 'by', 'can', 'could', 'did', 'do', 'does', 'doing', 'down', 'during', 'each', 'few',
  'for', 'from', 'further', 'had', 'has', 'have', 'having', 'he', 'her', 'here', 'hers',
  'him', 'his', 'how', 'i', 'if', 'in', 'into', 'is', 'it', 'its', 'just', 'me', 'more',
  'most', 'my', 'no', 'nor', 'not', 'now', 'of', 'off', 'on', 'once', 'only', 'or', 'other',
  'our', 'out', 'over', 'own', 'same', 'she', 'should', 'so', 'some', 'such', 'than', 'that',
  'the', 'their', 'theirs', 'them', 'then', 'there', 'these', 'they', 'this', 'those', 'through',
  'to', 'too', 'under', 'until', 'up', 'very', 'was', 'we', 'were', 'what', 'when', 'where',
  'which', 'while', 'who', 'whom', 'why', 'with', 'would', 'you', 'your',
]);

// Acronym and synonym mappings for hybrid search
const SYNONYMS = {
  gpa: ['cgpa', 'grade', 'marks', 'percentage', 'score', 'education'],
  cgpa: ['gpa', 'grade', 'marks', 'percentage', 'score', 'education'],
  rag: ['retrieval', 'augmented', 'generation', 'crag', 'self-rag'],
  llm: ['large', 'language', 'model', 'llms', 'gpt', 'transformer'],
  resume: ['cv', 'profile', 'candidate', 'experience', 'bio', 'education'],
  module: ['chapter', 'compiler', 'code', 'generation', 'bcse307l', 'unit'],
  name: ['person', 'candidate', 'author', 'profile', 'summary', 'bio', 'contact', 'identity', 'who', 'student'],
  person: ['name', 'candidate', 'author', 'profile', 'student', 'engineer', 'who', 'resume'],
  candidate: ['name', 'person', 'author', 'profile', 'student', 'resume', 'cv', 'who'],
  who: ['name', 'person', 'candidate', 'author', 'profile', 'about', 'student'],
  contact: ['email', 'phone', 'mobile', 'github', 'linkedin', 'gmail', 'name', 'address'],
  email: ['gmail', 'contact', 'mail', 'phone', 'name'],
  phone: ['mobile', 'contact', 'call', 'name', 'tel'],
  summary: ['profile', 'summary', 'about', 'overview', 'experience', 'professional'],
};

/**
 * Tokenize and calculate term frequency vector with stopword removal & acronym expansion
 */
function extractTerms(text) {
  const terms = new Map();
  if (!text) return terms;

  const words = text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !STOPWORDS.has(w));

  for (const w of words) {
    terms.set(w, (terms.get(w) || 0) + 1);
  }

  // Add synonym expansions with small weight
  for (const [key, synList] of Object.entries(SYNONYMS)) {
    if (terms.has(key)) {
      for (const syn of synList) {
        if (!terms.has(syn)) {
          terms.set(syn, 0.75);
        }
      }
    }
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
      score += tf * qCount * 12;
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

    // Embed with Google GenAI using gemini-embedding-001
    if (this.genAI) {
      try {
        const model = this.genAI.getGenerativeModel({ model: 'gemini-embedding-001' });
        const batchSize = 10;
        for (let i = 0; i < this.chunks.length; i += batchSize) {
          const batch = this.chunks.slice(i, i + batchSize);
          const promises = batch.map(async (c) => {
            try {
              const res = await model.embedContent(c.pageContent.slice(0, 2048));
              return res.embedding?.values || [];
            } catch (err) {
              console.warn('Embedding batch item error:', err.message);
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

  async similaritySearch(query, k = 8) {
    if (this.chunks.length === 0) return [];

    let queryEmbedding = null;
    if (this.genAI && this.embeddings.length === this.chunks.length) {
      try {
        const model = this.genAI.getGenerativeModel({ model: 'gemini-embedding-001' });
        const res = await model.embedContent(query.slice(0, 2048));
        queryEmbedding = res.embedding?.values || null;
      } catch {
        queryEmbedding = null;
      }
    }

    const queryTerms = extractTerms(query);
    const isIdentityOrOverview =
      /\b(name|who|author|person|candidate|contact|email|phone|profile|about|summary|overview|title|document|pdf)\b/i.test(
        query
      );

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

      // Boost root/header chunk (chunk_index === 0) when query asks for identity/overview/name
      const isRootChunk = chunk.metadata?.chunk_index === 0;
      const rootBoost = isIdentityOrOverview && isRootChunk ? 0.15 : 0;

      // Hybrid rank score
      const combinedScore = (vectorScore > 0 ? vectorScore * 0.75 : 0) + bm25Score * 0.25 + rootBoost;
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
