# System Architecture Document
## Adaptive Corrective Self-RAG (ACSRAG)

---

## 1. Architectural Overview & Design Philosophy
The **ACSRAG** architecture is designed around deterministic, low-latency, and zero-hallucination document intelligence. Unlike naive RAG pipelines that execute a linear `Query -> Vector Search -> LLM Prompt` flow, ACSRAG implements a **closed-loop feedback control system** with dynamic intent routing, relevance grading (CRAG), and sentence-level claim auditing (Self-RAG).

```mermaid
flowchart TD
    User([👤 User Query]) --> Router{🧠 Adaptive Intent Classifier}
    
    %% Intent Routing
    Router -->|Factual / Specific QA| HybridSearch[🔍 Hybrid Dense + Sparse BM25 Search]
    Router -->|Conceptual / Compare| HybridSearch
    Router -->|Out of Corpus / Web| WebDecision{🌐 Web Search Enabled?}
    
    %% Web Fallback
    WebDecision -->|Yes| Tavily[📡 Tavily Web Search API]
    WebDecision -->|No| PromptWeb[⚠️ Suggest Web Search Toggle]
    
    %% CRAG Grading
    HybridSearch --> Grader{🛡️ CRAG Relevance Grader}
    Grader -->|CORRECT (Score ≥ 0.70)| ContextPool[📦 Verified Context Chunks]
    Grader -->|AMBIGUOUS (0.40 - 0.69)| ContextPool
    Grader -->|INCORRECT (< 0.40)| Purge[❌ Purge Chunk]
    Tavily --> ContextPool
    
    %% Generator & Self-RAG
    ContextPool --> LLM[⚡ Gemini 2.5 Flash Generation]
    LLM --> SelfRAG{🔎 Self-RAG Claim Auditor}
    
    %% Verification Loop
    SelfRAG -->|Supported (Confidence ≥ 0.50)| Output([✅ Verified Answer + Grounded Citations])
    SelfRAG -->|Hallucination Detected & Iterations < 2| Refine[🔄 Refine Query & Secondary Search]
    Refine --> HybridSearch
    SelfRAG -->|Iterations == 2| Output
```

---

## 2. Technology Stack & Component Specifications

| Layer | Technology | Rationale & Specifications |
| :--- | :--- | :--- |
| **Frontend UI** | Next.js 15 (App Router, React 19, Vanilla CSS) | SSR + Client hydration, fast rendering, zero heavy UI framework overhead. |
| **Backend Runtime** | Node.js v20 (Alpine Linux in Docker) | Lightweight asynchronous I/O with high concurrency throughput. |
| **Vector Embeddings** | Gemini `text-embedding-004` (3072-dim) | High semantic density with multi-lingual support. |
| **Sparse Token Index** | In-Memory Okapi BM25 Index | Exact keyword matching, contact info recall, and fast term frequency ranking. |
| **Fusion Algorithm** | Reciprocal Rank Fusion (RRF, $k=60$) | Combines dense and sparse ranking distributions deterministically. |
| **LLM Generation** | Gemini 2.5 Flash ($T=0.2$) | Low latency ($<1.0\text{s}$ TTFT) and strong structured JSON generation. |
| **External Search** | Tavily Search API | High signal-to-noise web context for enterprise AI pipelines. |
| **Container Engine** | Multi-Stage Docker (Next.js Standalone) | Final image size $\approx 120\text{MB}$, runs unprivileged `nextjs:1001`. |

---

## 3. Core Subsystem Architecture

### 3.1 Document Ingestion & Hybrid Vector Store
* **File Parser**: Reads binary PDFs, parses raw text streams, and attaches chunk sequence metadata.
* **Chunking Engine**: Recursive sliding window ($500$ tokens / $100$ token overlap).
* **Chunk-0 Root Bias**: The first chunk containing document metadata/headers is flagged with a permanent `rootAnchor = true` attribute to ensure candidate identity recall.
* **RRF Rank Fusion Formula**:
$$\text{RRF\_Score}(d) = \frac{w_{\text{dense}}}{k + \text{rank}_{\text{dense}}(d)} + \frac{w_{\text{sparse}}}{k + \text{rank}_{\text{sparse}}(d)} + \text{Bias}_{\text{root}}$$

### 3.2 Corrective RAG (CRAG) Relevance Grader
* Evaluates semantic alignment between query and chunk tokens using lightweight few-shot grading.
* Filters out irrelevant noise chunks before prompt assembly to reduce token costs and eliminate distractors.

### 3.3 Self-RAG Atomic Claim Auditor
* Deconstructs draft answers into discrete atomic factual statements:
$$A \longrightarrow \{c_1, c_2, \dots, c_n\}$$
* Each claim $c_i$ is matched against retrieved evidence chunks $E$:
$$\text{Verdict}(c_i, E) \in \{\text{SUPPORTED}, \text{UNSUPPORTED}, \text{CONTRADICTORY}\}$$
* Overall confidence is computed as:
$$\text{Confidence} = \frac{\sum \text{Weight}(c_i \text{ is SUPPORTED})}{n}$$

---

## 4. Security & Isolation Model

```
┌─────────────────────────────────────────────────────────────┐
│                    Docker Sandbox (Alpine)                  │
│                                                             │
│  ┌──────────────────┐               ┌────────────────────┐  │
│  │ Non-Root User    │  Environment  │ Strict Delimiters  │  │
│  │ UID: 1001 nextjs │  Isolation    │ <UNTRUSTED_DOCS>   │  │
│  └────────┬─────────┘               └─────────┬──────────┘  │
│           │                                   │             │
│           ▼                                   ▼             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ Next.js Standalone Node Server (Port 3000)            │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

1. **Non-Root Execution**: Container drops root privileges upon startup.
2. **Untrusted Data Compartmentalization**: All PDF and web strings are enclosed in explicit prompt boundaries to mitigate prompt injection.
3. **Stateless Secrets**: Keys are read from container environment (`process.env.GOOGLE_API_KEY`) and never logged or exposed in HTTP responses.

---

## 5. Telemetry & Reliability Architecture
* **Liveness Probe** (`/api/health`): Returns HTTP 200 indicating the event loop is active.
* **Readiness Probe** (`/api/ready`): Validates API keys, loaded PDF count, and memory health.
* **Metrics Telemetry** (`/api/metrics`): Real-time instrumentation reporting heap memory, RSS, and CPU utilization.
* **Continuous FDE Polling**: `monitoring/monitor.js` provides continuous 10s health monitoring for operational visibility.
