import { PostingsList } from './postings-list.js';
import type { TermMetadata } from './types.js';

/**
 * An entry within the lexicon representing a term, its positional postings,
 * document frequency, total term frequency, and optional disk offset.
 */
export class TermEntry implements TermMetadata {
  public readonly term: string;
  public readonly postings: PostingsList;
  public offset?: number;

  constructor(term: string, postings?: PostingsList) {
    this.term = term;
    this.postings = postings ?? new PostingsList();
  }

  /**
   * Number of unique documents containing this term.
   */
  public get docFrequency(): number {
    return this.postings.length;
  }

  /**
   * Total occurrences of this term across all indexed documents.
   */
  public get totalTermFrequency(): number {
    return this.postings.totalTermFrequency;
  }
}

/**
 * Internal node in the compressed Radix Tree.
 */
class RadixNode<T> {
  public edgeLabel: string;
  public children: Map<string, RadixNode<T>>;
  public isTerminal: boolean;
  public value?: T;

  constructor(edgeLabel: string = '') {
    this.edgeLabel = edgeLabel;
    this.children = new Map();
    this.isTerminal = false;
  }
}

/**
 * High-performance Radix Tree (compact Trie) engineered from first principles.
 * Compresses common prefixes for fast O(K) lookups and prefix matching with zero external dependencies.
 */
export class RadixTree<T> {
  private readonly root: RadixNode<T> = new RadixNode('');
  private _size: number = 0;

  /**
   * Total number of keys stored in the Radix Tree.
   */
  public get size(): number {
    return this._size;
  }

  /**
   * Inserts a key-value pair into the Radix Tree.
   */
  public insert(key: string, value: T): void {
    if (key.length === 0) {
      if (!this.root.isTerminal) {
        this.root.isTerminal = true;
        this._size++;
      }
      this.root.value = value;
      return;
    }

    let current = this.root;
    let remaining = key;

    while (remaining.length > 0) {
      const firstChar = remaining[0]!;
      const child = current.children.get(firstChar);

      if (!child) {
        // No matching branch: create a new branch with the entire remaining key
        const newNode = new RadixNode<T>(remaining);
        newNode.isTerminal = true;
        newNode.value = value;
        current.children.set(firstChar, newNode);
        this._size++;
        return;
      }

      // Found matching child edge: calculate longest common prefix
      const commonLen = this.getCommonPrefixLength(remaining, child.edgeLabel);

      if (commonLen === child.edgeLabel.length) {
        if (commonLen === remaining.length) {
          // Exact match on existing terminal node
          if (!child.isTerminal) {
            child.isTerminal = true;
            this._size++;
          }
          child.value = value;
          return;
        }

        // Child edge is full prefix of remaining key; advance deeper
        current = child;
        remaining = remaining.slice(commonLen);
      } else {
        // Partial match: split the child node
        const commonPrefix = child.edgeLabel.slice(0, commonLen);
        const childRemainingEdge = child.edgeLabel.slice(commonLen);

        // Split node takes common prefix
        const splitNode = new RadixNode<T>(commonPrefix);

        // Adjust existing child to hold remaining edge
        child.edgeLabel = childRemainingEdge;
        splitNode.children.set(childRemainingEdge[0]!, child);

        // Replace child in current node
        current.children.set(firstChar, splitNode);

        if (commonLen === remaining.length) {
          // New key ends at split point
          splitNode.isTerminal = true;
          splitNode.value = value;
        } else {
          // New key branches off from split point
          const newBranchEdge = remaining.slice(commonLen);
          const newBranch = new RadixNode<T>(newBranchEdge);
          newBranch.isTerminal = true;
          newBranch.value = value;
          splitNode.children.set(newBranchEdge[0]!, newBranch);
        }

        this._size++;
        return;
      }
    }
  }

  /**
   * Retrieves the value associated with a key, or undefined if not found.
   */
  public get(key: string): T | undefined {
    if (key.length === 0) {
      return this.root.isTerminal ? this.root.value : undefined;
    }

    let current = this.root;
    let remaining = key;

    while (remaining.length > 0) {
      const firstChar = remaining[0]!;
      const child = current.children.get(firstChar);

      if (!child) return undefined;

      if (!remaining.startsWith(child.edgeLabel)) {
        return undefined;
      }

      if (remaining.length === child.edgeLabel.length) {
        return child.isTerminal ? child.value : undefined;
      }

      remaining = remaining.slice(child.edgeLabel.length);
      current = child;
    }

    return undefined;
  }

  /**
   * Checks whether the Radix Tree contains the given key.
   */
  public has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  /**
   * Searches for all entries whose keys start with the given prefix.
   */
  public findWithPrefix(prefix: string): Array<{ key: string; value: T }> {
    const results: Array<{ key: string; value: T }> = [];

    if (prefix.length === 0) {
      this.collectEntries(this.root, '', results);
      return results;
    }

    let current = this.root;
    let remaining = prefix;
    let accumulatedPath = '';

    while (remaining.length > 0) {
      const firstChar = remaining[0]!;
      const child = current.children.get(firstChar);

      if (!child) return results;

      if (child.edgeLabel.startsWith(remaining)) {
        // The remaining prefix is a prefix of this child's edge label.
        // Everything in this child's subtree matches!
        accumulatedPath += child.edgeLabel;
        this.collectEntries(child, accumulatedPath, results);
        return results;
      }

      if (!remaining.startsWith(child.edgeLabel)) {
        return results;
      }

      accumulatedPath += child.edgeLabel;
      remaining = remaining.slice(child.edgeLabel.length);
      current = child;
    }

    this.collectEntries(current, accumulatedPath, results);
    return results;
  }

  /**
   * Searches for all entries whose keys are within maxDistance Levenshtein edit distance of the target.
   * Leverages DP row branch pruning on the Radix Tree for sub-millisecond fuzzy lookups.
   */
  public findFuzzy(
    target: string,
    maxDistance: number = 2
  ): Array<{ key: string; value: T; distance: number }> {
    const results: Array<{ key: string; value: T; distance: number }> = [];
    if (maxDistance < 0) return results;

    const targetLower = target.toLowerCase();
    const targetLen = targetLower.length;

    // Initial Levenshtein row: [0, 1, 2, ..., targetLen]
    const initialRow: number[] = new Array(targetLen + 1);
    for (let i = 0; i <= targetLen; i++) {
      initialRow[i] = i;
    }

    this.fuzzyTraverse(this.root, '', initialRow, targetLower, maxDistance, results);

    // Sort by edit distance ascending, then alphabetically by key
    results.sort((a, b) => a.distance - b.distance || a.key.localeCompare(b.key));
    return results;
  }

  private fuzzyTraverse(
    node: RadixNode<T>,
    currentPath: string,
    prevRow: number[],
    target: string,
    maxDistance: number,
    results: Array<{ key: string; value: T; distance: number }>
  ): void {
    if (node.isTerminal && node.value !== undefined) {
      const distance = prevRow[target.length]!;
      if (distance <= maxDistance) {
        results.push({ key: currentPath, value: node.value, distance });
      }
    }

    for (const [, child] of node.children) {
      let currentRow = prevRow;
      const label = child.edgeLabel;
      let possible = true;

      for (let i = 0; i < label.length; i++) {
        const ch = label[i]!.toLowerCase();
        const nextRow = new Array<number>(target.length + 1);
        nextRow[0] = currentRow[0]! + 1;

        let rowMin = nextRow[0]!;
        for (let j = 1; j <= target.length; j++) {
          const cost = ch === target[j - 1] ? 0 : 1;
          const val = Math.min(
            nextRow[j - 1]! + 1,       // insertion
            currentRow[j]! + 1,        // deletion
            currentRow[j - 1]! + cost  // match or substitution
          );
          nextRow[j] = val;
          if (val < rowMin) rowMin = val;
        }

        currentRow = nextRow;
        // Branch pruning: if minimum possible distance in row exceeds threshold, stop
        if (rowMin > maxDistance) {
          possible = false;
          break;
        }
      }

      if (possible) {
        this.fuzzyTraverse(child, currentPath + label, currentRow, target, maxDistance, results);
      }
    }
  }

  /**
   * Returns all entries stored in the tree in alphabetical order.
   */
  public getAll(): Array<{ key: string; value: T }> {
    const results: Array<{ key: string; value: T }> = [];
    this.collectEntries(this.root, '', results);
    return results;
  }

  /**
   * Computes the length of the longest common prefix between two strings.
   */
  private getCommonPrefixLength(a: string, b: string): number {
    const maxLen = Math.min(a.length, b.length);
    let i = 0;
    while (i < maxLen && a.charCodeAt(i) === b.charCodeAt(i)) {
      i++;
    }
    return i;
  }

  /**
   * Traverses a subtree and collects all terminal key-value pairs.
   */
  private collectEntries(
    node: RadixNode<T>,
    currentPath: string,
    results: Array<{ key: string; value: T }>
  ): void {
    if (node.isTerminal && node.value !== undefined) {
      results.push({ key: currentPath, value: node.value });
    }

    // Sort child keys for deterministic alphabetical order
    const sortedKeys = Array.from(node.children.keys()).sort();
    for (const key of sortedKeys) {
      const child = node.children.get(key)!;
      this.collectEntries(child, currentPath + child.edgeLabel, results);
    }
  }
}

/**
 * Term Dictionary (Lexicon) backed by a zero-dependency Radix Tree.
 * Maintains term statistics and pointers to positional postings lists.
 */
export class TermDictionary {
  private readonly tree = new RadixTree<TermEntry>();

  /**
   * Total number of unique terms in the dictionary.
   */
  public get size(): number {
    return this.tree.size;
  }

  /**
   * Retrieves an existing term entry, or creates and stores a new one if not found.
   */
  public getOrCreate(term: string): TermEntry {
    const existing = this.tree.get(term);
    if (existing) {
      return existing;
    }
    const newEntry = new TermEntry(term);
    this.tree.insert(term, newEntry);
    return newEntry;
  }

  /**
   * Retrieves the term entry for a term, or undefined if the term does not exist.
   */
  public get(term: string): TermEntry | undefined {
    return this.tree.get(term);
  }

  /**
   * Checks whether a term is present in the dictionary.
   */
  public has(term: string): boolean {
    return this.tree.has(term);
  }

  /**
   * Returns all terms present in the dictionary in alphabetical order.
   */
  public terms(): string[] {
    return this.tree.getAll().map((e) => e.key);
  }

  /**
   * Returns all term entries present in the dictionary.
   */
  public entries(): TermEntry[] {
    return this.tree.getAll().map((e) => e.value);
  }

  /**
   * Performs prefix search across dictionary terms (supports wildcard queries like `distrib*`).
   */
  public prefixSearch(prefix: string): TermEntry[] {
    return this.tree.findWithPrefix(prefix).map((e) => e.value);
  }

  /**
   * Searches for terms within maxDistance Levenshtein edit distance for typo tolerance.
   */
  public fuzzySearch(
    term: string,
    maxDistance: number = 2
  ): Array<{ term: string; entry: TermEntry; distance: number }> {
    return this.tree.findFuzzy(term, maxDistance).map((m) => ({
      term: m.key,
      entry: m.value,
      distance: m.distance,
    }));
  }

  /**
   * Returns term autocompletions for a given prefix, ranked by popularity (document frequency).
   */
  public suggest(prefix: string, limit: number = 5): string[] {
    const entries = this.prefixSearch(prefix);
    entries.sort((a, b) => b.docFrequency - a.docFrequency || a.term.localeCompare(b.term));
    return entries.slice(0, limit).map((e) => e.term);
  }
}
