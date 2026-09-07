import test from 'node:test'
import assert from 'node:assert/strict'
import { visibleRoster } from './roster.js'
test('active tasks survive the crew cap even after many older project tasks', () => {
  const older = Array.from({length:100},(_,i)=>({id:`old-${i}`,status:'sleeping'}))
  const active = {id:'current',status:'working',thread:{lastActivityAt:10}}
  const entries = [...older,active]
  const visible = visibleRoster(entries,90)
  assert.equal(visible.length,90)
  assert.equal(visible[0],active)
  assert.equal(entries[0],older[0])
})
