import { NextResponse } from 'next/server';
import fs from 'fs';
import { DOCUMENTS_DIR } from '@/lib/pdf-parser';

export async function GET() {
  try {
    if (!fs.existsSync(DOCUMENTS_DIR)) {
      fs.mkdirSync(DOCUMENTS_DIR, { recursive: true });
      return NextResponse.json({ documents: [] });
    }

    const files = fs.readdirSync(DOCUMENTS_DIR);
    const pdfs = files.filter((f) => f.toLowerCase().endsWith('.pdf'));

    return NextResponse.json({ documents: pdfs });
  } catch (error) {
    console.error('List documents error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to list documents' },
      { status: 500 }
    );
  }
}
