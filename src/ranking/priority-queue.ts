/**
 * Comparator function returning:
 * < 0 if a < b
 *   0 if a === b
 * > 0 if a > b
 */
export type Comparator<T> = (a: T, b: T) => number;

/**
 * High-performance, zero-dependency Binary MinHeap Priority Queue.
 * Optimized for bounded Top-K score extraction in O(N log K) time.
 */
export class MinHeap<T> {
  private readonly heap: T[] = [];
  private readonly compare: Comparator<T>;
  private readonly capacity: number;

  /**
   * @param compare Comparator returning <0 if a < b. For Top-K highest scores,
   *                compare(a, b) should return a.score - b.score so the minimum element is at the root.
   * @param capacity Optional maximum bound K for bounded top-K collection.
   */
  constructor(compare: Comparator<T>, capacity: number = Infinity) {
    this.compare = compare;
    this.capacity = capacity;
  }

  /**
   * Number of items currently in the heap.
   */
  public get size(): number {
    return this.heap.length;
  }

  /**
   * Whether the heap is empty.
   */
  public get isEmpty(): boolean {
    return this.heap.length === 0;
  }

  /**
   * Returns the minimum element at the root without removing it.
   */
  public peek(): T | undefined {
    return this.heap[0];
  }

  /**
   * Pushes an item into the heap.
   * If bounded by capacity and full:
   * - If item > root (minimum), replaces root and sifts down.
   * - Otherwise discards the item as non-competitive.
   * Returns true if item was accepted into the heap.
   */
  public push(item: T): boolean {
    if (this.heap.length < this.capacity) {
      this.heap.push(item);
      this.siftUp(this.heap.length - 1);
      return true;
    }

    // Bounded heap is full: check if item is greater than the root
    if (this.compare(item, this.heap[0]!) > 0) {
      this.heap[0] = item;
      this.siftDown(0);
      return true;
    }

    return false;
  }

  /**
   * Removes and returns the minimum element from the root.
   */
  public pop(): T | undefined {
    if (this.heap.length === 0) return undefined;

    const root = this.heap[0]!;
    const last = this.heap.pop()!;

    if (this.heap.length > 0) {
      this.heap[0] = last;
      this.siftDown(0);
    }

    return root;
  }

  /**
   * Empties the heap.
   */
  public clear(): void {
    this.heap.length = 0;
  }

  /**
   * Extracts and returns all elements sorted in descending order (highest score first).
   */
  public toSortedArray(): T[] {
    const copy = [...this.heap];
    const result: T[] = new Array(copy.length);

    // Pop from smallest to largest and place at back of result
    for (let i = copy.length - 1; i >= 0; i--) {
      result[i] = this.pop()!;
    }

    // Restore heap
    this.heap.push(...copy);

    return result;
  }

  private siftUp(index: number): void {
    let current = index;
    const item = this.heap[current]!;

    while (current > 0) {
      const parentIndex = (current - 1) >>> 1;
      const parent = this.heap[parentIndex]!;

      if (this.compare(item, parent) >= 0) {
        break;
      }

      this.heap[current] = parent;
      current = parentIndex;
    }

    this.heap[current] = item;
  }

  private siftDown(index: number): void {
    let current = index;
    const length = this.heap.length;
    const halfLength = length >>> 1;
    const item = this.heap[current]!;

    while (current < halfLength) {
      let childIndex = (current << 1) + 1;
      let child = this.heap[childIndex]!;
      const rightIndex = childIndex + 1;

      if (rightIndex < length && this.compare(this.heap[rightIndex]!, child) < 0) {
        childIndex = rightIndex;
        child = this.heap[rightIndex]!;
      }

      if (this.compare(item, child) <= 0) {
        break;
      }

      this.heap[current] = child;
      current = childIndex;
    }

    this.heap[current] = item;
  }
}
