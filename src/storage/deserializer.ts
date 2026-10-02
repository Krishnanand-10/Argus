import * as fs from 'node:fs';
import { InvertedIndex, type InvertedIndexOptions } from '../index/inverted-index.js';
import { PostingsList } from '../index/postings-list.js';
import type { IndexedDocument, Posting } from '../index/types.js';
import { BufferReader } from './vbyte.js';
import { decodeDeltas } from './delta.js';
import {
  type BinaryHeader,
  type SerializedLexiconEntry,
  FORMAT_VERSION,
  HEADER_SIZE,
  MAGIC_BYTES,
} from './types.js';

/**
 * Validates the file header and parses global corpus metadata from a binary .argus buffer.
 */
export function readIndexHeader(buffer: Uint8Array): BinaryHeader {
  if (buffer.length < HEADER_SIZE) {
    throw new Error(
      `Invalid Argus file: Buffer size (${buffer.length} bytes) is smaller than header (${HEADER_SIZE} bytes)`
    );
  }

  // Verify magic bytes "ARGS"
  for (let i = 0; i < 4; i++) {
    if (buffer[i] !== MAGIC_BYTES[i]) {
      throw new Error(
        `Invalid Argus file: Magic bytes mismatch. Expected "ARGS", found 0x${buffer[0]?.toString(16)}...`
      );
    }
  }

  const reader = new BufferReader(buffer, 4);
  const version = reader.readUint16();
  if (version !== FORMAT_VERSION) {
    throw new Error(`Unsupported Argus format version: ${version}. Expected version ${FORMAT_VERSION}`);
  }

  const flags = reader.readUint16();
  const totalDocuments = reader.readUint32();
  const totalTokens = reader.readUint32();
  const averageDocLength = reader.readFloat32();
  const termCount = reader.readUint32();
  const lexiconOffset = reader.readUint32();
  const documentsOffset = reader.readUint32();
  const totalFileSize = reader.readUint32();

  return {
    version,
    flags,
    totalDocuments,
    totalTokens,
    averageDocLength,
    termCount,
    lexiconOffset,
    documentsOffset,
    totalFileSize,
  };
}

/**
 * Reads all lexicon entries from the Lexicon table without loading the postings bodies.
 */
export function readLexiconTable(buffer: Uint8Array, header: BinaryHeader): SerializedLexiconEntry[] {
  const reader = new BufferReader(buffer, header.lexiconOffset);
  const termCount = reader.readUint32();
  const entries: SerializedLexiconEntry[] = new Array(termCount);

  for (let i = 0; i < termCount; i++) {
    const term = reader.readString();
    const docFrequency = reader.readVarint();
    const totalTermFrequency = reader.readVarint();
    const postingsOffset = reader.readUint32();
    const postingsLength = reader.readUint32();

    entries[i] = {
      term,
      docFrequency,
      totalTermFrequency,
      postingsOffset,
      postingsLength,
    };
  }

  return entries;
}

/**
 * Reads and decodes a single term's postings list directly from its byte offset.
 * Demonstrates zero-copy random access without decoding the entire index.
 */
export function readTermPostings(
  buffer: Uint8Array,
  entry: SerializedLexiconEntry
): PostingsList {
  const reader = new BufferReader(buffer, entry.postingsOffset);
  const numPostings = reader.readVarint();

  if (numPostings === 0) {
    return new PostingsList([]);
  }

  // 1. Decode DocIDs
  const docDeltas: number[] = new Array(numPostings);
  for (let i = 0; i < numPostings; i++) {
    docDeltas[i] = reader.readVarint();
  }
  const docIds = decodeDeltas(docDeltas);

  // 2. Decode Term Frequencies
  const termFreqs: number[] = new Array(numPostings);
  for (let i = 0; i < numPostings; i++) {
    termFreqs[i] = reader.readVarint();
  }

  // 3. Decode Positional Offsets
  const postings: Posting[] = new Array(numPostings);
  for (let i = 0; i < numPostings; i++) {
    const posCount = reader.readVarint();
    const posDeltas: number[] = new Array(posCount);
    for (let j = 0; j < posCount; j++) {
      posDeltas[j] = reader.readVarint();
    }
    const positions = decodeDeltas(posDeltas);

    postings[i] = {
      docId: docIds[i]!,
      termFrequency: termFreqs[i]!,
      positions,
    };
  }

  return new PostingsList(postings);
}

/**
 * Deserializes a full binary .argus buffer into an active, searchable InvertedIndex instance.
 */
export function deserializeIndex(
  buffer: Uint8Array,
  options: InvertedIndexOptions = {}
): InvertedIndex {
  const header = readIndexHeader(buffer);

  // 1. Read Documents Table
  const docsReader = new BufferReader(buffer, header.documentsOffset);
  const numDocs = docsReader.readUint32();
  const documents: IndexedDocument[] = new Array(numDocs);

  for (let i = 0; i < numDocs; i++) {
    const id = docsReader.readUint32();
    const length = docsReader.readUint32();
    const payloadLen = docsReader.readUint32();
    let fields: Record<string, unknown> | undefined;

    if (payloadLen > 0) {
      const bytes = docsReader.readBytes(payloadLen);
      const jsonStr = new TextDecoder().decode(bytes);
      fields = JSON.parse(jsonStr);
    }

    documents[i] = { id, length, fields };
  }

  // 2. Read Lexicon Table
  const lexiconEntries = readLexiconTable(buffer, header);

  // 3. Decode Postings for each term
  const termSnapshots: Array<{ term: string; postings: PostingsList; offset?: number }> = [];

  for (const lexEntry of lexiconEntries) {
    const postingsList = readTermPostings(buffer, lexEntry);
    termSnapshots.push({
      term: lexEntry.term,
      postings: postingsList,
      offset: lexEntry.postingsOffset,
    });
  }

  // 4. Construct and Restore InvertedIndex
  const index = new InvertedIndex(options);
  index.restoreFromSnapshot(documents, termSnapshots, header.totalTokens);

  return index;
}

/**
 * Reads and deserializes an .argus binary file from disk.
 */
export async function readIndexFromFile(
  filePath: string,
  options: InvertedIndexOptions = {}
): Promise<InvertedIndex> {
  const nodeBuf = await fs.promises.readFile(filePath);
  const uint8 = new Uint8Array(nodeBuf.buffer, nodeBuf.byteOffset, nodeBuf.byteLength);
  return deserializeIndex(uint8, options);
}
