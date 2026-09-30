import type { DiffLine, FileDiff, Hunk } from './types.js'

const FILE_HEADER = /^diff --git a\/(.+) b\/(.+)$/
const HUNK_HEADER = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/

/**
 * Parses a unified diff (as returned by GitHub's `diff` media type) into files,
 * hunks and lines, tracking the line number each line has in the NEW file.
 * Those numbers are what the GitHub review API needs for inline comments.
 */
export function parseDiff(text: string): FileDiff[] {
  const files: FileDiff[] = []
  let file: FileDiff | null = null
  let hunk: Hunk | null = null
  let newLine = 0

  const rawLines = text.split('\n')
  // A trailing newline produces one empty element that is not a diff line.
  if (rawLines[rawLines.length - 1] === '') rawLines.pop()

  for (const raw of rawLines) {
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw

    // "diff --git" at column 0 can never be diff content (content lines start with + - or space).
    const header = FILE_HEADER.exec(line)
    if (header) {
      file = { path: header[2]!, status: 'modified', hunks: [], binary: false }
      files.push(file)
      hunk = null
      continue
    }
    if (!file) continue

    if (!hunk) {
      // Metadata section between "diff --git" and the first "@@".
      if (line.startsWith('new file mode')) file.status = 'added'
      else if (line.startsWith('deleted file mode')) file.status = 'deleted'
      else if (line.startsWith('rename to ')) {
        file.status = 'renamed'
        file.path = line.slice('rename to '.length)
      } else if (line.startsWith('Binary files') || line.startsWith('GIT binary patch')) {
        file.binary = true
      } else if (line.startsWith('+++ ')) {
        const target = line.slice(4)
        if (target !== '/dev/null') file.path = target.replace(/^b\//, '')
      } else if (line.startsWith('--- ') && file.status === 'deleted') {
        file.path = line.slice(4).replace(/^a\//, '')
      }
    }

    const hunkStart = HUNK_HEADER.exec(line)
    if (hunkStart) {
      hunk = { header: line, lines: [] }
      file.hunks.push(hunk)
      newLine = Number(hunkStart[2])
      continue
    }
    if (!hunk) continue

    const marker = line[0]
    const content = line.slice(1)
    let entry: DiffLine
    if (marker === '+') {
      entry = { type: 'add', newLine, text: content }
      newLine++
    } else if (marker === '-') {
      entry = { type: 'del', text: content }
    } else if (marker === ' ' || line === '') {
      // Some tools strip the single space of an empty context line.
      entry = { type: 'ctx', newLine, text: content }
      newLine++
    } else {
      // "\ No newline at end of file" and anything unrecognised.
      continue
    }
    hunk.lines.push(entry)
  }

  return files
}

/** New-file line numbers an inline review comment may target. */
export function commentableLines(file: FileDiff): Set<number> {
  const lines = new Set<number>()
  for (const hunk of file.hunks) {
    for (const l of hunk.lines) {
      if (l.newLine !== undefined) lines.add(l.newLine)
    }
  }
  return lines
}
