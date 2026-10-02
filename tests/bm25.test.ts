import { describe, it, expect } from 'vitest';
import { InvertedIndex } from '../src/index/index.js';
import { MinHeap } from '../src/ranking/priority-queue.js';
import { BM25Scorer } from '../src/ranking/bm25.js';
import { TFIDFScorer } from '../src/ranking/tfidf.js';
import { WANDScorer } from '../src/query/wand.js';

describe('Ranking & Relevance Scoring', () => {
  describe('MinHeap Priority Queue', () => {
    it('maintains min-heap property and extracts elements in sorted order', () => {
      const heap = new MinHeap<number>((a, b) => a - b);
      heap.push(50);
      heap.push(20);
      heap.push(100);
      heap.push(10);
      heap.push(30);

      expect(heap.size).toBe(5);
      expect(heap.peek()).toBe(10);

      // toSortedArray returns descending order (highest score first)
      expect(heap.toSortedArray()).toEqual([100, 50, 30, 20, 10]);

      // Pop extracts from minimum to maximum
      expect(heap.pop()).toBe(10);
      expect(heap.pop()).toBe(20);
      expect(heap.pop()).toBe(30);
      expect(heap.pop()).toBe(50);
      expect(heap.pop()).toBe(100);
      expect(heap.pop()).toBeUndefined();
    });

    it('enforces maximum capacity for bounded Top-K extraction', () => {
      // Keep top 3 highest numbers: compare returns a - b (root is smallest)
      const top3 = new MinHeap<number>((a, b) => a - b, 3);
      top3.push(10);
      top3.push(50);
      top3.push(20);
      top3.push(5);  // Discarded (smaller than root 10)
      top3.push(80); // Replaces root 10
      top3.push(30); // Replaces root 20

      expect(top3.size).toBe(3);
      expect(top3.toSortedArray()).toEqual([80, 50, 30]);
    });
  });

  describe('Okapi BM25 Scorer', () => {
    it('assigns higher IDF scores to rarer terms', () => {
      const scorer = new BM25Scorer();
      const totalDocs = 1000;

      const rareTermIDF = scorer.computeIDF(5, totalDocs);     // appears in 5 docs
      const commonTermIDF = scorer.computeIDF(500, totalDocs); // appears in 500 docs

      expect(rareTermIDF).toBeGreaterThan(commonTermIDF);
      expect(rareTermIDF).toBeGreaterThan(0);
      expect(commonTermIDF).toBeGreaterThan(0);
    });

    it('exhibits non-linear term frequency saturation', () => {
      const scorer = new BM25Scorer({ k1: 1.2, b: 0.75 });
      const idf = 2.0;
      const docLength = 100;
      const avgDocLength = 100;

      const score1 = scorer.scoreTerm(1, docLength, avgDocLength, idf);
      const score2 = scorer.scoreTerm(2, docLength, avgDocLength, idf);
      const score10 = scorer.scoreTerm(10, docLength, avgDocLength, idf);

      // Score increases with TF, but saturates
      expect(score2).toBeGreaterThan(score1);
      expect(score10).toBeGreaterThan(score2);
      // 10x term frequency produces substantially less than 10x the score
      expect(score10).toBeLessThan(score1 * 10);
    });

    it('penalizes longer documents via document length normalization', () => {
      const scorer = new BM25Scorer({ k1: 1.2, b: 0.75 });
      const idf = 2.0;
      const tf = 2;
      const avgDocLength = 100;

      const shortDocScore = scorer.scoreTerm(tf, 50, avgDocLength, idf);
      const longDocScore = scorer.scoreTerm(tf, 300, avgDocLength, idf);

      // Shorter document with same TF receives higher relevance
      expect(shortDocScore).toBeGreaterThan(longDocScore);
    });

    it('ranks documents accurately across an inverted index', () => {
      const index = new InvertedIndex();
      index.addDocuments([
        {
          id: 1,
          title: 'Distributed Consensus',
          body: 'Consensus algorithms consensus consensus.', // high TF for consensus
        },
        {
          id: 2,
          title: 'Distributed Databases',
          body: 'Distributed databases with Paxos consensus.', // lower TF for consensus
        },
        {
          id: 3,
          title: 'Machine Learning',
          body: 'Deep learning models and neural networks.',
        },
      ]);

      const scorer = new BM25Scorer();
      const results = scorer.rank([1, 2], ['consensus'], index, 5);

      expect(results.length).toBe(2);
      expect(results[0]!.docId).toBe(1); // Higher TF ranks #1
      expect(results[1]!.docId).toBe(2);
      expect(results[0]!.score).toBeGreaterThan(results[1]!.score);
    });
  });

  describe('TF-IDF Scorer', () => {
    it('scores and ranks documents using classic TF-IDF formulation', () => {
      const index = new InvertedIndex();
      index.addDocuments([
        { id: 1, text: 'Search engines and inverted index.' },
        { id: 2, text: 'Relational database query execution.' },
      ]);

      const scorer = new TFIDFScorer();
      const results = scorer.rank([1, 2], ['search', 'engine'], index);

      expect(results.length).toBe(1);
      expect(results[0]!.docId).toBe(1);
      expect(results[0]!.score).toBeGreaterThan(0);
    });
  });

  describe('WAND Dynamic Query Pruning', () => {
    it('prunes non-competitive documents while preserving top-K ranking accuracy', () => {
      const index = new InvertedIndex();
      for (let i = 1; i <= 20; i++) {
        index.addDocument({
          id: i,
          text: `Document ${i} about distributed systems and consensus algorithms in cluster ${i}`,
        });
      }

      // Add a document with extremely high relevance
      index.addDocument({
        id: 99,
        text: 'Consensus consensus consensus distributed consensus algorithm.',
      });

      const wand = new WANDScorer();
      const topK = wand.search(['distributed', 'consensus'], index, 3);

      expect(topK.length).toBe(3);
      expect(topK[0]!.docId).toBe(99); // Most relevant document is ranked #1
    });
  });
});
