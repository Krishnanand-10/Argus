import type { Posting, SkipPointer } from './types.js';

/**
 * A positional postings list representing all occurrences of a term across documents.
 * Maintains sorted document IDs and word positions with optional skip pointer acceleration.
 */
export class PostingsList implements Iterable<Posting> {
  private readonly postings: Posting[] = [];
  private readonly skipPointers: Map<number, SkipPointer> = new Map();
  private _totalTermFrequency: number = 0;
  private skipsDirty: boolean = false;

  constructor(initialPostings: Posting[] = []) {
    for (const p of initialPostings) {
      this.postings.push({
        docId: p.docId,
        termFrequency: p.termFrequency,
        positions: [...p.positions],
      });
      this._totalTermFrequency += p.termFrequency;
    }
    if (this.postings.length > 0) {
      this.buildSkips();
    }
  }

  /**
   * Number of documents containing this term (Document Frequency - df).
   */
  public get length(): number {
    return this.postings.length;
  }

  /**
   * Document frequency alias.
   */
  public get docFrequency(): number {
    return this.postings.length;
  }

  /**
   * Total number of times this term appears across all indexed documents.
   */
  public get totalTermFrequency(): number {
    return this._totalTermFrequency;
  }

  /**
   * Adds an occurrence of a term at a given word position in a document.
   * Maintains document ID sorting and position ordering.
   */
  public add(docId: number, position: number): void {
    const len = this.postings.length;

    // Fast-path: appending to current doc or new monotonically increasing docId
    if (len > 0) {
      const last = this.postings[len - 1]!;
      if (last.docId === docId) {
        last.termFrequency++;
        last.positions.push(position);
        this._totalTermFrequency++;
        return;
      }

      if (docId > last.docId) {
        this.postings.push({
          docId,
          termFrequency: 1,
          positions: [position],
        });
        this._totalTermFrequency++;
        this.skipsDirty = true;
        return;
      }
    } else {
      this.postings.push({
        docId,
        termFrequency: 1,
        positions: [position],
      });
      this._totalTermFrequency++;
      this.skipsDirty = true;
      return;
    }

    // Fallback: binary search insertion for out-of-order docIds
    const idx = this.binarySearchDocId(docId);
    if (idx >= 0) {
      const existing = this.postings[idx]!;
      existing.termFrequency++;
      this.insertSortedPosition(existing.positions, position);
    } else {
      const insertAt = -(idx + 1);
      this.postings.splice(insertAt, 0, {
        docId,
        termFrequency: 1,
        positions: [position],
      });
    }
    this._totalTermFrequency++;
    this.skipsDirty = true;
  }

  /**
   * Retrieves the posting at a specific index in the list.
   */
  public get(index: number): Posting | undefined {
    return this.postings[index];
  }

  /**
   * Returns a read-only view of the underlying postings array.
   */
  public getAll(): readonly Posting[] {
    return this.postings;
  }

  /**
   * Finds the posting for a specific docId via binary search.
   */
  public getPostingForDoc(docId: number): Posting | undefined {
    const idx = this.binarySearchDocId(docId);
    return idx >= 0 ? this.postings[idx] : undefined;
  }

  /**
   * Checks whether the postings list contains a given docId.
   */
  public hasDoc(docId: number): boolean {
    return this.binarySearchDocId(docId) >= 0;
  }

  /**
   * Builds or refreshes skip pointers every floor(sqrt(L)) entries.
   */
  public buildSkips(): void {
    this.skipPointers.clear();
    const len = this.postings.length;
    const step = Math.floor(Math.sqrt(len));

    if (step <= 1) {
      this.skipsDirty = false;
      return;
    }

    for (let i = 0; i + step < len; i += step) {
      const targetIndex = i + step;
      const targetPosting = this.postings[targetIndex]!;
      this.skipPointers.set(i, {
        targetDocId: targetPosting.docId,
        postingIndex: targetIndex,
      });
    }

    this.skipsDirty = false;
  }

  /**
   * Retrieves the skip pointer starting at the specified posting index, if any.
   */
  public getSkip(index: number): SkipPointer | undefined {
    if (this.skipsDirty) {
      this.buildSkips();
    }
    return this.skipPointers.get(index);
  }

  /**
   * Makes PostingsList directly iterable with for..of.
   */
  public [Symbol.iterator](): Iterator<Posting> {
    return this.postings[Symbol.iterator]();
  }

  /**
   * Performs binary search on docId.
   * Returns non-negative index if found, or -(insertionIndex + 1) if not found.
   */
  private binarySearchDocId(targetDocId: number): number {
    let low = 0;
    let high = this.postings.length - 1;

    while (low <= high) {
      const mid = (low + high) >>> 1;
      const midDocId = this.postings[mid]!.docId;

      if (midDocId === targetDocId) {
        return mid;
      }
      if (midDocId < targetDocId) {
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    return -(low + 1);
  }

  /**
   * Inserts a position into an array in sorted order.
   */
  private insertSortedPosition(positions: number[], position: number): void {
    let low = 0;
    let high = positions.length - 1;

    while (low <= high) {
      const mid = (low + high) >>> 1;
      const val = positions[mid]!;

      if (val === position) {
        return; // duplicates not added
      }
      if (val < position) {
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    positions.splice(low, 0, position);
  }
}
