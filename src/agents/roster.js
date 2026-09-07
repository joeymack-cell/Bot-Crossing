/** Keep active work on screen when the visual crew limit is smaller than the task list. */
export function visibleRoster(entries, cap) {
  const priority = { blocked: 0, waiting: 1, working: 2, celebrating: 3, idle: 4, sleeping: 5 }
  const rank = entry => {
    const base = priority[entry.status] ?? 6
    return base <= 2 ? base : (entry.thread?.keepVisible || entry.thread?.starred) ? 3 : base + 1
  }
  return [...entries].sort((a, b) =>
    rank(a) - rank(b)
    || (b.thread?.lastActivityAt || 0) - (a.thread?.lastActivityAt || 0)
    || a.id.localeCompare(b.id)
  ).slice(0, cap)
}
