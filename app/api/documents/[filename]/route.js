import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { DOCUMENTS_DIR } from '@/lib/pdf-parser';

export async function DELETE(request, { params }) {
  try {
    const resolvedParams = await params;
    const filename = decodeURIComponent(resolvedParams.filename);

    if (!filename) {
      return NextResponse.json({ error: 'Filename is required' }, { status: 400 });
    }

    const filePath = path.join(DOCUMENTS_DIR, filename);

    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    fs.unlinkSync(filePath);

    return NextResponse.json({
      message: `Successfully deleted ${filename}`,
    });
  } catch (error) {
    console.error('Delete document error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to delete document' },
      { status: 500 }
    );
  }
}
