import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
  const hasGeminiKey = Boolean(process.env.GOOGLE_API_KEY);
  const hasTavilyKey = Boolean(process.env.TAVILY_API_KEY);
  
  const docsDir = path.join(process.cwd(), 'documents');
  let docsCount = 0;
  if (fs.existsSync(docsDir)) {
    docsCount = fs.readdirSync(docsDir).filter(f => f.toLowerCase().endsWith('.pdf')).length;
  }

  const isReady = hasGeminiKey;
  const statusCode = isReady ? 200 : 503;

  return NextResponse.json({
    ready: isReady,
    services: {
      gemini_configured: hasGeminiKey,
      tavily_configured: hasTavilyKey,
      documents_loaded: docsCount,
    },
    memory_usage_mb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    timestamp: new Date().toISOString()
  }, { status: statusCode });
}
