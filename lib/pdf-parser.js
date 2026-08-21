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
 * Split text recursively with overlap
 */
export function recursiveTextSplitter(text, chunkSize = 900, chunkOverlap = 150) {
  const chunks = [];
  if (!text || text.trim().length === 0) return chunks;

  // Normalize newlines and clean surrogate characters
  const clean = text
    .replace(/[\uD800-\uDFFF]/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\t/g, ' ');

  const paragraphs = clean.split(/\n\n+/);
  let currentChunk = '';

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;

    if ((currentChunk + '\n\n' + trimmed).length <= chunkSize) {
      currentChunk = currentChunk ? currentChunk + '\n\n' + trimmed : trimmed;
    } else {
      if (currentChunk) {
        chunks.push(currentChunk);
        // keep overlap from previous chunk
        const words = currentChunk.split(/\s+/);
        const overlapWords = words.slice(-Math.floor(chunkOverlap / 6));
        currentChunk = overlapWords.join(' ') + '\n\n' + trimmed;
      } else {
        // If single paragraph is larger than chunkSize, split by sentences or slice
        const sentences = trimmed.split(/(?<=[.?!])\s+/);
        for (const sentence of sentences) {
          if ((currentChunk + ' ' + sentence).length <= chunkSize) {
            currentChunk = currentChunk ? currentChunk + ' ' + sentence : sentence;
          } else {
            if (currentChunk) chunks.push(currentChunk);
            currentChunk = sentence;
          }
        }
      }
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

/**
 * Load and chunk all PDFs in the given directory or file list
 */
export async function loadAndChunkPdfs(pdfPaths = null, chunkSize = 900, chunkOverlap = 150) {
  let filesToProcess = pdfPaths;

  if (!filesToProcess) {
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
        allChunks.push({
          id: `${filename}_chunk_${idx}`,
          pageContent: content,
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
