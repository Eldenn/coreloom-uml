// Pure helpers of the skill copies' review screen (no client import, so Node tests can load them).

interface CopiedFile {
  path: string
  content: string
  executable: boolean
}

/** Each path of either copy, in order, with its content before and after ('' when absent). */
export function pairFiles(
  files: readonly CopiedFile[],
  previous: readonly CopiedFile[] | undefined,
) {
  const before = new Map((previous ?? []).map((file) => [file.path, file]))
  const after = new Map(files.map((file) => [file.path, file]))
  return [...new Set([...after.keys(), ...before.keys()])].sort().map((path) => {
    const older = before.get(path)
    const newer = after.get(path)
    let status: 'added' | 'removed' | 'changed' | null = null
    if (!older) status = 'added'
    else if (!newer) status = 'removed'
    else if (older.content !== newer.content) status = 'changed'
    return {
      path,
      before: older?.content ?? '',
      after: newer?.content ?? '',
      executable: newer?.executable ?? false,
      status,
    }
  })
}
