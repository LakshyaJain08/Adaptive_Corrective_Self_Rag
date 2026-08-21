import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { executeRagPipeline } from '@/lib/rag-engine';

const USAGE_FILE = path.join(process.cwd(), 'usage_counts.json');

function loadCounts() {
  if (fs.existsSync(USAGE_FILE)) {
    try {
      const data = fs.readFileSync(USAGE_FILE, 'utf-8');
      return JSON.parse(data);
    } catch {
      return {};
    }
  }
  return {};
}

function saveCounts(counts) {
  try {
    fs.writeFileSync(USAGE_FILE, JSON.stringify(counts, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error saving usage counts:', err);
  }
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const question = body.question;

    if (!question || typeof question !== 'string' || question.trim().length === 0) {
      return NextResponse.json(
        { detail: 'Please provide a valid question.' },
        { status: 400 }
      );
    }

    // Session and rate limit management
    const cookieHeader = request.cookies.get('session_id');
    let sessionId = cookieHeader?.value;
    let isNewSession = false;

    if (!sessionId) {
      sessionId = crypto.randomUUID();
      isNewSession = true;
    }

    const counts = loadCounts();
    const currentCount = counts[sessionId] || 0;

    if (currentCount >= 3) {
      return NextResponse.json(
        { detail: 'You have reached the limit of 3 questions for this demo.' },
        { status: 429 }
      );
    }

    // Execute RAG Pipeline
    const result = await executeRagPipeline(question);

    if (result.error) {
      return NextResponse.json(
        { detail: result.error },
        { status: result.status || 500 }
      );
    }

    // Increment count
    counts[sessionId] = currentCount + 1;
    saveCounts(counts);

    const response = NextResponse.json(result);

    if (isNewSession) {
      response.cookies.set('session_id', sessionId, {
        maxAge: 60 * 60 * 24 * 365, // 1 year
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
      });
    }

    return response;
  } catch (error) {
    console.error('Chat API Error:', error);
    return NextResponse.json(
      { detail: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
