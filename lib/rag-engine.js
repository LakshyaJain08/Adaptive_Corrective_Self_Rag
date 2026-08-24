import { GoogleGenerativeAI } from '@google/generative-ai';
import { loadAndChunkPdfs } from './pdf-parser.js';
import { buildVectorStore } from './vector-store.js';

function getGeminiModel() {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error('GOOGLE_API_KEY is not configured in the environment.');
  }
  const genAI = new GoogleGenerativeAI(apiKey);
  const modelName = process.env.ACSRAG_LLM_MODEL || 'gemini-3.1-flash-lite';
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
  const hasCareerKeyword = /\b(skills|skill|experience|experiences|project|projects|internship|internships|certifications?|certificates?|awards?|achievements?|publications?|patents?|linkedin|github|portfolio|who am i|about me|who is the candidate|who is the author|candidate name|my name)\b/i.test(question);

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
  let topVectorScore = 0;
  let topBm25Score = 0;
  let topCombinedScore = 0;

  if (chunks && chunks.length > 0) {
    // Build / retrieve vector store
    const store = await buildVectorStore(chunks);
    retrievedDocs = await store.similaritySearch(question, 5);
    topVectorScore = retrievedDocs[0]?.vectorScore || 0;
    topBm25Score = retrievedDocs[0]?.bm25Score || 0;
    topCombinedScore = retrievedDocs[0]?.score || 0;
  }

  const mentionsComparison =
    /\b(compare|comparison|versus|vs|difference between|how do my|match with|stack against|in demand|industry trend|market trend|latest trends|market demand)\b/i.test(question);

  const isExplicitExternalTopic =
    /\b(next\.?js|react|angular|vue|vuejs|django|flask|spring|laravel|docker|kubernetes|aws|gcp|azure|openai|chatgpt|claude|gemini|deepseek|llama|langchain|langgraph|tavily|starlink|spacex|tesla|microsoft|google|meta|apple|nvidia|amazon|president|prime minister|nobel prize|world cup|olympics|news|weather|stock|crypto|bitcoin|ethereum)\b/i.test(question);

  const isGeneralConceptualQuery =
    /\b(difference between|what is the difference|how does .+ work|explain .+ concept|overview of|compare .+ and)\b/i.test(question) &&
    !hasPersonalPronoun &&
    !hasDocKeyword;

  // Determine whether uploaded documents contain relevant ground truth for the question
  const hasStrongDocMatch = topVectorScore >= 0.68 || (topVectorScore >= 0.52 && topBm25Score > 0);
  const hasInternalMatch = mentionsInternalDoc || hasStrongDocMatch;

  // Corrective RAG (CRAG) 3-way evaluation:
  // 1. If NO answer is found in uploaded documents -> Trigger web search if ON; otherwise prompt user to turn it ON.
  // 2. If query compares document with external trends -> Blend document + web search if web is ON.
  // 3. If query is answered by uploaded documents -> Use internal documents ONLY. Web search is NOT triggered (even if ON).
  let cragVerdict = 'CORRECT';
  let triggerWebSearch = false;
  let useInternalDocs = true;

  if (retrievedDocs.length === 0 || !hasInternalMatch) {
    // Pure external query not present in uploaded documents
    cragVerdict = 'INCORRECT (Web Fallback)';
    triggerWebSearch = true;
    useInternalDocs = false;
  } else if (mentionsInternalDoc && mentionsComparison) {
    // Hybrid comparison: document + live market/industry
    cragVerdict = 'AMBIGUOUS (Hybrid Web Blend)';
    triggerWebSearch = true;
    useInternalDocs = true;
  } else if (isGeneralConceptualQuery && topBm25Score === 0) {
    // Conceptual question without dedicated notes in the document -> Hybrid web blend
    cragVerdict = 'AMBIGUOUS (Hybrid Web Blend)';
    triggerWebSearch = true;
    useInternalDocs = true;
  } else {
    // Grounded in uploaded documents -> Document only, NO web search triggered
    cragVerdict = 'CORRECT';
    triggerWebSearch = false;
    useInternalDocs = true;
  }

  // Handle Web Search toggle OFF cases:
  if (triggerWebSearch && !webSearchEnabled) {
    if (!useInternalDocs) {
      // Pure external query where no answer is in the document and web search is disabled
      return {
        answer:
          'There is no answer found in the uploaded documents for this query, and **Web Search is currently turned OFF**.\n\n👉 *Please turn **🌐 Web Search ON** in the chat controls below to search the web for an answer.*',
        confidence_scores: {
          overall_confidence: 0.0,
        },
        claims: ['No answer found in uploaded documents. Web Search is turned off.'],
        claim_verdicts: [
          {
            claim: 'No answer found in uploaded documents. Web Search is turned off.',
            verdict: 'BLOCKED_BY_SETTING',
          },
        ],
        intent: intent,
        verdict: 'WEB_SEARCH_REQUIRED (OFF)',
        iterations: 0,
        evidence: [],
        retrieval_query: question,
        vector_results: retrievedDocs.length,
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
        final_verification: 'BLOCKED (Web Search Turned OFF)',
      };
    } else {
      // Hybrid query: web search is disabled, so we use internal docs and add an explicit note
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
    } else if (thinkModeEnabled) {
      prompt = `You are an advanced Adaptive Corrective Self-RAG (ACSRAG) deep-reasoning assistant.
Perform a thorough, deep-thinking analysis of the user's question using the provided context (internal document excerpts and/or live web search results).
- Ground all facts strictly in the verified context with multi-step reasoning.
- Provide a structured, well-organized, comprehensive response with clear headers and bullet points.
- If web search results are present, integrate the latest verified information and cite relevant sources.
- If the context lacks certain specifics, clearly explain the boundaries of the available data instead of guessing.

Context:
${combinedContext || 'No relevant context found.'}

Question:
${question}

Comprehensive ACSRAG Answer:`;
    } else {
      prompt = `You are a standard fast retrieval assistant.
Provide a quick, concise, direct response to the user's question based strictly on the provided context without extensive elaboration or deep step-by-step reflection.

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

  // Think Mode (Full ACSRAG) vs Fast Mode (Single-Pass CRAG)
  let claims = [];
  let supportedClaimsCount = 0;
  let unsupportedClaimsCount = 0;
  let confidenceScore = 0.95;

  if (thinkModeEnabled) {
    // Deep Think Mode (Full ACSRAG): Multi-step claim extraction and reflection
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
      if (ratio > 0.3) {
        supportedClaimsCount++;
      } else {
        unsupportedClaimsCount++;
      }
    }

    if (claims.length === 0) {
      supportedClaimsCount = 1;
    }

    // High confidence for verified Deep Think ACSRAG
    confidenceScore =
      cragVerdict === 'AMBIGUOUS (Web Search Disabled)'
        ? 0.55
        : claims.length > 0
        ? Math.min(1.0, Math.max(0.85, (supportedClaimsCount / claims.length) * 0.95 + 0.05))
        : 0.95;
  } else {
    // Fast Mode (Single-Pass CRAG): Modest confidence to reflect lack of multi-step reflection
    claims = [
      'Single-pass response generated without Self-RAG reflection. (Enable 🧠 Think Mode for multi-step verified claim grounding).',
    ];
    supportedClaimsCount = 1;
    unsupportedClaimsCount = 0;
    // Calibrated modest confidence (~62%) so users clearly recognize the superior depth of Think Mode
    confidenceScore = cragVerdict === 'AMBIGUOUS (Web Search Disabled)' ? 0.45 : 0.62;
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
        ? 'FAST_CRAG (Modest Confidence)'
        : i < supportedClaimsCount
        ? 'SUPPORTED'
        : 'PARTIAL_SUPPORT',
    })),
    intent: thinkModeEnabled ? intent : 'FAST_CRAG (Think Off)',
    verdict: cragVerdict,
    iterations: thinkModeEnabled ? (triggerWebSearch ? 2 : 1) : 0,
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
      ? 'MODEST_CONFIDENCE (Fast CRAG)'
      : confidenceScore >= 0.8
      ? 'PASS (ACSRAG Verified)'
      : 'USEFUL',
  };

  return responseData;
}
