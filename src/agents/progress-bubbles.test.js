import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { ProgressBubbles } from './progress-bubbles.js'

test('only current working agents speak; inactive updates never replay on resume', () => {
  const element = () => ({ style: {}, append() {}, remove() { this.removed = true }, hidden: true })
  globalThis.document = { createElement: element }
  globalThis.window = { innerWidth: 1200, innerHeight: 800 }
  const bubbles = new ProgressBubbles(element())
  const camera = new THREE.PerspectiveCamera(50, 1.5, .1, 100)
  camera.position.set(0, 2, 10); camera.lookAt(0, 1, 0); camera.updateMatrixWorld()
  let now = 100000
  const agent = { id: 'task', state: 'at-site', status: 'working', scale: 1, pos: new THREE.Vector3(), thread: { running: true, progressUpdates: [] } }
  const speak = text => { agent.thread.progressUpdates = [{ at: ++now, text }]; bubbles.update([agent], camera, now) }
  speak('Starting the check'); assert.equal(bubbles.has(agent.id), true)
  for (const change of [
    { status: 'idle' }, { status: 'waiting' }, { status: 'sleeping' }, { status: 'blocked' },
    { status: 'celebrating' }, { state: 'leaving' }, { running: false }, { archived: true }
  ]) {
    Object.assign(agent, { state: 'at-site', status: 'working' }, change)
    Object.assign(agent.thread, { running: true, archived: false }, change)
    speak('An update arriving after work stopped')
    const entry = bubbles.entries.get(agent.id)
    assert.equal(bubbles.has(agent.id), false); assert.equal(entry.element.hidden, true)
    assert.equal(entry.current, null); assert.deepEqual(entry.queue, [])
    Object.assign(agent, { state: 'walking', status: 'working' })
    Object.assign(agent.thread, { running: true, archived: false })
    bubbles.update([agent], camera, ++now)
    assert.equal(bubbles.has(agent.id), false)
    speak('Starting fresh work'); assert.equal(bubbles.has(agent.id), true)
  }
  agent.state = 'gone'; bubbles.update([agent], camera, ++now)
  assert.equal(bubbles.entries.size, 0); assert.equal(bubbles.has(agent.id), false)
  bubbles.dispose()
  delete globalThis.document; delete globalThis.window
})
