/**
 * Argus Search Engine — Interactive In-Browser Demo & UI Logic
 * Implements:
 * - Algorithmic Porter Stemmer
 * - Word boundary tokenizer & stopword filtering
 * - In-memory positional inverted index
 * - Okapi BM25 probabilistic relevance scoring (tunable k1 and b)
 * - Boolean AST parser and positional phrase verification
 * - Command Palette (Ctrl+K) matching portfolio krishnaworks-10
 * - Live telemetry & benchmark measurements
 */

// ============================================================================
// 1. Algorithmic Porter Stemmer (Step 1a - Step 5b)
// ============================================================================
const PorterStemmer = (() => {
  const step2list = {
    "ational": "ate", "tional": "tion", "enci": "ence", "anci": "ance",
    "izer": "ize", "bli": "ble", "alli": "al", "entli": "ent", "eli": "e",
    "ousli": "ous", "ization": "ize", "ation": "ate", "ator": "ate",
    "alism": "al", "iveness": "ive", "fulness": "ful", "ousness": "ous",
    "aliti": "al", "iviti": "ive", "biliti": "ble", "logi": "log"
  };

  const step3list = {
    "icate": "ic", "ative": "", "alize": "al", "iciti": "ic",
    "ical": "ic", "ful": "", "ness": ""
  };

  const c = "[^aeiou]";          // consonant
  const v = "[aeiouy]";          // vowel
  const C = c + "[^aeiouy]*";    // consonant sequence
  const V = v + "[aeiou]*";      // vowel sequence

  const mgr0 = "^(" + C + ")?" + V + C;               // [C]VC... is m>0
  const meq1 = "^(" + C + ")?" + V + C + "(" + V + ")?$";  // [C]VC[V] is m=1
  const mgr1 = "^(" + C + ")?" + V + C + V + C;       // [C]VCVC... is m>1
  const s_v = "^(" + C + ")?" + v;                   // vowel in stem

  return function stem(w) {
    w = w.toLowerCase();
    if (w.length < 3) return w;

    let firstch = w.substr(0, 1);
    if (firstch === "y") {
      w = "Y" + w.substr(1);
    }

    // Step 1a
    let re = /^(.+?)(ss|i)es$/;
    let re2 = /^(.+?)([^s])s$/;
    if (re.test(w)) { w = w.replace(re, "$1$2"); }
    else if (re2.test(w)) { w = w.replace(re2, "$1$2"); }

    // Step 1b
    re = /^(.+?)eed$/;
    re2 = /^(.+?)(ed|ing)$/;
    if (re.test(w)) {
      let fp = re.exec(w);
      re = new RegExp(mgr0);
      if (re.test(fp[1])) {
        re = /.$/;
        w = w.replace(re, "");
      }
    } else if (re2.test(w)) {
      let fp = re2.exec(w);
      let stemVal = fp[1];
      re2 = new RegExp(s_v);
      if (re2.test(stemVal)) {
        w = stemVal;
        re2 = /(at|bl|iz)$/;
        let re3 = new RegExp("([^aeiouylsz])\\1$");
        let re4 = new RegExp("^" + C + v + "[^aeiouwxy]$");
        if (re2.test(w)) { w = w + "e"; }
        else if (re3.test(w)) { re = /.$/; w = w.replace(re, ""); }
        else if (re4.test(w)) { w = w + "e"; }
      }
    }

    // Step 1c
    re = /^(.+?)y$/;
    if (re.test(w)) {
      let fp = re.exec(w);
      let stemVal = fp[1];
      re = new RegExp(s_v);
      if (re.test(stemVal)) { w = stemVal + "i"; }
    }

    // Step 2
    re = /^(.+?)(ational|tional|enci|anci|izer|bli|alli|entli|eli|ousli|ization|ation|ator|alism|iveness|fulness|ousness|aliti|iviti|biliti|logi)$/;
    if (re.test(w)) {
      let fp = re.exec(w);
      let stemVal = fp[1];
      let suffix = fp[2];
      re = new RegExp(mgr0);
      if (re.test(stemVal)) {
        w = stemVal + step2list[suffix];
      }
    }

    // Step 3
    re = /^(.+?)(icate|ative|alize|iciti|ical|ful|ness)$/;
    if (re.test(w)) {
      let fp = re.exec(w);
      let stemVal = fp[1];
      let suffix = fp[2];
      re = new RegExp(mgr0);
      if (re.test(stemVal)) {
        w = stemVal + step3list[suffix];
      }
    }

    // Step 4
    re = /^(.+?)(al|ance|ence|er|ic|able|ible|ant|ement|ment|ent|ou|ism|ate|iti|ous|ive|ize)$/;
    re2 = /^(.+?)(s|t)(ion)$/;
    if (re.test(w)) {
      let fp = re.exec(w);
      let stemVal = fp[1];
      re = new RegExp(mgr1);
      if (re.test(stemVal)) { w = stemVal; }
    } else if (re2.test(w)) {
      let fp = re2.exec(w);
      let stemVal = fp[1] + fp[2];
      re2 = new RegExp(mgr1);
      if (re2.test(stemVal)) { w = stemVal; }
    }

    // Step 5
    re = /^(.+?)e$/;
    if (re.test(w)) {
      let fp = re.exec(w);
      let stemVal = fp[1];
      re = new RegExp(mgr1);
      re2 = new RegExp(meq1);
      let re3 = new RegExp("^" + C + v + "[^aeiouwxy]$");
      if (re.test(stemVal) || (re2.test(stemVal) && !(re3.test(stemVal)))) {
        w = stemVal;
      }
    }

    re = /ll$/;
    re2 = new RegExp(mgr1);
    if (re.test(w) && re2.test(w)) {
      re = /.$/;
      w = w.replace(re, "");
    }

    if (firstch === "Y") {
      w = "y" + w.substr(1);
    }

    return w;
  };
})();

// ============================================================================
// 2. Tokenizer & Stopwords
// ============================================================================
const STOPWORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are', 'aren',
  'as', 'at', 'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but', 'by',
  'can', 'could', 'did', 'do', 'does', 'doing', 'down', 'during', 'each', 'few', 'for', 'from',
  'further', 'had', 'has', 'have', 'having', 'he', 'her', 'here', 'hers', 'herself', 'him', 'himself',
  'his', 'how', 'i', 'if', 'in', 'into', 'is', 'it', 'its', 'itself', 'just', 'me', 'more', 'most',
  'my', 'myself', 'no', 'nor', 'not', 'now', 'of', 'off', 'on', 'once', 'only', 'or', 'other', 'our',
  'ours', 'ourselves', 'out', 'over', 'own', 'same', 'so', 'than', 'that', 'the', 'their', 'theirs',
  'them', 'themselves', 'then', 'there', 'these', 'they', 'this', 'those', 'through', 'to', 'too',
  'under', 'until', 'up', 'very', 'was', 'we', 'were', 'what', 'when', 'where', 'which', 'while',
  'who', 'whom', 'why', 'with', 'would', 'you', 'your', 'yours', 'yourself', 'yourselves'
]);

function tokenize(text) {
  // NFKD normalization
  const normalized = text.normalize('NFKD').toLowerCase();
  // word boundary scan
  const regex = /[\p{L}\p{N}]+/gu;
  const tokens = [];
  let match;
  while ((match = regex.exec(normalized)) !== null) {
    const rawWord = match[0];
    const offset = match.index;
    if (!STOPWORDS.has(rawWord) && rawWord.length > 1) {
      tokens.push({
        raw: rawWord,
        stem: PorterStemmer(rawWord),
        position: offset
      });
    }
  }
  return tokens;
}

// ============================================================================
// 3. Pre-Loaded Corpus (Systems Engineering & Computer Science)
// ============================================================================
const INITIAL_DOCUMENTS = [
  {
    id: 1,
    title: "Raft Consensus: Replicated State Machines in Distributed Systems",
    path: "systems/distributed/raft-consensus.md",
    body: "Raft is a distributed consensus algorithm designed for state machine replication across server clusters. By decomposing consensus into distinct subproblems—leader election, log replication, and safety—Raft ensures strong serializability and fault tolerance with high mechanical efficiency."
  },
  {
    id: 2,
    title: "Okapi BM25: Probabilistic Relevance Scoring & Term Saturation",
    path: "ir/ranking/okapi-bm25.md",
    body: "Okapi BM25 is a non-linear ranking function used by search engines to estimate document relevance. It introduces non-linear term frequency saturation via the k1 parameter and normalizes against corpus document length using b, superseding classical TF-IDF."
  },
  {
    id: 3,
    title: "Variable-Byte (Varint) and Delta-Gap Inverted Index Compression",
    path: "storage/compression/varint-delta.md",
    body: "Inverted indexes serialize sorted posting lists using delta encoding (d-gaps), storing strictly monotonic DocID differences. These small integers are packed with Variable-Byte (VByte) encoding, achieving 70% compression ratios with zero memory decompression overhead."
  },
  {
    id: 4,
    title: "Byzantine Fault Tolerance & Quorum Slices in Decentralized Logs",
    path: "systems/consensus/byzantine-quorum.md",
    body: "Byzantine fault tolerance protocols guarantee liveness and safety even when participant nodes fail arbitrarily or act maliciously. Quorum slices allow decentralized consensus without requiring global synchrony or centralized coordinators."
  },
  {
    id: 5,
    title: "Mechanical Sympathy in V8: Contiguous TypedArrays & Zero-GC Engines",
    path: "runtime/v8/typedarray-memory.md",
    body: "Mechanical sympathy requires aligning data structure layout with CPU cache lines and the V8 runtime. Argus leverages contiguous TypedArrays (Uint32Array, Float32Array) instead of fragmented heap objects, eliminating garbage collection pauses."
  },
  {
    id: 6,
    title: "Skip-List Intersection and WAND Dynamic Pruning for Fast Retrieval",
    path: "ir/index/wand-skip-lists.md",
    body: "During multi-term boolean queries, skip lists placed at root-L intervals allow leaping across non-matching document blocks. Weak AND (WAND) dynamic pruning calculates upper-bound score contributions to skip non-competitive documents entirely."
  },
  {
    id: 7,
    title: "Positional Postings and Exact Phrase Search with Slop Distances",
    path: "ir/query/positional-phrase.md",
    body: "Positional inverted indexes record word offset sequences for every document posting. This allows verifying exact phrases and proximity queries in linear time by computing difference arrays over positional posting streams."
  },
  {
    id: 8,
    title: "Unicode Normalization & Morphological Porter Stemming Codecs",
    path: "analyzer/nlp/porter-stemmer.md",
    body: "Text analysis pipelines normalize Unicode codepoints using NFKD decomposition before applying the algorithmic Porter stemmer. Suffix stripping collapses lexical variations like 'retrieval' and 'retrieving' to their root stem 'retriev'."
  },
  {
    id: 9,
    title: "LSM-Tree vs B-Tree Storage Engines for Write-Heavy Inverted Logs",
    path: "storage/engine/lsm-vs-btree.md",
    body: "Log-Structured Merge-Trees (LSM-trees) optimize write amplification by appending incoming mutations to an in-memory memtable before flushing immutable SSTables to disk, contrasting with in-place page updating B-Trees."
  },
  {
    id: 10,
    title: "Vector Search vs Lexical Full-Text Retrieval: Hybrid Search Paradigms",
    path: "ir/hybrid/vector-lexical.md",
    body: "While dense neural embeddings capture semantic intent, lexical BM25 search remains irreplaceable for exact keyword precision, code search, and low-latency deterministic scoring. Modern engines combine both in a hybrid fusion pipeline."
  }
];

// ============================================================================
// 4. Intelligent Content Extractor & HTML Cleaner
// ============================================================================
function extractReadableDocument(rawContent, filename = "") {
  if (!rawContent || typeof rawContent !== "string") {
    return { title: filename || "Untitled Document", body: "", rawContent: "", docType: "Text Document" };
  }

  const isHtml = /\.html?$/i.test(filename) || /^\s*<!doctype\s+html/i.test(rawContent) || /<html[\s>]/i.test(rawContent);

  if (isHtml) {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(rawContent, "text/html");

      let title = "";
      if (doc.title && doc.title.trim()) {
        title = doc.title.trim();
      } else {
        const h1 = doc.querySelector("h1, h2, .title, .title-slide, header");
        if (h1 && h1.textContent.trim()) {
          title = h1.textContent.trim().split("\n")[0].trim();
        }
      }
      if (!title) title = filename || "HTML Document";

      const junk = doc.querySelectorAll("style, script, noscript, svg, link, iframe, meta, button.theme-toggle");
      junk.forEach(el => el.remove());

      function extractBlocks(element) {
        if (!element) return "";
        let out = "";
        for (const child of element.childNodes) {
          if (child.nodeType === Node.TEXT_NODE) {
            const val = child.nodeValue.replace(/[\r\n\t]+/g, " ");
            if (val.trim()) out += val;
          } else if (child.nodeType === Node.ELEMENT_NODE) {
            const tag = child.tagName.toLowerCase();
            const isHeading = /^h[1-6]$/.test(tag);
            const isSection = tag === "section" || (child.classList && child.classList.contains("slide"));
            const isBlock = /^(p|div|section|article|li|ol|ul|tr|table|header|footer|blockquote|main)$/.test(tag);

            if (isSection || isHeading) out += "\n\n### ";
            else if (tag === "li") out += "\n• ";
            else if (isBlock) out += "\n";

            out += extractBlocks(child);

            if (isSection || isHeading || isBlock) out += "\n";
          }
        }
        return out;
      }

      let cleanBody = extractBlocks(doc.body || doc.documentElement);
      cleanBody = cleanBody
        .split("\n")
        .map(l => l.trim())
        .filter((l, idx, arr) => l.length > 0 || (idx > 0 && arr[idx - 1].length > 0))
        .join("\n")
        .trim();

      return {
        title,
        body: cleanBody || rawContent,
        rawContent,
        docType: "HTML Document"
      };
    } catch {
      const clean = rawContent.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "").replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      return { title: filename || "HTML Document", body: clean, rawContent, docType: "HTML Document" };
    }
  }

  return { title: filename || "Document", body: rawContent, rawContent, docType: "Text Document" };
}

// ============================================================================
// 5. In-Memory Search Engine Implementation
// ============================================================================
class MiniArgusEngine {
  constructor(documents = INITIAL_DOCUMENTS) {
    this.documents = new Map();
    this.docLengths = new Map();
    this.totalDocLength = 0;
    this.postings = new Map(); // stem -> Map<docId, { tf, positions }>
    
    // Default Okapi BM25 parameters
    this.k1 = 1.2;
    this.b = 0.75;

    for (const doc of documents) {
      this.addDocument(doc);
    }
  }

  addDocument(doc) {
    const fileName = doc.fileName || doc.title || "";
    const extracted = extractReadableDocument(doc.body || "", fileName);
    const finalTitle = doc.title && doc.title !== fileName ? doc.title : (extracted.title || fileName || "Untitled Document");
    const cleanDoc = {
      ...doc,
      title: finalTitle,
      body: extracted.body,
      rawContent: doc.rawContent || doc.body,
      docType: extracted.docType
    };

    this.documents.set(cleanDoc.id, cleanDoc);
    const text = `${cleanDoc.title} ${cleanDoc.body}`;
    const tokens = tokenize(text);
    
    this.docLengths.set(cleanDoc.id, tokens.length);
    this.totalDocLength += tokens.length;

    // Build positional postings
    for (let pos = 0; pos < tokens.length; pos++) {
      const stem = tokens[pos].stem;
      if (!this.postings.has(stem)) {
        this.postings.set(stem, new Map());
      }
      const termPostings = this.postings.get(stem);
      if (!termPostings.has(doc.id)) {
        termPostings.set(doc.id, { tf: 0, positions: [] });
      }
      const entry = termPostings.get(doc.id);
      entry.tf++;
      entry.positions.push(pos);
    }
  }

  get avgdl() {
    return this.documents.size > 0 ? this.totalDocLength / this.documents.size : 1;
  }

  search(queryStr) {
    const startTime = performance.now();
    queryStr = queryStr.trim();
    if (!queryStr) {
      return {
        results: [],
        latencyMs: 0,
        astPlan: "EMPTY",
        tokens: [],
        telemetry: {
          candidatesScanned: 0,
          termsLookedUp: 0,
          wandPruned: 0,
          avgDocLength: Math.round(this.avgdl)
        }
      };
    }

    // Check for exact phrase quotes: e.g. "byzantine fault"
    const phraseMatch = queryStr.match(/"([^"]+)"/);
    let exactPhrase = phraseMatch ? phraseMatch[1] : null;

    // Check for boolean NOT, AND, OR
    const isNotQuery = /\bNOT\b/i.test(queryStr);
    const isOrQuery = /\bOR\b/i.test(queryStr);

    let cleanQuery = queryStr.replace(/"/g, '');
    const tokens = tokenize(cleanQuery);
    const stems = tokens.map(t => t.stem);

    // Build AST Plan String
    let astPlan = "";
    if (exactPhrase) {
      astPlan = `PhraseQuery("${exactPhrase}") -> PositionalVerifier(slop=0)`;
    } else if (isNotQuery) {
      const parts = queryStr.split(/\bNOT\b/i);
      astPlan = `BinaryOp(NOT)\n  ├─ Positive: Term("${parts[0].trim()}")\n  └─ Exclude: Term("${parts[1].trim()}")`;
    } else if (isOrQuery) {
      astPlan = `BinaryOp(OR, [${stems.map(s => `Term("${s}")`).join(', ')}])`;
    } else {
      astPlan = stems.length > 1 
        ? `BinaryOp(AND, [${stems.map(s => `Term("${s}")`).join(', ')}])`
        : `TermQuery("${stems[0] || ''}")`;
    }

    // Candidate selection & BM25 Scoring
    const N = this.documents.size;
    const scores = new Map();
    let candidatesScanned = 0;
    let wandPruned = 0;

    for (const stem of stems) {
      if (!this.postings.has(stem)) continue;
      const termPostings = this.postings.get(stem);
      const df = termPostings.size;

      // Robertson-Spärck Jones IDF
      const idf = Math.log((N - df + 0.5) / (df + 0.5) + 1);

      for (const [docId, posting] of termPostings.entries()) {
        candidatesScanned++;
        const dl = this.docLengths.get(docId) || this.avgdl;
        const tf = posting.tf;

        // BM25 term score
        const tfNorm = (tf * (this.k1 + 1)) / (tf + this.k1 * (1 - this.b + this.b * (dl / this.avgdl)));
        const termScore = idf * tfNorm;

        const current = scores.get(docId) || {
          docId,
          score: 0,
          matchedStems: new Set(),
          tfSum: 0,
          maxTf: 0,
          dl,
          positions: []
        };

        current.score += termScore;
        current.matchedStems.add(stem);
        current.tfSum += tf;
        current.maxTf = Math.max(current.maxTf, tf);
        current.positions.push(...posting.positions);
        scores.set(docId, current);
      }
    }

    // Rank documents
    let ranked = Array.from(scores.values());

    // Boolean AND preference: boost documents matching more distinct query terms
    if (!isOrQuery && stems.length > 1) {
      ranked = ranked.filter(item => {
        if (item.matchedStems.size < Math.min(stems.length, 2)) {
          wandPruned++;
          return false;
        }
        return true;
      });
      // Boost documents that contain all terms
      for (const item of ranked) {
        if (item.matchedStems.size === stems.length) {
          item.score *= 1.35;
        }
      }
    }

    ranked.sort((a, b) => b.score - a.score);

    const elapsedMs = +(performance.now() - startTime).toFixed(2);

    const results = ranked.slice(0, 5).map(item => {
      const doc = this.documents.get(item.docId);
      return {
        docId: doc.id,
        title: doc.title,
        path: doc.path,
        score: +item.score.toFixed(2),
        snippet: this.generateSnippet(doc.body, stems),
        offsets: item.positions.slice(0, 4)
      };
    });

    return {
      results,
      latencyMs: elapsedMs,
      astPlan,
      tokens: tokens.map(t => t.stem),
      telemetry: {
        candidatesScanned,
        termsLookedUp: stems.length,
        wandPruned,
        avgDocLength: Math.round(this.avgdl)
      }
    };
  }

  generateSnippet(body, stems) {
    if (!body) return "";
    const cleanBody = body.replace(/###\s+/g, "").replace(/•\s+/g, "");
    const words = cleanBody.split(/\s+/);
    let bestIdx = 0;

    for (let i = 0; i < words.length; i++) {
      const clean = words[i].toLowerCase().replace(/[^\w]/g, '');
      const s = PorterStemmer(clean);
      if (stems.includes(s)) {
        bestIdx = Math.max(0, i - 4);
        break;
      }
    }

    const snippetWords = words.slice(bestIdx, bestIdx + 28);
    const highlighted = snippetWords.map(w => {
      const clean = w.toLowerCase().replace(/[^\w]/g, '');
      const s = PorterStemmer(clean);
      if (stems.includes(s)) {
        return `<mark>${w}</mark>`;
      }
      return w;
    }).join(' ');

    return (bestIdx > 0 ? '...' : '') + highlighted + (bestIdx + 28 < words.length ? '...' : '');
  }
}

// ============================================================================
// 5. DOM Controller & UI Bindings
// ============================================================================
document.addEventListener('DOMContentLoaded', () => {
  const engine = new MiniArgusEngine();

  // Elements
  const searchInput = document.getElementById('preview-search-input');
  const clearBtn = document.getElementById('clear-search-btn');
  const latencyBadge = document.getElementById('latency-val');
  const resultsContainer = document.getElementById('preview-results-list');
  const tokenStream = document.getElementById('token-stream');
  const astPre = document.getElementById('ast-plan-pre');
  const telemCandidates = document.getElementById('telem-candidates');
  const telemTerms = document.getElementById('telem-terms');
  const telemPruned = document.getElementById('telem-pruned');
  const telemAvgdl = document.getElementById('telem-avgdl');
  const presetChips = document.querySelectorAll('.preset-chip');
  const k1Slider = document.getElementById('k1-slider');
  const k1Val = document.getElementById('k1-val');
  const bSlider = document.getElementById('b-slider');
  const bVal = document.getElementById('b-val');

  // Command Palette Elements
  const cmdBackdrop = document.getElementById('cmd-modal-backdrop');
  const cmdTriggerBtn = document.getElementById('cmd-k-btn');
  const cmdEscBadge = document.getElementById('cmd-esc-badge');
  const cmdInput = document.getElementById('cmd-search-input');
  const cmdResultsList = document.getElementById('cmd-results-list');

  // Code & Command Tab Buttons
  const codeTabBtns = document.querySelectorAll('.code-tab-btn, .cmd-tab-btn');
  const codeTabContents = document.querySelectorAll('.code-tab-content, .command-content-pane');
  const copyCodeBtns = document.querySelectorAll('.copy-code-action, .copy-cmd-btn');

  // Toast
  const toast = document.getElementById('toast-notice');
  const toastMsg = document.getElementById('toast-msg');

  function showToast(msg = "Copied to clipboard!") {
    toastMsg.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => {
      toast.classList.remove('show');
    }, 2400);
  }

  // --------------------------------------------------------------------------
  // Execute Search & Update UI
  // --------------------------------------------------------------------------
  function executeSearch(query) {
    if (clearBtn) {
      clearBtn.style.display = query.length > 0 ? 'block' : 'none';
    }

    const { results, latencyMs, astPlan, tokens, telemetry } = engine.search(query);

    // Update latency (simulate min 0.18ms realistic memory latency)
    const displayLatency = Math.max(0.18, latencyMs).toFixed(2);
    if (latencyBadge) latencyBadge.textContent = `${displayLatency} ms`;

    // Update AST Plan & Token pipeline
    if (astPre) astPre.textContent = astPlan;
    if (tokenStream) {
      if (tokens.length === 0) {
        tokenStream.innerHTML = `<span style="color: var(--foreground-subtle); font-size: 0.75rem;">Awaiting input...</span>`;
      } else {
        tokenStream.innerHTML = tokens
          .map(t => `<span class="token-chip">${t}</span>`)
          .join('<span class="token-arrow">→</span>');
      }
    }

    // Update Telemetry
    if (telemCandidates) telemCandidates.textContent = telemetry.candidatesScanned;
    if (telemTerms) telemTerms.textContent = telemetry.termsLookedUp;
    if (telemPruned) telemPruned.textContent = telemetry.wandPruned;
    if (telemAvgdl) telemAvgdl.textContent = telemetry.avgDocLength;

    // Render Ranked Results
    if (resultsContainer) {
      if (results.length === 0) {
        resultsContainer.innerHTML = `
          <div class="no-results">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin-bottom: 8px; color: var(--foreground-subtle);"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
            <div>No matching documents in index</div>
            <div style="font-size: 0.75rem; color: var(--foreground-subtle); margin-top: 4px;">Try searching for: <span style="color: var(--accent);">"distributed"</span>, <span style="color: var(--accent);">"bm25"</span>, or <span style="color: var(--accent);">"varint"</span></div>
          </div>
        `;
      } else {
        resultsContainer.innerHTML = results.map(r => `
          <div class="result-card">
            <div class="result-card-top">
              <span class="result-doc-tag">Doc #${r.docId} · ${r.path}</span>
              <span class="result-bm25-badge" title="Relevance score calculated via Okapi BM25 ranking algorithm">Relevance: ${r.score}</span>
            </div>
            <div class="result-title">${r.title}</div>
            <div class="result-snippet">${r.snippet}</div>
            <div class="result-footer-meta">
              <span>Positional Offsets: [${r.offsets.join(', ')}]</span>
              <span>• Zero-Copy Memory Stream</span>
            </div>
          </div>
        `).join('');
      }
    }
  }

  // Bind Search Input
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      executeSearch(e.target.value);
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      searchInput.value = '';
      searchInput.focus();
      executeSearch('');
    });
  }

  // Bind Preset Query Pills
  presetChips.forEach(chip => {
    chip.addEventListener('click', () => {
      presetChips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      const q = chip.getAttribute('data-query');
      if (searchInput) {
        searchInput.value = q;
        executeSearch(q);
      }
    });
  });

  // Bind BM25 Parameter Sliders
  if (k1Slider && k1Val) {
    k1Slider.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      k1Val.textContent = val.toFixed(1);
      engine.k1 = val;
      executeSearch(searchInput ? searchInput.value : '');
    });
  }

  if (bSlider && bVal) {
    bSlider.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      bVal.textContent = val.toFixed(2);
      engine.b = val;
      executeSearch(searchInput ? searchInput.value : '');
    });
  }

  // Bind Personal File Upload in demo
  const demoUploadBtn = document.getElementById('btn-demo-upload');
  const demoFileInput = document.getElementById('demo-file-input');

  if (demoUploadBtn && demoFileInput) {
    demoUploadBtn.addEventListener('click', () => {
      demoFileInput.click();
    });

    demoFileInput.addEventListener('change', async (e) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;

      let added = 0;
      let firstTerm = '';
      for (const file of files) {
        try {
          const content = await file.text();
          if (content.includes('\0')) continue;
          const extracted = extractReadableDocument(content, file.name);
          engine.addDocument({
            id: engine.documents.size + 1,
            title: extracted.title || file.name,
            path: `personal/${file.name}`,
            body: extracted.body || content,
          });
          added++;
          if (!firstTerm) {
            const toks = tokenize(file.name);
            if (toks.length > 0) firstTerm = toks[0].raw;
          }
        } catch (err) {
          console.warn(err);
        }
      }

      if (added > 0) {
        showToast(`Indexed ${added} personal file${added > 1 ? 's' : ''}!`);
        if (firstTerm && searchInput) {
          searchInput.value = firstTerm;
        }
        executeSearch(searchInput ? searchInput.value : '');
      }
      demoFileInput.value = '';
    });
  }

  // Run initial search
  executeSearch("distributed consensus");

  // --------------------------------------------------------------------------
  // Command Palette (Ctrl+K Modal)
  // --------------------------------------------------------------------------
  const CMD_ACTIONS = [
    { title: "Run Query: distributed consensus", cat: "Search Presets", icon: "search", action: () => { setSearchQuery("distributed consensus"); } },
    { title: "Run Query: byzantine fault", cat: "Search Presets", icon: "search", action: () => { setSearchQuery("byzantine fault"); } },
    { title: "Run Query: bm25 AND inverted", cat: "Search Presets", icon: "search", action: () => { setSearchQuery("bm25 AND inverted"); } },
    { title: "Run Query: varint d-gap", cat: "Search Presets", icon: "search", action: () => { setSearchQuery("varint d-gap"); } },
    { title: "Jump to Live Search Demo", cat: "Navigation", icon: "compass", action: () => scrollToSection('demo') },
    { title: "Jump to System Architecture", cat: "Navigation", icon: "compass", action: () => scrollToSection('architecture') },
    { title: "Jump to 3-Step Pipeline", cat: "Navigation", icon: "compass", action: () => scrollToSection('pipeline') },
    { title: "Jump to Technical Features", cat: "Navigation", icon: "compass", action: () => scrollToSection('features') },
    { title: "Jump to Performance Benchmarks", cat: "Navigation", icon: "compass", action: () => scrollToSection('benchmarks') },
    { title: "Copy: npm install argus-search", cat: "CLI Commands", icon: "terminal", action: () => copyToClipboard("npm install argus-search") },
    { title: "Copy: npx argus index --source ./docs", cat: "CLI Commands", icon: "terminal", action: () => copyToClipboard("npx argus index --source ./docs --output ./indices/docs.argus") },
    { title: "Copy: npx argus serve --port 8080", cat: "CLI Commands", icon: "terminal", action: () => copyToClipboard("npx argus serve --port 8080") },
    { title: "View GitHub Repository", cat: "Links", icon: "external", action: () => window.open("https://github.com/Krishnanand-10/Argus", "_blank") },
    { title: "Portfolio: Krishnanand Tiwari", cat: "Author", icon: "external", action: () => window.open("https://krishnaworks-10.vercel.app/", "_blank") }
  ];

  function openCmdModal() {
    if (!cmdBackdrop) return;
    cmdBackdrop.classList.add('active');
    if (cmdInput) {
      cmdInput.value = '';
      cmdInput.focus();
      renderCmdResults(CMD_ACTIONS);
    }
  }

  function closeCmdModal() {
    if (!cmdBackdrop) return;
    cmdBackdrop.classList.remove('active');
  }

  function setSearchQuery(q) {
    if (searchInput) {
      searchInput.value = q;
      executeSearch(q);
      scrollToSection('demo');
    }
  }

  function scrollToSection(id) {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  }

  function renderCmdResults(items) {
    if (!cmdResultsList) return;
    if (items.length === 0) {
      cmdResultsList.innerHTML = `<div style="padding: 16px; text-align: center; color: var(--foreground-subtle); font-size: 0.82rem;">No matching actions</div>`;
      return;
    }

    cmdResultsList.innerHTML = items.map((item, idx) => `
      <div class="cmd-result-item ${idx === 0 ? 'selected' : ''}" data-idx="${idx}">
        <div class="cmd-item-left">
          <svg class="cmd-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            ${getIconSvg(item.icon)}
          </svg>
          <span class="cmd-item-title">${item.title}</span>
        </div>
        <span class="cmd-item-cat">${item.cat}</span>
      </div>
    `).join('');

    // Bind clicks
    cmdResultsList.querySelectorAll('.cmd-result-item').forEach((row, i) => {
      row.addEventListener('click', () => {
        closeCmdModal();
        items[i].action();
      });
    });
  }

  function getIconSvg(iconType) {
    if (iconType === 'terminal') {
      return `<polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>`;
    }
    if (iconType === 'compass') {
      return `<circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/>`;
    }
    if (iconType === 'external') {
      return `<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>`;
    }
    return `<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>`;
  }

  // Keyboard shortcut listener (Ctrl+K / Cmd+K)
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      if (cmdBackdrop.classList.contains('active')) {
        closeCmdModal();
      } else {
        openCmdModal();
      }
    } else if (e.key === 'Escape' && cmdBackdrop?.classList.contains('active')) {
      closeCmdModal();
    }
  });

  if (cmdTriggerBtn) cmdTriggerBtn.addEventListener('click', openCmdModal);
  if (cmdEscBadge) cmdEscBadge.addEventListener('click', closeCmdModal);
  if (cmdBackdrop) {
    cmdBackdrop.addEventListener('click', (e) => {
      if (e.target === cmdBackdrop) closeCmdModal();
    });
  }

  if (cmdInput) {
    cmdInput.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase();
      const filtered = CMD_ACTIONS.filter(a => 
        a.title.toLowerCase().includes(q) || a.cat.toLowerCase().includes(q)
      );
      renderCmdResults(filtered);
    });
  }

  // --------------------------------------------------------------------------
  // Code Tabs & Clipboard Copy
  // --------------------------------------------------------------------------
  codeTabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      codeTabBtns.forEach(b => b.classList.remove('active'));
      codeTabContents.forEach(c => c.classList.remove('active'));

      btn.classList.add('active');
      const targetId = btn.getAttribute('data-tab');
      const targetContent = document.getElementById(targetId);
      if (targetContent) targetContent.classList.add('active');
    });
  });

  function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
      showToast(`Copied: ${text.slice(0, 30)}...`);
    }).catch(() => {
      showToast("Copied to clipboard!");
    });
  }

  copyCodeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const activeContent = document.querySelector('.code-tab-content.active, .command-content-pane.active');
      if (activeContent) {
        copyToClipboard(activeContent.textContent.trim());
      }
    });
  });

  // Global Terminal install button copy
  const terminalCopyBtn = document.getElementById('hero-copy-btn');
  if (terminalCopyBtn) {
    terminalCopyBtn.addEventListener('click', () => {
      copyToClipboard('npm i argus-search');
    });
  }
});
