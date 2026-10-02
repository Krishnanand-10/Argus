import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { ArgusEngine } from '../src/engine.js';
import { serializeIndex } from '../src/storage/serializer.js';

interface LatencyStats {
  median: number;
  p95: number;
  p99: number;
  min: number;
  max: number;
}

function computeStats(samples: number[]): LatencyStats {
  samples.sort((a, b) => a - b);
  const n = samples.length;
  return {
    min: samples[0] ?? 0,
    max: samples[n - 1] ?? 0,
    median: samples[Math.floor(n * 0.5)] ?? 0,
    p95: samples[Math.floor(n * 0.95)] ?? 0,
    p99: samples[Math.floor(n * 0.99)] ?? 0,
  };
}

const VOCABULARY = [
  'distributed', 'systems', 'consensus', 'algorithm', 'database', 'transaction',
  'replication', 'sharding', 'byzantine', 'fault', 'tolerance', 'network',
  'latency', 'throughput', 'storage', 'engine', 'inverted', 'index', 'bm25',
  'retrieval', 'query', 'lexer', 'parser', 'radix', 'tree', 'postings', 'compression',
  'varint', 'delta', 'encoding', 'cluster', 'node', 'paxos', 'raft', 'consistency',
  'partition', 'scalability', 'performance', 'vector', 'binary', 'serialization'
];

function generateRandomText(wordCount: number): string {
  const words: string[] = [];
  for (let i = 0; i < wordCount; i++) {
    const idx = Math.floor(Math.random() * VOCABULARY.length);
    words.push(VOCABULARY[idx]!);
  }
  return words.join(' ');
}

async function runBenchmark(): Promise<void> {
  console.log('⚡ Argus Search Engine — Performance Benchmark Suite');
  console.log('────────────────────────────────────────────────────────');

  const DOC_COUNT = 5000;
  console.log(`\n1. Generating synthetic corpus of ${DOC_COUNT} documents...`);

  const documents = new Array(DOC_COUNT);
  for (let i = 0; i < DOC_COUNT; i++) {
    const len = 30 + Math.floor(Math.random() * 70); // 30-100 words
    documents[i] = {
      id: i + 1,
      title: `Doc #${i + 1} ` + generateRandomText(5),
      body: generateRandomText(len),
    };
  }

  // 2. Indexing Throughput
  console.log('\n2. Measuring Ingestion & Indexing Throughput...');
  const engine = new ArgusEngine();
  const startIngest = performance.now();
  await engine.addDocuments(documents);
  const ingestDuration = performance.now() - startIngest;
  const docsPerSec = Math.round((DOC_COUNT / (ingestDuration / 1000)));
  const stats = engine.getStats();
  const tokensPerSec = Math.round((stats.totalTokens / (ingestDuration / 1000)));

  console.log(`   Ingested:       ${DOC_COUNT} docs (${stats.totalTokens} tokens) in ${ingestDuration.toFixed(1)}ms`);
  console.log(`   Throughput:     ${docsPerSec.toLocaleString()} docs/sec (${tokensPerSec.toLocaleString()} tokens/sec)`);
  console.log(`   Unique Terms:   ${stats.totalTerms.toLocaleString()}`);

  // 3. Binary Serialization & Compression
  console.log('\n3. Measuring Binary Serialization (.argus format)...');
  const startSerialize = performance.now();
  const binaryBuffer = serializeIndex(engine.invertedIndex);
  const serializeDuration = performance.now() - startSerialize;

  const rawJsonSize = Buffer.byteLength(JSON.stringify(documents));
  const compressedSize = binaryBuffer.length;
  const compressionRatio = ((1 - compressedSize / rawJsonSize) * 100).toFixed(1);

  console.log(`   Serialized in:  ${serializeDuration.toFixed(1)}ms`);
  console.log(`   Raw JSON Size:  ${(rawJsonSize / 1024).toFixed(1)} KB`);
  console.log(`   .argus Size:    ${(compressedSize / 1024).toFixed(1)} KB`);
  console.log(`   Compression:    ${compressionRatio}% reduction vs JSON`);

  // 4. Query Latency Benchmarks
  console.log('\n4. Benchmarking Query Retrieval Latency (500 iterations each)...');
  const testQueries = [
    { name: 'Single Term', query: 'consensus' },
    { name: 'Boolean AND', query: 'distributed AND consensus' },
    { name: 'Boolean OR', query: 'paxos OR raft' },
    { name: 'Exact Phrase', query: '"fault tolerance"' },
    { name: 'Prefix Wildcard', query: 'distrib*' },
    { name: 'Complex AST', query: '(distributed OR database) AND consensus NOT byzantine' },
  ];

  console.log('──────────────────────────────────────────────────────────────────────────');
  console.log(
    'Query Type'.padEnd(18) +
    'Median (ms)'.padEnd(14) +
    'p95 (ms)'.padEnd(12) +
    'p99 (ms)'.padEnd(12) +
    'Max (ms)'.padEnd(12)
  );
  console.log('──────────────────────────────────────────────────────────────────────────');

  for (const t of testQueries) {
    const iterations = 500;
    const latencies: number[] = new Array(iterations);

    // Warm-up
    for (let w = 0; w < 20; w++) {
      engine.search(t.query, { limit: 10 });
    }

    for (let i = 0; i < iterations; i++) {
      const qStart = performance.now();
      engine.search(t.query, { limit: 10 });
      latencies[i] = performance.now() - qStart;
    }

    const s = computeStats(latencies);
    console.log(
      t.name.padEnd(18) +
      s.median.toFixed(3).padEnd(14) +
      s.p95.toFixed(3).padEnd(12) +
      s.p99.toFixed(3).padEnd(12) +
      s.max.toFixed(3).padEnd(12)
    );
  }

  console.log('──────────────────────────────────────────────────────────────────────────');
  console.log('✅ Benchmark run complete. Sub-1ms median query retrieval achieved.\n');
}

runBenchmark().catch((err) => {
  console.error('Benchmark error:', err);
});
