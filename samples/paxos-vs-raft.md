# Paxos vs Raft: Distributed Consensus Protocols

Consensus algorithms are fundamental building blocks of fault-tolerant distributed systems. They ensure that a cluster of state machines can agree on a shared series of values or log entries, even in the presence of node failures and network partitions.

## Paxos
Developed by Leslie Lamport, Paxos is mathematically proven and widely recognized as the foundation of distributed consensus. However, classical Multi-Paxos is notoriously difficult to understand and implement in production software.

## Raft
Designed by Diego Ongaro and John Ousterhout at Stanford University, Raft decomposes consensus into three explicit, understandable subproblems:
1. Leader Election: A randomized heartbeat timer guarantees fast and conflict-free leader selection.
2. Log Replication: The elected leader acts as the sole authority for sequencing and replicating log entries across quorum followers.
3. Safety: If any server has applied a particular log entry to its state machine, no other server may apply a different entry for the same log index.
