import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { tokenizeQuery } from '../src/query/lexer.js';
import { QueryParser } from '../src/query/parser.js';
import { QueryEvaluator } from '../src/query/evaluator.js';
import { ArgusEngine } from '../src/engine.js';
import { InvertedIndex } from '../src/index/index.js';

describe('Query Parsing & Execution Engine', () => {
  describe('Query Lexer', () => {
    it('scans keywords, operators, phrases, and wildcards', () => {
      const query = 'distributed AND "fault tolerance" OR distrib* NOT (paxos || raft) !bad -old';
      const tokens = tokenizeQuery(query);

      const types = tokens.map((t) => t.type);
      expect(types).toContain('TERM');
      expect(types).toContain('AND');
      expect(types).toContain('PHRASE');
      expect(types).toContain('OR');
      expect(types).toContain('PREFIX');
      expect(types).toContain('NOT');
      expect(types).toContain('LPAREN');
      expect(types).toContain('RPAREN');

      const phraseToken = tokens.find((t) => t.type === 'PHRASE');
      expect(phraseToken?.value).toBe('fault tolerance');

      const prefixToken = tokens.find((t) => t.type === 'PREFIX');
      expect(prefixToken?.value).toBe('distrib');
    });
  });

  describe('Recursive-Descent Query Parser', () => {
    const parser = new QueryParser();

    it('parses single term queries', () => {
      const ast = parser.parse('database');
      expect(ast).toEqual({ type: 'TERM', value: 'database' });
    });

    it('parses explicit and implicit Boolean AND queries', () => {
      const explicitAst = parser.parse('distributed AND consensus');
      expect(explicitAst.type).toBe('AND');

      const implicitAst = parser.parse('distributed consensus');
      expect(implicitAst.type).toBe('AND');
    });

    it('parses Boolean OR expressions', () => {
      const ast = parser.parse('rust OR typescript');
      expect(ast.type).toBe('OR');
    });

    it('parses negation NOT expressions', () => {
      const ast = parser.parse('engine NOT storage');
      expect(ast.type).toBe('AND');
      // Children: [TERM engine, NOT(TERM storage)]
      const children = (ast as any).children;
      expect(children[0]).toEqual({ type: 'TERM', value: 'engine' });
      expect(children[1].type).toBe('NOT');
      expect(children[1].child).toEqual({ type: 'TERM', value: 'storage' });
    });

    it('parses quoted exact phrases and prefix wildcards', () => {
      const phraseAst = parser.parse('"byzantine fault tolerance"');
      expect(phraseAst).toEqual({
        type: 'PHRASE',
        terms: ['byzantine', 'fault', 'tolerance'],
      });

      const prefixAst = parser.parse('distrib*');
      expect(prefixAst).toEqual({
        type: 'PREFIX',
        prefix: 'distrib',
      });
    });

    it('parses nested parentheses with operator precedence', () => {
      const ast = parser.parse('(distributed OR decentralized) AND consensus');
      expect(ast.type).toBe('AND');
      const children = (ast as any).children;
      expect(children[0].type).toBe('OR');
      expect(children[1]).toEqual({ type: 'TERM', value: 'consensus' });
    });
  });

  describe('QueryEvaluator & Snippet Highlights', () => {
    let index: InvertedIndex;
    let evaluator: QueryEvaluator;

    beforeEach(() => {
      index = new InvertedIndex();
      evaluator = new QueryEvaluator();

      index.addDocuments([
        {
          id: 1,
          title: 'Distributed Systems Overview',
          body: 'Paxos and Raft are consensus algorithms ensuring high availability and fault tolerance in networks.',
        },
        {
          id: 2,
          title: 'Database Architecture',
          body: 'Relational database query optimization with inverted indexes.',
        },
        {
          id: 3,
          title: 'Blockchain Consensus',
          body: 'Byzantine fault tolerance algorithms power decentralized networks.',
        },
      ]);
    });

    it('evaluates boolean queries and ranks results', () => {
      const results = evaluator.search('algorithms AND "fault tolerance"', index);
      expect(results.length).toBe(2);
      expect(results.map((r) => r.docId)).toContain(1);
      expect(results.map((r) => r.docId)).toContain(3);
    });

    it('evaluates negation to exclude documents', () => {
      const results = evaluator.search('algorithms NOT blockchain', index);
      expect(results.length).toBe(1);
      expect(results[0]!.docId).toBe(1);
    });

    it('evaluates prefix searches', () => {
      const results = evaluator.search('distrib*', index);
      expect(results.length).toBe(1);
      expect(results[0]!.docId).toBe(1);
    });

    it('generates highlighted text snippets with markdown bolding', () => {
      const results = evaluator.search('"fault tolerance"', index);
      expect(results.length).toBeGreaterThan(0);
      const snippet = results[0]?.snippet;
      expect(snippet).toBeDefined();
      expect(snippet).toContain('**fault**');
      expect(snippet).toContain('**tolerance**');
    });
  });

  describe('ArgusEngine High-Level API', () => {
    let tempDir: string;

    beforeEach(async () => {
      tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'argus-engine-'));
    });

    afterEach(async () => {
      if (fs.existsSync(tempDir)) {
        await fs.promises.rm(tempDir, { recursive: true, force: true });
      }
    });

    it('indexes, searches, persists to .argus file, and reloads from disk', async () => {
      const engine = new ArgusEngine({ k1: 1.2, b: 0.75 });

      await engine.addDocuments([
        {
          id: 1,
          title: 'Distributed Systems Architecture',
          body: 'Consensus algorithms such as Paxos and Raft ensure high availability and fault tolerance.',
        },
        {
          id: 2,
          title: 'Search Engines from First Principles',
          body: 'Inverted indexes, postings lists, and Okapi BM25 ranking provide sub-millisecond retrieval.',
        },
      ]);

      // Query active engine
      const searchResults = engine.search('consensus AND "fault tolerance"', { limit: 5 });
      expect(searchResults.length).toBe(1);
      expect(searchResults[0]!.docId).toBe(1);
      expect(searchResults[0]!.score).toBeGreaterThan(0);

      // Commit to disk binary .argus
      const indexPath = path.join(tempDir, 'library.argus');
      await engine.commit(indexPath);
      expect(fs.existsSync(indexPath)).toBe(true);

      // Reload into fresh engine
      const restoredEngine = await ArgusEngine.load(indexPath);
      const restoredResults = restoredEngine.search('consensus AND "fault tolerance"', { limit: 5 });

      expect(restoredResults.length).toBe(1);
      expect(restoredResults[0]!.docId).toBe(1);
      expect(restoredResults[0]!.score).toBeCloseTo(searchResults[0]!.score, 3);
    });

    it('performs automatic typo tolerance when words have minor spelling errors', async () => {
      const engine = new ArgusEngine();
      await engine.addDocuments([
        {
          id: 1,
          title: 'Distributed Systems Architecture',
          body: 'Consensus algorithms such as Paxos and Raft ensure high availability and fault tolerance.',
        },
        {
          id: 2,
          title: 'Full-Text Search Engine',
          body: 'Inverted indexes, postings lists, and Okapi BM25 ranking provide sub-millisecond retrieval.',
        },
      ]);

      // Typo 'postngs' (missing 'i') -> should automatically find Doc 2
      const typoResults = engine.search('postngs');
      expect(typoResults.length).toBeGreaterThan(0);
      expect(typoResults[0]!.docId).toBe(2);

      // Explicit fuzzy query: 'algoritm~2'
      const fuzzyResults = engine.search('algoritm~2');
      expect(fuzzyResults.length).toBeGreaterThan(0);
      expect(fuzzyResults[0]!.docId).toBe(1);
    });

    it('generates highlighted snippets with word stem matching', async () => {
      const engine = new ArgusEngine();
      await engine.addDocuments([
        {
          id: 1,
          title: 'Database Internals',
          body: 'Modern database systems use write-ahead logging to guarantee durability and transaction atomicity.',
        },
      ]);

      const results = engine.search('logging durability', { highlight: true });
      expect(results.length).toBe(1);
      expect(results[0]!.snippet).toBeDefined();
      expect(results[0]!.snippet).toContain('**');
    });

    it('returns autocomplete suggestions via engine.suggest', async () => {
      const engine = new ArgusEngine();
      await engine.addDocuments([
        { id: 1, text: 'Distributed consensus algorithms in decentralized networks.' },
      ]);

      const suggestions = engine.suggest('dist', 3);
      expect(suggestions.length).toBeGreaterThan(0);
    });
  });
});
