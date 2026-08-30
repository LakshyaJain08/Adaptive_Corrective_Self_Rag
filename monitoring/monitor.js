/**
 * ACSRAG Forward Deployed Engineering (FDE) Continuous Monitor
 * Periodically polls /api/health, /api/ready, /api/metrics, and logs health metrics.
 */

const http = require('http');

const BASE_URL = process.env.ACSRAG_URL || 'http://localhost:3000';
const INTERVAL_MS = parseInt(process.env.MONITOR_INTERVAL_MS || '10000', 10);

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    http.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        const latencyMs = Date.now() - start;
        try {
          const json = JSON.parse(data);
          resolve({ status: res.statusCode, latencyMs, data: json });
        } catch (e) {
          resolve({ status: res.statusCode, latencyMs, raw: data });
        }
      });
    }).on('error', (err) => {
      resolve({ status: 0, latencyMs: Date.now() - start, error: err.message });
    });
  });
}

async function runHealthCheck() {
  const timestamp = new Date().toISOString();
  console.log(\n======================================================);
  console.log([FDE MONITOR] Health Check at );
  console.log(======================================================);

  const [health, ready, metrics] = await Promise.all([
    fetchJson(${BASE_URL}/api/health),
    fetchJson(${BASE_URL}/api/ready),
    fetchJson(${BASE_URL}/api/metrics)
  ]);

  console.log(🔍 [Liveness]  /api/health  -> Status:  (ms));
  if (health.data) console.log(   └─ Uptime: s | Status: );

  console.log(🔍 [Readiness] /api/ready   -> Status:  (ms));
  if (ready.data) {
    console.log(   └─ Gemini Configured:  | Docs Loaded:  | Memory: MB);
  }

  console.log(🔍 [Metrics]   /api/metrics -> Status:  (ms));
  if (metrics.data) {
    console.log(   └─ CPU Count:  | Free RAM: MB / MB | Heap Used: MB);
  }

  const isHealthy = health.status === 200 && ready.status === 200;
  if (isHealthy) {
    console.log(✅ [SYSTEM STATUS: OPERATIONAL & READY]);
  } else {
    console.warn(⚠️ [SYSTEM ALERT: DEGRADED OR UNREADY] Check configuration or backend services.);
  }
}

console.log(🚀 Starting ACSRAG Forward Deployed Monitor targeting ...);
runHealthCheck();
setInterval(runHealthCheck, INTERVAL_MS);
