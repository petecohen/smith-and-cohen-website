// Post-hoc comment-transcript formatter for stream archive pages (PC-34).
//
// After a session, Pete pastes a raw comment export copied from Facebook or
// Instagram (or run through screenshot-to-text) into the session markdown. This
// turns that messy raw text into a clean, attributed list of comments.
//
// There is no Meta API here and there never will be — this is a deliberately
// forgiving text parser for human-pasted archive material. It supports three
// shapes and auto-detects which one a block is:
//
//   csv    — a header row plus rows, e.g. exported from a tool:
//              name,comment,time
//              Jane Doe,Loved this one,2:14
//   lines  — one comment per line, author and text split by : — or |:
//              Jane Doe: Loved this one
//   blocks — comments separated by blank lines, first line is the author and
//            the platform's UI noise (Reply, "2 likes", "3h", …) is stripped:
//              jane_doe
//              Loved this one
//              3h · Reply · 2 likes
//
// Whatever the input, the output is the same: an ordered list of entries with an
// author, the comment text, and an optional rough time.

export type TranscriptFormat = 'auto' | 'csv' | 'lines' | 'blocks';

export interface TranscriptEntry {
  author: string;
  text: string;
  time?: string;
}

// Column header synonyms for CSV detection / mapping.
const AUTHOR_COLUMNS = ['author', 'name', 'user', 'username', 'from', 'commenter', 'display name'];
const TEXT_COLUMNS = ['comment', 'text', 'message', 'body', 'content', 'reply'];
const TIME_COLUMNS = ['time', 'timestamp', 'date', 'datetime', 'when', 'posted', 'posted at'];

// Lines that are pure platform chrome and should be dropped in block mode.
const NOISE_EXACT = new Set([
  'reply',
  'replied',
  'like',
  'liked',
  'likes',
  'share',
  'follow',
  'following',
  'author',
  'verified',
  'see translation',
  'view translation',
  'edited',
  'pinned',
  'top fan',
  'just now',
  'now',
  '·',
  '•',
  '-',
  '—',
]);

// A line that is only a relative/absolute time, e.g. "3h", "35 m", "2 hrs",
// "1 day", "2:14", "2:14 pm", "12 June", "Jun 12". Captured as the entry time
// rather than treated as body text.
const RELATIVE_TIME = /^\d+\s*(s|sec|secs|second|seconds|m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days|w|wk|wks|week|weeks|y|yr|yrs|year|years)\b\.?$/i;
const CLOCK_TIME = /^\d{1,2}:\d{2}(\s*[ap]\.?m\.?)?$/i;
const COUNT_NOISE = /^\d+\s+(like|likes|reply|replies|repl(?:y|ies)|comment|comments|view|views)$/i;
const REPLIES_NOISE = /^(view|hide|see)\b.*\breply?(?:ies|s)?\b/i;

function isNoiseLine(line: string): boolean {
  const l = line.trim().toLowerCase();
  if (l === '') return true;
  if (NOISE_EXACT.has(l)) return true;
  if (COUNT_NOISE.test(l)) return true;
  if (REPLIES_NOISE.test(l)) return true;
  return false;
}

function looksLikeTime(line: string): boolean {
  const l = line.trim();
  return RELATIVE_TIME.test(l) || CLOCK_TIME.test(l);
}

// A metadata line is one the platform stacks below a comment, often several bits
// joined by "·"/"•"/"|", e.g. "3h · Reply · 2 likes" or "1h · Reply". It counts
// as metadata only when every token is itself noise or a time; the first time
// token found is returned so it can be kept as the entry's time.
function parseMetaLine(line: string): { isMeta: boolean; time?: string } {
  const tokens = line
    .split(/[·•|]/)
    .map((t) => t.trim())
    .filter((t) => t !== '');
  if (tokens.length === 0) return { isMeta: false };
  let time: string | undefined;
  for (const token of tokens) {
    if (looksLikeTime(token)) {
      if (!time) time = token;
      continue;
    }
    if (isNoiseLine(token)) continue;
    return { isMeta: false };
  }
  return { isMeta: true, ...(time ? { time } : {}) };
}

// Minimal RFC-4180-ish CSV row parser: handles quoted fields, embedded commas,
// and "" escapes. One row at a time — callers split on newlines first, so a
// quoted field spanning newlines is not supported (rare in pasted comments).
function parseCsvRow(row: string): string[] {
  const cells: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < row.length; i++) {
    const ch = row[i];
    if (inQuotes) {
      if (ch === '"') {
        if (row[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      cells.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  cells.push(cur);
  return cells.map((c) => c.trim());
}

function headerIndex(header: string[], synonyms: string[]): number {
  return header.findIndex((h) => synonyms.includes(h.trim().toLowerCase()));
}

// True when the first non-empty line reads like a CSV header we can map.
function looksLikeCsv(lines: string[]): boolean {
  const first = lines.find((l) => l.trim() !== '');
  if (!first || !first.includes(',')) return false;
  const header = parseCsvRow(first);
  return headerIndex(header, AUTHOR_COLUMNS) !== -1 && headerIndex(header, TEXT_COLUMNS) !== -1;
}

function parseCsv(lines: string[]): TranscriptEntry[] {
  const rows = lines.filter((l) => l.trim() !== '');
  if (rows.length < 2) return [];
  const header = parseCsvRow(rows[0]);
  const ai = headerIndex(header, AUTHOR_COLUMNS);
  const ti = headerIndex(header, TEXT_COLUMNS);
  const timeI = headerIndex(header, TIME_COLUMNS);
  const entries: TranscriptEntry[] = [];
  for (const row of rows.slice(1)) {
    const cells = parseCsvRow(row);
    const text = (cells[ti] ?? '').trim();
    if (text === '') continue;
    const author = (cells[ai] ?? '').trim();
    const time = timeI !== -1 ? (cells[timeI] ?? '').trim() : '';
    entries.push({ author, text, ...(time ? { time } : {}) });
  }
  return entries;
}

// Separators tried, in order, for "Author<sep>text" line mode.
const LINE_SEPARATORS = ['\t', ' — ', ' – ', ' | ', '|', ': ', ':'];

function splitAuthorLine(line: string): { author: string; text: string } | null {
  for (const sep of LINE_SEPARATORS) {
    const idx = line.indexOf(sep);
    if (idx > 0) {
      const author = line.slice(0, idx).trim();
      const text = line.slice(idx + sep.length).trim();
      if (author !== '' && text !== '') return { author, text };
    }
  }
  return null;
}

// True when most content lines look like "Author<sep>text".
function looksLikeLines(lines: string[]): boolean {
  const content = lines.filter((l) => l.trim() !== '');
  if (content.length === 0) return false;
  const matched = content.filter((l) => splitAuthorLine(l) !== null).length;
  return matched >= Math.ceil(content.length * 0.6);
}

function parseLines(lines: string[]): TranscriptEntry[] {
  const entries: TranscriptEntry[] = [];
  for (const raw of lines) {
    if (raw.trim() === '') continue;
    const split = splitAuthorLine(raw);
    if (split) {
      entries.push({ author: split.author, text: split.text });
    } else {
      // A line with no separator inside a lines-mode block: keep it as an
      // unattributed comment rather than dropping it silently.
      entries.push({ author: '', text: raw.trim() });
    }
  }
  return entries;
}

function parseBlocks(lines: string[]): TranscriptEntry[] {
  const entries: TranscriptEntry[] = [];
  let buffer: string[] = []; // content lines of the comment being built
  let time: string | undefined;
  let closed = false; // a metadata line has ended the current comment

  function flush() {
    if (buffer.length === 0) {
      time = undefined;
      closed = false;
      return;
    }
    if (buffer.length === 1) {
      // Only one real line — can't tell author from text, so leave it
      // unattributed rather than dropping it.
      entries.push({ author: '', text: buffer[0], ...(time ? { time } : {}) });
    } else {
      const [author, ...rest] = buffer;
      entries.push({ author, text: rest.join(' ').trim(), ...(time ? { time } : {}) });
    }
    buffer = [];
    time = undefined;
    closed = false;
  }

  for (const raw of lines) {
    const trimmed = raw.trim();
    if (trimmed === '') {
      // Blank line ends a comment (some exports separate them this way).
      flush();
      continue;
    }
    const meta = parseMetaLine(trimmed);
    if (meta.isMeta) {
      // Metadata ("3h · Reply · 2 likes") terminates a comment but does not
      // flush yet — later metadata lines may still carry the time. Real pastes
      // often have no blank line between comments, only this line.
      if (buffer.length > 0) {
        if (!time && meta.time) time = meta.time;
        closed = true;
      }
      continue;
    }
    // A content line after a closed comment starts the next one.
    if (closed) flush();
    buffer.push(trimmed);
  }
  flush();
  return entries;
}

function detectFormat(lines: string[]): Exclude<TranscriptFormat, 'auto'> {
  if (looksLikeCsv(lines)) return 'csv';
  if (looksLikeLines(lines)) return 'lines';
  return 'blocks';
}

/**
 * Parse a raw pasted comment export into ordered, attributed entries.
 * `format` forces a parser; the default 'auto' detects CSV / lines / blocks.
 */
export function parseTranscript(raw: string, format: TranscriptFormat = 'auto'): TranscriptEntry[] {
  if (!raw || raw.trim() === '') return [];
  // Normalise newlines; keep intentional blank lines (they delimit blocks).
  const lines = raw.replace(/\r\n?/g, '\n').split('\n');
  const chosen = format === 'auto' ? detectFormat(lines) : format;
  switch (chosen) {
    case 'csv':
      return parseCsv(lines);
    case 'lines':
      return parseLines(lines);
    case 'blocks':
      return parseBlocks(lines);
  }
}

// Human-facing labels + ordering for the platforms a block can come from.
export const PLATFORM_LABELS: Record<string, string> = {
  facebook: 'From Facebook',
  instagram: 'From Instagram',
  youtube: 'From YouTube',
  other: 'From the stream',
};

export function platformLabel(platform: string, override?: string): string {
  return override ?? PLATFORM_LABELS[platform] ?? PLATFORM_LABELS.other;
}
