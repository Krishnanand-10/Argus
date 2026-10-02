/**
 * Delta Encoding (D-Gaps) algorithm for monotonically increasing sequences of integers.
 * Replaces large absolute document IDs and positions with small relative differences:
 *
 * Raw Sequence:   [104, 108, 125, 160]
 * Delta Encoded:  [104,   4,  17,  35]
 */

/**
 * Encodes a monotonically increasing array of integers into delta gaps.
 * The first element remains unchanged; each subsequent element is stored as (current - previous).
 */
export function encodeDeltas(numbers: number[]): number[] {
  if (numbers.length === 0) return [];

  const deltas: number[] = new Array(numbers.length);
  deltas[0] = numbers[0]!;

  for (let i = 1; i < numbers.length; i++) {
    const diff = numbers[i]! - numbers[i - 1]!;
    if (diff < 0) {
      throw new Error(
        `Delta encoding error: sequence is not monotonically increasing at index ${i}: ` +
        `prev=${numbers[i - 1]}, current=${numbers[i]}`
      );
    }
    deltas[i] = diff;
  }

  return deltas;
}

/**
 * Decodes an array of delta gaps back into the original sorted sequence of absolute numbers.
 */
export function decodeDeltas(gaps: number[]): number[] {
  if (gaps.length === 0) return [];

  const numbers: number[] = new Array(gaps.length);
  numbers[0] = gaps[0]!;

  for (let i = 1; i < gaps.length; i++) {
    numbers[i] = numbers[i - 1]! + gaps[i]!;
  }

  return numbers;
}
