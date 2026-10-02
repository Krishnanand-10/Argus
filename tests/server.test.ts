import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ArgusEngine } from '../src/engine.js';
import { ArgusServer } from '../src/server/server.js';
import { parseArgs } from '../src/cli.js';

describe('Server & CLI Suite', () => {
  describe('CLI Argument Parser', () => {
    it('parses index command arguments', () => {
      const args = parseArgs(['index', '--source', './docs', '--output', './indices/docs.argus']);
      expect(args.command).toBe('index');
      expect(args.source).toBe('./docs');
      expect(args.output).toBe('./indices/docs.argus');
    });

    it('parses search command arguments with query and limit', () => {
      const args = parseArgs(['search', '--index', './indices/docs.argus', 'distributed consensus', '--limit', '5']);
      expect(args.command).toBe('search');
      expect(args.index).toBe('./indices/docs.argus');
      expect(args.query).toBe('distributed consensus');
      expect(args.limit).toBe(5);
    });

    it('parses serve command arguments with custom port', () => {
      const args = parseArgs(['serve', '--index', './indices/docs.argus', '--port', '8080']);
      expect(args.command).toBe('serve');
      expect(args.index).toBe('./indices/docs.argus');
      expect(args.port).toBe(8080);
    });

    it('parses stats command arguments', () => {
      const args = parseArgs(['stats', '--index', './indices/docs.argus']);
      expect(args.command).toBe('stats');
      expect(args.index).toBe('./indices/docs.argus');
    });
  });

  describe('Argus HTTP Server & Web UI', () => {
    let engine: ArgusEngine;
    let server: ArgusServer;
    let port: number;

    beforeAll(async () => {
      engine = new ArgusEngine();
      await engine.addDocuments([
        {
          id: 1,
          title: 'Distributed Systems',
          body: 'Paxos and Raft consensus algorithms power distributed database clusters.',
        },
        {
          id: 2,
          title: 'Information Retrieval',
          body: 'Inverted indexes with BM25 scoring provide sub-millisecond full text search.',
        },
      ]);

      server = new ArgusServer(engine);
      // Listen on random available port
      port = await server.start({ port: 0, host: '127.0.0.1' });
    });

    afterAll(async () => {
      await server.stop();
    });

    it('serves embedded HTML web search playground at GET /', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/`);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/html');

      const html = await res.text();
      expect(html).toContain('Argus — Full-Text Search Playground');
      expect(html).toContain('queryInput');
    });

    it('returns JSON stats at GET /api/stats', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/stats`);
      expect(res.status).toBe(200);

      const stats = await res.json();
      expect(stats.totalDocuments).toBe(2);
      expect(stats.totalTerms).toBeGreaterThan(0);
      expect(stats.averageDocLength).toBeGreaterThan(0);
    });

    it('executes search queries at GET /api/search', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/search?q=consensus&limit=5`);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.query).toBe('consensus');
      expect(data.totalResults).toBe(1);
      expect(data.results.length).toBe(1);
      expect(data.results[0].docId).toBe(1);
      expect(data.executionTimeMs).toBeDefined();
    });

    it('indexes new documents dynamically at POST /api/index', async () => {
      const newDoc = {
        id: 3,
        title: 'Quantum Computing',
        body: 'Quantum algorithms for cryptography and error correction.',
      };

      const postRes = await fetch(`http://127.0.0.1:${port}/api/index`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newDoc),
      });

      expect(postRes.status).toBe(201);

      // Search for the newly indexed document
      const searchRes = await fetch(`http://127.0.0.1:${port}/api/search?q=quantum`);
      const searchData = await searchRes.json();

      expect(searchData.totalResults).toBe(1);
      expect(searchData.results[0].docId).toBe(3);
    });

    it('handles batch file uploads dynamically at POST /api/upload', async () => {
      const uploadPayload = {
        files: [
          {
            name: 'graph-databases.md',
            content: 'Graph databases use nodes and edges to model complex relational graphs and topological networks.',
          },
          {
            name: 'vector-search.json',
            content: JSON.stringify({
              title: 'Vector Embeddings',
              body: 'Approximate nearest neighbor search across high-dimensional vector spaces.',
            }),
          },
        ],
      };

      const res = await fetch(`http://127.0.0.1:${port}/api/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(uploadPayload),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.addedCount).toBe(2);

      // Verify the uploaded document is immediately searchable
      const searchRes = await fetch(`http://127.0.0.1:${port}/api/search?q=topological`);
      const searchData = await searchRes.json();
      expect(searchData.totalResults).toBe(1);
      expect(searchData.results[0].snippet).toContain('**topological**');
    });
  });
});
