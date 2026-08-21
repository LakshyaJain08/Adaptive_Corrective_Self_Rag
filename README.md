# ACSRAG (Adaptive Corrective Self-RAG) 🚀

ACSRAG is a full-stack, AI-powered document intelligence platform that allows users to upload PDF documents and interrogate them using advanced **Adaptive Corrective Retrieval-Augmented Generation (Self-RAG)** techniques.

The application has been unified into a single **Next.js Fullstack Application**, combining the interactive frontend and intelligent backend API routes into one seamless project. Running `npm run dev` starts the entire system on a single port.

---

## 🌟 Key Features

* **Unified Fullstack Architecture**: Frontend UI and Backend APIs (`/api/upload`, `/api/documents`, `/api/chat`) run together under Next.js.
* **Advanced Adaptive Self-RAG Pipeline**:
  * Intent classification (Factual / Analytical / Conversational).
  * Hybrid retrieval with Vector Cosine Similarity and BM25 term scoring.
  * Context extraction & grounding with Google Gemini.
  * Automated claim extraction and factuality verification.
* **Interactive Process Trace**: Real-time visual breakdown of the model's retrieval and reasoning steps (Vector matches, BM25 scores, RRF fusion, Context compression, and Self-RAG verification).
* **Dynamic Knowledge Base**: Upload and manage multiple PDF documents with instant vector indexing.
* **Glassmorphism UI**: High-fidelity dark mode interface with resizable workspace and animated feedback indicators.
* **Session Rate Limiting**: Built-in cookie session tracking limiting demo usage to 3 questions per session.

---

## 🛠️ Tech Stack

* **Framework**: Next.js 15 (App Router), React 19
* **Styling**: Vanilla CSS (Modern Glassmorphism & Micro-animations)
* **Icons**: Lucide React
* **AI & LLM**: Google Gemini API (`@google/generative-ai`)
* **Document Ingestion**: `pdf-parse` & in-memory vector store

---

## 🚀 Getting Started

### 1. Prerequisites
* **Node.js** (v18+)
* A **Google Gemini API Key** (set in `.env` or `.env.local` as `GOOGLE_API_KEY=...`)

### 2. Installation & Run
From the project root directory:

```bash
# Install dependencies
npm install

# Start the fullstack development server (Frontend + Backend)
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 📂 Project Structure

```text
ACSRAG/
├── app/
│   ├── api/
│   │   ├── chat/route.js              # RAG inference & verification endpoint
│   │   ├── documents/
│   │   │   ├── route.js              # List uploaded documents
│   │   │   └── [filename]/route.js   # Delete document endpoint
│   │   └── upload/route.js           # Multi-file PDF upload & chunker
│   ├── globals.css                   # Glassmorphism dark styles & animations
│   ├── layout.jsx                    # Root layout & Inter font
│   └── page.jsx                      # Unified ACSRAG chat & workspace UI
├── lib/
│   ├── pdf-parser.js                 # PDF text extraction & chunking
│   ├── vector-store.js               # Embeddings & similarity search
│   └── rag-engine.js                 # Self-RAG pipeline & process trace
├── documents/                        # Uploaded PDF document storage
├── package.json                      # Unified npm scripts & dependencies
├── next.config.mjs                   # Next.js configuration
├── usage_counts.json                 # Demo rate limit counter
└── .env                              # API keys (GOOGLE_API_KEY)
```

---

## 📝 License
This project is for demonstration and educational purposes. Feel free to use and modify it as you see fit!
