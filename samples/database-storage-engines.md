# Database Storage Engines: B-Trees vs LSM-Trees

Modern relational and NoSQL databases rely on storage engines optimized for specific access patterns and hardware characteristics.

## B-Trees and B+Trees
B-Trees are the dominant on-disk data structure in traditional relational database management systems like PostgreSQL, SQLite, and MySQL InnoDB. They provide predictable O(log N) point lookups and efficient sequential range scans by storing ordered key-value pairs across balanced tree pages. However, random write operations cause significant write amplification.

## Log-Structured Merge-Trees (LSM-Trees)
LSM-Trees, utilized in systems such as RocksDB, Cassandra, and Bigtable, optimize for high-throughput write workloads. Writes are first appended to an in-memory MemTable and a durable Write-Ahead Log (WAL). When the MemTable fills, it is flushed to disk as an immutable Sorted String Table (SSTable). Periodic background compaction merges and deduplicates SSTables.
