/**
 * Strips HTML tags from input text.
 */
export function stripHtmlTags(input: string): string {
  return input.replace(/<[^>]*>/g, ' ');
}

/**
 * Normalizes Unicode characters to NFKD decomposition and removes diacritics/accents.
 * e.g., "café" -> "cafe", "naïve" -> "naive"
 */
export function stripDiacritics(input: string): string {
  return input.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Applies character filtering options to raw document text.
 */
export function filterChars(
  input: string,
  options: { stripHtml?: boolean; stripDiacritics?: boolean; lowercase?: boolean } = {}
): string {
  let result = input;

  if (options.stripHtml) {
    result = stripHtmlTags(result);
  }

  if (options.stripDiacritics !== false) {
    result = stripDiacritics(result);
  }

  if (options.lowercase !== false) {
    result = result.toLowerCase();
  }

  return result;
}
