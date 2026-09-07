import test from 'node:test'
import assert from 'node:assert/strict'
import { Navigation } from './navigation.js'

test('work sites use reachable ground instead of a free but enclosed courtyard', () => {
  const nav = new Navigation()
  const wall = Array.from({ length: 16 }, (_, i) => ({ x: Math.cos(i * Math.PI / 8) * 3, z: Math.sin(i * Math.PI / 8) * 3, r: 1 }))
  nav.rebuild(wall)
  assert.equal(nav.isBlocked(0, 0), false)
  assert.equal(nav.findPath(-10, 0, 0, 0), null)
  const point = nav.reachablePoint(-10, 0, 0, 0)
  assert.ok(point); assert.ok(nav.findPath(-10, 0, point.x, point.z))
  assert.equal(nav.isBlocked(point.x, point.z), false)
  assert.deepEqual(nav.reachablePoint(-10, 0, -8, 2), { x: -8, z: 2 })
  nav.rebuild([])
  assert.deepEqual(nav.reachablePoint(-10, 0, 0, 0), { x: 0, z: 0 })
})

test('collision cannot slip through a sealed diagonal or mistake rounding noise for movement', () => {
  const nav = new Navigation()
  nav.rebuild([{ x: .25, z: -.25, r: .2 }, { x: -.25, z: .25, r: .2 }])
  const pos = { x: -.01, z: -.01 }
  assert.equal(nav.slide(pos, .02, .02), false)
  assert.deepEqual(pos, { x: -.01, z: -.01 })
  const beside = { x: -.01, z: -.25 }
  assert.equal(nav.slide(beside, .02, 1e-17), false)
  assert.deepEqual(beside, { x: -.01, z: -.25 })
})
