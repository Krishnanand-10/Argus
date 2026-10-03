/**
 * Argus Search Engine — Interactive In-Memory REPL & Document Studio
 * Dedicated client-side engine with live personal file & folder ingestion,
 * custom text indexing, Porter stemmer analysis, and Okapi BM25 scoring.
 */

// ============================================================================
// 1. Algorithmic Porter Stemmer
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

  const c = "[^aeiou]";
  const v = "[aeiouy]";
  const C = c + "[^aeiouy]*";
  const V = v + "[aeiou]*";

  const mgr0 = "^(" + C + ")?" + V + C;
  const meq1 = "^(" + C + ")?" + V + C + "(" + V + ")?$";
  const mgr1 = "^(" + C + ")?" + V + C + V + C;
  const s_v = "^(" + C + ")?" + v;

  return function stem(w) {
    w = (w || "").toLowerCase();
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
      if (re.test(stemVal)) {
        w = stemVal;
      }
    } else if (re2.test(w)) {
      let fp = re2.exec(w);
      let stemVal = fp[1] + fp[2];
      re2 = new RegExp(mgr1);
      if (re2.test(stemVal)) {
        w = stemVal;
      }
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

    if (firstch === "y") {
      w = "y" + w.substr(1);
    }

    return w;
  };
})();

// ============================================================================
// 2. Stopwords Dictionary (~170 Standard English Terms)
// ============================================================================
const STOPWORDS = new Set([
  "a", "about", "above", "after", "again", "against", "all", "am", "an", "and",
  "any", "are", "aren't", "as", "at", "be", "because", "been", "before", "being",
  "below", "between", "both", "but", "by", "can't", "cannot", "could", "couldn't",
  "did", "didn't", "do", "does", "doesn't", "doing", "don't", "down", "during",
  "each", "few", "for", "from", "further", "had", "hadn't", "has", "hasn't",
  "have", "haven't", "having", "he", "he'd", "he'll", "he's", "her", "here",
  "here's", "hers", "herself", "him", "himself", "his", "how", "how's", "i",
  "i'd", "i'll", "i'm", "i've", "if", "in", "into", "is", "isn't", "it",
  "it's", "its", "itself", "let's", "me", "more", "most", "mustn't", "my",
  "myself", "no", "nor", "not", "of", "off", "on", "once", "only", "or",
  "other", "ought", "our", "ours", "ourselves", "out", "over", "own", "same",
  "shan't", "she", "she'd", "she'll", "she's", "should", "shouldn't", "so",
  "some", "such", "than", "that", "that's", "the", "their", "theirs", "them",
  "themselves", "then", "there", "there's", "these", "they", "they'd", "they'll",
  "they're", "they've", "this", "those", "through", "to", "too", "under", "until",
  "up", "very", "was", "wasn't", "we", "we'd", "we'll", "we're", "we've", "were",
  "weren't", "what", "what's", "when", "when's", "where", "where's", "which",
  "while", "who", "who's", "whom", "why", "why's", "with", "won't", "would",
  "wouldn't", "you", "you'd", "you'll", "you're", "you've", "your", "yours",
  "yourself", "yourselves"
]);

// ============================================================================
// 3. Tokenizer Pipeline
// ============================================================================
function tokenize(text) {
  if (!text) return [];
  const normalized = text.normalize("NFKD").toLowerCase();
  const rawWords = normalized.match(/[\p{L}\p{N}]+/gu) || [];
  const tokens = [];

  for (let i = 0; i < rawWords.length; i++) {
    const raw = rawWords[i];
    if (STOPWORDS.has(raw)) continue;
    const stem = PorterStemmer(raw);
    tokens.push({ raw, stem, position: i });
  }

  return tokens;
}

// ============================================================================
// 4. Intelligent Content Extractor & HTML Cleaner
// ============================================================================
function extractReadableDocument(rawContent, filename = "") {
  if (!rawContent || typeof rawContent !== "string") {
    return {
      title: filename || "Untitled Document",
      body: "",
      rawContent: "",
      docType: "Text Document",
      isHtml: false
    };
  }

  const isHtml = /\.html?$/i.test(filename) || 
                 /^\s*<!doctype\s+html/i.test(rawContent) || 
                 /<html[\s>]/i.test(rawContent) ||
                 /<head[\s>]/i.test(rawContent) ||
                 /<body[\s>]/i.test(rawContent);

  if (isHtml) {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(rawContent, "text/html");

      // Extract title from <title> tag, or first <h1>/<h2>, or filename
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

      // Detect presentation vs general HTML
      const isPresentation = doc.querySelector(".reveal, .slides, .presentation, .slide") !== null ||
                             rawContent.includes("reveal.js") || 
                             rawContent.includes("class=\"slides\"");

      // Remove non-content tags: style, script, noscript, svg, link, iframe, meta
      const junk = doc.querySelectorAll("style, script, noscript, svg, link, iframe, meta, button.theme-toggle");
      junk.forEach(el => el.remove());

      // Extract structured content preserving sections, slides, headers, and lists
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

            if (isSection) out += "\n\n### ";
            else if (isHeading) out += "\n\n### ";
            else if (tag === "li") out += "\n• ";
            else if (isBlock) out += "\n";

            out += extractBlocks(child);

            if (isSection || isHeading || isBlock) out += "\n";
          }
        }
        return out;
      }

      let cleanBody = extractBlocks(doc.body || doc.documentElement);
      // Clean up multiple spaces, consecutive newlines, and strip accidental ### with nothing after
      cleanBody = cleanBody
        .split("\n")
        .map(l => l.trim())
        .filter((l, idx, arr) => {
          if (l === "###") return false;
          if (l.length === 0 && idx > 0 && arr[idx - 1].length === 0) return false;
          return true;
        })
        .join("\n")
        .trim();

      return {
        title,
        body: cleanBody || rawContent,
        rawContent,
        docType: isPresentation ? "HTML Presentation" : "HTML Document",
        isHtml: true
      };
    } catch (e) {
      console.warn("DOMParser failed, falling back to regex stripper:", e);
      const noStyle = rawContent.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
      const noScript = noStyle.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
      const clean = noScript.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      return {
        title: filename || "HTML Document",
        body: clean,
        rawContent,
        docType: "HTML Document",
        isHtml: true
      };
    }
  }

  // Handle JSON files
  if (/\.json$/i.test(filename) || (rawContent.trim().startsWith("{") || rawContent.trim().startsWith("["))) {
    try {
      const parsed = JSON.parse(rawContent);
      let extractedText = "";
      if (Array.isArray(parsed)) {
        extractedText = parsed.map(item => {
          if (typeof item === "string") return item;
          return Object.values(item).filter(v => typeof v === "string").join(" — ");
        }).join("\n\n");
      } else if (typeof parsed === "object" && parsed !== null) {
        extractedText = Object.entries(parsed).map(([k, v]) => {
          return `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`;
        }).join("\n");
      }
      return {
        title: filename || "JSON Data",
        body: extractedText || rawContent,
        rawContent,
        docType: "JSON Data",
        isHtml: false
      };
    } catch {
      // Not valid JSON, continue to text
    }
  }

  // Markdown or plain text
  const isMd = /\.md$/i.test(filename);
  let title = filename || "Text Document";
  if (isMd) {
    const firstH1 = rawContent.match(/^#\s+(.+)$/m);
    if (firstH1) title = firstH1[1].trim();
  }

  return {
    title,
    body: rawContent,
    rawContent,
    docType: isMd ? "Markdown" : "Text Document",
    isHtml: false
  };
}

// ============================================================================
// 5. In-Memory Search Engine
// ============================================================================
class StudioEngine {
  constructor(docs = []) {
    this.documents = new Map();
    this.docLengths = new Map();
    this.totalDocLength = 0;
    this.postings = new Map(); // stem -> Map<docId, { tf, positions }>
    this.k1 = 1.2;
    this.b = 0.75;

    for (const doc of docs) {
      this.addDocument(doc);
    }
  }

  addDocument(doc) {
    const docId = typeof doc.id === "number" ? doc.id : this.getNextDocId();
    const isFile = !!doc.isFile;
    const isNote = doc.isNote !== undefined ? !!doc.isNote : !isFile;
    const fileName = doc.fileName || (isFile ? doc.title : "") || "";

    // Extract clean readable content for indexing and reading view
    const extracted = extractReadableDocument(doc.body || "", fileName || doc.title || "");
    const finalTitle = doc.title && doc.title !== fileName ? doc.title : (extracted.title || fileName || "Untitled Document");

    const storedDoc = {
      id: docId,
      title: finalTitle,
      path: doc.path || (isFile ? `files/${fileName || 'file-' + docId}` : `notes/note-${docId}.md`),
      body: extracted.body,
      rawContent: doc.rawContent || doc.body || "",
      isPersonal: true,
      isFile: isFile,
      isNote: isNote,
      docType: extracted.docType,
      isHtml: extracted.isHtml,
      fileSize: doc.fileSize || 0,
      fileName: fileName || finalTitle
    };

    if (this.documents.has(docId)) {
      this.removeDocument(docId);
    }

    this.documents.set(docId, storedDoc);
    const text = `${storedDoc.title} ${storedDoc.body}`;
    const tokens = tokenize(text);

    this.docLengths.set(docId, tokens.length);
    this.totalDocLength += tokens.length;

    for (let pos = 0; pos < tokens.length; pos++) {
      const stem = tokens[pos].stem;
      if (!this.postings.has(stem)) {
        this.postings.set(stem, new Map());
      }
      const termMap = this.postings.get(stem);
      if (!termMap.has(docId)) {
        termMap.set(docId, { tf: 0, positions: [] });
      }
      const entry = termMap.get(docId);
      entry.tf++;
      entry.positions.push(pos);
    }

    return storedDoc;
  }

  removeDocument(docId) {
    if (!this.documents.has(docId)) return false;
    const dl = this.docLengths.get(docId) || 0;
    this.totalDocLength = Math.max(0, this.totalDocLength - dl);
    this.docLengths.delete(docId);
    this.documents.delete(docId);

    for (const [stem, termMap] of this.postings.entries()) {
      if (termMap.has(docId)) {
        termMap.delete(docId);
        if (termMap.size === 0) {
          this.postings.delete(stem);
        }
      }
    }
    return true;
  }

  getNextDocId() {
    let max = 0;
    for (const id of this.documents.keys()) {
      if (id > max) max = id;
    }
    return max + 1;
  }

  get avgdl() {
    return this.documents.size > 0 ? this.totalDocLength / this.documents.size : 1;
  }

  search(queryStr, filter = "all") {
    const startTime = performance.now();
    queryStr = (queryStr || "").trim();
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

    const phraseMatch = queryStr.match(/"([^"]+)"/);
    let exactPhrase = phraseMatch ? phraseMatch[1] : null;

    const isNotQuery = /\bNOT\b/i.test(queryStr);
    const isOrQuery = /\bOR\b/i.test(queryStr);

    let cleanQuery = queryStr.replace(/"/g, "");
    const tokens = tokenize(cleanQuery);
    const stems = tokens.map(t => t.stem);

    let astPlan = "";
    if (exactPhrase) {
      astPlan = `PhraseQuery("${exactPhrase}") -> PositionalVerifier(slop=0)`;
    } else if (isNotQuery) {
      const parts = queryStr.split(/\bNOT\b/i);
      astPlan = `BinaryOp(NOT)\n  ├─ Positive: Term("${parts[0].trim()}")\n  └─ Exclude: Term("${parts[1].trim()}")`;
    } else if (isOrQuery) {
      astPlan = `BinaryOp(OR, [${stems.map(s => `Term("${s}")`).join(", ")}])`;
    } else {
      astPlan = stems.length > 1
        ? `BinaryOp(AND, [${stems.map(s => `Term("${s}")`).join(", ")}])`
        : `TermQuery("${stems[0] || ""}")`;
    }

    const N = this.documents.size;
    const scores = new Map();
    let candidatesScanned = 0;
    let wandPruned = 0;

    for (const stem of stems) {
      if (!this.postings.has(stem)) continue;
      const termPostings = this.postings.get(stem);
      const df = termPostings.size;

      const idf = Math.log((N - df + 0.5) / (df + 0.5) + 1);

      for (const [docId, posting] of termPostings.entries()) {
        const doc = this.documents.get(docId);
        if (!doc) continue;

        // Apply corpus filter: 'all' | 'files' | 'notes' | 'personal'
        if (filter === "files" && !doc.isFile) continue;
        if (filter === "notes" && !doc.isNote) continue;
        if (filter === "personal" && !doc.isFile) continue;

        candidatesScanned++;
        const dl = this.docLengths.get(docId) || this.avgdl;
        const tf = posting.tf;

        const tfNorm = (tf * (this.k1 + 1)) / (tf + this.k1 * (1 - this.b + this.b * (dl / this.avgdl)));
        const termScore = idf * tfNorm;

        const current = scores.get(docId) || {
          docId,
          score: 0,
          matchedStems: new Set(),
          tfSum: 0,
          dl,
          positions: []
        };

        current.score += termScore;
        current.matchedStems.add(stem);
        current.tfSum += tf;
        current.positions.push(...posting.positions);
        scores.set(docId, current);
      }
    }

    let ranked = Array.from(scores.values());

    if (!isOrQuery && stems.length > 1) {
      ranked = ranked.filter(item => {
        if (item.matchedStems.size < Math.min(stems.length, 2)) {
          wandPruned++;
          return false;
        }
        return true;
      });
      for (const item of ranked) {
        if (item.matchedStems.size === stems.length) {
          item.score *= 1.35;
        }
      }
    }

    ranked.sort((a, b) => b.score - a.score);

    const elapsedMs = +(performance.now() - startTime).toFixed(2);

    const results = ranked.slice(0, 15).map(item => {
      const doc = this.documents.get(item.docId);
      return {
        docId: doc.id,
        title: doc.title,
        path: doc.path,
        fileName: doc.fileName || "",
        docType: doc.docType || "Text Document",
        isPersonal: true,
        isFile: !!doc.isFile,
        isNote: !!doc.isNote,
        isHtml: !!doc.isHtml,
        fileSize: doc.fileSize || 0,
        score: +item.score.toFixed(2),
        snippet: this.generateSnippet(doc.body, stems),
        matchedStems: Array.from(item.matchedStems),
        offsets: item.positions.slice(0, 4)
      };
    });

    return {
      results,
      latencyMs: elapsedMs,
      astPlan,
      tokens: stems,
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
      const clean = words[i].toLowerCase().replace(/[^\w]/g, "");
      const s = PorterStemmer(clean);
      if (stems.includes(s)) {
        bestIdx = i;
        break;
      }
    }

    const start = Math.max(0, bestIdx - 6);
    const end = Math.min(words.length, bestIdx + 16);
    const slice = words.slice(start, end);

    const highlighted = slice.map(word => {
      const clean = word.toLowerCase().replace(/[^\w]/g, "");
      const s = PorterStemmer(clean);
      if (stems.includes(s)) {
        return `<mark>${escapeHtml(word)}</mark>`;
      }
      return escapeHtml(word);
    }).join(" ");

    return (start > 0 ? "… " : "") + highlighted + (end < words.length ? " …" : "");
  }
}

function escapeHtml(str) {
  return (str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ============================================================================
// 6. Studio UI Controller
// ============================================================================
document.addEventListener("DOMContentLoaded", () => {
  const engine = new StudioEngine([]);
  let activeCorpusFilter = "all"; // 'all' | 'files' | 'notes'

  // DOM Elements - Search
  const searchInput = document.getElementById("repl-search-input");
  const clearBtn = document.getElementById("clear-search-btn");
  const resultsContainer = document.getElementById("repl-results-list");
  const latencyVal = document.getElementById("latency-val");
  const tokenStream = document.getElementById("token-stream");
  const astPlanPre = document.getElementById("ast-plan-pre");
  const telemCandidates = document.getElementById("telem-candidates");
  const telemTerms = document.getElementById("telem-terms");
  const telemPruned = document.getElementById("telem-pruned");
  const telemAvgdl = document.getElementById("telem-avgdl");
  const resultsCountBadge = document.getElementById("results-count-badge");
  const corpusStatusPill = document.getElementById("corpus-status-pill");
  const tabDocCount = document.getElementById("tab-doc-count");

  // Filter Buttons & Counts
  const filterCountAll = document.getElementById("filter-count-all");
  const filterCountFiles = document.getElementById("filter-count-files");
  const filterCountNotes = document.getElementById("filter-count-notes");
  const filterCountPersonal = document.getElementById("filter-count-personal");

  // Personal File Ingestion Elements
  const dropzone = document.getElementById("studio-dropzone");
  const localFileInput = document.getElementById("local-file-input");
  const localFolderInput = document.getElementById("local-folder-input");
  const btnBrowseFiles = document.getElementById("btn-browse-files");
  const btnBrowseFolder = document.getElementById("btn-browse-folder");
  const personalFileCount = document.getElementById("personal-file-count");
  const personalFilesList = document.getElementById("personal-files-list");
  const btnClearPersonalFiles = document.getElementById("btn-clear-personal-files");

  // Ingestion Form Elements
  const docTitleInput = document.getElementById("doc-title-input");
  const docPathInput = document.getElementById("doc-path-input");
  const docBodyInput = document.getElementById("doc-body-input");
  const btnIndexDoc = document.getElementById("btn-index-doc");
  const liveWordCount = document.getElementById("live-word-count");
  const liveCharCount = document.getElementById("live-char-count");
  const liveTokenCount = document.getElementById("live-token-count");
  const liveStemChips = document.getElementById("live-stem-chips");

  // Doc Manager Elements
  const studioDocList = document.getElementById("studio-doc-list");
  const docFilterInput = document.getElementById("doc-filter-input");
  const btnResetCorpus = document.getElementById("btn-reset-corpus");

  // Bulk Elements
  const bulkJsonInput = document.getElementById("bulk-json-input");
  const btnIngestJson = document.getElementById("btn-ingest-json");

  // BM25 Tuning Elements
  const k1Slider = document.getElementById("k1-slider");
  const bSlider = document.getElementById("b-slider");
  const k1Val = document.getElementById("k1-slider-val");
  const bVal = document.getElementById("b-slider-val");
  const btnResetBM25 = document.getElementById("btn-reset-bm25");

  // Modal Elements
  const modalBackdrop = document.getElementById("studio-modal-backdrop");
  const modalCloseBtn = document.getElementById("modal-close-btn");
  const modalDocTitle = document.getElementById("modal-doc-title");
  const modalDocSub = document.getElementById("modal-doc-sub");
  const modalDocBody = document.getElementById("modal-doc-body");
  const modalBtnFormatted = document.getElementById("modal-btn-formatted");
  const modalBtnRaw = document.getElementById("modal-btn-raw");
  const modalCopyBtn = document.getElementById("modal-copy-btn");
  let activeModalDocId = null;
  let currentModalViewMode = "formatted"; // 'formatted' | 'raw'

  // Toast
  const toastNotice = document.getElementById("toast-notice");
  const toastMsg = document.getElementById("toast-msg");

  function showToast(message) {
    if (!toastNotice) return;
    toastMsg.textContent = message;
    toastNotice.classList.add("show");
    setTimeout(() => {
      toastNotice.classList.remove("show");
    }, 2500);
  }

  // Tab Switching
  document.querySelectorAll(".studio-tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".studio-tab-btn").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".studio-tab-content").forEach(c => c.classList.remove("active"));
      btn.classList.add("active");
      const targetId = btn.getAttribute("data-tab");
      const targetContent = document.getElementById(targetId);
      if (targetContent) targetContent.classList.add("active");
    });
  });

  // Corpus Filter Buttons
  document.querySelectorAll(".corpus-filter-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".corpus-filter-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      activeCorpusFilter = btn.getAttribute("data-filter");
      performSearch(searchInput.value);
    });
  });

  function updateFilterButtons() {
    document.querySelectorAll(".corpus-filter-btn").forEach(btn => {
      btn.classList.toggle("active", btn.getAttribute("data-filter") === activeCorpusFilter);
    });
  }

  // Execute Search
  function performSearch(query) {
    const response = engine.search(query, activeCorpusFilter);

    // Latency & Counts
    latencyVal.textContent = `${response.latencyMs} ms`;
    const filterLabel = activeCorpusFilter === "files" ? " (Files Only)" : activeCorpusFilter === "notes" ? " (Notes Only)" : "";
    resultsCountBadge.textContent = `${response.results.length} Matches${filterLabel}`;

    // AST Plan
    astPlanPre.textContent = response.astPlan;

    // Tokens Stream
    if (response.tokens.length > 0) {
      tokenStream.innerHTML = response.tokens
        .map(t => `<span class="token-chip">${escapeHtml(t)}</span>`)
        .join('<span class="token-arrow">→</span>');
    } else {
      tokenStream.innerHTML = '<span class="token-chip" style="opacity: 0.5;">No active search tokens</span>';
    }

    // Telemetry
    telemCandidates.textContent = response.telemetry.candidatesScanned;
    telemTerms.textContent = response.telemetry.termsLookedUp;
    telemPruned.textContent = response.telemetry.wandPruned;
    telemAvgdl.textContent = `${response.telemetry.avgDocLength} terms`;

    // Render Results
    if (response.results.length === 0) {
      if (engine.documents.size === 0) {
        resultsContainer.innerHTML = `
          <div class="no-results" style="padding: 36px 20px;">
            <div style="font-size: 2rem; margin-bottom: 12px;">📁</div>
            <div style="font-size: 0.95rem; font-weight: 600; color: #ffffff; margin-bottom: 6px;">Zero Documents Indexed Yet</div>
            <p style="margin: 0 auto; max-width: 420px; font-size: 0.78rem; color: var(--text-dim); line-height: 1.5;">
              Drop your personal files or folder in the left panel, add a custom text note, or import JSON to search locally in memory.
            </p>
          </div>
        `;
        return;
      }

      if (!query.trim()) {
        resultsContainer.innerHTML = `
          <div class="no-results" style="padding: 36px 20px;">
            <div style="font-size: 1.8rem; margin-bottom: 12px; opacity: 0.7;">⚡</div>
            <div style="font-size: 0.95rem; font-weight: 600; color: #ffffff; margin-bottom: 6px;">Ready for Query Evaluation</div>
            <p style="margin: 0 auto; max-width: 420px; font-size: 0.78rem; color: var(--text-dim); line-height: 1.5;">
              Type keywords in the search bar above. You can combine terms with <code>AND</code>, <code>OR</code>, <code>NOT</code>, or search exact phrases with <code>"quotes"</code>.
            </p>
          </div>
        `;
        return;
      }

      resultsContainer.innerHTML = `
        <div class="no-results">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin: 0 auto 10px; opacity: 0.4;">
            <circle cx="11" cy="11" r="8"/>
            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <div>No indexed documents match <code>"${escapeHtml(query)}"</code></div>
          <p style="margin-top: 6px; font-size: 0.72rem; color: var(--text-dim);">
            ${activeCorpusFilter === "files" 
              ? "No matches found in uploaded files. Drop more files or switch filter to 'All Documents'!" 
              : activeCorpusFilter === "notes"
              ? "No matches found in text notes. Switch filter to 'All Documents' or add more text!"
              : "Drop personal files or add custom text in the studio panel to index new terms!"}
          </p>
        </div>
      `;
      return;
    }

    resultsContainer.innerHTML = response.results.map((res, idx) => {
      const matchTags = res.matchedStems
        ? res.matchedStems.map(s => `<span class="matched-term-tag">${escapeHtml(s)}</span>`).join("")
        : "";

      const typeLabel = res.docType || (res.isFile ? "File" : "Note");
      const typeBadge = `<span class="file-pill-badge" title="${escapeHtml(typeLabel)}">${res.isFile ? '📁 ' : '📝 '}${escapeHtml(typeLabel)}</span>`;
      const fileSub = res.fileName && res.fileName !== res.title
        ? `<span style="font-family: var(--font-mono); font-size: 0.7rem; color: var(--text-dim); margin-left: 6px;">(${escapeHtml(res.fileName)})</span>`
        : "";

      return `
        <article class="result-card" data-doc-id="${res.docId}">
          <div class="result-header">
            <span class="result-rank-num">#${idx + 1}</span>
            <div style="flex: 1; min-width: 0;">
              <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 2px; flex-wrap: wrap;">
                <h3 class="result-title">${escapeHtml(res.title)}${fileSub}</h3>
                ${typeBadge}
              </div>
              <div class="result-path">${escapeHtml(res.path)}</div>
            </div>
            <span class="bm25-score-pill">BM25: ${res.score.toFixed(2)}</span>
          </div>

          <div class="result-snippet">${res.snippet}</div>

          <div class="result-footer-meta">
            <div style="display: flex; gap: 4px; flex-wrap: wrap;">
              ${matchTags}
            </div>
            <span style="margin-left: auto;">DocID: #${res.docId}</span>
          </div>
        </article>
      `;
    }).join("");

    resultsContainer.querySelectorAll(".result-card").forEach(card => {
      card.addEventListener("click", () => {
        const id = parseInt(card.getAttribute("data-doc-id"), 10);
        openDocumentModal(id);
      });
    });
  }

  // Update Corpus Metrics
  function updateCorpusStats() {
    const allDocs = Array.from(engine.documents.values());
    const fileDocs = allDocs.filter(d => d.isFile);
    const noteDocs = allDocs.filter(d => d.isNote);

    if (corpusStatusPill) corpusStatusPill.textContent = `${allDocs.length} DOCS INDEXED`;
    if (tabDocCount) tabDocCount.textContent = allDocs.length;

    if (filterCountAll) filterCountAll.textContent = allDocs.length;
    if (filterCountFiles) filterCountFiles.textContent = fileDocs.length;
    if (filterCountNotes) filterCountNotes.textContent = noteDocs.length;
    if (filterCountPersonal) filterCountPersonal.textContent = fileDocs.length;
    if (personalFileCount) personalFileCount.textContent = `${fileDocs.length} file${fileDocs.length === 1 ? '' : 's'}`;

    renderDocumentList();
    renderPersonalFilesList(fileDocs);
  }

  // Render Personal Files in Tab 0
  function renderPersonalFilesList(personalDocs) {
    if (!personalFilesList) return;

    if (personalDocs.length === 0) {
      personalFilesList.innerHTML = `
        <div style="padding: 16px; text-align: center; color: var(--text-dim); font-size: 0.76rem;">
          No personal files indexed yet. Drag &amp; drop files above or click "Choose Files..." to test search against your local files!
        </div>
      `;
      return;
    }

    personalFilesList.innerHTML = personalDocs.map(d => {
      const length = engine.docLengths.get(d.id) || 0;
      const sizeKb = d.fileSize ? ` · ${(d.fileSize / 1024).toFixed(1)} KB` : "";
      return `
        <div class="doc-list-item" data-id="${d.id}">
          <div style="flex: 1; min-width: 0;">
            <div class="doc-item-title" title="Click to view file text">${escapeHtml(d.title)}</div>
            <div class="doc-item-sub">
              <span class="file-pill-badge" style="font-size: 0.6rem; padding: 0 4px;">#${d.id}</span>
              <span>${escapeHtml(d.path)}${sizeKb}</span>
              <span>${length} terms</span>
            </div>
          </div>
          <button class="doc-delete-btn" title="Remove this file" data-delete-id="${d.id}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
          </button>
        </div>
      `;
    }).join("");

    personalFilesList.querySelectorAll(".doc-item-title").forEach(title => {
      title.addEventListener("click", () => {
        const id = parseInt(title.closest(".doc-list-item").getAttribute("data-id"), 10);
        openDocumentModal(id);
      });
    });

    personalFilesList.querySelectorAll(".doc-delete-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = parseInt(btn.getAttribute("data-delete-id"), 10);
        engine.removeDocument(id);
        updateCorpusStats();
        performSearch(searchInput.value);
        showToast(`Removed personal file #${id}`);
      });
    });
  }

  // Render Document List in Tab 2
  function renderDocumentList(filter = "") {
    filter = filter.toLowerCase().trim();
    const docs = Array.from(engine.documents.values()).filter(d => {
      if (!filter) return true;
      return d.title.toLowerCase().includes(filter) || d.path.toLowerCase().includes(filter);
    });

    if (docs.length === 0) {
      studioDocList.innerHTML = `
        <div style="padding: 16px; text-align: center; color: var(--text-dim); font-size: 0.78rem;">
          No documents found matching filter.
        </div>
      `;
      return;
    }

    studioDocList.innerHTML = docs.map(d => {
      const length = engine.docLengths.get(d.id) || 0;
      const personalBadge = d.isPersonal ? '<span class="file-pill-badge" style="font-size: 0.6rem; padding: 0 4px;">Personal</span>' : '';
      return `
        <div class="doc-list-item" data-id="${d.id}">
          <div style="flex: 1; min-width: 0;">
            <div class="doc-item-title" title="Click to view text">${escapeHtml(d.title)}</div>
            <div class="doc-item-sub">
              ${personalBadge}
              <span style="color: var(--accent);">#${d.id}</span>
              <span>${escapeHtml(d.path)}</span>
              <span>${length} terms</span>
            </div>
          </div>
          <button class="doc-delete-btn" title="Delete document from index" data-delete-id="${d.id}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
          </button>
        </div>
      `;
    }).join("");

    studioDocList.querySelectorAll(".doc-item-title").forEach(title => {
      title.addEventListener("click", () => {
        const id = parseInt(title.closest(".doc-list-item").getAttribute("data-id"), 10);
        openDocumentModal(id);
      });
    });

    studioDocList.querySelectorAll(".doc-delete-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = parseInt(btn.getAttribute("data-delete-id"), 10);
        engine.removeDocument(id);
        updateCorpusStats();
        performSearch(searchInput.value);
        showToast(`Document #${id} removed from index`);
      });
    });
  }

  // Process Local Personal Files
  async function processLocalFiles(fileList) {
    if (!fileList || fileList.length === 0) return;

    let addedCount = 0;
    let firstTerm = "";

    for (const file of fileList) {
      if (file.size > 5000000) continue; // Skip large files > 5MB

      try {
        const content = await file.text();
        if (content.includes("\0")) continue; // Skip binary files

        const doc = engine.addDocument({
          title: file.name,
          path: file.webkitRelativePath || `files/${file.name}`,
          body: content,
          isFile: true,
          isNote: false,
          fileSize: file.size,
          fileName: file.name
        });

        addedCount++;
        if (!firstTerm) {
          const t = tokenize(doc.title);
          if (t.length > 0) firstTerm = t[0].raw;
        }

        // Try syncing with server
        fetch("/api/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ files: [{ name: file.name, content }] })
        }).catch(() => {});

      } catch (err) {
        console.warn("Failed reading", file.name, err);
      }
    }

    if (addedCount > 0) {
      activeCorpusFilter = "files";
      updateFilterButtons();
      updateCorpusStats();
      showToast(`Indexed ${addedCount} file${addedCount > 1 ? "s" : ""} into V8 memory!`);

      if (firstTerm) {
        searchInput.value = firstTerm;
        clearBtn.style.display = "block";
      }
      performSearch(searchInput.value);
    } else {
      alert("No readable text, markdown, code, or JSON files found in selected files.");
    }
  }

  // Personal File Input & Dropzone Bindings
  if (btnBrowseFiles && localFileInput) {
    btnBrowseFiles.addEventListener("click", (e) => {
      e.stopPropagation();
      localFileInput.click();
    });

    localFileInput.addEventListener("change", (e) => {
      processLocalFiles(e.target.files);
      localFileInput.value = "";
    });
  }

  if (btnBrowseFolder && localFolderInput) {
    btnBrowseFolder.addEventListener("click", (e) => {
      e.stopPropagation();
      localFolderInput.click();
    });

    localFolderInput.addEventListener("change", (e) => {
      processLocalFiles(e.target.files);
      localFolderInput.value = "";
    });
  }

  if (dropzone) {
    dropzone.addEventListener("dragover", (e) => {
      e.preventDefault();
      dropzone.classList.add("dragover");
    });

    dropzone.addEventListener("dragleave", () => {
      dropzone.classList.remove("dragover");
    });

    dropzone.addEventListener("drop", (e) => {
      e.preventDefault();
      dropzone.classList.remove("dragover");
      if (e.dataTransfer && e.dataTransfer.files) {
        processLocalFiles(e.dataTransfer.files);
      }
    });

    dropzone.addEventListener("click", () => {
      if (localFileInput) localFileInput.click();
    });
  }

  if (btnClearPersonalFiles) {
    btnClearPersonalFiles.addEventListener("click", () => {
      const fileIds = [];
      for (const [id, doc] of engine.documents.entries()) {
        if (doc.isFile) fileIds.push(id);
      }
      if (fileIds.length === 0) {
        showToast("No uploaded files to clear");
        return;
      }
      for (const id of fileIds) {
        engine.removeDocument(id);
      }
      activeCorpusFilter = "all";
      updateFilterButtons();
      updateCorpusStats();
      performSearch(searchInput.value);
      showToast(`Cleared ${fileIds.length} uploaded file${fileIds.length === 1 ? '' : 's'} from index`);
    });
  }

  // Open Document Modal
  function openDocumentModal(docId) {
    const doc = engine.documents.get(docId);
    if (!doc) return;
    activeModalDocId = docId;

    modalDocTitle.textContent = doc.title;
    const fileLabel = doc.fileName && doc.fileName !== doc.title ? ` · <span>${escapeHtml(doc.fileName)}</span>` : "";
    const typeLabel = doc.docType || (doc.isFile ? "Uploaded File" : "Text Note");
    const termCount = engine.docLengths.get(doc.id) || 0;
    const words = doc.body ? doc.body.trim().split(/\s+/).length : 0;

    modalDocSub.innerHTML = `
      <span>Doc #${doc.id}</span>
      <span>•</span>
      <span>${escapeHtml(doc.path)}</span>
      ${fileLabel}
      <span>•</span>
      <span style="color: var(--accent);">${words} words</span>
      <span>•</span>
      <span>${termCount} indexed terms</span>
      <span>•</span>
      <span class="file-pill-badge" style="font-size:0.62rem; padding: 1px 6px;">${escapeHtml(typeLabel)}</span>
    `;

    renderModalContent(doc);
    modalBackdrop.classList.add("open");
  }

  function renderModalContent(doc) {
    if (!doc) return;

    if (currentModalViewMode === "raw") {
      const raw = doc.rawContent || doc.body;
      modalDocBody.innerHTML = `<pre class="modal-raw-pre"><code>${escapeHtml(raw)}</code></pre>`;
      return;
    }

    // Formatted Clean Reading View
    const q = searchInput.value.trim();
    const tokens = tokenize(q.replace(/"/g, ""));
    const stems = tokens.map(t => t.stem);

    modalDocBody.innerHTML = formatDocumentContent(doc.body, stems);
  }

  function highlightTermsInText(str, stems) {
    if (!str) return "";
    const words = str.split(/(\s+)/);
    return words.map(w => {
      if (/^\s+$/.test(w)) return w;
      const clean = w.toLowerCase().replace(/[^\w]/g, "");
      const s = PorterStemmer(clean);
      if (stems && stems.length > 0 && stems.includes(s)) {
        return `<mark>${escapeHtml(w)}</mark>`;
      }
      return escapeHtml(w);
    }).join("");
  }

  function formatDocumentContent(text, stems) {
    if (!text) return '<div style="color: var(--text-dim); text-align: center; padding: 20px;">Empty document content</div>';

    const lines = text.split("\n");
    let html = "";
    let inList = false;

    for (let rawLine of lines) {
      const line = rawLine.trim();
      if (!line) {
        if (inList) { html += "</ul>"; inList = false; }
        continue;
      }

      if (line.startsWith("### ")) {
        if (inList) { html += "</ul>"; inList = false; }
        const hText = highlightTermsInText(line.replace(/^###\s+/, ""), stems);
        html += `<h4 class="modal-content-h4">${hText}</h4>`;
      } else if (line.startsWith("• ")) {
        if (!inList) { html += '<ul class="modal-content-list">'; inList = true; }
        const liText = highlightTermsInText(line.replace(/^•\s+/, ""), stems);
        html += `<li>${liText}</li>`;
      } else {
        if (inList) { html += "</ul>"; inList = false; }
        const pText = highlightTermsInText(line, stems);
        html += `<p class="modal-content-p">${pText}</p>`;
      }
    }

    if (inList) html += "</ul>";
    return html;
  }

  // Modal View Toggle & Actions
  if (modalBtnFormatted) {
    modalBtnFormatted.addEventListener("click", () => {
      currentModalViewMode = "formatted";
      modalBtnFormatted.classList.add("active");
      if (modalBtnRaw) modalBtnRaw.classList.remove("active");
      if (activeModalDocId !== null) {
        renderModalContent(engine.documents.get(activeModalDocId));
      }
    });
  }

  if (modalBtnRaw) {
    modalBtnRaw.addEventListener("click", () => {
      currentModalViewMode = "raw";
      modalBtnRaw.classList.add("active");
      if (modalBtnFormatted) modalBtnFormatted.classList.remove("active");
      if (activeModalDocId !== null) {
        renderModalContent(engine.documents.get(activeModalDocId));
      }
    });
  }

  if (modalCopyBtn) {
    modalCopyBtn.addEventListener("click", () => {
      if (activeModalDocId === null) return;
      const doc = engine.documents.get(activeModalDocId);
      if (!doc) return;
      const textToCopy = currentModalViewMode === "raw" ? (doc.rawContent || doc.body) : doc.body;
      navigator.clipboard.writeText(textToCopy).then(() => {
        showToast("Copied document content to clipboard!");
      }).catch(() => {
        showToast("Failed copying to clipboard");
      });
    });
  }

  modalCloseBtn.addEventListener("click", () => {
    modalBackdrop.classList.remove("open");
  });

  modalBackdrop.addEventListener("click", (e) => {
    if (e.target === modalBackdrop) {
      modalBackdrop.classList.remove("open");
    }
  });

  // Live Input Text Telemetry
  docBodyInput.addEventListener("input", () => {
    const text = docBodyInput.value;
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    const chars = text.length;
    const tokens = tokenize(text);

    liveWordCount.textContent = words;
    liveCharCount.textContent = chars;
    liveTokenCount.textContent = tokens.length;

    if (tokens.length > 0) {
      const uniqueStems = Array.from(new Set(tokens.map(t => t.stem))).slice(0, 10);
      liveStemChips.innerHTML = uniqueStems
        .map(s => `<span class="token-chip">${escapeHtml(s)}</span>`)
        .join("");
    } else {
      liveStemChips.innerHTML = '<span class="token-chip" style="opacity: 0.5;">Type text above to preview token stream...</span>';
    }
  });

  // Index Document Action
  btnIndexDoc.addEventListener("click", () => {
    const title = docTitleInput.value.trim();
    const path = docPathInput.value.trim();
    const body = docBodyInput.value.trim();

    if (!title && !body) {
      alert("Please provide at least a title or text content to index.");
      return;
    }

    const doc = engine.addDocument({
      title: title || "Untitled Document",
      path: path || "notes/custom-note.md",
      body: body || title,
      isFile: false,
      isNote: true
    });

    fetch("/api/index", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(doc)
    }).catch(() => {});

    updateCorpusStats();
    showToast(`Indexed "${doc.title}" into memory (+${engine.docLengths.get(doc.id)} terms)`);

    docTitleInput.value = "";
    docPathInput.value = "";
    docBodyInput.value = "";
    liveWordCount.textContent = "0";
    liveCharCount.textContent = "0";
    liveTokenCount.textContent = "0";
    liveStemChips.innerHTML = '<span class="token-chip" style="opacity: 0.5;">Type text above to preview token stream...</span>';

    const newTokens = tokenize(doc.title);
    if (newTokens.length > 0) {
      searchInput.value = newTokens[0].raw;
      clearBtn.style.display = "block";
      performSearch(searchInput.value);
    } else {
      performSearch(searchInput.value);
    }
  });

  // Quick Template Inserters
  const btnInsertNote = document.getElementById("btn-insert-note");
  if (btnInsertNote) {
    btnInsertNote.addEventListener("click", () => {
      docTitleInput.value = "Weekly Team Architecture Sync";
      docPathInput.value = "notes/meetings/architecture-sync.md";
      docBodyInput.value = "Discussed migrating indexing workers to zero-copy memory buffers. Evaluated latency improvements across BM25 scoring pipelines and positional phrase queries.";
      docBodyInput.dispatchEvent(new Event("input"));
    });
  }

  const btnInsertSpec = document.getElementById("btn-insert-spec");
  if (btnInsertSpec) {
    btnInsertSpec.addEventListener("click", () => {
      docTitleInput.value = "High-Throughput Inverted Index Specification";
      docPathInput.value = "specs/engine/inverted-index-v2.md";
      docBodyInput.value = "Specification for mechanical sympathy and cache-aligned postings lists. Implements SIMD-friendly delta compression, skip pointers, and dynamic WAND score thresholds.";
      docBodyInput.dispatchEvent(new Event("input"));
    });
  }

  const btnInsertReadme = document.getElementById("btn-insert-readme");
  if (btnInsertReadme) {
    btnInsertReadme.addEventListener("click", () => {
      docTitleInput.value = "Project README & Development Guide";
      docPathInput.value = "docs/readme.md";
      docBodyInput.value = "Zero-dependency in-memory search engine in pure TypeScript. Fast lexical full-text retrieval, boolean AST evaluator, and BM25 relevance ranking.";
      docBodyInput.dispatchEvent(new Event("input"));
    });
  }

  // Document Filter
  docFilterInput.addEventListener("input", () => {
    renderDocumentList(docFilterInput.value);
  });

  // Reset / Clear Corpus
  btnResetCorpus.addEventListener("click", () => {
    if (engine.documents.size === 0) {
      showToast("Index is already empty");
      return;
    }
    if (confirm("Clear all indexed documents and notes from memory?")) {
      engine.documents.clear();
      engine.docLengths.clear();
      engine.postings.clear();
      engine.totalDocLength = 0;
      activeCorpusFilter = "all";
      updateFilterButtons();
      updateCorpusStats();
      performSearch(searchInput.value);
      showToast("Cleared all documents from in-memory index");
    }
  });

  // Bulk Ingest JSON
  btnIngestJson.addEventListener("click", () => {
    const raw = bulkJsonInput.value.trim();
    if (!raw) {
      alert("Please paste a JSON array of documents.");
      return;
    }
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        alert("Expected an array of documents: [{ title, body }]");
        return;
      }
      let count = 0;
      for (const item of parsed) {
        if (item.title || item.body) {
          engine.addDocument({
            ...item,
            isFile: false,
            isNote: true
          });
          count++;
        }
      }
      activeCorpusFilter = "notes";
      updateFilterButtons();
      updateCorpusStats();
      performSearch(searchInput.value);
      showToast(`Successfully indexed ${count} JSON documents`);
      bulkJsonInput.value = "";
    } catch (err) {
      alert("JSON Syntax Error: " + err.message);
    }
  });

  // BM25 Sliders
  k1Slider.addEventListener("input", () => {
    engine.k1 = parseFloat(k1Slider.value);
    k1Val.textContent = engine.k1.toFixed(2);
    performSearch(searchInput.value);
  });

  bSlider.addEventListener("input", () => {
    engine.b = parseFloat(bSlider.value);
    bVal.textContent = engine.b.toFixed(2);
    performSearch(searchInput.value);
  });

  btnResetBM25.addEventListener("click", () => {
    engine.k1 = 1.2;
    engine.b = 0.75;
    k1Slider.value = 1.2;
    bSlider.value = 0.75;
    k1Val.textContent = "1.20";
    bVal.textContent = "0.75";
    performSearch(searchInput.value);
    showToast("BM25 parameters reset to defaults (k1=1.2, b=0.75)");
  });

  // Search input events
  searchInput.addEventListener("input", () => {
    clearBtn.style.display = searchInput.value.length > 0 ? "block" : "none";
    performSearch(searchInput.value);
  });

  clearBtn.addEventListener("click", () => {
    searchInput.value = "";
    clearBtn.style.display = "none";
    searchInput.focus();
    performSearch("");
  });

  // Preset query chips
  document.querySelectorAll(".preset-chip").forEach(chip => {
    chip.addEventListener("click", () => {
      document.querySelectorAll(".preset-chip").forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
      const q = chip.getAttribute("data-query");
      searchInput.value = q;
      clearBtn.style.display = "block";
      performSearch(q);
    });
  });

  // Global Keyboard shortcuts
  document.addEventListener("keydown", (e) => {
    if (e.key === "/" && document.activeElement !== searchInput && document.activeElement !== docBodyInput && document.activeElement !== docTitleInput) {
      e.preventDefault();
      searchInput.focus();
      searchInput.select();
    }
    if (e.key === "Escape") {
      modalBackdrop.classList.remove("open");
    }
  });

  // Initial Boot
  updateCorpusStats();
  performSearch(searchInput.value);
});
