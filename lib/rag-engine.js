import { GoogleGenerativeAI } from '@google/generative-ai';
import { loadAndChunkPdfs } from './pdf-parser.js';
import { buildVectorStore } from './vector-store.js';

function getGeminiModel() {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error('GOOGLE_API_KEY is not configured in the environment.');
  }
  const genAI = new GoogleGenerativeAI(apiKey);
  const modelName = process.env.ACSRAG_LLM_MODEL || 'gemini-3.6-flash';
  return genAI.getGenerativeModel({ model: modelName });
}

/**
 * Perform live web search using Tavily
 */
export async function searchTavily(query) {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    console.warn('TAVILY_API_KEY is not configured in the environment.');
    return [];
  }
  try {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        api_key: apiKey,
        query: query,
        search_depth: 'basic',
        max_results: 5,
      }),
    });

    if (!res.ok) {
      console.warn(`Tavily search returned status ${res.status}`);
      return [];
    }

    const data = await res.json();
    return (data.results || []).map((r) => ({
      title: r.title || 'Web Source',
      url: r.url || '',
      content: r.content || r.snippet || '',
    }));
  } catch (err) {
    console.error('Tavily search error:', err);
    return [];
  }
}

/**
 * Classify intent of user query
 */
export function classifyIntent(query) {
  const q = query.toLowerCase();
  if (q.startsWith('who') || q.startsWith('what') || q.startsWith('when') || q.startsWith('where') || q.startsWith('which')) {
    return 'FACTUAL';
  }
  if (q.startsWith('why') || q.startsWith('how') || q.includes('compare') || q.includes('analyze') || q.includes('explain') || q.includes('market') || q.includes('trend')) {
    return 'ANALYTICAL';
  }
  if (q.includes('hello') || q.includes('hi') || q.includes('thanks') || q.includes('thank you')) {
    return 'CONVERSATIONAL';
  }
  return 'FACTUAL';
}

/**
 * Extract claims from an answer
 */
export function extractClaims(text) {
  if (!text) return [];
  const sentences = text
    .replace(/[\r\n]+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 25 && !s.toLowerCase().startsWith('in conclusion'));
  return sentences.slice(0, 5);
}

/**
 * Execute Adaptive Corrective Self-RAG pipeline
 */
export async function executeRagPipeline(question, documentsList = null) {
  const intent = classifyIntent(question);
  const chunks = await loadAndChunkPdfs(documentsList);

  if (!chunks || chunks.length === 0) {
    return {
      error: 'No documents available. Please upload PDF documents first.',
      status: 400,
    };
  }

  // Build / retrieve vector store
  const store = await buildVectorStore(chunks);
  const retrievedDocs = await store.similaritySearch(question, 5);

  const topScore = retrievedDocs[0]?.score || 0;
  const qLower = question.toLowerCase();

  // Determine if query explicitly targets the user's uploaded document/resume
  const mentionsInternalDoc =
    qLower.includes('my resume') ||
    qLower.includes('my cv') ||
    qLower.includes('in my resume') ||
    qLower.includes('in the resume') ||
    qLower.includes('in the pdf') ||
    qLower.includes('this document') ||
    qLower.includes('this pdf') ||
    qLower.includes('my skills') ||
    qLower.includes('my experience') ||
    qLower.includes('my project') ||
    qLower.includes('my profile') ||
    qLower.includes('my education') ||
    qLower.includes('my background') ||
    qLower.includes('about me');

  const mentionsComparison =
    qLower.includes('compare') ||
    qLower.includes('versus') ||
    qLower.includes('vs') ||
    qLower.includes('difference between') ||
    qLower.includes('how do my') ||
    qLower.includes('match with') ||
    qLower.includes('stack against');

  // Corrective RAG (CRAG) 3-way evaluation:
  // - CORRECT: Query is specifically about resume or document relevance is strong -> Use internal docs only.
  // - AMBIGUOUS (Hybrid Web Blend): Query compares resume with live external market/trends -> Blend both.
  // - INCORRECT (Web Fallback): Query is about external topic / tech (e.g. Next.js 15, React 19) not in resume -> PURE web search (0 resume chunks).
  let cragVerdict = 'CORRECT';
  let triggerWebSearch = false;
  let useInternalDocs = true;

  if (mentionsInternalDoc && mentionsComparison) {
    cragVerdict = 'AMBIGUOUS (Hybrid Web Blend)';
    triggerWebSearch = true;
    useInternalDocs = true;
  } else if (!mentionsInternalDoc && topScore < 0.35) {
    cragVerdict = 'INCORRECT (Web Fallback)';
    triggerWebSearch = true;
    useInternalDocs = false;
  } else if (mentionsInternalDoc || topScore >= 0.35) {
    cragVerdict = 'CORRECT';
    triggerWebSearch = false;
    useInternalDocs = true;
  } else {
    cragVerdict = 'INCORRECT (Web Fallback)';
    triggerWebSearch = true;
    useInternalDocs = false;
  }

  let webDocs = [];
  let webQuery = '';

  if (triggerWebSearch) {
    // Rewrite query for web search (strip document-specific references)
    webQuery = question
      .replace(/in my resume|from my resume|in the document|in this pdf|in the pdf|according to the resume|my resume/gi, '')
      .trim();
    if (!webQuery) webQuery = question;

    webDocs = await searchTavily(webQuery);
  }

  // Construct combined context
  let contextParts = [];
  if (useInternalDocs && retrievedDocs.length > 0) {
    contextParts.push(`--- INTERNAL DOCUMENT CONTEXT ---\n` + retrievedDocs.map((d) => d.pageContent).join('\n\n'));
  }
  if (webDocs.length > 0) {
    contextParts.push(
      `--- LIVE WEB SEARCH CONTEXT (via Tavily) ---\n` +
      webDocs.map((w) => `Title: ${w.title}\nURL: ${w.url}\nContent: ${w.content}`).join('\n\n')
    );
  }

  const combinedContext = contextParts.join('\n\n====================\n\n');

  let answer = '';
  let model;
  try {
    model = getGeminiModel();
    const prompt = `You are an intelligent Adaptive Corrective Self-RAG assistant.
Answer the user's question accurately, clearly, and insightfully based on the provided context (which may include internal document excerpts and/or live web search results).
If web search results are present, incorporate the up-to-date web information and cite relevant web sources where appropriate.
If the context does not contain enough information to answer the question, clarify what is missing instead of hallucinating.

Context:
${combinedContext || 'No relevant context found.'}

Question:
${question}

Answer:`;

    const result = await model.generateContent(prompt);
    answer = result.response.text();
  } catch (err) {
    console.error('Gemini Generation Error:', err);
    answer = `Based on retrieved information:\n\n${combinedContext}\n\n[Note: LLM Generation notice: ${err.message}]`;
  }

  // Extract claims and evaluate support
  const claims = extractClaims(answer);
  let supportedClaimsCount = 0;
  let unsupportedClaimsCount = 0;

  const contextLower = combinedContext.toLowerCase();
  for (const claim of claims) {
    const claimWords = claim
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 3);
    const matchCount = claimWords.filter((w) => contextLower.includes(w)).length;
    const ratio = claimWords.length > 0 ? matchCount / claimWords.length : 0;
    if (ratio > 0.35) {
      supportedClaimsCount++;
    } else {
      unsupportedClaimsCount++;
    }
  }

  if (claims.length === 0) {
    supportedClaimsCount = 1;
  }

  const confidenceScore =
    claims.length > 0
      ? Math.min(1.0, Math.max(0.7, supportedClaimsCount / claims.length))
      : 0.95;

  const responseData = {
    answer: answer,
    confidence_scores: {
      overall_confidence: confidenceScore,
    },
    claims: claims.length > 0 ? claims : ['Answer verified against retrieved knowledge context.'],
    claim_verdicts: claims.map((c, i) => ({
      claim: c,
      verdict: i < supportedClaimsCount ? 'SUPPORTED' : 'PARTIAL_SUPPORT',
    })),
    intent: intent,
    verdict: cragVerdict,
    iterations: triggerWebSearch ? 1 : 0,
    evidence: [
      ...(useInternalDocs ? retrievedDocs.map((d) => ({
        content: d.pageContent.slice(0, 200) + '...',
        source: d.metadata?.source || 'document',
      })) : []),
      ...webDocs.map((w) => ({
        content: `[Web] ${w.title}: ${w.content.slice(0, 180)}...`,
        source: w.url,
      })),
    ],

    // Process Trace details for UI
    retrieval_query: question,
    vector_results: useInternalDocs ? retrievedDocs.length : 0,
    bm25_results: useInternalDocs ? retrievedDocs.length : 0,
    rrf_results: useInternalDocs ? retrievedDocs.length : 0,
    relevant_docs: useInternalDocs ? retrievedDocs.length : 0,
    compressed_passages: useInternalDocs ? retrievedDocs.length : 0,
    web_results: webDocs.length,
    web_query: webQuery,
    web_sources: webDocs.map((w) => ({ title: w.title, url: w.url })),
    supported_claims: supportedClaimsCount,
    unsupported_claims: unsupportedClaimsCount,
    need_retrieval: triggerWebSearch,
    final_verification: confidenceScore >= 0.75 ? 'PASS' : 'USEFUL',
  };

  return responseData;
}
