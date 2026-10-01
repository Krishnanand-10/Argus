/**
 * Porter Stemmer implementation in pure TypeScript.
 * Based on Martin Porter's 1980 paper "An algorithm for suffix stripping".
 */

// Helper: Check if character at index is a consonant
function isConsonant(str: string, i: number): boolean {
  const c = str[i];
  if (!c) return false;
  if (c === 'a' || c === 'e' || c === 'i' || c === 'o' || c === 'u') {
    return false;
  }
  if (c === 'y') {
    if (i === 0) return true;
    return !isConsonant(str, i - 1);
  }
  return true;
}

// Helper: Measure m - the number of VC sequences in str
function getMeasure(str: string): number {
  let count = 0;
  let i = 0;
  const len = str.length;

  while (i < len && isConsonant(str, i)) i++;
  while (i < len) {
    while (i < len && !isConsonant(str, i)) i++;
    if (i < len) {
      count++;
      while (i < len && isConsonant(str, i)) i++;
    }
  }
  return count;
}

// Helper: Check if word contains any vowel
function containsVowel(str: string): boolean {
  for (let i = 0; i < str.length; i++) {
    if (!isConsonant(str, i)) return true;
  }
  return false;
}

// Helper: Check if word ends with a double consonant
function endsWithDoubleConsonant(str: string): boolean {
  const len = str.length;
  if (len < 2) return false;
  if (str[len - 1] !== str[len - 2]) return false;
  return isConsonant(str, len - 1);
}

// Helper: Check if word ends with consonant-vowel-consonant (cvc), where the second consonant is not w, x, or y
function endsWithCVC(str: string): boolean {
  const len = str.length;
  if (len < 3) return false;
  const c2 = str[len - 1]!;

  if (!isConsonant(str, len - 3)) return false;
  if (isConsonant(str, len - 2)) return false;
  if (!isConsonant(str, len - 1)) return false;

  if (c2 === 'w' || c2 === 'x' || c2 === 'y') return false;
  return true;
}

export function stemWord(word: string): string {
  if (word.length <= 2) return word;

  let str = word.toLowerCase();

  // Step 1a
  if (str.endsWith('sses')) {
    str = str.slice(0, -2);
  } else if (str.endsWith('ies')) {
    str = str.slice(0, -2);
  } else if (str.endsWith('ss')) {
    // leave as is
  } else if (str.endsWith('s')) {
    str = str.slice(0, -1);
  }

  // Step 1b
  let step1bExtra = false;
  if (str.endsWith('eed')) {
    const stem = str.slice(0, -3);
    if (getMeasure(stem) > 0) {
      str = stem + 'ee';
    }
  } else if (str.endsWith('ed')) {
    const stem = str.slice(0, -2);
    if (containsVowel(stem)) {
      str = stem;
      step1bExtra = true;
    }
  } else if (str.endsWith('ing')) {
    const stem = str.slice(0, -3);
    if (containsVowel(stem)) {
      str = stem;
      step1bExtra = true;
    }
  }

  if (step1bExtra) {
    if (str.endsWith('at')) {
      str = str + 'e';
    } else if (str.endsWith('bl')) {
      str = str + 'e';
    } else if (str.endsWith('iz')) {
      str = str + 'e';
    } else if (endsWithDoubleConsonant(str)) {
      const last = str[str.length - 1];
      if (last !== 'l' && last !== 's' && last !== 'z') {
        str = str.slice(0, -1);
      }
    } else if (getMeasure(str) === 1 && endsWithCVC(str)) {
      str = str + 'e';
    }
  }

  // Step 1c
  if (str.endsWith('y')) {
    const stem = str.slice(0, -1);
    if (containsVowel(stem)) {
      str = stem + 'i';
    }
  }

  // Step 2
  const step2Map: Array<[string, string]> = [
    ['ational', 'ate'],
    ['tional', 'tion'],
    ['enci', 'ence'],
    ['anci', 'ance'],
    ['izer', 'ize'],
    ['bli', 'ble'],
    ['alli', 'al'],
    ['entli', 'ent'],
    ['eli', 'e'],
    ['ousli', 'ous'],
    ['ization', 'ize'],
    ['ation', 'ate'],
    ['ator', 'ate'],
    ['alism', 'al'],
    ['iveness', 'ive'],
    ['fulness', 'ful'],
    ['ousness', 'ous'],
    ['aliti', 'al'],
    ['iviti', 'ive'],
    ['biliti', 'ble'],
  ];

  for (const [suffix, replacement] of step2Map) {
    if (str.endsWith(suffix)) {
      const stem = str.slice(0, -suffix.length);
      if (getMeasure(stem) > 0) {
        str = stem + replacement;
      }
      break;
    }
  }

  // Step 3
  const step3Map: Array<[string, string]> = [
    ['icate', 'ic'],
    ['ative', ''],
    ['alize', 'al'],
    ['iciti', 'ic'],
    ['ical', 'ic'],
    ['ful', ''],
    ['ness', ''],
  ];

  for (const [suffix, replacement] of step3Map) {
    if (str.endsWith(suffix)) {
      const stem = str.slice(0, -suffix.length);
      if (getMeasure(stem) > 0) {
        str = stem + replacement;
      }
      break;
    }
  }

  // Step 4
  const step4Suffixes = [
    'al', 'ance', 'ence', 'er', 'ic', 'able', 'ible', 'ant',
    'ement', 'ment', 'ent', 'ou', 'ism', 'ate', 'iti', 'ous',
    'ive', 'ize',
  ];

  for (const suffix of step4Suffixes) {
    if (str.endsWith(suffix)) {
      const stem = str.slice(0, -suffix.length);
      if (getMeasure(stem) > 1) {
        str = stem;
      }
      break;
    }
  }

  // Special check for 'ion' in step 4
  if (str.endsWith('ion')) {
    const stem = str.slice(0, -3);
    if (getMeasure(stem) > 1 && (stem.endsWith('s') || stem.endsWith('t'))) {
      str = stem;
    }
  }

  // Step 5a
  if (str.endsWith('e')) {
    const stem = str.slice(0, -1);
    const m = getMeasure(stem);
    if (m > 1 || (m === 1 && !endsWithCVC(stem))) {
      str = stem;
    }
  }

  // Step 5b
  if (getMeasure(str) > 1 && endsWithDoubleConsonant(str) && str.endsWith('l')) {
    str = str.slice(0, -1);
  }

  return str;
}
