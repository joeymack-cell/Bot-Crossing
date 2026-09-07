/** Stable section colors belong to the session, independently of the suit's activity color. */
export function sectionColor(id, saved) {
  if (/^#[0-9a-f]{6}$/i.test(saved || '')) return saved.toLowerCase()
  let hash = 2166136261
  for (const char of id) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619)
  const hue = (hash >>> 0) % 360
  const channel = n => {
    const k = (n + hue / 30) % 12
    return Math.round(255 * (.61 - .25 * Math.max(-1, Math.min(k - 3, 9 - k, 1)))).toString(16).padStart(2, '0')
  }
  return '#' + channel(0) + channel(8) + channel(4)
}

export function mergeStudioThreads(scanned, native) {
  const aliases = new Map(native.filter(t => t.providerThreadId).map(t => ['codex:' + t.providerThreadId, t.id]))
  const scannedById = new Map(scanned.map(t => [t.id, t]))
  return [
    ...scanned.filter(t => !t.studioConversationId && !aliases.has(t.id)).map(t => t.isMini ? {
      ...t, parentId: aliases.get(t.parentId) || t.parentId, rootParentId: aliases.get(t.rootParentId) || t.rootParentId
    } : t),
    ...native.map(t => {
      const external = scannedById.get('codex:' + t.providerThreadId)
      return { ...external, ...t, ...(t.externalSession && external ? {
        running: external.running, hasError: external.hasError, unread: external.unread,
        lastActivityAt: external.lastActivityAt, progressUpdates: external.progressUpdates
      } : {}) }
    })
  ]
}
