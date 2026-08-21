import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { DOCUMENTS_DIR } from '@/lib/pdf-parser';

export async function POST(request) {
  try {
    const formData = await request.formData();
    const files = formData.getAll('files');

    if (!files || files.length === 0) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 });
    }

    if (!fs.existsSync(DOCUMENTS_DIR)) {
      fs.mkdirSync(DOCUMENTS_DIR, { recursive: true });
    }

    const savedFiles = [];

    for (const file of files) {
      if (typeof file === 'string' || !file.name) continue;

      const filename = file.name;
      if (!filename.toLowerCase().endsWith('.pdf')) continue;

      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);

      const filePath = path.join(DOCUMENTS_DIR, filename);
      fs.writeFileSync(filePath, buffer);
      savedFiles.push(filename);
    }

    if (savedFiles.length === 0) {
      return NextResponse.json(
        { error: 'No valid PDF files were uploaded.' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      message: `Successfully uploaded ${savedFiles.length} files.`,
      files: savedFiles,
    });
  } catch (error) {
    console.error('Upload handler error:', error);
    return NextResponse.json(
      { error: error.message || 'File upload failed' },
      { status: 500 }
    );
  }
}
