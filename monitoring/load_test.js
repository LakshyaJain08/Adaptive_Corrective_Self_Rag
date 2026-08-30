/**
 * ACSRAG Load & Latency Benchmark Script
 * Forward Deployed Engineering performance validation tool.
 */

const http = require('http');

const BASE_URL = process.env.ACSRAG_URL || 'http://localhost:3000';
const CONCURRENT_USERS = parseInt(process.env.CONCURRENCY || '2', 10);
const TOTAL_REQUESTS = parseInt(process.env.TOTAL_REQUESTS || '4', 10);

const TEST_QUERIES = [
  "What is the candidate name and email in the resume?",
  "According to NexaAI Solutions leave policy, how many sick leaves are allowed?",
  "LLM vs RAG",
  "What are the main issues in code generator design?"
];

function sendQuery(query) {
  return new Promise((resolve) => {
    const postData = JSON.stringify({
      question: query,
      webSearch: false,
      thinkMode: false,
      sessionId: 'fde-benchmark-session'
    });
    const url = new URL(`${BASE_URL}/api/chat`);
    const start = Date.now();

    const req = http.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: 30000
    }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        const latency = Date.now() - start;
        resolve({
          statusCode: res.statusCode,
          latency,
          success: res.statusCode === 200
        });
      });
    });

    req.on('error', (err) => {
      resolve({ statusCode: 0, latency: Date.now() - start, success: false, error: err.message });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ statusCode: 408, latency: Date.now() - start, success: false, error: 'Timeout' });
    });

    req.write(postData);
    req.end();
  });
}

function calculatePercentile(arr, p) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

async function runLoadTest() {
  console.log(`\n======================================================`);
  console.log(`🧪 [FDE LOAD TEST] Launching Benchmark Suite`);
  console.log(`   Target: ${BASE_URL}/api/chat`);
  console.log(`   Total Requests: ${TOTAL_REQUESTS} | Concurrency: ${CONCURRENT_USERS}`);
  console.log(`======================================================\n`);

  const results = [];
  let completed = 0;
  const queue = Array.from({ length: TOTAL_REQUESTS }, (_, i) => TEST_QUERIES[i % TEST_QUERIES.length]);

  async function worker() {
    while (queue.length > 0) {
      const q = queue.shift();
      const res = await sendQuery(q);
      results.push(res);
      completed++;
      process.stdout.write(`\rProgress: ${completed}/${TOTAL_REQUESTS} requests completed...`);
    }
  }

  const startTime = Date.now();
  const workers = Array.from({ length: CONCURRENT_USERS }, () => worker());
  await Promise.all(workers);
  const totalDurationSec = (Date.now() - startTime) / 1000;

  const latencies = results.map(r => r.latency);
  const successful = results.filter(r => r.success).length;
  const failed = results.length - successful;

  const avgLatency = Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length);
  const p50 = calculatePercentile(latencies, 50);
  const p90 = calculatePercentile(latencies, 90);
  const p95 = calculatePercentile(latencies, 95);
  const p99 = calculatePercentile(latencies, 99);
  const rps = (TOTAL_REQUESTS / totalDurationSec).toFixed(2);

  console.log(`\n\n======================================================`);
  console.log(`📊 [BENCHMARK RESULTS SUMMARY]`);
  console.log(`======================================================`);
  console.log(`• Total Requests:    ${TOTAL_REQUESTS}`);
  console.log(`• Successful:        ${successful} (${((successful/TOTAL_REQUESTS)*100).toFixed(1)}%)`);
  console.log(`• Failed:            ${failed}`);
  console.log(`• Total Duration:    ${totalDurationSec.toFixed(2)}s`);
  console.log(`• Throughput (RPS):  ${rps} req/sec`);
  console.log(`------------------------------------------------------`);
  console.log(`• Avg Latency:       ${avgLatency} ms`);
  console.log(`• P50 Latency:       ${p50} ms`);
  console.log(`• P90 Latency:       ${p90} ms`);
  console.log(`• P95 Latency:       ${p95} ms`);
  console.log(`• P99 Latency:       ${p99} ms`);
  console.log(`======================================================\n`);
}

runLoadTest();
