export const PROJECT_BADGES = {
  business: { icon: '🏢', label: 'Business sign', caption: 'PROJECT HQ' },
  website: { icon: '🌐', label: 'Website · WWW', caption: 'WWW · HEADQUARTERS' },
  mechanic: { icon: '🔧', label: 'Mechanic / workshop', caption: 'WORKSHOP HQ' },
  game: { icon: '🎮', label: 'Game / server', caption: 'SERVER HQ' },
  coast: { icon: '🌴', label: 'Coast / paradise', caption: 'PROJECT HQ' },
  app: { icon: '💻', label: 'App / software', caption: 'APP HQ' },
  rocket: { icon: '🚀', label: 'General project', caption: 'PROJECT HQ' },
}

export function projectIdentity(name, saved = {}) {
  const guessed = /business|office|company/i.test(name) ? 'business' : /web|website|site|portfolio/i.test(name) ? 'website'
    : /mechanic|garage/i.test(name) ? 'mechanic' : /gta|fivem|server|game/i.test(name) ? 'game' : 'rocket'
  const badge = Object.hasOwn(PROJECT_BADGES, saved?.badge) ? saved.badge : guessed
  return { badge, displayName: typeof saved?.displayName === 'string' && saved.displayName.trim() ? saved.displayName.trim().slice(0, 48) : name, ...PROJECT_BADGES[badge] }
}

export function historyView(threads, { days = 14, kept = [], archived = [], now = Date.now() } = {}) {
  const hidden = new Set(archived), keep = new Set(kept)
  const active = threads.filter(t => !t.archived && !(t.harness !== 'codex' && hidden.has(t.id)))
  const parents = new Set(active.filter(t => t.isMini).flatMap(t => [t.parentId,t.rootParentId]))
  const cutoff = Number(days) > 0 ? now - Number(days) * 86400000 : -Infinity
  const visible = active.filter(t => parents.has(t.id) || t.running || t.starred || keep.has(t.id) || (t.lastActivityAt || 0) >= cutoff)
    .map(t => ({ ...t, keepVisible: keep.has(t.id) || t.starred }))
  return { visible, projects: [...new Set(threads.filter(t => !t.isMini).map(t => t.project || 'unknown'))], hiddenCount: active.length - visible.length,
    archived: threads.filter(t => t.archived || (t.harness !== 'codex' && hidden.has(t.id))) }
}
