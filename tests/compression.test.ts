import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { InvertedIndex } from '../src/index/index.js';
import {
  encodeVarint,
  decodeVarint,
  encodeVarints,
  decodeVarints,
  encodeDeltas,
  decodeDeltas,
  BufferWriter,
  BufferReader,
  serializeIndex,
  deserializeIndex,
  writeIndexToFile,
  readIndexFromFile,
  readIndexHeader,
  readLexiconTable,
  readTermPostings,
  WriteAheadLog,
  MAGIC_BYTES,
  FORMAT_VERSION,
} from '../src/storage/index.js';

describe('Phase 3: Binary Storage & Compression', () => {
  describe('Variable-Byte (Varint) Codec', () => {
    it('encodes and decodes single-byte integers (0..127)', () => {
      const testCases = [0, 1, 42, 127];
      for (const val of testCases) {
        const encoded = encodeVarint(val);
        expect(encoded.length).toBe(1);
        const { value, bytesRead } = decodeVarint(encoded);
        expect(value).toBe(val);
        expect(bytesRead).toBe(1);
      }
    });

    it('encodes and decodes multi-byte integers (>127)', () => {
      const testCases = [128, 255, 300, 16384, 65535, 1000000, 2147483647];
      for (const val of testCases) {
        const encoded = encodeVarint(val);
        expect(encoded.length).toBeGreaterThan(1);
        const { value, bytesRead } = decodeVarint(encoded);
        expect(value).toBe(val);
        expect(bytesRead).toBe(encoded.length);
      }
    });

    it('encodes and decodes batches of varints', () => {
      const numbers = [0, 1, 100, 128, 5000, 999999];
      const encoded = encodeVarints(numbers);
      const { values, bytesRead } = decodeVarints(encoded, numbers.length);

      expect(bytesRead).toBe(encoded.length);
      expect(values).toEqual(numbers);
    });

    it('detects buffer underflow during varint decoding', () => {
      // 0x80 means more bytes follow, but buffer terminates
      const incomplete = new Uint8Array([0x80]);
      expect(() => decodeVarint(incomplete)).toThrow(/Unexpected end of buffer/);
    });
  });

  describe('Delta Encoding (D-Gaps)', () => {
    it('encodes and decodes monotonic integer sequences into small gaps', () => {
      const original = [104, 108, 125, 160];
      const deltas = encodeDeltas(original);

      expect(deltas).toEqual([104, 4, 17, 35]);
      expect(decodeDeltas(deltas)).toEqual(original);
    });

    it('handles sequences starting with zero (e.g. positions)', () => {
      const positions = [0, 3, 5, 12];
      const deltas = encodeDeltas(positions);

      expect(deltas).toEqual([0, 3, 2, 7]);
      expect(decodeDeltas(deltas)).toEqual(positions);
    });

    it('handles empty and single-element arrays', () => {
      expect(encodeDeltas([])).toEqual([]);
      expect(decodeDeltas([])).toEqual([]);

      expect(encodeDeltas([99])).toEqual([99]);
      expect(decodeDeltas([99])).toEqual([99]);
    });

    it('throws when input sequence is not monotonic', () => {
      expect(() => encodeDeltas([10, 5, 12])).toThrow(/not monotonically increasing/);
    });
  });

  describe('BufferWriter & BufferReader', () => {
    it('serializes and deserializes primitives, floats, and utf-8 strings', () => {
      const writer = new BufferWriter(16);
      writer.writeUint8(250);
      writer.writeUint16(45000);
      writer.writeUint32(3000000000);
      writer.writeFloat32(3.14159);
      writer.writeString('Argus 🚀 Search');

      const bytes = writer.toBytes();
      const reader = new BufferReader(bytes);

      expect(reader.readUint8()).toBe(250);
      expect(reader.readUint16()).toBe(45000);
      expect(reader.readUint32()).toBe(3000000000);
      expect(reader.readFloat32()).toBeCloseTo(3.14159, 4);
      expect(reader.readString()).toBe('Argus 🚀 Search');
      expect(reader.remaining).toBe(0);
    });

    it('dynamically expands buffer capacity without corruption', () => {
      const writer = new BufferWriter(4);
      for (let i = 0; i < 100; i++) {
        writer.writeUint32(i * 100);
      }

      const reader = new BufferReader(writer.toBytes());
      for (let i = 0; i < 100; i++) {
        expect(reader.readUint32()).toBe(i * 100);
      }
    });
  });

  describe('Binary Index Serialization & Deserialization (.argus format)', () => {
    let index: InvertedIndex;

    beforeEach(() => {
      index = new InvertedIndex();
      index.addDocuments([
        {
          id: 1,
          title: 'Distributed Systems',
          body: 'Consensus algorithms such as Paxos and Raft ensure fault tolerance.',
          category: 'systems',
        },
        {
          id: 2,
          title: 'Full-Text Search Engines',
          body: 'Inverted indexes with BM25 ranking provide fast information retrieval.',
          category: 'ir',
        },
        {
          id: 3,
          title: 'Database Internals',
          body: 'Write-ahead logging and relational tables guarantee durability and consistency.',
          category: 'storage',
        },
      ]);
    });

    it('serializes to binary with valid header and magic bytes', () => {
      const buffer = serializeIndex(index);

      // Verify header magic
      expect(buffer.slice(0, 4)).toEqual(MAGIC_BYTES);

      const header = readIndexHeader(buffer);
      expect(header.version).toBe(FORMAT_VERSION);
      expect(header.totalDocuments).toBe(3);
      expect(header.termCount).toBeGreaterThan(0);
      expect(header.averageDocLength).toBeGreaterThan(0);
      expect(header.totalFileSize).toBe(buffer.length);
    });

    it('rejects corrupted binary buffers', () => {
      const invalid = new Uint8Array([0x00, 0x01, 0x02, 0x03]);
      expect(() => readIndexHeader(invalid)).toThrow(/Buffer size/);

      const badMagic = new Uint8Array(40);
      expect(() => readIndexHeader(badMagic)).toThrow(/Magic bytes mismatch/);
    });

    it('round-trips index state and preserves search capabilities', () => {
      const binaryData = serializeIndex(index);
      const restored = deserializeIndex(binaryData);

      // Verify statistics
      const origStats = index.getStats();
      const restStats = restored.getStats();
      expect(restStats.totalDocuments).toBe(origStats.totalDocuments);
      expect(restStats.totalTerms).toBe(origStats.totalTerms);
      expect(restStats.totalTokens).toBe(origStats.totalTokens);
      expect(restStats.averageDocLength).toBeCloseTo(origStats.averageDocLength, 3);

      // Verify stored document payloads
      const doc1 = restored.getDocument(1);
      expect(doc1).toBeDefined();
      expect(doc1?.id).toBe(1);
      expect(doc1?.fields?.['category']).toBe('systems');

      // Verify query execution on restored index
      const andResults = restored.searchBooleanAnd(['fault', 'tolerance']);
      expect(andResults).toEqual([1]);

      const orResults = restored.searchBooleanOr(['paxos', 'bm25']);
      expect(orResults).toEqual([1, 2]);

      const phraseResults = restored.searchPhrase('fault tolerance');
      expect(phraseResults.length).toBe(1);
      expect(phraseResults[0]!.docId).toBe(1);

      const prefixResults = restored.searchPrefix('distrib');
      expect(prefixResults.length).toBeGreaterThan(0);
    });

    it('supports on-demand single term postings lookup from byte offsets', () => {
      const buffer = serializeIndex(index);
      const header = readIndexHeader(buffer);
      const lexicon = readLexiconTable(buffer, header);

      const consensusEntry = lexicon.find((e) => e.term === 'consensu');
      expect(consensusEntry).toBeDefined();

      const postings = readTermPostings(buffer, consensusEntry!);
      expect(postings.length).toBe(1);
      expect(postings.get(0)?.docId).toBe(1);
    });
  });

  describe('File I/O & Write-Ahead Log (WAL)', () => {
    let tempDir: string;

    beforeEach(async () => {
      tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'argus-test-'));
    });

    afterEach(async () => {
      if (fs.existsSync(tempDir)) {
        await fs.promises.rm(tempDir, { recursive: true, force: true });
      }
    });

    it('writes and reads index files to disk', async () => {
      const index = new InvertedIndex();
      index.addDocument({ id: 1, text: 'Distributed consensus across clusters.' });

      const filePath = path.join(tempDir, 'test-index.argus');
      await writeIndexToFile(index, filePath);

      expect(fs.existsSync(filePath)).toBe(true);

      const loadedIndex = await readIndexFromFile(filePath);
      expect(loadedIndex.getStats().totalDocuments).toBe(1);
      expect(loadedIndex.searchPhrase('distributed consensus').length).toBe(1);
    });

    it('logs mutations in WriteAheadLog and replays uncommitted writes', async () => {
      const walPath = path.join(tempDir, 'wal.log');
      const wal = new WriteAheadLog(walPath);

      await wal.append({ id: 10, text: 'Uncommitted document one' });
      await wal.append({ id: 20, text: 'Uncommitted document two' });
      await wal.close();

      const freshIndex = new InvertedIndex();
      const recoveryWal = new WriteAheadLog(walPath);
      const restoredCount = await recoveryWal.replay(freshIndex);

      expect(restoredCount).toBe(2);
      expect(freshIndex.getDocument(10)).toBeDefined();
      expect(freshIndex.getDocument(20)).toBeDefined();

      // Checkpoint truncates WAL
      await recoveryWal.checkpoint();
      const emptyReplay = await recoveryWal.replay(freshIndex);
      expect(emptyReplay).toBe(0);
    });
  });
});
