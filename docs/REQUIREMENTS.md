# Software Requirements Specification (SRS)
## System Requirements for Adaptive Corrective Self-RAG (ACSRAG)

---

## 1. Introduction & Purpose
This document provides a testable and comprehensive Software Requirements Specification (SRS) for the **Adaptive Corrective Self-RAG (ACSRAG)** platform. It specifies functional and non-functional requirements, data schemas, security boundaries, performance thresholds, and testable acceptance criteria.

---

## 2. User Roles & Permission Matrix

| Role | Permissions & Capabilities | Access Level |
| :--- | :--- | :--- |
| **Anonymous User / Client** | Submit queries, toggle Think Mode, toggle Web Search, upload session PDFs, manage local chat history. | Frontend Web UI / Session Scope |
| **System Orchestrator / Worker** | Access backend RAG pipeline, query vector index, call Gemini & Tavily APIs, compute claim audit metrics. | Service Runtime (`nextjs:1001`) |
| **Site Reliability Engineer / FDE** | Poll `/api/health`, `/api/ready`, `/api/metrics`, view Docker container logs, execute load benchmarks. | Ops / Monitoring Scope |

---

## 3. Functional Requirements

### 3.1 Document Ingestion & Hybrid Indexing
* **FR-1.1**: The system **SHALL** accept PDF documents uploaded via `/api/upload` or read from the `./documents/` directory.
* **FR-1.2**: Text extraction **SHALL** preserve document structure, heading boundaries, and metadata (filename, page numbers, chunk index).
* **FR-1.3**: Chunking **SHALL** split text into overlapping windows of $500$ tokens with $100$ token overlap.
* **FR-1.4**: The system **SHALL** compute Gemini 3072-dimensional vector embeddings (`text-embedding-004` / `gemini-embedding-001`) and build an in-memory sparse BM25 token index concurrently.
* **FR-1.5**: Chunk 0 of any document containing metadata/header headers **SHALL** receive an explicit rank bias (Root Anchor Boost).

### 3.2 Adaptive Intent Classification & Routing
* **FR-2.1**: The system **SHALL** classify each inbound user prompt into one of three primary intents:
  1. `FACTUAL_QA`: Specific query answerable via document knowledge.
  2. `CONCEPTUAL_DISAMBIGUATION`: High-level definitions or comparative analysis.
  3. `WEB_SEARCH_FALLBACK`: External, temporal, or out-of-corpus queries.
* **FR-2.2**: If the user prompt requires web knowledge and `webSearch` toggle is `true`, the system **SHALL** execute a Tavily search API query with $K=3$ results.

### 3.3 Corrective RAG (CRAG) Document Relevance Grading
* **FR-3.1**: Prior to generation, retrieved chunks **SHALL** be evaluated against the query using a fast grading prompt.
* **FR-3.2**: Chunks with relevance scores $\ge 0.70$ are graded `CORRECT`. Chunks between $0.40$ and $0.69$ are graded `AMBIGUOUS`. Chunks $< 0.40$ are graded `INCORRECT`.
* **FR-3.3**: Chunks graded `INCORRECT` **SHALL** be purged from the prompt context.

### 3.4 Self-RAG Generation & Claim-Level Auditing
* **FR-4.1**: Generation **SHALL** execute using Gemini 2.5 Flash with strict temperature control ($T=0.2$).
* **FR-4.2**: When Think Mode is enabled, the system **SHALL** extract discrete atomic factual claims from the draft response.
* **FR-4.3**: Each claim **SHALL** be verified against retrieved context and labeled as `SUPPORTED`, `UNSUPPORTED`, or `CONTRADICTORY`.
* **FR-4.4**: The system **SHALL** compute an aggregate `overall_confidence` score between $0.00$ and $1.00$.
* **FR-4.5**: If hallucination is detected (confidence $< 0.50$), the system **SHALL** refine the query and execute a secondary retrieval pass (Maximum **2 iterations** strictly enforced).

### 3.5 Telemetry & Observability Endpoints
* **FR-5.1**: `GET /api/health` **SHALL** return `200 OK` with JSON `{ status: "healthy", uptime_seconds, environment }`.
* **FR-5.2**: `GET /api/ready` **SHALL** return `200 OK` only when API keys are configured and vector documents are indexed.
* **FR-5.3**: `GET /api/metrics` **SHALL** expose system memory (total, free), Node.js heap allocation (`heap_used_mb`, `rss_mb`), and CPU core count.

---

## 4. Non-Functional Requirements & Performance SLAs

| Requirement Area | Metric / Threshold | Verification Method |
| :--- | :--- | :--- |
| **P50 Query Latency** | $\le 1500\text{ ms}$ (Single-pass RAG) | `monitoring/load_test.js` |
| **P95 Query Latency** | $\le 12000\text{ ms}$ (2-pass Self-RAG reflection) | Stress Test Benchmarks |
| **Memory Footprint** | Heap $\le 100\text{ MB}$, RSS $\le 250\text{ MB}$ | `GET /api/metrics` |
| **Container Startup Time** | $\le 5.0\text{ seconds}$ from cold start | Docker Compose Healthcheck |
| **Concurrent Load** | 10 concurrent active sessions without socket exhaustion | HTTP Load Testing |

---

## 5. Security, Privacy & Boundary Protection
* **SEC-1**: All retrieved third-party or PDF context **SHALL** be isolated inside `<UNTRUSTED_DOCUMENT_CONTEXT>` boundary delimiters to prevent prompt injection and instruction hijack.
* **SEC-2**: API keys (`GOOGLE_API_KEY`, `TAVILY_API_KEY`) **SHALL NEVER** be committed to Git or baked into client-side JS bundles. Keys must be injected via runtime environment variables.
* **SEC-3**: Docker container **SHALL** run under an unprivileged non-root user (`USER nextjs`, UID 1001).
