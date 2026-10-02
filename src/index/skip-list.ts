import type { PhraseMatch } from './types.js';
import { PostingsList } from './postings-list.js';

/**
 * Intersects two postings lists using skip pointer traversal where beneficial.
 * Returns the matching DocIDs common to both lists.
 */
export function intersectTwoDocIds(listA: PostingsList, listB: PostingsList): number[] {
  const result: number[] = [];
  let p1 = 0;
  let p2 = 0;
  const len1 = listA.length;
  const len2 = listB.length;

  while (p1 < len1 && p2 < len2) {
    const doc1 = listA.get(p1)!.docId;
    const doc2 = listB.get(p2)!.docId;

    if (doc1 === doc2) {
      result.push(doc1);
      p1++;
      p2++;
    } else if (doc1 < doc2) {
      // Check for skip pointer on listA
      const skip = listA.getSkip(p1);
      if (skip !== undefined && skip.targetDocId <= doc2) {
        while (
          listA.getSkip(p1) !== undefined &&
          listA.getSkip(p1)!.targetDocId <= doc2
        ) {
          p1 = listA.getSkip(p1)!.postingIndex;
        }
      } else {
        p1++;
      }
    } else {
      // Check for skip pointer on listB
      const skip = listB.getSkip(p2);
      if (skip !== undefined && skip.targetDocId <= doc1) {
        while (
          listB.getSkip(p2) !== undefined &&
          listB.getSkip(p2)!.targetDocId <= doc1
        ) {
          p2 = listB.getSkip(p2)!.postingIndex;
        }
      } else {
        p2++;
      }
    }
  }

  return result;
}

/**
 * Intersects an existing array of DocIDs with a PostingsList using skip pointers.
 */
export function intersectDocIdsWithPostings(docIds: number[], postings: PostingsList): number[] {
  const result: number[] = [];
  let i = 0;
  let p = 0;
  const numDocs = docIds.length;
  const len = postings.length;

  while (i < numDocs && p < len) {
    const doc1 = docIds[i]!;
    const doc2 = postings.get(p)!.docId;

    if (doc1 === doc2) {
      result.push(doc1);
      i++;
      p++;
    } else if (doc1 < doc2) {
      i++;
    } else {
      // doc2 < doc1: try to advance p using skip pointers
      const skip = postings.getSkip(p);
      if (skip !== undefined && skip.targetDocId <= doc1) {
        while (
          postings.getSkip(p) !== undefined &&
          postings.getSkip(p)!.targetDocId <= doc1
        ) {
          p = postings.getSkip(p)!.postingIndex;
        }
      } else {
        p++;
      }
    }
  }

  return result;
}

/**
 * Performs accelerated multi-term intersection (Boolean AND) across multiple postings lists.
 * Evaluates in order of increasing Document Frequency (df) to minimize intermediate sets.
 */
export function intersectMultiple(lists: PostingsList[]): number[] {
  if (lists.length === 0) return [];
  if (lists.length === 1) {
    return lists[0]!.getAll().map((p) => p.docId);
  }

  // Sort lists by document frequency ascending (shortest first)
  const sortedLists = [...lists].sort((a, b) => a.length - b.length);

  // If any list is empty, the AND result must be empty
  if (sortedLists[0]!.length === 0) {
    return [];
  }

  // Intersect first two lists
  let currentDocs = intersectTwoDocIds(sortedLists[0]!, sortedLists[1]!);

  // Intersect remaining lists iteratively
  for (let i = 2; i < sortedLists.length; i++) {
    if (currentDocs.length === 0) break;
    currentDocs = intersectDocIdsWithPostings(currentDocs, sortedLists[i]!);
  }

  return currentDocs;
}

/**
 * Computes the union (Boolean OR) across multiple postings lists.
 * Returns sorted, deduplicated document IDs.
 */
export function unionMultiple(lists: PostingsList[]): number[] {
  if (lists.length === 0) return [];
  if (lists.length === 1) {
    return lists[0]!.getAll().map((p) => p.docId);
  }

  const docSet = new Set<number>();
  for (const list of lists) {
    for (const posting of list) {
      docSet.add(posting.docId);
    }
  }

  return Array.from(docSet).sort((a, b) => a - b);
}

/**
 * Positional phrase verification.
 * Verifies that a sequence of terms appears contiguously (or within slop distance) in the same document.
 */
export function intersectPhrase(lists: PostingsList[], slop: number = 0): PhraseMatch[] {
  if (lists.length === 0) return [];

  // Single term phrase: every position matches
  if (lists.length === 1) {
    return lists[0]!.getAll().map((p) => ({
      docId: p.docId,
      matchPositions: [...p.positions],
    }));
  }

  // Step 1: Document-level candidate filter (must contain all terms)
  const candidateDocIds = intersectMultiple(lists);
  if (candidateDocIds.length === 0) return [];

  const results: PhraseMatch[] = [];

  // Step 2: Positional verification for each candidate document
  for (const docId of candidateDocIds) {
    const termPositions: number[][] = [];
    for (const list of lists) {
      const posting = list.getPostingForDoc(docId)!;
      termPositions.push(posting.positions);
    }

    const firstTermPositions = termPositions[0]!;
    const matchPositions: number[] = [];

    for (const startPos of firstTermPositions) {
      let matched = true;
      let prevPos = startPos;

      for (let t = 1; t < termPositions.length; t++) {
        const positions = termPositions[t]!;
        const expectedPos = startPos + t;

        if (slop === 0) {
          // Exact consecutive match
          if (!binarySearchContains(positions, expectedPos)) {
            matched = false;
            break;
          }
        } else {
          // Slop match: must appear after previous word within (1 + slop) positions
          const found = positions.some(
            (pos) => pos > prevPos && pos <= prevPos + 1 + slop
          );
          if (!found) {
            matched = false;
            break;
          }
          // Pick the closest matching position for chained checks
          const nextPos = positions.find((pos) => pos > prevPos && pos <= prevPos + 1 + slop)!;
          prevPos = nextPos;
        }
      }

      if (matched) {
        matchPositions.push(startPos);
      }
    }

    if (matchPositions.length > 0) {
      results.push({
        docId,
        matchPositions,
      });
    }
  }

  return results;
}

/**
 * Binary search to check if a sorted array contains a target value.
 */
function binarySearchContains(arr: number[], target: number): boolean {
  let low = 0;
  let high = arr.length - 1;

  while (low <= high) {
    const mid = (low + high) >>> 1;
    const val = arr[mid]!;

    if (val === target) return true;
    if (val < target) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return false;
}
