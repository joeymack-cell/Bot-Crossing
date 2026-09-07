/** Read-only scans; explicit name/archive actions use the official Codex app-server. */
import fsp from 'node:fs/promises'
import { progressUpdates } from './progress.mjs'
import { codexRequest } from './codex-control.mjs'
import os from 'node:os'
import path from 'node:path'
import { exists } from '../lib/fsutil.mjs'

const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i
const CHUNK = 256 * 1024
const ACTIVE_MS = 5 * 60 * 1000
const clean = (s) => typeof s === 'string' ? s.replace(/<([\w-]+)[^>]*>[\s\S]*?<\/\1>/g, ' ').replace(/\s+/g, ' ').trim() : ''
const timestamp = (v) => typeof v === 'number' ? (v < 1e12 ? v * 1000 : v) : Date.parse(v) || 0
export const normalizePath = (s = '') => s.replace(/^\\\\\?\\UNC\\/i, '//').replace(/^\\\\\?\\/, '').replace(/\\/g, '/')

export function spawnedParent(source) {
  try { if (typeof source === 'string') source = JSON.parse(source) } catch { return '' }
  const spawn = source?.subagent?.thread_spawn || source?.subagent?.threadSpawn
  const id = spawn?.parent_thread_id || spawn?.parentThreadId
  return UUID.test(id || '') ? id : ''
}

export function parseRecords(text) {
  const out = []
  for (const line of text.split('\n')) {
    try { out.push(JSON.parse(line)) } catch { /* incomplete live record */ }
  }
  return out
}

/** Interpret both legacy transcripts and the desktop app's paginated event format. */
export function summarize(records) {
  const m = { id: '', cwd: '', model: '', effort: '', firstPrompt: '', createdAt: 0, lastAt: 0, state: 'idle', gitBranch: '' }
  for (const r of records) {
    const p = r.payload || {}
    const at = timestamp(r.timestamp)
    m.lastAt = Math.max(m.lastAt, at)
    if (r.type === 'session_meta') {
      m.id = p.id || p.session_id || m.id
      m.cwd = p.cwd || m.cwd
      m.createdAt = timestamp(p.timestamp) || at
      m.gitBranch = p.git?.branch || ''
      m.source = p.source
      m.threadSource = p.thread_source
    }
    if (r.type === 'turn_context') {
      m.cwd = p.cwd || m.cwd
      m.model = p.model || m.model
      m.effort = p.effort || m.effort
    }
    if (r.type === 'event_msg') {
      if (p.type === 'user_message' && !m.firstPrompt) m.firstPrompt = clean(p.message)
      if (p.type === 'task_started' || p.type === 'turn_started') m.state = 'working'
      else if (['task_complete', 'task_completed', 'turn_completed', 'turn_aborted', 'task_aborted'].includes(p.type)) m.state = 'idle'
      else if (p.type === 'error' || p.type === 'turn_failed') m.state = 'error'
      else if (['token_count', 'agent_message', 'agent_reasoning', 'item_started', 'item_completed'].includes(p.type)) {
        // Tail chunks may not contain the start of a long turn. Recent work is sufficient.
        if (p.type !== 'token_count' || m.state !== 'idle') m.state = 'working'
        const item = p.item || {}
        if ((item.type === 'agentMessage' || item.type === 'agent_message') && item.phase === 'final') m.state = 'idle'
      }
    }
    if (r.type === 'response_item' && p.type === 'message') {
      if (p.role === 'user' && !m.firstPrompt) m.firstPrompt = clean((p.content || []).map(c => c.text || '').join(' '))
      if (p.role === 'assistant') m.state = p.phase === 'final' ? 'idle' : 'working'
    }
  }
  m.progressUpdates = progressUpdates(records)
  return m
}

export function createCodexAdapter({ codexHome = process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), now = Date.now } = {}) {
  const cache = new Map()
  let sqliteClass

  async function readMeta(file) {
    try {
      const stat = await fsp.stat(file)
      const old = cache.get(file)
      if (old?.mtime === stat.mtimeMs && old.size === stat.size) return old
      const fd = await fsp.open(file, 'r')
      let records
      try {
        const head = Buffer.alloc(Math.min(CHUNK, stat.size))
        const a = await fd.read(head, 0, head.length, 0)
        let text = head.subarray(0, a.bytesRead).toString()
        if (stat.size > CHUNK) {
          text = text.slice(0, text.lastIndexOf('\n') + 1)
          const start = Math.max(CHUNK, stat.size - CHUNK)
          const tail = Buffer.alloc(stat.size - start)
          const b = await fd.read(tail, 0, tail.length, start)
          let end = tail.subarray(0, b.bytesRead).toString()
          if (start > CHUNK) end = end.slice(end.indexOf('\n') + 1)
          text += '\n' + end
        }
        records = parseRecords(text)
      } finally { await fd.close() }
      const entry = { mtime: stat.mtimeMs, size: stat.size, meta: summarize(records) }
      cache.set(file, entry)
      return entry
    } catch { return { mtime: 0, size: 0, meta: summarize([]) } }
  }

  async function databaseRows() {
    const files = (await fsp.readdir(codexHome).catch(() => []))
      .filter(n => /^state_\d+\.sqlite$/.test(n))
      .sort((a, b) => Number(b.match(/\d+/)[0]) - Number(a.match(/\d+/)[0]))
    for (const file of files) {
      let db
      try {
        sqliteClass ||= (await import('node:sqlite')).DatabaseSync
        db = new sqliteClass(path.join(codexHome, file), { readOnly: true })
        db.exec('PRAGMA query_only=ON; PRAGMA busy_timeout=1000')
        const columns = new Set(db.prepare('PRAGMA table_info(threads)').all().map(c => c.name))
        const wanted = ['id', 'rollout_path', 'created_at', 'created_at_ms', 'updated_at', 'updated_at_ms', 'source', 'cwd', 'title', 'name', 'archived', 'git_branch', 'model', 'reasoning_effort', 'thread_source', 'preview', 'is_pinned', 'project_id', 'agent_nickname', 'agent_role']
        const rows = db.prepare(`SELECT ${wanted.filter(k => columns.has(k)).join(',')} FROM threads`).all()
        let projects = new Map()
        try {
          projects = new Map(db.prepare('SELECT p.id,p.name,r.path FROM projects p LEFT JOIN project_roots r ON r.project_id=p.id AND r.position=0').all().map(p => [p.id, p]))
        } catch { /* older Codex has no saved-project table */ }
        return { rows, projects }
      } catch { /* CLI-only installs can use JSONL below */ }
      finally { db?.close() }
    }
    return null
  }

  async function fallbackRows() {
    const rows = []
    async function walk(dir, archived) {
      for (const entry of await fsp.readdir(dir, { withFileTypes: true }).catch(() => [])) {
        const file = path.join(dir, entry.name)
        if (entry.isDirectory()) await walk(file, archived)
        else if (/^rollout-.*\.jsonl$/.test(entry.name)) {
          const { meta, mtime } = await readMeta(file)
          if (UUID.test(meta.id)) rows.push({ id: meta.id, cwd: meta.cwd, rollout_path: file, updated_at_ms: mtime, archived, source: meta.source, thread_source: meta.threadSource })
        }
      }
    }
    await walk(path.join(codexHome, 'sessions'), false)
    await walk(path.join(codexHome, 'archived_sessions'), true)
    return { rows, projects: new Map() }
  }

  async function scanThreads() {
    const { rows, projects } = await databaseRows() || await fallbackRows()
    const names = new Map()
    for (const r of parseRecords(await fsp.readFile(path.join(codexHome, 'session_index.jsonl'), 'utf8').catch(() => ''))) {
      if (r.id && r.thread_name) names.set(r.id, r.thread_name)
    }
    const out = [], liveFiles = new Set()
    for (const row of rows) {
      if (!UUID.test(row.id) || row.thread_source === 'guardian_review') continue
      const parentThreadId = spawnedParent(row.source)
      const worker = row.thread_source === 'subagent' || !!parentThreadId || (typeof row.source === 'string' && row.source.includes('subagent'))
      const file = row.rollout_path || ''
      if (worker) {
        // Internal approval reviews are not helpers. Only linked, recently active workers enter the city.
        if (!parentThreadId || row.archived) continue
        const modified = (await fsp.stat(file).catch(() => null))?.mtimeMs || 0
        if (now() - Math.max(timestamp(row.updated_at_ms || row.updated_at), modified) >= ACTIVE_MS) continue
      }
      liveFiles.add(file)
      const { meta, size, mtime } = await readMeta(file)
      const cwd = normalizePath(row.cwd || meta.cwd)
      const savedProject = projects.get(row.project_id)
      const projectless = /^(.*\/Documents\/Codex)\/\d{4}-\d{2}-\d{2}\//i.exec(cwd)
      const projectPath = normalizePath(savedProject?.path || projectless?.[1] || cwd)
      const lastActivityAt = Math.max(timestamp(row.updated_at_ms || row.updated_at), meta.lastAt, mtime)
      const archived = Boolean(row.archived)
      const running = !archived && meta.state === 'working' && now() - lastActivityAt < ACTIVE_MS
      if (worker && !running) continue
      out.push({
        id: `codex:${row.id}`, isMini: worker, parentId: worker ? `codex:${parentThreadId}` : '', title: row.name || names.get(row.id) || clean(row.title).slice(0, 160) || meta.firstPrompt.slice(0, 120) || 'Untitled Codex task',
        progressUpdates: meta.progressUpdates || [],
        preview: clean(row.preview || meta.firstPrompt).slice(0, 240),
        project: savedProject?.name || (projectless ? 'Codex tasks' : path.posix.basename(projectPath)) || 'Codex tasks',
        projectPath, cwd, worktree: /\/\.codex\/worktrees\/([^/]+)/.exec(cwd)?.[1] || '',
        gitBranch: row.git_branch || meta.gitBranch, model: row.model || meta.model, effort: row.reasoning_effort || meta.effort,
        createdAt: timestamp(row.created_at_ms || row.created_at) || meta.createdAt || lastActivityAt,
        lastActivityAt, lastFocusedAt: 0,
        running,
        unread: false, hasError: !archived && meta.state === 'error',
        starred: Boolean(row.is_pinned), routine: '', prState: '', archived,
        sizeBytes: size, source: 'codex-local', canOpen: true, canArchive: !worker, canRename: !worker, ref: { threadId: row.id },
      })
    }
    for (const file of cache.keys()) if (!liveFiles.has(file)) cache.delete(file)
    const byId = new Map(out.map(t => [t.id,t])), rowsById = new Map(rows.map(r => [r.id,r]))
    return out.filter(thread => {
      if (!thread.isMini) return true
      let id = thread.parentId.slice(6), visited = new Set()
      while (id && !visited.has(id)) {
        visited.add(id)
        const parent = byId.get('codex:' + id)
        if (parent && !parent.isMini && !parent.archived) {
          thread.rootParentId = parent.id
          thread.project = parent.project; thread.projectPath = parent.projectPath
          thread.parentTitle = byId.get(thread.parentId)?.title || parent.title
          return true
        }
        id = spawnedParent(rowsById.get(id)?.source)
      }
      return false
    })
  }

  return {
    id: 'codex', name: 'Codex', detect: () => exists(codexHome), scanThreads,
    openThread(ref) {
      return UUID.test(ref?.threadId || '') ? { ok: true, url: `codex://threads/${ref.threadId}` } : { ok: false, error: 'Invalid Codex task ID' }
    },
    newSession() { return { ok: false, error: 'Create a new task in Codex; it will appear here automatically.' } },
    async setArchived(ref, archived) {
      if (!UUID.test(ref?.threadId || '') || typeof archived !== 'boolean') return { ok: false, error: 'Invalid archive request' }
      const task = (await scanThreads()).find(t => t.ref.threadId === ref.threadId)
      if (!task) return { ok: false, error: 'That task is no longer available. Refresh and try again.' }
      if (archived && task.running) return { ok: false, error: 'Wait until this task finishes before archiving it.' }
      await codexRequest(archived ? 'thread/archive' : 'thread/unarchive', { threadId: ref.threadId }, { codexHome })
      return { ok: true }
    },
    async rename(ref, name) {
      if (!UUID.test(ref?.threadId || '') || typeof name !== 'string' || !name.trim() || name.trim().length > 160) return { ok: false, error: 'Use a session name between 1 and 160 characters.' }
      await codexRequest('thread/name/set', { threadId: ref.threadId, name: name.trim() }, { codexHome })
      return { ok: true, name: name.trim() }
    },
  }
}

export default createCodexAdapter()
