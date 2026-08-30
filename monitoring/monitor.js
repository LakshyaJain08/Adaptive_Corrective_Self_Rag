/**
 * ACSRAG Forward Deployed Engineering (FDE) Continuous Monitor
 * Periodically polls /api/health, /api/ready, /api/metrics, and logs health metrics.
 */

const http = require('http');

const BASE_URL = process.env.ACSRAG_URL || 'http://localhost:3000';
const INTERVAL_MS = parseInt(process.env.MONITOR_INTERVAL_MS || '10000', 10);

function fetchJson(url) {
  return new Promise((resolve) => {
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
  console.log('\n======================================================');
  console.log('[FDE MONITOR] Health Check at ' + timestamp);
  console.log('======================================================');

  const [health, ready, metrics] = await Promise.all([
    fetchJson(BASE_URL + '/api/health'),
    fetchJson(BASE_URL + '/api/ready'),
    fetchJson(BASE_URL + '/api/metrics')
  ]);

  console.log('🔍 [Liveness]  /api/health  -> Status: ' + health.status + ' (' + health.latencyMs + 'ms)');
  if (health.data) {
    console.log('   └─ Uptime: ' + health.data.uptime_seconds + 's | Status: ' + health.data.status + ' | Env: ' + health.data.environment);
  } else if (health.error) {
    console.log('   └─ Error: ' + health.error);
  }

  console.log('🔍 [Readiness] /api/ready   -> Status: ' + ready.status + ' (' + ready.latencyMs + 'ms)');
  if (ready.data) {
    console.log('   └─ Gemini: ' + (ready.data.services?.gemini_configured ? 'Ready' : 'Missing') + ' | Tavily: ' + (ready.data.services?.tavily_configured ? 'Ready' : 'Disabled') + ' | Docs: ' + ready.data.services?.documents_loaded + ' | Memory: ' + ready.data.memory_usage_mb + 'MB');
  } else if (ready.error) {
    console.log('   └─ Error: ' + ready.error);
  }

  console.log('🔍 [Metrics]   /api/metrics -> Status: ' + metrics.status + ' (' + metrics.latencyMs + 'ms)');
  if (metrics.data) {
    console.log('   └─ Platform: ' + metrics.data.system?.platform + ' | CPUs: ' + metrics.data.system?.cpus + ' | Free RAM: ' + metrics.data.system?.free_memory_mb + 'MB | Heap: ' + metrics.data.process?.heap_used_mb + 'MB');
  } else if (metrics.data === undefined && metrics.error) {
    console.log('   └─ Error: ' + metrics.error);
  }

  const isHealthy = health.status === 200 && ready.status === 200;
  if (isHealthy) {
    console.log('✅ [SYSTEM STATUS: OPERATIONAL & READY]');
  } else {
    console.log('⚠️ [SYSTEM ALERT: DEGRADED OR UNREADY] Check configuration or backend services.');
  }
}

console.log('🚀 Starting ACSRAG Forward Deployed Monitor targeting ' + BASE_URL + ' (Interval: ' + (INTERVAL_MS / 1000) + 's)...');
runHealthCheck();
setInterval(runHealthCheck, INTERVAL_MS);
