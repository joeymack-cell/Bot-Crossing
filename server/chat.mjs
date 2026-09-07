import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { codexExecutable, codexRequest } from './harnesses/codex-control.mjs'

const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i
const runs = new Map(), cache = new Map(), sending = new Set()
const idOf = id => { const value = String(id || '').replace(/^codex:/, ''); if (!UUID.test(value)) throw new Error('Select a Codex session first.'); return value }
const at = value => value ? value < 1e12 ? value * 1000 : value : Date.now()

export function publicThread(thread) {
  const messages = []
  for (const turn of thread.turns || []) for (const item of turn.items || []) {
    if (!['userMessage', 'agentMessage'].includes(item.type)) continue
    const text = item.type === 'agentMessage' ? item.text : item.content?.filter(part => part.type === 'text').map(part => part.text || '').join('\n')
    if (text) messages.push({ id: item.id, role: item.type === 'userMessage' ? 'user' : 'assistant', text, at: at(turn.startedAt || thread.updatedAt) })
  }
  return { id: 'codex:' + thread.id, title: thread.name || thread.preview || 'Codex session', cwd: thread.cwd, model: thread.model || 'Codex', messages: messages.slice(-500), running: thread.turns?.at(-1)?.status === 'inProgress' || thread.status?.type === 'active', pending: [], activity: '', error: '' }
}

/** One process per active conversation, with user approvals kept inside its chat. */
export class ChatConnection {
  constructor(executable, onEvent, onRequest, onExit) {
    this.child = spawn(executable, ['app-server'], { windowsHide: true, stdio: ['pipe','pipe','pipe'] })
    this.nextId = 1; this.pending = new Map(); this.onEvent = onEvent; this.onRequest = onRequest
    this.lines = createInterface({ input: this.child.stdout })
    this.lines.on('line', line => {
      let message; try { message = JSON.parse(line) } catch { return }
      if (message.method && 'id' in message) onRequest(message)
      else if (message.method) onEvent(message.method, message.params || {})
      else if (this.pending.has(message.id)) {
        const waiter = this.pending.get(message.id); this.pending.delete(message.id); clearTimeout(waiter.timer)
        message.error ? waiter.reject(new Error(message.error.message || 'Codex could not complete that request.')) : waiter.resolve(message.result)
      }
    })
    this.child.stderr.resume()
    const exited = () => { for (const waiter of this.pending.values()) { clearTimeout(waiter.timer); waiter.reject(new Error('The Codex connection closed.')) } this.pending.clear(); onExit() }
    this.child.on('error', exited); this.child.on('exit', exited); this.child.stdin.on('error', () => {})
  }
  write(message) { this.child.stdin.write(JSON.stringify(message) + '\n') }
  request(method, params) {
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('Codex took too long to respond.')) }, 30000)
      this.pending.set(id, { resolve, reject, timer }); this.write({ id, method, params })
    })
  }
  async start() {
    await this.request('initialize', { clientInfo: { name: 'bot_crossing_chat', title: 'Bot Crossing', version: '1.0.0' }, capabilities: { experimentalApi: true } })
    this.write({ method: 'initialized', params: {} })
  }
  close() { this.lines.close(); this.child.kill() }
}

async function readView(id, read = codexRequest) {
  const previous = cache.get(id)
  if (previous && Date.now() - previous.at < 3000) return previous.view
  const result = await read('thread/read', { threadId: id, includeTurns: true })
  const view = publicThread(result.thread)
  cache.set(id, { at: Date.now(), view })
  if (cache.size > 12) cache.delete(cache.keys().next().value)
  return view
}
export async function chatView(id) {
  id = idOf(id)
  const run = runs.get(id)
  return run ? { ...run.view, canStop: run.view.running, pending: [...run.requests.values()].map(request => ({ ...request.params, changes: run.proposals.get(request.params.itemId), id: request.id, method: request.method })) } : readView(id)
}
export function hasChat(id) { return runs.has(idOf(id)) }

export function handleChatEvent(run, method, params) {
  if (params.threadId && params.threadId !== run.id) return
  if (method === 'turn/started') { run.turnId = params.turn?.id; run.view.running = true; run.view.activity = 'Working…' }
  if (method === 'item/agentMessage/delta') {
    let message = run.view.messages.find(item => item.id === params.itemId)
    if (!message) { message = { id: params.itemId, role: 'assistant', text: '', at: Date.now() }; run.view.messages.push(message) }
    message.text += params.delta || ''
  }
  if (method === 'item/completed' && params.item?.type === 'agentMessage') {
    const item = params.item, held = run.view.messages.find(message => message.id === item.id)
    if (held) held.text = item.text || held.text
    else if (item.text) run.view.messages.push({ id: item.id, role: 'assistant', text: item.text, at: Date.now() })
    if (item.text) run.updates = [...(run.updates || []), { at: Date.now(), text: item.text.replace(/[#*`]/g, '').split('\n').find(line => line.trim())?.slice(0,220) || 'Update received' }].slice(-4)
  }
  if (method === 'item/started') {
    if (params.item?.type === 'fileChange') run.proposals.set(params.item.id, params.item.changes)
    const labels = { commandExecution: 'Running a command…', fileChange: 'Editing files…', webSearch: 'Searching…', mcpToolCall: 'Using a tool…' }
    run.view.activity = labels[params.item?.type] || 'Working…'
  }
  if (method === 'serverRequest/resolved') run.requests.delete(String(params.requestId))
  if (method === 'error') run.view.error = params.error?.message || params.message || 'Codex reported an error.'
  if (method === 'turn/completed') {
    run.view.running = false; run.view.activity = params.turn?.status === 'completed' ? 'Finished' : 'Stopped'
    if (params.turn?.error?.message) run.view.error = params.turn.error.message
    run.requests.clear()
    cache.delete(run.id)
    run.finished = true
    setTimeout(() => { run.connection?.close(); if (runs.get(run.id) === run) runs.delete(run.id) }, 2000).unref()
  }
}

export async function sendChat(input, options) {
  const key = input.id ? idOf(input.id) : 'new:' + String(input.folder).replace(/\\/g,'/').toLowerCase()
  if (sending.has(key)) throw new Error('This message is already being sent. Your draft is kept.')
  sending.add(key)
  try { return await startChat(input, options) } finally { sending.delete(key) }
}
async function startChat({ id, folder, text }, { resolveFolder, knownThreads, read = codexRequest, executableFor = codexExecutable, connectionFor = (...args) => new ChatConnection(...args) }) {
  if (typeof text !== 'string' || !text.trim() || text.length > 100000) throw new Error('Write a message of up to 100,000 characters.')
  if ([...runs.values()].filter(run => run.view.running).length >= 4) throw new Error('Four sessions are already running. Wait for one to finish.')
  let threadId = id ? idOf(id) : null
  let view
  if (threadId) {
    const previous = runs.get(threadId)
    if (previous?.view.running) throw new Error('This session is still working. Your draft is kept; send it when the turn finishes.')
    if (previous) { previous.finished = true; previous.connection.close(); runs.delete(threadId) }
    const known = knownThreads.find(thread => thread.id === 'codex:' + threadId)
    if (!known) throw new Error('That session is not available in this city.')
    if (known.running) throw new Error('This session is working in another Codex window. Your draft is kept; send it when that turn finishes.')
    cache.delete(threadId); view = await readView(threadId, read)
    if (view.running) throw new Error('This session is still working. Your draft is kept.')
  } else {
    const cwd = await resolveFolder(folder)
    if (!cwd || !knownThreads.some(thread => thread.projectPath?.replace(/\\/g,'/').toLowerCase() === cwd.replace(/\\/g,'/').toLowerCase())) throw new Error('Choose an existing project in the city first.')
    view = { id: '', title: text.trim().slice(0,80), cwd, model: 'Codex', messages: [], pending: [], running: false, activity: '', error: '' }
  }
  const run = { id: threadId, view: { ...view, messages: [...view.messages], running: true, activity: 'Starting…', error: '' }, requests: new Map(), proposals: new Map(), turnId: null, finished: false }
  const executable = await executableFor()
  run.connection = connectionFor(executable, (method, params) => handleChatEvent(run, method, params), request => {
    if (['item/commandExecution/requestApproval','item/fileChange/requestApproval','item/tool/requestUserInput'].includes(request.method)) run.requests.set(String(request.id), request)
    else { run.view.error = 'This tool needs a feature not supported here. Continue this task in Codex.'; run.connection.write({ id: request.id, error: { code: -32601, message: 'This request is not supported by Bot Crossing.' } }) }
  }, () => { if (!run.finished) { run.view.running = false; run.view.error = 'The connection closed before the turn finished. Reopen the session to check its latest state.'; run.requests.clear() } })
  if (threadId) runs.set(threadId, run)
  try {
    await run.connection.start()
    const result = await run.connection.request(threadId ? 'thread/resume' : 'thread/start', {
      ...(threadId ? { threadId } : {}), cwd: view.cwd, approvalPolicy: 'on-request', approvalsReviewer: 'user', sandbox: 'workspace-write', runtimeWorkspaceRoots: [view.cwd]
    })
    threadId = result.thread?.id
    if (!UUID.test(threadId || '')) throw new Error('Codex did not return a session.')
    run.id = threadId; run.view.id = 'codex:' + threadId; run.view.model = result.thread.model || view.model
    runs.set(threadId, run)
    const user = { id: 'sent-' + Date.now(), role: 'user', text: text.trim(), at: Date.now() }
    run.view.messages.push(user)
    const started = await run.connection.request('turn/start', { threadId, input: [{ type: 'text', text: text.trim(), text_elements: [] }], cwd: view.cwd, runtimeWorkspaceRoots: [view.cwd], approvalPolicy: 'on-request' })
    run.turnId ||= started.turn?.id
    return { id: run.view.id }
  } catch (error) { run.finished = true; run.connection.close(); if (threadId) runs.delete(threadId); throw error }
}

export async function stopChat(id) {
  const run = runs.get(idOf(id))
  if (!run?.turnId || !run.view.running) throw new Error('This window has no active turn to stop.')
  await run.connection.request('turn/interrupt', { threadId: run.id, turnId: run.turnId })
  return { ok: true }
}
export function answerChat({ id, requestId, allow, answers }) {
  const run = runs.get(idOf(id)), request = run?.requests.get(String(requestId))
  if (!request) throw new Error('That request has already closed.')
  let result
  if (request.method === 'item/tool/requestUserInput') {
    const values = {}
    for (const question of request.params.questions || []) {
      const text = answers?.[question.id]
      if (typeof text !== 'string' || !text.trim()) throw new Error('Answer each question first.')
      values[question.id] = { answers: [text.slice(0,10000)] }
    }
    result = { answers: values }
  } else { if (typeof allow !== 'boolean') throw new Error('Choose Allow or Decline.'); result = { decision: allow ? 'accept' : 'decline' } }
  run.connection.write({ id: request.id, result }); run.requests.delete(String(requestId))
  return { ok: true }
}
export function decorateChatThreads(threads) {
  return threads.map(thread => {
    const run = runs.get(String(thread.id).replace(/^codex:/, ''))
    if (!run || !run.view.running) return thread
    return { ...thread, running: run.requests.size === 0, unread: run.requests.size > 0, hasError: false, lastActivityAt: Date.now(), ...(run.updates?.length ? { progressUpdates: run.updates } : {}) }
  })
}
export function closeChats() { for (const run of runs.values()) { run.finished = true; run.connection.close() } runs.clear() }
