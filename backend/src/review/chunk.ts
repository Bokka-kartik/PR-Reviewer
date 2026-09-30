import type { DiffLine, FileDiff } from './types.js'

export interface Chunk {
  /** Text sent to the model. Every added/context line carries its new-file line number. */
  text: string
  paths: string[]
  chars: number
}

export interface ChunkResult {
  chunks: Chunk[]
  /** Number of chunks dropped because the PR exceeded the size budget. */
  droppedChunks: number
}

const MAX_LINE_CHARS = 1000

function renderLine(l: DiffLine): string {
  const text = l.text.length > MAX_LINE_CHARS ? `${l.text.slice(0, MAX_LINE_CHARS)}…` : l.text
  if (l.type === 'del') return `      - ${text}`
  const num = String(l.newLine).padStart(5, ' ')
  return `${num} ${l.type === 'add' ? '+' : ' '} ${text}`
}

/** Renders one file as one or more pieces of at most about maxChars each. */
function renderFile(file: FileDiff, maxChars: number): string[] {
  const head = `### File: ${file.path} (${file.status})`
  const continuedHead = `${head} (continued)`

  const lines: string[] = []
  for (const hunk of file.hunks) {
    lines.push(hunk.header)
    for (const l of hunk.lines) lines.push(renderLine(l))
  }

  const pieces: string[] = []
  let current = head
  let hasContent = false
  for (const line of lines) {
    if (hasContent && current.length + line.length + 1 > maxChars) {
      pieces.push(current)
      current = continuedHead
    }
    current += `\n${line}`
    // The line just added counts as content for the next check.
    hasContent = true
  }
  pieces.push(current)
  return pieces
}

/**
 * Packs files into chunks of at most about `maxChunkChars` (small files share a chunk),
 * then keeps only as many chunks as `maxTotalChars` allows.
 */
export function chunkFiles(files: FileDiff[], maxChunkChars: number, maxTotalChars: number): ChunkResult {
  const chunks: Chunk[] = []
  let current: Chunk | null = null

  for (const file of files) {
    for (const piece of renderFile(file, maxChunkChars)) {
      if (current && current.chars + piece.length + 2 > maxChunkChars) {
        chunks.push(current)
        current = null
      }
      if (!current) {
        current = { text: piece, paths: [file.path], chars: piece.length }
      } else {
        current.text += `\n\n${piece}`
        current.chars += piece.length + 2
        if (!current.paths.includes(file.path)) current.paths.push(file.path)
      }
    }
  }
  if (current) chunks.push(current)

  const kept: Chunk[] = []
  let total = 0
  for (const chunk of chunks) {
    if (total + chunk.chars > maxTotalChars && kept.length > 0) break
    kept.push(chunk)
    total += chunk.chars
  }
  return { chunks: kept, droppedChunks: chunks.length - kept.length }
}
