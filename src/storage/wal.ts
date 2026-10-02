import * as fs from 'node:fs';
import * as path from 'node:path';
import * as readline from 'node:readline';
import type { InvertedIndex } from '../index/inverted-index.js';
import type { IndexableDocument } from '../index/types.js';
import type { WALEntry } from './types.js';

/**
 * Write-Ahead Log (WAL) providing crash-resilience and durability for uncommitted index mutations.
 * Ingests documents into an append-only log before or during memory indexing.
 */
export class WriteAheadLog {
  private readonly filePath: string;
  private sequenceNumber: number = 0;
  private writeStream: fs.WriteStream | null = null;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  /**
   * Initializes the WAL file handle.
   */
  public async open(): Promise<void> {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      await fs.promises.mkdir(dir, { recursive: true });
    }

    this.writeStream = fs.createWriteStream(this.filePath, { flags: 'a' });
  }

  /**
   * Appends a document addition to the log.
   */
  public async append(doc: IndexableDocument): Promise<number> {
    if (!this.writeStream) {
      await this.open();
    }

    this.sequenceNumber++;
    const entry: WALEntry = {
      sequenceNumber: this.sequenceNumber,
      timestamp: Date.now(),
      type: 'INSERT',
      payload: doc,
    };

    const line = JSON.stringify(entry) + '\n';
    await new Promise<void>((resolve, reject) => {
      this.writeStream!.write(line, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    return this.sequenceNumber;
  }

  /**
   * Replays uncommitted WAL entries into an InvertedIndex.
   * Returns the number of restored documents.
   */
  public async replay(index: InvertedIndex): Promise<number> {
    if (!fs.existsSync(this.filePath)) {
      return 0;
    }

    const fileStream = fs.createReadStream(this.filePath);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    });

    let replayedCount = 0;

    for await (const line of rl) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      try {
        const entry = JSON.parse(trimmed) as WALEntry;
        if (entry.type === 'INSERT' && entry.payload) {
          const doc = entry.payload as unknown as IndexableDocument;
          // Only add if not already in index
          if (!index.getDocument(doc.id)) {
            index.addDocument(doc);
            replayedCount++;
          }
          if (entry.sequenceNumber > this.sequenceNumber) {
            this.sequenceNumber = entry.sequenceNumber;
          }
        }
      } catch {
        // Skip corrupted partial lines at EOF during crash recovery
        continue;
      }
    }

    return replayedCount;
  }

  /**
   * Truncates the WAL after a successful full index serialization / commit.
   */
  public async checkpoint(): Promise<void> {
    await this.close();
    if (fs.existsSync(this.filePath)) {
      await fs.promises.writeFile(this.filePath, '');
    }
    this.sequenceNumber = 0;
  }

  /**
   * Flushes and closes the underlying stream.
   */
  public async close(): Promise<void> {
    if (this.writeStream) {
      await new Promise<void>((resolve) => {
        this.writeStream!.end(() => resolve());
      });
      this.writeStream = null;
    }
  }
}
