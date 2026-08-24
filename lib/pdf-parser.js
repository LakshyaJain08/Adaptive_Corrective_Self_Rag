import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import pdfParse from 'pdf-parse';

export const DOCUMENTS_DIR = path.join(process.cwd(), 'documents');

// Ensure documents directory exists
if (!fs.existsSync(DOCUMENTS_DIR)) {
  fs.mkdirSync(DOCUMENTS_DIR, { recursive: true });
}

// In-memory cache for parsed chunks
const chunkCache = new Map();

/**
 * Clean extracted PDF text with proper token spacing
 */
export function cleanPdfText(rawText) {
  if (!rawText) return '';
  return rawText
    .replace(/[\uD800-\uDFFF]/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\t/g, ' ')
    // Insert spaces between lowercase and uppercase letters (e.g. "EngineeringCGPA" -> "Engineering CGPA")
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    // Insert spaces between letters and numbers
    .replace(/([a-zA-Z])([0-9])/g, '$1 $2')
    .replace(/([0-9])([a-zA-Z])/g, '$1 $2')
    // Replace bullet variants with standard dash
    .replace(/[•–—]/g, ' - ')
    .replace(/[ ]+/g, ' ');
}

/**
 * Split text recursively with overlap
 */
export function recursiveTextSplitter(text, chunkSize = 750, chunkOverlap = 120) {
  const chunks = [];
  const clean = cleanPdfText(text);
  if (!clean.trim()) return chunks;

  // Split by newlines or paragraphs
  const lines = clean.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  let currentChunk = '';

  for (const line of lines) {
    const candidate = currentChunk ? currentChunk + '\n' + line : line;
    if (candidate.length <= chunkSize) {
      currentChunk = candidate;
    } else {
      if (currentChunk) {
        chunks.push(currentChunk);
        // Overlap: keep last few words
        const words = currentChunk.split(/\s+/);
        const overlapWords = words.slice(-Math.floor(chunkOverlap / 6));
        currentChunk = overlapWords.join(' ') + '\n' + line;
      } else {
        chunks.push(line.slice(0, chunkSize));
        currentChunk = line.slice(chunkSize);
      }
    }
  }

  if (currentChunk && currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

/**
 * Load and chunk all PDFs in the given directory or file list
 */
export async function loadAndChunkPdfs(pdfPaths = null, chunkSize = 750, chunkOverlap = 120) {
  let filesToProcess = pdfPaths;

  if (filesToProcess && Array.isArray(filesToProcess)) {
    if (filesToProcess.length === 0) {
      return [];
    }
    filesToProcess = filesToProcess.map((f) =>
      path.isAbsolute(f) ? f : path.join(DOCUMENTS_DIR, f)
    );
  } else {
    if (!fs.existsSync(DOCUMENTS_DIR)) {
      return [];
    }
    const files = fs.readdirSync(DOCUMENTS_DIR);
    filesToProcess = files
      .filter((f) => f.toLowerCase().endsWith('.pdf'))
      .map((f) => path.join(DOCUMENTS_DIR, f));
  }

  if (filesToProcess.length === 0) {
    return [];
  }

  // Generate cache key based on file paths and modification times
  const stats = filesToProcess.map((p) => {
    try {
      const s = fs.statSync(p);
      return `${p}:${s.mtimeMs}`;
    } catch {
      return `${p}:0`;
    }
  });

  const cacheKey = crypto.createHash('md5').update(stats.join('|')).digest('hex');

  if (chunkCache.has(cacheKey)) {
    return chunkCache.get(cacheKey);
  }

  const allChunks = [];

  for (const filePath of filesToProcess) {
    try {
      if (!fs.existsSync(filePath)) continue;
      const dataBuffer = fs.readFileSync(filePath);
      const pdfData = await pdfParse(dataBuffer);
      const text = pdfData.text || '';
      const filename = path.basename(filePath);

      const textChunks = recursiveTextSplitter(text, chunkSize, chunkOverlap);

      textChunks.forEach((content, idx) => {
        const prefixedContent = `[Document: ${filename}]\n${content}`;
        allChunks.push({
          id: `${filename}_chunk_${idx}`,
          pageContent: prefixedContent,
          rawContent: content,
          metadata: {
            source: filename,
            department: 'KnowledgeBase',
            year: new Date().getFullYear(),
            doc_type: 'pdf',
            chunk_index: idx,
          },
        });
      });
    } catch (err) {
      console.error(`Error parsing PDF ${filePath}:`, err);
    }
  }

  chunkCache.set(cacheKey, allChunks);
  return allChunks;
}
