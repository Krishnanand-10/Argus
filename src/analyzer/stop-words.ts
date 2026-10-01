/**
 * Standard list of English stopwords commonly filtered in Information Retrieval systems.
 */
export const DEFAULT_STOP_WORDS: ReadonlySet<string> = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and',
  'any', 'are', 'aren', 'arent', 'as', 'at', 'be', 'because', 'been', 'before',
  'being', 'below', 'between', 'both', 'but', 'by', 'can', 'cannot', 'cant',
  'could', 'couldn', 'couldnt', 'd', 'did', 'didn', 'didnt', 'do', 'does',
  'doesn', 'doesnt', 'doing', 'don', 'dont', 'down', 'during', 'each', 'few',
  'for', 'from', 'further', 'had', 'hadn', 'hadnt', 'has', 'hasn', 'hasnt',
  'have', 'haven', 'havent', 'having', 'he', 'her', 'here', 'hers', 'herself',
  'him', 'himself', 'his', 'how', 'i', 'if', 'in', 'into', 'is', 'isn', 'isnt',
  'it', 'its', 'itself', 'just', 'll', 'm', 'ma', 'me', 'mightn', 'mightnt',
  'more', 'most', 'mustn', 'mustnt', 'my', 'myself', 'needn', 'neednt', 'no',
  'nor', 'not', 'now', 'o', 'of', 'off', 'on', 'once', 'only', 'or', 'other',
  'our', 'ours', 'ourselves', 'out', 'over', 'own', 're', 's', 'same', 'shan',
  'shant', 'she', 'should', 'shouldn', 'shouldnt', 'so', 'some', 'such', 't',
  'than', 'that', 'the', 'their', 'theirs', 'them', 'themselves', 'then',
  'there', 'these', 'they', 'this', 'those', 'through', 'to', 'too', 'under',
  'until', 'up', 've', 'very', 'was', 'wasn', 'wasnt', 'we', 'were', 'weren',
  'werent', 'what', 'when', 'where', 'which', 'while', 'who', 'whom', 'why',
  'will', 'with', 'won', 'wont', 'would', 'wouldn', 'wouldnt', 'y', 'you',
  'your', 'yours', 'yourself', 'yourselves'
]);

/**
 * Creates or resolves a Stopword set based on user options.
 */
export function resolveStopWords(
  option?: boolean | string[] | Set<string>
): Set<string> | null {
  if (option === false) {
    return null;
  }
  if (option === undefined || option === true) {
    return DEFAULT_STOP_WORDS as Set<string>;
  }
  if (Array.isArray(option)) {
    return new Set(option.map((w) => w.toLowerCase()));
  }
  if (option instanceof Set) {
    return option;
  }
  return null;
}
