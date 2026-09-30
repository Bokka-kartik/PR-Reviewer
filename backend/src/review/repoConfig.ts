import { parse } from 'yaml'
import { z } from 'zod'

export const CONFIG_PATH = '.pr-reviewer.yml'

const repoConfigSchema = z.object({
  enabled: z.boolean().default(true),
  /** Glob patterns of files to skip, on top of the built-in ignore list. */
  ignore: z.array(z.string()).default([]),
  /** Free-text areas to emphasise, e.g. "security", "error handling". */
  focus: z.array(z.string()).default([]),
  /** Extra guidance appended to the reviewer's instructions. */
  instructions: z.string().max(2000).default(''),
  minSeverity: z.enum(['suggestion', 'warning', 'critical']).default('suggestion'),
  maxComments: z.number().int().min(1).max(50).default(15),
  reviewDrafts: z.boolean().default(false),
})

export type RepoConfig = z.infer<typeof repoConfigSchema>

export const DEFAULT_REPO_CONFIG: RepoConfig = repoConfigSchema.parse({})

export interface LoadedRepoConfig {
  config: RepoConfig
  /** Set when the file exists but could not be used; shown in the review summary. */
  warning?: string
}

/** Turns the raw contents of `.pr-reviewer.yml` (or nothing) into a usable config. */
export function parseRepoConfig(content: string | null): LoadedRepoConfig {
  if (content === null || content.trim() === '') {
    return { config: DEFAULT_REPO_CONFIG }
  }
  let data: unknown
  try {
    data = parse(content)
  } catch (e) {
    return { config: DEFAULT_REPO_CONFIG, warning: `${CONFIG_PATH} is not valid YAML, using defaults.` }
  }
  const result = repoConfigSchema.safeParse(data ?? {})
  if (!result.success) {
    const first = result.error.issues[0]
    const where = first ? `${first.path.join('.') || 'root'}: ${first.message}` : 'invalid'
    return { config: DEFAULT_REPO_CONFIG, warning: `${CONFIG_PATH} is invalid (${where}), using defaults.` }
  }
  return { config: result.data }
}
