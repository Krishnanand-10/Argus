import { describe, it, expect } from 'vitest';
import {
  InvertedIndex,
  PostingsList,
  RadixTree,
  TermDictionary,
  intersectTwoDocIds,
  intersectMultiple,
  unionMultiple,
  intersectPhrase,
} from '../src/index/index.js';

describe('Phase 2: Inverted Index & Positional Postings', () => {
  describe('PostingsList', () => {
    it('records term frequencies and word positions correctly', () => {
      const list = new PostingsList();

      list.add(1, 0);
      list.add(1, 3);
      list.add(1, 5);

      expect(list.length).toBe(1);
      expect(list.docFrequency).toBe(1);
      expect(list.totalTermFrequency).toBe(3);

      const p1 = list.get(0)!;
      expect(p1.docId).toBe(1);
      expect(p1.termFrequency).toBe(3);
      expect(p1.positions).toEqual([0, 3, 5]);
    });

    it('maintains monotonic document order across multiple documents', () => {
      const list = new PostingsList();
      list.add(1, 2);
      list.add(3, 0);
      list.add(7, 4);

      expect(list.length).toBe(3);
      expect(list.docFrequency).toBe(3);
      expect(list.totalTermFrequency).toBe(3);

      expect(list.getAll().map((p) => p.docId)).toEqual([1, 3, 7]);
      expect(list.hasDoc(3)).toBe(true);
      expect(list.hasDoc(5)).toBe(false);

      const p3 = list.getPostingForDoc(3);
      expect(p3?.positions).toEqual([0]);
    });

    it('handles out-of-order docId additions gracefully', () => {
      const list = new PostingsList();
      list.add(10, 1);
      list.add(2, 5);
      list.add(5, 3);

      expect(list.getAll().map((p) => p.docId)).toEqual([2, 5, 10]);
      expect(list.totalTermFrequency).toBe(3);
    });

    it('is iterable with for..of', () => {
      const list = new PostingsList();
      list.add(1, 0);
      list.add(2, 1);

      const docIds: number[] = [];
      for (const p of list) {
        docIds.push(p.docId);
      }
      expect(docIds).toEqual([1, 2]);
    });

    it('generates skip pointers every floor(sqrt(L)) for accelerated traversal', () => {
      const list = new PostingsList();
      // Add 16 documents (sqrt(16) = 4, skip step = 4)
      for (let i = 0; i < 16; i++) {
        list.add(i * 10, 0);
      }

      list.buildSkips();

      // At index 0, should skip to index 4 (docId 40)
      const skip0 = list.getSkip(0);
      expect(skip0).toBeDefined();
      expect(skip0?.postingIndex).toBe(4);
      expect(skip0?.targetDocId).toBe(40);

      // At index 4, should skip to index 8 (docId 80)
      const skip4 = list.getSkip(4);
      expect(skip4).toBeDefined();
      expect(skip4?.postingIndex).toBe(8);
      expect(skip4?.targetDocId).toBe(80);

      // At index 8, should skip to index 12 (docId 120)
      const skip8 = list.getSkip(8);
      expect(skip8).toBeDefined();
      expect(skip8?.postingIndex).toBe(12);
      expect(skip8?.targetDocId).toBe(120);

      // Beyond 12 (12 + 4 = 16 is out of bounds), no skip pointer
      expect(list.getSkip(12)).toBeUndefined();
    });
  });

  describe('RadixTree & TermDictionary', () => {
    it('inserts and retrieves keys with common prefixes via edge splitting', () => {
      const tree = new RadixTree<number>();
      tree.insert('car', 1);
      tree.insert('cart', 2);
      tree.insert('cat', 3);
      tree.insert('dog', 4);
      tree.insert('door', 5);

      expect(tree.size).toBe(5);
      expect(tree.get('car')).toBe(1);
      expect(tree.get('cart')).toBe(2);
      expect(tree.get('cat')).toBe(3);
      expect(tree.get('dog')).toBe(4);
      expect(tree.get('door')).toBe(5);
      expect(tree.get('unknown')).toBeUndefined();
    });

    it('handles root and prefix keys correctly', () => {
      const tree = new RadixTree<string>();
      tree.insert('test', 'short');
      tree.insert('testing', 'long');
      tree.insert('tester', 'agent');

      expect(tree.size).toBe(3);
      expect(tree.get('test')).toBe('short');
      expect(tree.get('testing')).toBe('long');
      expect(tree.get('tester')).toBe('agent');
      expect(tree.has('tes')).toBe(false);
    });

    it('performs prefix search to support wildcard/prefix queries', () => {
      const tree = new RadixTree<string>();
      tree.insert('distribute', 'v');
      tree.insert('distribution', 'n');
      tree.insert('distributed', 'adj');
      tree.insert('distinct', 'adj');
      tree.insert('database', 'n');

      const matches = tree.findWithPrefix('distrib');
      const keys = matches.map((m) => m.key);

      expect(keys.length).toBe(3);
      expect(keys).toContain('distribute');
      expect(keys).toContain('distribution');
      expect(keys).toContain('distributed');
      expect(keys).not.toContain('distinct');
      expect(keys).not.toContain('database');
    });

    it('manages term entries and statistics in TermDictionary', () => {
      const dict = new TermDictionary();
      const entry = dict.getOrCreate('consensus');

      entry.postings.add(1, 0);
      entry.postings.add(2, 4);

      expect(dict.size).toBe(1);
      expect(dict.has('consensus')).toBe(true);
      expect(dict.get('consensus')?.docFrequency).toBe(2);
      expect(dict.get('consensus')?.totalTermFrequency).toBe(2);
      expect(dict.terms()).toEqual(['consensus']);
    });
  });

  describe('Skip List & Intersections', () => {
    it('intersects two postings lists correctly using skip pointers', () => {
      const listA = new PostingsList();
      const listB = new PostingsList();

      for (let i = 0; i < 20; i++) {
        listA.add(i * 2, 0); // 0, 2, 4, 6, 8, 10, ... 38
      }
      for (let i = 0; i < 10; i++) {
        listB.add(i * 4, 0); // 0, 4, 8, 12, 16, 20, 24, 28, 32, 36
      }

      listA.buildSkips();
      listB.buildSkips();

      const common = intersectTwoDocIds(listA, listB);
      expect(common).toEqual([0, 4, 8, 12, 16, 20, 24, 28, 32, 36]);
    });

    it('evaluates multi-list Boolean AND intersections', () => {
      const l1 = new PostingsList();
      const l2 = new PostingsList();
      const l3 = new PostingsList();

      l1.add(1, 0);
      l1.add(2, 0);
      l1.add(3, 0);

      l2.add(2, 0);
      l2.add(3, 0);
      l2.add(4, 0);

      l3.add(3, 0);
      l3.add(5, 0);

      expect(intersectMultiple([l1, l2, l3])).toEqual([3]);
      expect(intersectMultiple([l1, l2])).toEqual([2, 3]);
    });

    it('evaluates Boolean OR unions correctly', () => {
      const l1 = new PostingsList();
      const l2 = new PostingsList();

      l1.add(1, 0);
      l1.add(3, 0);

      l2.add(2, 0);
      l2.add(3, 0);
      l2.add(4, 0);

      expect(unionMultiple([l1, l2])).toEqual([1, 2, 3, 4]);
    });

    it('performs exact positional phrase search', () => {
      const termA = new PostingsList(); // "distributed"
      const termB = new PostingsList(); // "consensus"

      // Doc 1: "distributed consensus" -> positions 0, 1 (exact match)
      termA.add(1, 0);
      termB.add(1, 1);

      // Doc 2: "consensus distributed" -> positions 1, 0 (reverse order, should NOT match)
      termA.add(2, 1);
      termB.add(2, 0);

      // Doc 3: "distributed algorithm with consensus" -> positions 0, 3 (not consecutive)
      termA.add(3, 0);
      termB.add(3, 3);

      // Doc 4: multiple occurrences "distributed consensus ... distributed consensus" -> positions 0, 1 and 10, 11
      termA.add(4, 0);
      termB.add(4, 1);
      termA.add(4, 10);
      termB.add(4, 11);

      const matches = intersectPhrase([termA, termB], 0);

      expect(matches.length).toBe(2);
      expect(matches[0]!.docId).toBe(1);
      expect(matches[0]!.matchPositions).toEqual([0]);

      expect(matches[1]!.docId).toBe(4);
      expect(matches[1]!.matchPositions).toEqual([0, 10]);
    });

    it('supports phrase search with slop', () => {
      const termA = new PostingsList();
      const termB = new PostingsList();

      // Doc 1: "distributed fault-tolerant consensus" -> positions 0, 2 (1 word apart)
      termA.add(1, 0);
      termB.add(1, 2);

      // Slop = 0: no match
      expect(intersectPhrase([termA, termB], 0)).toEqual([]);

      // Slop = 1: matches
      const matches = intersectPhrase([termA, termB], 1);
      expect(matches.length).toBe(1);
      expect(matches[0]!.docId).toBe(1);
    });
  });

  describe('InvertedIndex Engine', () => {
    it('indexes documents and computes accurate index statistics', () => {
      const index = new InvertedIndex();

      index.addDocuments([
        {
          id: 1,
          title: 'Distributed Systems',
          body: 'Consensus algorithms such as Paxos and Raft ensure fault tolerance.',
        },
        {
          id: 2,
          title: 'Full-Text Search Engines',
          body: 'Inverted indexes and BM25 ranking provide fast information retrieval.',
        },
      ]);

      const stats = index.getStats();
      expect(stats.totalDocuments).toBe(2);
      expect(stats.totalTerms).toBeGreaterThan(0);
      expect(stats.totalTokens).toBeGreaterThan(0);
      expect(stats.averageDocLength).toBe(stats.totalTokens / 2);

      expect(index.getDocLength(1)).toBeGreaterThan(0);
      expect(index.getDocLength(2)).toBeGreaterThan(0);
      expect(index.getDocument(1)?.id).toBe(1);
    });

    it('rejects duplicate document IDs', () => {
      const index = new InvertedIndex();
      index.addDocument({ id: 1, text: 'Hello world' });
      expect(() => {
        index.addDocument({ id: 1, text: 'Duplicate ID' });
      }).toThrow(/already exists/);
    });

    it('retrieves normalized term postings and metadata', () => {
      const index = new InvertedIndex();
      index.addDocument({
        id: 1,
        text: 'Distributed databases enable distributed consensus.',
      });

      // Stem of 'distributed' -> 'distribut'
      const postings = index.getPostings('distributed');
      expect(postings).toBeDefined();
      expect(postings?.length).toBe(1);
      expect(postings?.totalTermFrequency).toBe(2);

      const meta = index.getTermMetadata('distributed');
      expect(meta?.term).toBe('distribut');
      expect(meta?.docFrequency).toBe(1);
      expect(meta?.totalTermFrequency).toBe(2);
    });

    it('executes Boolean AND queries', () => {
      const index = new InvertedIndex();
      index.addDocuments([
        { id: 1, text: 'Distributed consensus algorithms in database systems.' },
        { id: 2, text: 'Relational database systems without consensus.' },
        { id: 3, text: 'Machine learning algorithms and neural networks.' },
      ]);

      const results = index.searchBooleanAnd(['database', 'consensus']);
      expect(results).toEqual([1, 2]);

      const narrowResults = index.searchBooleanAnd(['distributed', 'database', 'consensus']);
      expect(narrowResults).toEqual([1]);

      const emptyResults = index.searchBooleanAnd(['database', 'quantum']);
      expect(emptyResults).toEqual([]);
    });

    it('executes Boolean OR queries', () => {
      const index = new InvertedIndex();
      index.addDocuments([
        { id: 1, text: 'Paxos consensus' },
        { id: 2, text: 'Raft consensus' },
        { id: 3, text: 'Zookeeper coordinator' },
      ]);

      const results = index.searchBooleanOr(['paxos', 'zookeeper']);
      expect(results).toEqual([1, 3]);
    });

    it('executes exact phrase searches across documents', () => {
      const index = new InvertedIndex();
      index.addDocuments([
        {
          id: 1,
          text: 'We study Byzantine fault tolerance in distributed networks.',
        },
        {
          id: 2,
          text: 'Fault tolerance is critical, even in Byzantine environments.',
        },
      ]);

      // Exact phrase: "byzantine fault tolerance"
      const matches = index.searchPhrase('byzantine fault tolerance');
      expect(matches.length).toBe(1);
      expect(matches[0]!.docId).toBe(1);

      // Non-existent phrase
      expect(index.searchPhrase('quantum neural network')).toEqual([]);
    });

    it('supports prefix wildcard lookups across indexed terms', () => {
      const index = new InvertedIndex();
      index.addDocuments([
        { id: 1, text: 'Distribution of distributed systems.' },
        { id: 2, text: 'Data structures and algorithms.' },
      ]);

      // Both 'distribution' and 'distributed' stem to 'distribut'
      const prefixResults = index.searchPrefix('distrib');
      expect(prefixResults.length).toBeGreaterThan(0);
      expect(prefixResults.some((e) => e.term.startsWith('distrib'))).toBe(true);
    });
  });
});
