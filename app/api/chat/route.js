import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { executeRagPipeline } from '@/lib/rag-engine';

const USAGE_FILE = path.join(process.cwd(), 'usage_counts.json');
const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;

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

function getSessionUsage(counts, sessionId) {
  const entry = counts[sessionId];
  const now = Date.now();

  if (!entry) {
    return { count: 0, firstRequestTime: now };
  }

  // Handle legacy number format
  if (typeof entry === 'number') {
    return { count: entry, firstRequestTime: now };
  }

  const firstTime = entry.firstRequestTime || now;
  // If 12 hours have passed since the first request, auto-reset the count
  if (now - firstTime >= TWELVE_HOURS_MS) {
    return { count: 0, firstRequestTime: now };
  }

  return {
    count: entry.count || 0,
    firstRequestTime: firstTime,
  };
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
    const usage = getSessionUsage(counts, sessionId);

    if (usage.count >= 3) {
      const now = Date.now();
      const remainingMs = Math.max(0, TWELVE_HOURS_MS - (now - usage.firstRequestTime));
      const remainingHours = Math.floor(remainingMs / (60 * 60 * 1000));
      const remainingMinutes = Math.ceil((remainingMs % (60 * 60 * 1000)) / (60 * 1000));
      const timeStr = remainingHours > 0 ? `${remainingHours}h ${remainingMinutes}m` : `${remainingMinutes}m`;

      return NextResponse.json(
        { detail: `You have reached the limit of 3 questions for this demo. Your limit will auto-reset in ${timeStr}.` },
        { status: 429 }
      );
    }

    // Execute RAG Pipeline with per-chat documents filter, feature toggles, and conversation history
    const documentsList = Array.isArray(body.documents) ? body.documents : null;
    const history = Array.isArray(body.history) ? body.history : [];
    const webSearch = body.webSearch !== false;
    const thinkMode = body.thinkMode !== false;

    const result = await executeRagPipeline(
      question,
      documentsList,
      {
        webSearch,
        thinkMode,
      },
      history
    );

    if (result.error) {
      return NextResponse.json(
        { detail: result.error },
        { status: result.status || 500 }
      );
    }

    // Increment count & save timestamp
    const now = Date.now();
    counts[sessionId] = {
      count: usage.count + 1,
      firstRequestTime: usage.count === 0 ? now : usage.firstRequestTime,
      lastRequestTime: now,
    };
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
