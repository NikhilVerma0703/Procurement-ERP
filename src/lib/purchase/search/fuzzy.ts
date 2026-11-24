// The old site's fuzzy matching for its top search box (Frappe 14.101's fuzzy_match.js, a port of
// lib_fts's fuzzy_match, as it ran on the old site — captured from its desk bundle on 23-11-2026,
// data/erpnext-live/live-assets-20261123.json). Owner, 23-11-2026: "make that search box … same
// functionality and behaviour". The scores decide the order of the results, so this is a line-by-line
// port, not a re-implementation: the same recursion, limits and bonuses. Pure.

/** fuzzy_match(pattern, str): [matched, score]. */
export function fuzzyMatch(pattern: string, str: string): [boolean, number] {
  return fuzzyMatchRecursive(pattern, str, 0, 0, null, [], 256, 0, 0, 10);
}

function fuzzyMatchRecursive(
  pattern: string,
  str: string,
  patternCurIndex: number,
  strCurrIndex: number,
  srcMatches: number[] | null,
  matches: number[],
  maxMatches: number,
  nextMatch: number,
  recursionCount: number,
  recursionLimit: number,
): [boolean, number] {
  let outScore = 0;
  if (++recursionCount >= recursionLimit) return [false, outScore];
  if (patternCurIndex === pattern.length || strCurrIndex === str.length) return [false, outScore];

  let recursiveMatch = false;
  let bestRecursiveMatches: number[] = [];
  let bestRecursiveScore = 0;
  let firstMatch = true;
  while (patternCurIndex < pattern.length && strCurrIndex < str.length) {
    if (pattern[patternCurIndex].toLowerCase() === str[strCurrIndex].toLowerCase()) {
      if (nextMatch >= maxMatches) return [false, outScore];
      if (firstMatch && srcMatches) {
        matches = [...srcMatches];
        firstMatch = false;
      }
      const recursiveMatches: number[] = [];
      const [matched, recursiveScore] = fuzzyMatchRecursive(
        pattern, str, patternCurIndex, strCurrIndex + 1, matches, recursiveMatches, maxMatches, nextMatch, recursionCount, recursionLimit,
      );
      if (matched) {
        if (!recursiveMatch || recursiveScore > bestRecursiveScore) {
          bestRecursiveMatches = [...recursiveMatches];
          bestRecursiveScore = recursiveScore;
        }
        recursiveMatch = true;
      }
      matches[nextMatch++] = strCurrIndex;
      ++patternCurIndex;
    }
    ++strCurrIndex;
  }

  const matched = patternCurIndex === pattern.length;
  if (matched) {
    outScore = 100;
    // Leading letters before the first match cost up to 15.
    let penalty = -5 * matches[0];
    penalty = penalty < -15 ? -15 : penalty;
    outScore += penalty;
    // Every letter not matched costs 1.
    outScore += -1 * (str.length - nextMatch);
    for (let i = 0; i < nextMatch; i++) {
      const currIdx = matches[i];
      if (i > 0 && currIdx === matches[i - 1] + 1) outScore += 25; // consecutive letters
      if (currIdx > 0) {
        const neighbor = str[currIdx - 1];
        const curr = str[currIdx];
        if (neighbor !== neighbor.toUpperCase() && curr !== curr.toLowerCase()) outScore += 30; // camelCase
        if (neighbor === "_" || neighbor === " ") outScore += 30; // after a separator
      } else {
        outScore += 15; // the very first letter
      }
    }
    if (recursiveMatch && (!matched || bestRecursiveScore > outScore)) {
      matches = [...bestRecursiveMatches];
      outScore = bestRecursiveScore;
      return [true, outScore];
    }
    return [true, outScore];
  }
  return [false, outScore];
}

/** frappe.search.utils.fuzzy_search(subseq, str): the score, 0 when it does not match. */
export function fuzzySearch(subseq: string | null | undefined, str: string | null | undefined): number {
  return fuzzyMatch(subseq || "", str || "")[1];
}

/**
 * frappe.search.utils.bolden_match_part(str, subseq): the label with the matched letters in <mark>.
 * Kept as the old site had it, quirks included (a leading match keeps only the text up to the
 * second occurrence: "split(subseq)[1]"). The caller escapes nothing here: `str` is one of the
 * module's own names, and every letter inserted from `subseq` equals a letter of `str`.
 */
export function boldenMatchPart(str: string, subseq: string): string {
  if (fuzzyMatch(subseq, str)[0] === false) return str;
  if (str.indexOf(subseq) === 0) {
    const rest = str.split(subseq)[1];
    return `<mark>${subseq}</mark>${rest}`;
  }
  let out = "";
  const original = str;
  const len = str.length;
  const lower = str.toLowerCase();
  const sub = subseq.toLowerCase();
  let s = 0;
  outer: for (let a = 0; a < sub.length; a++) {
    const code = sub.charCodeAt(a);
    while (s < len) {
      if (lower.charCodeAt(s) === code) {
        const d = original.charAt(s);
        out += d === d.toLowerCase() ? `<mark>${sub.charAt(a)}</mark>` : `<mark>${sub.charAt(a).toUpperCase()}</mark>`;
        s++;
        continue outer;
      }
      out += original.charAt(s);
      s++;
    }
    return original;
  }
  return out + original.slice(s);
}
