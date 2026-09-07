import test from 'node:test'
import assert from 'node:assert/strict'
import { sectionColor, mergeStudioThreads } from './sections.js'

test('section colors survive renames and accept only valid saved colors', () => {
  assert.match(sectionColor('session-one'), /^#[0-9a-f]{6}$/)
  assert.equal(sectionColor('session-one'), sectionColor('session-one'))
  assert.notEqual(sectionColor('session-one'), sectionColor('session-two'))
  assert.equal(sectionColor('session-one', '#Ab12Cd'), '#ab12cd')
  assert.equal(sectionColor('session-one', '<script>'), sectionColor('session-one'))
})
test('one Studio building per conversation, without duplicate Codex agents; helpers retain their parent', () => {
  const scanned = [{ id: 'codex:123', title: 'Old name', running: true }, { id: 'codex:child', isMini: true, parentId: 'codex:123', rootParentId: 'codex:123' }, { id: 'codex:other' }]
  const native = [{ id: 'studio:abc', studioConversationId: 'abc', providerThreadId: '123', title: 'Mechanic', running: false }, { id: 'studio:def', studioConversationId: 'def', title: 'Admin Menu' }]
  const merged = mergeStudioThreads(scanned, native)
  assert.equal(merged.length, 4)
  assert.equal(merged.some(t => t.id === 'codex:123'), false)
  assert.equal(merged.find(t => t.id === 'studio:abc').title, 'Mechanic')
  assert.equal(merged.find(t => t.isMini).parentId, 'studio:abc')
  assert.equal(merged.find(t => t.id === 'studio:abc').running, false)
  assert.deepEqual(mergeStudioThreads(merged, native), merged)
})
