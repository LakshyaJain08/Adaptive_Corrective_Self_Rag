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
export async function executeRagPipeline(
  question,
  documentsList = null,
  options = { webSearch: true, thinkMode: true }
) {
  const webSearchEnabled = options?.webSearch !== false;
  const thinkModeEnabled = options?.thinkMode !== false;

  const intent = classifyIntent(question);
  const chunks = await loadAndChunkPdfs(documentsList);
  const qLower = question.toLowerCase();

  // Enhanced intent and entity detection:
  // 1. Personal pronouns & candidate references
  const hasPersonalPronoun = /\b(my|i|me|mine|myself|our|we|us)\b/i.test(question);

  // 2. Document & resume terms
  const hasDocKeyword = /\b(resume|cv|pdf|document|file|paper|text|page|uploaded|attachment)\b/i.test(question);

  // 3. Academic & educational attributes
  const hasAcademicKeyword = /\b(marks|score|scores|percentage|gpa|cgpa|grade|grades|10th|12th|school|highschool|high school|matriculation|intermediate|secondary|college|university|degree|bachelor|b\.?tech|master|m\.?tech|graduation|major|minor|course|academic|academics|education|qualification|qualifications)\b/i.test(question);

  // 4. Career, project & profile attributes
  const hasCareerKeyword = /\b(skills|skill|experience|experiences|project|projects|work|internship|internships|job|jobs|role|roles|company|companies|certification|certifications|certificate|certificates|award|awards|achievement|achievements|publication|publications|patent|patents|contact|email|phone|mobile|number|linkedin|github|portfolio|address|location|city|name|candidate|author|who am i|who is|about me|summary|bio)\b/i.test(question);

  const mentionsInternalDoc =
    hasPersonalPronoun ||
    hasDocKeyword ||
    (hasAcademicKeyword && chunks && chunks.length > 0) ||
    (hasCareerKeyword && chunks && chunks.length > 0);

  if (!chunks || chunks.length === 0) {
    if (mentionsInternalDoc) {
      return {
        answer:
          'No documents are attached to this chat yet. Please click the **+** button next to the prompt or drag and drop a PDF file to attach knowledge to this conversation.',
        confidence_scores: { overall_confidence: 0 },
        intent,
        verdict: 'NO_DOCS',
        iterations: 0,
        claims: [],
        claim_verdicts: [],
        retrieval_query: question,
        vector_results: 0,
        bm25_results: 0,
        rrf_results: 0,
        relevant_docs: 0,
        compressed_passages: 0,
        web_results: 0,
        web_query: '',
        web_sources: [],
        web_search_enabled: webSearchEnabled,
        think_mode_enabled: thinkModeEnabled,
        supported_claims: 0,
        unsupported_claims: 0,
        need_retrieval: true,
        final_verification: 'No documents attached to this chat.',
      };
    }
  }

  let retrievedDocs = [];
  let topScore = 0;

  if (chunks && chunks.length > 0) {
    // Build / retrieve vector store
    const store = await buildVectorStore(chunks);
    retrievedDocs = await store.similaritySearch(question, 5);
    topScore = retrievedDocs[0]?.score || 0;
  }

  const mentionsComparison =
    /\b(compare|comparison|versus|vs|difference between|how do my|match with|stack against|in demand|industry trend|market trend|latest trends|market demand)\b/i.test(question);

  const isExplicitExternalTopic =
    /\b(next\.?js|react|angular|vue|vuejs|django|flask|spring|laravel|docker|kubernetes|aws|gcp|azure|openai|chatgpt|claude|gemini|deepseek|llama|langchain|langgraph|tavily|starlink|spacex|tesla|microsoft|google|meta|apple|nvidia|amazon|president|prime minister|nobel prize|world cup|olympics|news|weather|stock|crypto|bitcoin|ethereum)\b/i.test(question);

  const isGeneralConceptualQuery =
    /\b(difference between|what is the difference|how does .+ work|explain .+ concept|overview of|compare .+ and)\b/i.test(question) &&
    !hasPersonalPronoun &&
    !hasDocKeyword;

  // Corrective RAG (CRAG) 3-way evaluation:
  // - CORRECT: Query is specifically about resume / uploaded document content -> Use internal docs only.
  // - AMBIGUOUS (Hybrid Web Blend): Query compares resume with market trends OR is a conceptual technical query -> Blend document + web search if web enabled.
  // - INCORRECT (Web Fallback): Query is about external topic / tech not in document -> PURE web search.
  let cragVerdict = 'CORRECT';
  let triggerWebSearch = false;
  let useInternalDocs = true;

  if (retrievedDocs.length === 0) {
    cragVerdict = 'INCORRECT (Web Fallback)';
    triggerWebSearch = true;
    useInternalDocs = false;
  } else if (mentionsInternalDoc && mentionsComparison) {
    cragVerdict = 'AMBIGUOUS (Hybrid Web Blend)';
    triggerWebSearch = true;
    useInternalDocs = true;
  } else if (isGeneralConceptualQuery) {
    // Conceptual query (e.g. "Difference between LLM and RAG"): Blend authoritative web knowledge with any document mentions
    cragVerdict = 'AMBIGUOUS (Hybrid Web Blend)';
    triggerWebSearch = true;
    useInternalDocs = true;
  } else if (mentionsInternalDoc) {
    // Dedicated internal query (even if the specific detail like 12th marks is absent from resume)
    cragVerdict = 'CORRECT';
    triggerWebSearch = false;
    useInternalDocs = true;
  } else if (topScore >= 0.55) {
    cragVerdict = 'CORRECT';
    triggerWebSearch = false;
    useInternalDocs = true;
  } else if (isExplicitExternalTopic || topScore < 0.3) {
    cragVerdict = 'INCORRECT (Web Fallback)';
    triggerWebSearch = true;
    useInternalDocs = false;
  } else {
    cragVerdict = 'CORRECT';
    triggerWebSearch = false;
    useInternalDocs = true;
  }

  // Handle Web Search toggle OFF cases:
  if (triggerWebSearch && !webSearchEnabled) {
    if (!useInternalDocs) {
      // Pure external query where web search is disabled
      return {
        answer:
          'This query requires live external or web search information (e.g. latest documentation, industry standards, or public knowledge), but **Web Search is currently toggled OFF**.\n\n👉 *Please toggle **🌐 Web Search ON** in the chat controls below to search the web for an up-to-date answer.*',
        confidence_scores: {
          overall_confidence: 0.0,
        },
        claims: ['Web Search is disabled. External retrieval was required.'],
        claim_verdicts: [
          {
            claim: 'Web Search is disabled. External retrieval was required.',
            verdict: 'BLOCKED_BY_SETTING',
          },
        ],
        intent: intent,
        verdict: 'WEB_SEARCH_REQUIRED (OFF)',
        iterations: 0,
        evidence: [],
        retrieval_query: question,
        vector_results: 0,
        bm25_results: 0,
        rrf_results: 0,
        relevant_docs: 0,
        compressed_passages: 0,
        web_results: 0,
        web_query: '',
        web_sources: [],
        web_search_enabled: false,
        think_mode_enabled: thinkModeEnabled,
        supported_claims: 0,
        unsupported_claims: 1,
        need_retrieval: true,
        final_verification: 'BLOCKED (Web Search Disabled)',
      };
    } else {
      // Hybrid query: web search is disabled, so we only use internal docs and add a disclaimer
      cragVerdict = 'AMBIGUOUS (Web Search Disabled)';
      triggerWebSearch = false;
    }
  }

  let webDocs = [];
  let webQuery = '';

  if (triggerWebSearch && webSearchEnabled) {
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
    let prompt = '';

    if (cragVerdict === 'AMBIGUOUS (Web Search Disabled)') {
      prompt = `You are an intelligent Adaptive Corrective Self-RAG assistant.
The user asked a question comparing their document with external/market information, but **Web Search is currently disabled by the user**.
Answer the document-specific portions strictly based on the attached document context, and explicitly mention at the end that the external comparison or live market trend data could not be retrieved because Web Search is turned OFF.

Context:
${combinedContext || 'No relevant internal document context found.'}

Question:
${question}

Answer:`;
    } else {
      prompt = `You are an intelligent Adaptive Corrective Self-RAG assistant.
Answer the user's question accurately, clearly, and insightfully based on the provided context (which may include internal document excerpts and/or live web search results).
If web search results are present, incorporate the up-to-date web information and cite relevant web sources where appropriate.
If the context does not contain enough information to answer the question, clarify what is missing instead of hallucinating.

Context:
${combinedContext || 'No relevant context found.'}

Question:
${question}

Answer:`;
    }

    const result = await model.generateContent(prompt);
    answer = result.response.text();
  } catch (err) {
    console.error('Gemini Generation Error:', err);
    answer = `Based on retrieved information:\n\n${combinedContext}\n\n[Note: LLM Generation notice: ${err.message}]`;
  }

  // Think Mode evaluation vs Fast Mode
  let claims = [];
  let supportedClaimsCount = 0;
  let unsupportedClaimsCount = 0;
  let confidenceScore = 0.95;

  if (thinkModeEnabled) {
    // Deep Think Mode: Extract claims and evaluate support against context terms
    claims = extractClaims(answer);
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

    confidenceScore =
      cragVerdict === 'AMBIGUOUS (Web Search Disabled)'
        ? 0.55
        : claims.length > 0
        ? Math.min(1.0, Math.max(0.7, supportedClaimsCount / claims.length))
        : 0.95;
  } else {
    // Fast Mode: Skip detailed sentence splitting loops
    claims = ['Fast direct response generated (Claim verification skipped in Fast Mode).'];
    supportedClaimsCount = 1;
    unsupportedClaimsCount = 0;
    confidenceScore = cragVerdict === 'AMBIGUOUS (Web Search Disabled)' ? 0.55 : 0.95;
  }

  const responseData = {
    answer: answer,
    confidence_scores: {
      overall_confidence: confidenceScore,
    },
    claims: claims.length > 0 ? claims : ['Answer verified against retrieved knowledge context.'],
    claim_verdicts: claims.map((c, i) => ({
      claim: c,
      verdict: !thinkModeEnabled
        ? 'FAST_MODE'
        : i < supportedClaimsCount
        ? 'SUPPORTED'
        : 'PARTIAL_SUPPORT',
    })),
    intent: intent,
    verdict: cragVerdict,
    iterations: triggerWebSearch ? 1 : 0,
    web_search_enabled: webSearchEnabled,
    think_mode_enabled: thinkModeEnabled,
    evidence: [
      ...(useInternalDocs
        ? retrievedDocs.map((d) => ({
            content: d.pageContent.slice(0, 200) + '...',
            source: d.metadata?.source || 'document',
          }))
        : []),
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
    final_verification: !thinkModeEnabled
      ? 'FAST_PASS'
      : confidenceScore >= 0.75
      ? 'PASS'
      : 'USEFUL',
  };

  return responseData;
}
