# Forward Deployed Engineer (FDE) Operational Runbook

## 1. System Architecture & Topology

`
                         Internet / Client Browser
                                    │
                                    ▼
                         ┌─────────────────────┐
                         │   Nginx (Port 80)   │
                         │    Reverse Proxy    │
                         └──────────┬──────────┘
                                    │
                                    ▼
                 ┌──────────────────────────────────────┐
                 │  Docker Container: acsrag_container  │
                 │  Next.js Standalone (Port 3000)      │
                 │  ├─ UI: React 19 Client App          │
                 │  ├─ API: App Router Server Routes    │
                 │  └─ Engine: Hybrid RAG + BM25 + CRAG │
                 └──────────────────┬───────────────────┘
                                    │
                  ┌─────────────────┴─────────────────┐
                  ▼                                   ▼
        Google Gemini AI API                Tavily Search API
   (Embeddings + Flash-Lite Gen)           (Live Web Fallback)
`

---

## 2. Health & Readiness Verification

### Endpoints
* **Liveness Probe**: GET /api/health
  * Response 200 OK: { status: healthy, uptime_seconds: 1240 }
* **Readiness Probe**: GET /api/ready
  * Response 200 OK: { ready: true, services: { gemini_configured: true, tavily_configured: true, documents_loaded: 3 } }
* **Telemetry Metrics**: GET /api/metrics
  * Response 200 OK: Returns real-time heap allocation, resident memory (RSS), CPU count, and free system memory.

---

## 3. Incident Response & Troubleshooting Playbooks

### Issue 1: Container Fails Readiness Probe (503 Service Unavailable)
* **Symptom**: /api/ready returns eady: false.
* **Root Cause**: GOOGLE_API_KEY is missing or invalid.
* **Resolution**:
  1. Inspect container environment: docker exec -it acsrag_container env | grep API_KEY
  2. Update .env file on host with valid key: GOOGLE_API_KEY=AIzaSy...
  3. Restart container: docker compose restart

### Issue 2: Memory Spike / High Heap Allocation
* **Symptom**: heap_used_mb in /api/metrics > 512MB.
* **Root Cause**: Excessive concurrent large PDF embeddings or chunk parsing.
* **Resolution**:
  1. Check container memory usage: docker stats acsrag_container
  2. Verify vector store cache persistence in ./documents.
  3. Set memory limits in docker-compose.yml (mem_limit: 1024m).

### Issue 3: External API Rate Limiting (Gemini 429)
* **Symptom**: Requests return 429 Too Many Requests.
* **Root Cause**: Exceeding Gemini free tier RPM limits.
* **Resolution**:
  1. RAG engine is pre-configured with fallback to gemini-3.1-flash-lite and exponential backoff retry.
  2. Ensure think mode is only enabled on deep analytical questions.

---

## 4. Operational Monitoring Commands

`ash
# View live container stream logs
docker compose logs -f --tail=100 acsrag-app

# Run continuous FDE health monitor
node monitoring/monitor.js

# Run latency & load stress test
node monitoring/load_test.js
`
