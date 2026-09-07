import test from 'node:test'
import assert from 'node:assert/strict'
import { recencyFor, RECENCY_BANDS } from './recency.js'
test('recency changes at exact hour, day, and week boundaries', () => {
  const now = 1800000000000
  const at = age => recencyFor({lastActivityAt: now - age},now).id
  assert.equal(at(0),'fresh')
  assert.equal(at(3599999),'fresh')
  assert.equal(at(3600000),'today')
  assert.equal(at(86400000),'week')
  assert.equal(at(604800000),'older')
  assert.equal(at(-60000),'fresh')
  assert.equal(recencyFor({}).id,'unknown')
  assert.equal(new Set(RECENCY_BANDS.map(b=>b.color)).size,4)
})
test('recent activity takes precedence over old task creation', () => {
  const now = 1800000000000
  assert.equal(recencyFor({createdAt:now-1e10,lastActivityAt:now-100},now).id,'fresh')
})
