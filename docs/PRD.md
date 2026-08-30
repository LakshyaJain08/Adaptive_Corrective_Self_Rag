# Product Requirements Document (PRD)
## Adaptive Corrective Self-RAG (ACSRAG) Enterprise Intelligence Engine

---

## 1. Executive Summary & Problem Statement
Standard Retrieval-Augmented Generation (RAG) systems fail in mission-critical enterprise environments due to three fatal flaws:
1. **Context Insufficiency & Hallucinations**: Standard RAG blindly feeds top-$K$ vector chunks into LLM prompts without verifying relevance, causing high hallucination rates (~22.4%) when queries are complex or out-of-domain.
2. **Dense Vector Blindspots**: Traditional dense vector embeddings (cosine similarity) frequently drop header data, candidate identities, contact lines, and keyword-exact identifiers (e.g., policy numbers, names, email addresses).
3. **Runaway Latency / Loops**: Agentic self-reflection loops often lack bounded iteration ceilings, resulting in unpredictable API costs and response latencies exceeding 30 seconds.

**ACSRAG** solves these flaws by combining **Hybrid Dense + Sparse (BM25) Retrieval**, **Corrective RAG (CRAG) Document Relevance Grading**, and **Self-RAG Sentence-Level Claim Auditing** with a strict **2-Iteration Ceiling**.

---

## 2. Target Users & Personas
* **Enterprise Knowledge Workers**: Legal, HR, and technical staff requiring pinpoint accurate answers from internal policy documents, resumes, and manuals.
* **Forward Deployed Engineers (FDEs)**: Engineers deploying bespoke AI solutions on client infrastructure requiring high observability, health probes, and deterministic SLAs.
* **Compliance & Audit Officers**: Stakeholders requiring explicit attribution, confidence scoring, and claim-level verification for every generated token.

---

## 3. Product Goals & Core Objectives
* **Zero-Hallucination Tolerance**: Achieve $<2\%$ hallucination rate via active sentence-level claim reflection.
* **Deterministic SLA**: Maintain **P50 query latency $<1.5\text{s}$** and bounded maximum latency under concurrent load.
* **100% Identity & Header Recall**: Guarantee chunk-0 identity recall using Root Anchor Boosting.
* **Adaptive Multi-Source Routing**: Automatically detect out-of-corpus queries and fall back to live web search when appropriate.

---

## 4. Feature Scope & MVP Definition

### In-Scope (MVP):
1. **Hybrid Dense + Sparse Search**: Reciprocal Rank Fusion (RRF) between Gemini 3072-dim embeddings and BM25 token indices.
2. **CRAG Document Relevance Grader**: High-speed evaluation classifying retrieved context as `CORRECT`, `AMBIGUOUS`, or `INCORRECT`.
3. **Adaptive Intent Routing**: Dynamic query classifier routing between Factual QA, Conceptual Disambiguation, and Web Search.
4. **Self-RAG Atomic Claim Auditor**: Automated extraction and verification of generated claims against source citations.
5. **Real-Time Streaming UI**: Next.js App Router frontend with real-time reasoning steps, chat history, document uploads, and Think Mode.
6. **Production Observability & Containerization**: `/api/health`, `/api/ready`, `/api/metrics` telemetry endpoints and multi-stage Docker containerization.

### Out-of-Scope (Post-MVP Roadmap):
* Multi-modal image/diagram optical OCR extraction (planned for v2.0).
* Distributed vector database integration (Pinecone/Milvus/Qdrant cluster) for corpora $>1,000,000$ documents.
* Multi-tenant role-based access control (RBAC) with SAML/SSO integration.

---

## 5. User Stories & Acceptance Criteria

| User Story ID | Persona | Action | Benefit / Acceptance Criteria |
| :--- | :--- | :--- | :--- |
| **US-01** | HR / Recruiter | Asks *"What is the candidate's email?"* | System utilizes Chunk-0 Root Boosting to return exact email with 100% recall and 0 hallucinations. |
| **US-02** | Knowledge Worker | Asks general tech comparison (*"LLM vs RAG"*) | CRAG detects out-of-corpus query; if Web Search is enabled, queries Tavily API; if disabled, provides actionable retry CTA. |
| **US-03** | FDE / DevOps | Deploys container to Kubernetes/Docker | Probes `GET /api/health` and `GET /api/ready` to verify container lifecycle and memory usage. |
| **US-04** | Compliance Lead | Inspects generated answer | Clicks **🧠 Think Mode** to view exact claim breakdown, source grounding flags, and overall confidence score. |

---

## 6. Key Performance Indicators & Success Metrics
* **Grounding Accuracy**: $\ge 98\%$ on benchmark validation datasets.
* **Hallucination Rate**: $\le 1.5\%$ across out-of-distribution queries.
* **Query Latency**: $\text{P50} \le 1.5\text{s}$, $\text{P95} \le 12.0\text{s}$ (including multi-step Self-RAG reflection).
* **Container Resource Footprint**: Memory RSS $< 150\text{MB}$, Alpine container image size $< 150\text{MB}$.

---

## 7. Assumptions & Technical Risks

| Risk / Constraint | Probability | Impact | Mitigation Strategy |
| :--- | :---: | :---: | :--- |
| **Gemini API Rate Limiting (429)** | Medium | High | Implement exponential backoff, batch rate throttling, and in-memory cache. |
| **Recursive Agentic Loop Creep** | Low | Critical | Hardcode strict **2-iteration ceiling** in `rag-engine.js`. |
| **Cold Start Vector Ingestion** | Low | Medium | Cache chunk embeddings and BM25 inverted index in memory. |
