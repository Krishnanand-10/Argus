import * as fs from 'node:fs';
import * as path from 'node:path';
import type { InvertedIndex } from '../index/inverted-index.js';
import { BufferWriter } from './vbyte.js';
import { encodeDeltas } from './delta.js';
import { FORMAT_VERSION, HEADER_SIZE, MAGIC_BYTES } from './types.js';

/**
 * Serializes an InvertedIndex into a compact binary .argus format using
 * Delta encoding and Variable-Byte integer compression.
 */
export function serializeIndex(index: InvertedIndex): Uint8Array {
  const stats = index.getStats();
  const termEntries = index.termDictionary.entries();

  // 1. Encode Postings Blob
  const postingsWriter = new BufferWriter(1024 * 16);
  const termLocations: Array<{
    term: string;
    docFrequency: number;
    totalTermFrequency: number;
    postingsOffset: number;
    postingsLength: number;
  }> = [];

  for (const entry of termEntries) {
    const startPos = postingsWriter.position;
    const postings = entry.postings.getAll();

    // Number of postings
    postingsWriter.writeVarint(postings.length);

    if (postings.length > 0) {
      // 1a. Delta-encode DocIDs
      const docIds = postings.map((p) => p.docId);
      const docDeltas = encodeDeltas(docIds);
      for (const delta of docDeltas) {
        postingsWriter.writeVarint(delta);
      }

      // 1b. Term frequencies
      for (const p of postings) {
        postingsWriter.writeVarint(p.termFrequency);
      }

      // 1c. Positional offsets (delta-encoded per document)
      for (const p of postings) {
        postingsWriter.writeVarint(p.positions.length);
        const posDeltas = encodeDeltas(p.positions);
        for (const posDelta of posDeltas) {
          postingsWriter.writeVarint(posDelta);
        }
      }
    }

    const endPos = postingsWriter.position;
    termLocations.push({
      term: entry.term,
      docFrequency: entry.docFrequency,
      totalTermFrequency: entry.totalTermFrequency,
      postingsOffset: startPos,
      postingsLength: endPos - startPos,
    });
  }

  const postingsBytes = postingsWriter.toBytes();

  // 2. Encode Lexicon Table
  const lexiconWriter = new BufferWriter(1024 * 8);
  lexiconWriter.writeUint32(termLocations.length);

  for (const loc of termLocations) {
    lexiconWriter.writeString(loc.term);
    lexiconWriter.writeVarint(loc.docFrequency);
    lexiconWriter.writeVarint(loc.totalTermFrequency);
    // Relative to start of file (HEADER_SIZE + postingsOffset)
    lexiconWriter.writeUint32(HEADER_SIZE + loc.postingsOffset);
    lexiconWriter.writeUint32(loc.postingsLength);
  }

  const lexiconBytes = lexiconWriter.toBytes();

  // 3. Encode Documents Table
  const docs = index.getAllDocuments();
  const docsWriter = new BufferWriter(1024 * 8);
  docsWriter.writeUint32(docs.length);

  for (const doc of docs) {
    docsWriter.writeUint32(doc.id);
    docsWriter.writeUint32(doc.length);

    if (doc.fields) {
      const jsonStr = JSON.stringify(doc.fields);
      docsWriter.writeLongString(jsonStr);
    } else {
      docsWriter.writeUint32(0); // 0 bytes payload
    }
  }

  const docsBytes = docsWriter.toBytes();

  // 4. Calculate Offsets & Total File Size
  const postingsBlobOffset = HEADER_SIZE;
  const lexiconTableOffset = postingsBlobOffset + postingsBytes.length;
  const docsTableOffset = lexiconTableOffset + lexiconBytes.length;
  const totalFileSize = docsTableOffset + docsBytes.length;

  // 5. Assemble Header & Final Binary Image
  const headerWriter = new BufferWriter(HEADER_SIZE);
  headerWriter.writeBytes(MAGIC_BYTES);                 // 4 bytes: "ARGS"
  headerWriter.writeUint16(FORMAT_VERSION);             // 2 bytes: version 1
  headerWriter.writeUint16(0);                          // 2 bytes: flags
  headerWriter.writeUint32(stats.totalDocuments);       // 4 bytes: N
  headerWriter.writeUint32(stats.totalTokens);          // 4 bytes: total tokens
  headerWriter.writeFloat32(stats.averageDocLength);    // 4 bytes: avgdl
  headerWriter.writeUint32(stats.totalTerms);           // 4 bytes: term count
  headerWriter.writeUint32(lexiconTableOffset);         // 4 bytes: pointer to lexicon
  headerWriter.writeUint32(docsTableOffset);            // 4 bytes: pointer to docs
  headerWriter.writeUint32(totalFileSize);              // 4 bytes: total size

  const headerBytes = headerWriter.toBytes();

  // Final combined buffer
  const finalBuffer = new Uint8Array(totalFileSize);
  finalBuffer.set(headerBytes, 0);
  finalBuffer.set(postingsBytes, postingsBlobOffset);
  finalBuffer.set(lexiconBytes, lexiconTableOffset);
  finalBuffer.set(docsBytes, docsTableOffset);

  return finalBuffer;
}

/**
 * Writes an InvertedIndex to disk as a binary .argus file.
 */
export async function writeIndexToFile(index: InvertedIndex, filePath: string): Promise<void> {
  const binaryData = serializeIndex(index);
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    await fs.promises.mkdir(dir, { recursive: true });
  }
  await fs.promises.writeFile(filePath, binaryData);
}
