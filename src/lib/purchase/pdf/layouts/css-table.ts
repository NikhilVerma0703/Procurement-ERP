// How the old PO sheets' HTML tables sized their columns and wrapped their
// cells, so the redrawn tables come out the same.
//
// The old site printed through wkhtmltopdf (QtWebKit). Its table layout
// (WebKit's AutoTableLayout) works like this:
//   1. every column starts at its narrowest width: its longest unbreakable word;
//   2. a column whose heading asks for a percentage (`<th style="width: 8%">`)
//      is raised to that share of the table, if that is wider;
//   3. columns without a percentage get the space left in proportion to their
//      unwrapped content width;
//   4. any space still left goes to the percentage columns, in proportion to
//      their percentages, and then to all columns equally.
// A heading spanning several columns (CGST over % and AMT) shares its
// percentage among them in proportion to their content width.
//
// Lines break at spaces and after a hyphen inside a word ("0.6-|1.2MM"), as
// WebKit broke them; pdfmake would not break after that hyphen, so table cells
// are wrapped here and handed over line by line. Pure; all sizes in points.

/** A text's width in the sheet font (render.ts passes the real font metrics). */
export type Measure = (text: string, bold?: boolean) => number;

export interface CssColumn {
  /** The narrowest the column may be: its longest unbreakable word, plus padding and border. */
  min: number;
  /** Its widest content when nothing wraps, plus padding and border. */
  max: number;
  /** The `width: N%` its heading asks for, if any. */
  percent?: number;
}

/** The pieces a line may break between: words, and word parts after a hyphen. */
function pieces(text: string): { text: string; space: boolean }[] {
  const out: { text: string; space: boolean }[] = [];
  for (const word of text.split(/\s+/).filter(Boolean)) {
    // After a hyphen that follows a letter or digit and comes before one (not a leading minus).
    const parts = word.split(/(?<=[^\s-]-)(?=[^\s-])/);
    parts.forEach((p, i) => out.push({ text: p, space: i === 0 && out.length > 0 }));
  }
  return out;
}

/** The longest unbreakable piece of a text (its CSS min-content width). */
export function minWidth(text: string, measure: Measure, bold = false): number {
  return Math.max(0, ...text.split("\n").flatMap((l) => pieces(l).map((p) => measure(p.text, bold))));
}

/** A text's widest line when nothing wraps (its CSS max-content width). */
export function maxWidth(text: string, measure: Measure, bold = false): number {
  return Math.max(0, ...text.split("\n").map((l) => measure(l.trim().replace(/\s+/g, " "), bold)));
}

/** Breaks a text into lines no wider than `width`, as WebKit did (spaces, and after hyphens). */
export function wrapLines(text: string, width: number, measure: Measure, bold = false): string[] {
  const lines: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const p of pieces(para)) {
      const next = line === "" ? p.text : `${line}${p.space ? " " : ""}${p.text}`;
      if (line !== "" && measure(next, bold) > width + 0.01) {
        lines.push(line);
        line = p.text;
      } else line = next;
    }
    lines.push(line);
  }
  return lines;
}

/**
 * Shares a spanning heading's percentage among the columns it spans that have none, in
 * proportion to their content width (WebKit's calcEffectiveLogicalWidth).
 */
export function spreadPercent(cols: CssColumn[], from: number, count: number, percent: number): void {
  const spanned = cols.slice(from, from + count);
  let missing = percent - spanned.reduce((t, c) => t + (c.percent ?? 0), 0);
  let total = spanned.reduce((t, c) => t + (c.percent === undefined ? c.max : 0), 0);
  for (const c of spanned) {
    if (c.percent !== undefined || total <= 0) continue;
    const share = (missing * c.max) / total;
    total -= c.max;
    missing -= share;
    if (share > 0) c.percent = share;
  }
}

/** The columns' widths in a table `tableWidth` wide (borders and padding included). */
export function cssTableWidths(cols: CssColumn[], tableWidth: number): number[] {
  const w = cols.map((c) => c.min);
  let available = tableWidth - w.reduce((t, x) => t + x, 0);
  const pct = cols.map((c, i) => (c.percent !== undefined ? i : -1)).filter((i) => i >= 0);
  const auto = cols.map((c, i) => (c.percent === undefined ? i : -1)).filter((i) => i >= 0);
  let totalPercent = pct.reduce((t, i) => t + cols[i].percent!, 0);

  // 2. Percentage columns take their share of the table (or stay at their minimum).
  if (available > 0 && pct.length) {
    for (const i of pct) {
      const cw = Math.max(cols[i].min, (cols[i].percent! / 100) * tableWidth);
      available += w[i] - cw;
      w[i] = cw;
    }
  }
  // 3. Columns without one share what is left by their content width.
  let totalAuto = auto.reduce((t, i) => t + cols[i].max, 0);
  if (available > 0 && auto.length && totalAuto > 0) {
    available += auto.reduce((t, i) => t + w[i], 0);
    for (const i of auto) {
      const cw = Math.max(w[i], (available * cols[i].max) / totalAuto);
      available -= cw;
      totalAuto -= cols[i].max;
      w[i] = cw;
    }
  }
  // 4. The rest goes to the percentage columns by percentage, then to every column.
  if (available > 0 && pct.length && totalPercent < 100) {
    for (const i of pct) {
      const share = (available * cols[i].percent!) / totalPercent;
      available -= share;
      totalPercent -= cols[i].percent!;
      w[i] += share;
      if (available <= 0 || totalPercent <= 0) break;
    }
  }
  if (available > 0) {
    const each = available / cols.length;
    for (let i = 0; i < w.length; i++) w[i] += each;
    available = 0;
  }
  // Too narrow for every column's minimum: WebKit let the table overflow; a sheet cannot, so
  // every column gives up the same share of its width.
  if (available < 0) {
    const scale = tableWidth / (tableWidth - available);
    for (let i = 0; i < w.length; i++) w[i] *= scale;
  }
  return w;
}
