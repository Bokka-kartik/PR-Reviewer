const lines = (...l: string[]) => l.join('\n') + '\n'

/**
 * A realistic multi-file diff: a modified file, a new file, a deleted file,
 * a rename with edits, a binary file and a lockfile.
 */
export const SAMPLE_DIFF = lines(
  'diff --git a/src/app.ts b/src/app.ts',
  'index 1111111..2222222 100644',
  '--- a/src/app.ts',
  '+++ b/src/app.ts',
  '@@ -10,4 +10,6 @@ export function start() {',
  '   const port = 3000',
  '-  listen(port)',
  '+  const host = process.env.HOST',
  '+  listen(port, host)',
  "   log('started')",
  '+  return true',
  ' }',
  'diff --git a/src/new.ts b/src/new.ts',
  'new file mode 100644',
  'index 0000000..3333333',
  '--- /dev/null',
  '+++ b/src/new.ts',
  '@@ -0,0 +1,3 @@',
  '+export const a = 1',
  '+export const b = 2',
  '+export const c = 3',
  'diff --git a/old.txt b/old.txt',
  'deleted file mode 100644',
  'index 4444444..0000000',
  '--- a/old.txt',
  '+++ /dev/null',
  '@@ -1,2 +0,0 @@',
  '-one',
  '-two',
  'diff --git a/lib/a.ts b/lib/b.ts',
  'similarity index 90%',
  'rename from lib/a.ts',
  'rename to lib/b.ts',
  'index 5555555..6666666 100644',
  '--- a/lib/a.ts',
  '+++ b/lib/b.ts',
  '@@ -1,2 +1,2 @@',
  ' keep',
  '-old',
  '+new',
  'diff --git a/logo.png b/logo.png',
  'new file mode 100644',
  'index 0000000..7777777',
  'Binary files /dev/null and b/logo.png differ',
  'diff --git a/package-lock.json b/package-lock.json',
  'index 8888888..9999999 100644',
  '--- a/package-lock.json',
  '+++ b/package-lock.json',
  '@@ -1,1 +1,1 @@',
  '-a',
  '+b',
)

/** Only a lockfile changed: nothing worth reviewing. */
export const LOCKFILE_ONLY_DIFF = lines(
  'diff --git a/package-lock.json b/package-lock.json',
  'index 8888888..9999999 100644',
  '--- a/package-lock.json',
  '+++ b/package-lock.json',
  '@@ -1,1 +1,1 @@',
  '-a',
  '+b',
)

/** Lines in src/app.ts that a review comment may target: new-file lines 10 to 15. */
export const APP_TS_LINES = [10, 11, 12, 13, 14, 15]
