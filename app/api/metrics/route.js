import { NextResponse } from 'next/server';
import os from 'os';

export async function GET() {
  const memory = process.memoryUsage();
  return NextResponse.json({
    system: {
      platform: os.platform(),
      cpus: os.cpus().length,
      free_memory_mb: Math.round(os.freemem() / 1024 / 1024),
      total_memory_mb: Math.round(os.totalmem() / 1024 / 1024),
    },
    process: {
      uptime_seconds: Math.floor(process.uptime()),
      heap_used_mb: Math.round(memory.heapUsed / 1024 / 1024),
      heap_total_mb: Math.round(memory.heapTotal / 1024 / 1024),
      rss_mb: Math.round(memory.rss / 1024 / 1024),
    },
    timestamp: new Date().toISOString()
  }, { status: 200 });
}
