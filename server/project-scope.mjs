import path from 'node:path'

/** Optional host-owned scope; an unset root keeps the standalone colony global. */
export function scopeThreads(threads, root = process.env.BOT_CROSSING_PROJECT_ROOT) {
  if (!root) return threads
  const canonical = value => {
    if (typeof value !== 'string' || !value) return ''
    const normalized = value.replace(/^\\\\\?\\/, '').replace(/\\/g, '/')
    if (!path.posix.isAbsolute(normalized) && !/^[a-z]:\//i.test(normalized)) return ''
    const resolved = path.posix.normalize(normalized).replace(/\/$/, '')
    return process.platform === 'win32' ? resolved.toLowerCase() : resolved
  }
  const scopedRoot = canonical(root)
  if (!scopedRoot) return []
  const project = path.posix.basename(root.replace(/\\/g, '/').replace(/\/$/, ''))
  return threads.filter(thread => {
    const candidate = canonical(thread.projectPath)
    return candidate === scopedRoot || candidate.startsWith(scopedRoot + '/')
  }).map(thread => ({ ...thread, project, projectPath: root }))
}
