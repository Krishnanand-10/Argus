# Inverted Index Architecture and Positional Postings

Full-text search engines rely on an inverted index data structure to achieve sub-millisecond retrieval across millions of documents. Rather than scanning documents sequentially, an inverted index maps each normalized word or term to a postings list of documents in which it appears.

## Positional Postings
A basic inverted index records document IDs for each term. A positional inverted index additionally records word positions within each document. This allows the search engine to verify exact phrase queries (such as "distributed consensus") and proximity searches without consulting the original document text.

## Compression
Postings lists are typically compressed using Delta encoding (d-gaps) and Variable-Byte (Varint) integer compression. Because document IDs are strictly increasing, storing the gap between adjacent IDs significantly reduces binary storage requirements.
