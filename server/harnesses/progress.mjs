/** Only public updates and observed lifecycle events; never private reasoning or tool arguments. */
export function progressUpdates(records) {
  const updates = [], calls = new Map()
  const textOf = value => typeof value === 'string' ? value.replace(/```[\s\S]*?```/g, ' [code] ').replace(/\[[^\]]+\]\([^)]*\)/g, label => label.slice(1,label.indexOf(']'))).replace(/\s+/g, ' ').trim().slice(0, 220) : ''
  let lastNarration = 0
  const add = (text, at, kind) => {
    if (!text || !at) return
    const last = updates.at(-1)
    if (last?.text === text && Math.abs(last.at - at) < 2000) return
    updates.push({ text, at, kind })
  }
  const toolLabel = name => /search|grep|glob/i.test(name) ? 'a search' : /read|open|view/i.test(name) ? 'a file check' : /patch|edit|write/i.test(name) ? 'an edit' : /test/i.test(name) ? 'a test' : 'a tool step'
  for (const record of records) {
    const p = record.payload || {}, at = Date.parse(record.timestamp) || 0
    if (record.type === 'event_msg') {
      if (p.type === 'agent_message' && p.phase === 'commentary') { add(textOf(p.message), at, 'update'); lastNarration = at }
      else if (['task_started','turn_started'].includes(p.type)) add('Starting this turn…', at, 'start')
      else if (['task_complete','task_completed','turn_completed'].includes(p.type)) add('Finished this turn.', at, 'done')
      else if (['task_aborted','turn_aborted'].includes(p.type)) add('Work paused.', at, 'paused')
      else if (['error','turn_failed'].includes(p.type)) add('This step needs attention.', at, 'error')
    }
    if (record.type !== 'response_item') continue
    if (p.type === 'message' && p.role === 'assistant' && p.phase === 'commentary') {
      add(textOf((p.content || []).map(c => c.text || '').join(' ')), at, 'update'); lastNarration = at
    } else if (p.type === 'message' && p.role === 'assistant' && p.phase === 'final') add('Finished this turn.', at, 'done')
    else if (['function_call','custom_tool_call'].includes(p.type)) {
      calls.set(p.call_id, toolLabel(p.name || ''))
      if (at - lastNarration > 5000) add('Starting ' + toolLabel(p.name || '') + '…', at, 'tool')
    } else if (['function_call_output','custom_tool_call_output'].includes(p.type) && calls.has(p.call_id) && at - lastNarration > 5000) {
      // A returned tool result proves the call ended, not that the requested change succeeded.
      add('Tool step returned. Continuing…', at, 'tool')
    }
  }
  return updates.slice(-8)
}
