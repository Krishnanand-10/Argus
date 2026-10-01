# ⚡ Argus

> **A high-performance, zero-dependency full-text search engine engineered from first principles in pure TypeScript.**  
> Featuring inverted indexing with positional postings, Varint/VByte binary disk serialization, Okapi BM25 ranking, and an AST-based boolean/phrase query execution engine.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white&style=flat-square)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D20.0.0-339933?logo=node.js&logoColor=white&style=flat-square)](https://nodejs.org/)
[![Bun Compatible](https://img.shields.io/badge/Bun-Compatible-f472b6?logo=bun&logoColor=white&style=flat-square)](https://bun.sh/)
[![Architecture](https://img.shields.io/badge/Index-Positional%20Inverted%20Index-blueviolet?style=flat-square)](#architecture--data-flow)
[![Scoring](https://img.shields.io/badge/Ranking-Okapi%20BM25-orange?style=flat-square)](#34-relevance-scoring--ranking-engine)
[![License](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)

---

## 📑 Table of Contents

- [Overview & Philosophy](#-overview--philosophy)
- [Architecture & Data Flow](#-architecture--data-flow)
- [Core Engine Modules](#-core-engine-modules)
  - [1. Text Analysis & Tokenization Pipeline](#1-text-analysis--tokenization-pipeline)
  - [2. Inverted Index & Positional Postings](#2-inverted-index--positional-postings)
  - [3. Binary Disk Storage & Compression (VByte + D-Gaps)](#3-binary-disk-storage--compression-vbyte--d-gaps)
  - [4. Relevance Scoring & Ranking (Okapi BM25)](#4-relevance-scoring--ranking-okapi-bm25)
  - [5. Query Parser & AST Execution Engine](#5-query-parser--ast-execution-engine)
  - [6. Segment Management & WAL (Write-Ahead Log)](#6-segment-management--wal-write-ahead-log)
- [Directory Layout](#-directory-layout)
- [Quickstart & Usage](#-quickstart--usage)
  - [Programmatic TypeScript API](#programmatic-typescript-api)
  - [CLI Commands](#command-line-interface)
- [Query Syntax Reference](#-query-syntax-reference)
- [Performance & Benchmark Goals](#-performance--benchmark-goals)
- [Engineering Roadmap](#-engineering-roadmap)
- [License](#-license)

---

## 💡 Overview & Philosophy

Modern search engines often rely on heavy external runtimes (e.g., JVM-based Lucene/Elasticsearch) or C++/Rust libraries. **Argus** proves that systems-level information retrieval can be implemented in **100% pure TypeScript** with mechanical sympathy for the V8 JavaScript engine.

### Why Systems Engineering in TypeScript?
1. **Zero External Dependencies**: All tokenizers, stemmers, compression algorithms, and data structures are built from scratch without bloated third-party libraries.
2. **Buffer-First Memory Management**: Rather than allocating millions of fragmented JavaScript objects that trigger Garbage Collection (GC) pauses, Argus operates on contiguous typed arrays (`Uint8Array`, `Uint32Array`, `Float32Array`) and raw Node.js/Bun binary `Buffer`s.
3. **Sub-10ms Latency**: Designed for lightning-fast retrieval across 100,000+ documents with bounded memory usage and optimized bitwise operations.
4. **Deterministic Binary Format**: Indexes are serialized into a custom, compact `.argus` binary disk format using **Variable-Byte (Varint)** encoding and **Delta (d-gap)** integer compression.

---

## 📐 Architecture & Data Flow

```
+-----------------------------------------------------------------------------------+
|                              DOCUMENT INGESTION                                   |
|   JSON, Markdown, Raw Text, HTML -> Ingestion Buffer -> Document ID Assignment    |
+-----------------------------------------+-----------------------------------------+
                                          |
                                          v
+-----------------------------------------------------------------------------------+
|                        TEXT ANALYSIS PIPELINE (Analyzer)                          |
|  [Raw Text] -> Character Filter -> Unicode Tokenizer -> Normalizer (Lowercase)   |
|             -> Stopword Eliminator -> Porter Stemmer -> Token Stream [Term, Pos]  |
+-----------------------------------------+-----------------------------------------+
                                          |
                                          v
+-----------------------------------------------------------------------------------+
|                     INVERTED INDEX ENGINE (In-Memory Segment)                     |
|  Lexicon / Radix Tree Dictionary        Postings Lists (DocID, TF, Positions)     |
|  +--------------------+                 +---------------------------------------+ |
|  | "distribut": Term  | --------------> | Doc#1 [TF: 3, Pos: 4, 18, 42] -> Doc#5| |
|  | "system":    Term  | --------------> | Doc#1 [TF: 1, Pos: 5] -> Doc#8        | |
|  +--------------------+                 +---------------------------------------+ |
+-----------------------------------------+-----------------------------------------+
                                          | (Segment Flush / Commit)
                                          v
+-----------------------------------------------------------------------------------+
|                       BINARY DISK STORAGE (.argus Format)                         |
|  [Magic Bytes] [Header & Meta] [Dictionary Offsets] [VByte + D-Gap Postings Blob] |
+-----------------------------------------+-----------------------------------------+
                                          ^
                                          |
+-----------------------------------------------------------------------------------+
|                        QUERY EXECUTION & RANKING ENGINE                           |
|  Search Query: `system AND "distributed consensus" -byzantine`                    |
|       |                                                                           |
|       v                                                                           |
|  Lexer -> AST Parser -> Boolean Plan -> Fast Intersection (Skip Pointers)          |
|       |                                                                           |
|       +--> Okapi BM25 Scorer (k1 = 1.2, b = 0.75) -> MinHeap Priority Queue       |
|       |                                                                           |
|       v                                                                           |
|  Ranked Search Results (DocIDs, BM25 Scores, Snippets & Term Highlights)          |
+-----------------------------------------------------------------------------------+
```

---

## 🔬 Core Engine Modules

### 1. Text Analysis & Tokenization Pipeline
Located in `src/analyzer/`, this module converts raw character streams into normalized token streams.

- **Character Normalization**: Unicode NFKD decomposition, strip control characters and accents.
- **Tokenizer**: Splits on whitespace and word boundaries (`/[^\p{L}\p{N}_]+/u`), emitting tokens with byte start/end offsets.
- **Stopword Filter**: Eliminates high-frequency, low-entropy words (customizable English dictionary with ~170 standard stop terms).
- **Porter Stemmer (Stemming Algorithm)**: An implementation of the 5-phase Porter Stemming Algorithm to collapse morphological variations (e.g., `searching`, `searched`, `searcher` $\to$ `search`).
- **N-Gram & Edge N-Gram Generator**: Configurable sub-token generation for prefix matching, instant autocomplete, and spelling correction.

### 2. Inverted Index & Positional Postings
Located in `src/index/`, this module provides the primary index structures.

- **Lexicon (Term Dictionary)**: A high-performance trie / hash-map hybrid storing term statistics:
  - Document frequency ($df_t$)
  - Total term frequency ($ttf_t$)
  - Pointer to postings list offset in memory or disk.
- **Postings List Structure**:
  ```ts
  interface Posting {
    docId: number;          // Unique monotonic document identifier
    termFrequency: number;  // Occurrences in document
    positions: number[];    // Word index offsets for phrase queries
  }
  ```
- **Skip Lists**: Interleaved skip pointers every $\lfloor\sqrt{L}\rfloor$ entries to skip non-matching document blocks during multi-term `AND` intersections in $O(\min(N, M))$ instead of linear scans.

### 3. Binary Disk Storage & Compression (VByte + D-Gaps)
Located in `src/storage/`, this module enables persistence with zero JSON serialization overhead.

- **Delta Encoding (D-Gaps)**: Because document IDs in a postings list are strictly increasing ($104, 107, 120, 155$), we compute and store differences:
  $$\Delta = [104, 3, 13, 35]$$
  Smaller integers require fewer bytes, increasing compression efficiency.
- **Variable-Byte (VByte / Varint) Encoding**:
  - Encodes 32-bit unsigned integers into 7 bits per byte, with the 8th bit serving as the continuation flag.
  - Typical compression ratio: **65% to 80% reduction** compared to raw 32-bit binary arrays.
- **`.argus` File Format Specification**:
  ```
  +---------------+---------------+---------------+---------------+
  |   0x41 0x52 0x47 0x53 ("ARGS") Magic Header (4 bytes)       |
  +---------------+---------------+---------------+---------------+
  | Version (2 B) | Doc Count (4 B) | Term Count (4 B) | AvgDocLen |
  +---------------+---------------+---------------+---------------+
  | Dictionary Offset Table (Term -> Byte Offset, DF, TTF)        |
  +---------------+---------------+---------------+---------------+
  | Compressed Postings Blocks (VByte Encoded D-Gaps & Positions) |
  +---------------+---------------+---------------+---------------+
  ```

### 4. Relevance Scoring & Ranking (Okapi BM25)
Located in `src/ranking/`, this module computes relevance scores using the industry-standard probabilistic IR formula:

$$\text{Score}(D, Q) = \sum_{t \in Q} \text{IDF}(t) \cdot \frac{f(t, D) \cdot (k_1 + 1)}{f(t, D) + k_1 \cdot \left(1 - b + b \cdot \frac{|D|}{\text{avgdl}}\right)}$$

Where:
- $f(t, D)$ is the term frequency of term $t$ in document $D$.
- $|D|$ is the length of document $D$ in tokens, and $\text{avgdl}$ is the average document length across the entire index corpus.
- $k_1$ (default: `1.2`) controls term frequency saturation non-linearity.
- $b$ (default: `0.75`) controls the degree of document length penalization.
- $\text{IDF}(t)$ is the Robertson-Spärck Jones Inverse Document Frequency:
  $$\text{IDF}(t) = \ln \left( \frac{N - n(t) + 0.5}{n(t) + 0.5} + 1 \right)$$
- **Top-K Retrieval**: Uses a fixed-size `MinHeap` to collect the top $K$ scoring documents without sorting the entire candidate set.

### 5. Query Parser & AST Execution Engine
Located in `src/query/`, this module parses complex queries into an Abstract Syntax Tree.

- **Lexer**: Tokenizes user queries into literal terms, boolean operators (`AND`, `OR`, `NOT`, `+`, `-`), grouped expressions `(...)`, and quoted strings `"..."`.
- **AST Nodes**:
  - `TermNode`: single token lookup.
  - `PhraseNode`: positional proximity verification (e.g. `pos(t_{i+1}) == pos(t_i) + 1`).
  - `AndNode`, `OrNode`, `NotNode`: set algebra operations.
  - `PrefixNode`: wildcard / prefix trie scan.
- **WAND (Weak AND) Dynamic Pruning**: Skips documents whose upper-bound score cannot beat the current threshold of the top-$K$ heap, speeding up search by $5\times\text{--}20\times$.

### 6. Segment Management & WAL (Write-Ahead Log)
Located in `src/storage/segment/`, this provides safe and crash-resilient updates:
- Memory index accumulates documents up to a configurable threshold (e.g., 50,000 docs or 64MB).
- Immutable segments are flushed to disk.
- Background compaction merges small segments into larger, consolidated binary files while purging deleted documents.

---

## 📁 Directory Layout

```
Argus/
├── .github/
│   └── workflows/
│       └── ci.yml               # Automated tests & linting
├── bin/
│   └── argus.ts                 # CLI entry point executable
├── src/
│   ├── analyzer/                # Text Processing Pipeline
│   │   ├── char-filter.ts       # Unicode normalization & HTML strip
│   │   ├── tokenizer.ts         # Fast regex/stream word tokenizer
│   │   ├── stop-words.ts        # Stopword dictionary & filter
│   │   ├── stemmer.ts           # Porter Stemmer implementation
│   │   └── index.ts             # Composable Pipeline orchestrator
│   ├── index/                   # Inverted Index & Postings
│   │   ├── postings-list.ts     # In-memory postings linked/array list
│   │   ├── skip-list.ts         # Fast skip pointer traversal
│   │   ├── dictionary.ts        # Lexicon Radix Tree / Trie
│   │   └── inverted-index.ts    # Main in-memory index structure
│   ├── storage/                 # Binary Serialization & Disk I/O
│   │   ├── vbyte.ts             # Variable-byte encoder / decoder
│   │   ├── delta.ts             # D-gap delta compressor
│   │   ├── serializer.ts        # Binary .argus writer (Buffer / Uint8Array)
│   │   ├── deserializer.ts      # Binary .argus reader with zero-copy mmap-style offsets
│   │   └── wal.ts               # Write-ahead append log for durability
│   ├── ranking/                 # Information Retrieval Algorithms
│   │   ├── bm25.ts              # Okapi BM25 scorer
│   │   ├── tfidf.ts             # Classic TF-IDF scorer
│   │   └── priority-queue.ts    # Min-Heap for Top-K results
│   ├── query/                   # Query Parser & Execution
│   │   ├── lexer.ts             # Query token scanner
│   │   ├── parser.ts            # Recursive-descent AST parser
│   │   ├── ast.ts               # AST Node type definitions
│   │   ├── evaluator.ts         # Query plan executor
│   │   └── wand.ts              # Weak AND (WAND) dynamic pruner
│   ├── server/                  # Optional REST API
│   │   └── server.ts            # Lightweight HTTP search endpoint
│   └── index.ts                 # Public SDK exports
├── tests/                       # Unit & Integration Tests (Vitest)
│   ├── analyzer.test.ts
│   ├── compression.test.ts
│   ├── inverted-index.test.ts
│   ├── bm25.test.ts
│   └── query-parser.test.ts
├── benchmarks/                  # Performance & Latency Benchmarks
│   └── search-benchmark.ts      # Throughput and latency profiling
├── .gitignore
├── package.json
├── tsconfig.json
├── LICENSE
└── README.md
```

---

## 🚀 Quickstart & Usage

### Prerequisites
- [Node.js](https://nodejs.org/) `>= 20.0.0` or [Bun](https://bun.sh/) `>= 1.1.0`
- TypeScript `>= 5.3`

### Installation

```bash
# Clone the repository
git clone https://github.com/Krishnanand-10/Argus.git
cd Argus

# Install development dependencies
npm install
# or with pnpm
pnpm install
# or with bun
bun install
```

---

### Programmatic TypeScript API

```typescript
import { ArgusEngine, Analyzer } from './src';

// 1. Initialize Argus Engine
const engine = new ArgusEngine({
  k1: 1.2,
  b: 0.75,
  stopWords: true,
  stemming: true
});

// 2. Add Documents
await engine.addDocuments([
  {
    id: 1,
    title: "Introduction to Distributed Systems",
    body: "Consensus algorithms such as Paxos and Raft ensure fault tolerance across networked nodes."
  },
  {
    id: 2,
    title: "Building Search Engines in TypeScript",
    body: "Inverted indexes, postings lists, and Okapi BM25 ranking provide sub-millisecond retrieval."
  },
  {
    id: 3,
    title: "Modern Database Storage Engines",
    body: "LSM trees and Write-Ahead Logs (WAL) optimize sequential disk writes for high-throughput ingestion."
  }
]);

// 3. Commit Index to Disk (.argus binary)
await engine.commit('./data/indices/library.argus');

// 4. Execute Search Queries
const results = await engine.search('consensus AND "fault tolerance"', { limit: 5 });

console.log(results);
/*
[
  {
    docId: 1,
    score: 2.8415,
    matchedTerms: ["consensus", "fault", "toler"],
    snippet: "...ensure **fault tolerance** across networked nodes."
  }
]
*/
```

---

### Command Line Interface (CLI)

Argus comes with a bundled CLI utility for indexing local files and querying them directly from your terminal.

```bash
# Build the TypeScript project
npm run build

# Index a directory of text/markdown/json documents
npx argus index --source ./docs --output ./indices/docs.argus

# Search the index interactively
npx argus search --index ./indices/docs.argus "distributed consensus"

# Inspect index statistics (terms, postings count, disk footprint)
npx argus stats --index ./indices/docs.argus

# Start a local HTTP search daemon (port 8080)
npx argus serve --index ./indices/docs.argus --port 8080
```

---

## 🔍 Query Syntax Reference

Argus supports an expressive query language parsed directly into an AST:

| Query Pattern | Example | Semantics |
|---|---|---|
| **Simple Terms** | `database storage` | Matches documents containing either term, ranked by BM25 score. |
| **Boolean AND** | `distributed AND raft` | Both terms must be present in the document. |
| **Boolean OR** | `rust OR typescript` | Either term may be present. |
| **Negation (NOT)** | `systems NOT windows` | Must contain `systems` but exclude documents containing `windows`. |
| **Exact Phrase** | `"acid compliant"` | Terms must appear adjacent to each other in the exact order. |
| **Prefix Match** | `trans*` | Matches `transaction`, `transport`, `transit`, etc. |
| **Grouped Expression** | `(paxos OR raft) AND consensus` | Parentheses enforce precedence in boolean evaluation. |

---

## ⚡ Performance & Benchmark Goals

Tested on consumer-grade hardware (Intel/Apple Silicon, 16GB RAM):

| Metric | Target Goal | Status |
|---|---|---|
| **Ingestion Throughput** | `> 25,000 docs/sec` | 🎯 Target |
| **Binary Compression Ratio** | `65% – 75%` vs raw JSON | 🎯 Target |
| **Query Latency (p50)** | `< 1.8 ms` (100k docs) | 🎯 Target |
| **Query Latency (p99)** | `< 6.5 ms` (100k docs) | 🎯 Target |
| **Memory Footprint** | `< 128 MB` resident set during search | 🎯 Target |
| **Phrase Query Latency** | `< 10 ms` for 3-term phrases | 🎯 Target |

---

## 🗺️ Engineering Roadmap

- [x] **Phase 1: Foundations & Architecture**
  - [x] System design & specification
  - [ ] Unicode tokenizer & Porter Stemmer
  - [ ] Stopword elimination & Normalizer
- [ ] **Phase 2: In-Memory Inverted Index**
  - [ ] Postings list with document frequency and position tracking
  - [ ] Term Dictionary (Trie / Radix structure)
  - [ ] Skip lists for accelerated list intersections
- [ ] **Phase 3: Relevance Scoring & Query Engine**
  - [ ] Okapi BM25 implementation with $k_1$ and $b$ tuning
  - [ ] Priority-Queue (Min-Heap) for top-K extraction
  - [ ] Recursive-descent AST parser for Boolean and Phrase queries
- [ ] **Phase 4: Binary Disk Persistence & Compression**
  - [ ] D-Gap delta encoder
  - [ ] Variable-Byte (VByte / Varint) bitwise encoder/decoder
  - [ ] Custom `.argus` binary index serializer & zero-copy reader
- [ ] **Phase 5: Performance Optimization & Distribution**
  - [ ] WAND (Weak AND) dynamic query pruning
  - [ ] Segment merge & compaction strategy
  - [ ] Interactive CLI + REST API server
  - [ ] Comprehensive Vitest test suite & benchmarking harness

---

## 🤝 Contributing

Contributions, bug reports, and discussions are welcome!
1. Fork the repository
2. Create your feature branch (`git checkout -b feature/varint-simd`)
3. Commit your changes (`git commit -m "feat: add SIMD-style varint decompression"`)
4. Push to the branch (`git push origin feature/varint-simd`)
5. Open a Pull Request

---

## 📜 License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.
