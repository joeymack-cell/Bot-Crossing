import * as THREE from 'three'

/** Short, readable public updates. No timers invent progress or completion. */
export class ProgressBubbles {
  constructor(container) {
    this.layer = document.createElement('div')
    this.layer.className = 'agent-progress-layer'
    container.append(this.layer)
    this.entries = new Map()
    this.visible = new Set()
    this.point = new THREE.Vector3()
  }
  has(id) { return this.visible.has(id) }
  update(agents, camera, now = Date.now()) {
    this.visible.clear()
    const live = new Set(), placed = []
    for (const agent of agents) {
      if (agent.state === 'gone') continue
      live.add(agent.id)
      const updates = agent.thread.progressUpdates || []
      let entry = this.entries.get(agent.id)
      if (!entry && !updates.length) continue
      if (!entry) {
        const element = document.createElement('div')
        element.className = 'agent-progress-bubble'
        element.hidden = true
        this.layer.append(element)
        entry = { element, seen: new Set(), queue: [], until: 0, nextAt: 0, current: null, updates: null }
        this.entries.set(agent.id, entry)
      }
      if (entry.updates !== updates) {
        const fresh = updates.filter(update => {
          const key = update.at + ':' + update.text
          const seen = entry.seen.has(key)
          entry.seen.add(key)
          return !seen && typeof update.text === 'string' && update.text && now - update.at < 30000 && update.at <= now + 1000
        })
        // Opening the app should show the latest update, not replay an old transcript.
        entry.queue.push(...(entry.updates === null ? fresh.slice(-1) : fresh))
        entry.queue = entry.queue.slice(-4)
        entry.seen = new Set([...entry.seen].slice(-24))
        entry.updates = updates
      }
      // Consume updates while inactive too, so resuming cannot replay a finished turn.
      if (agent.thread.running !== true || agent.thread.archived || agent.status !== 'working' || agent.state === 'leaving') {
        entry.element.hidden = true
        entry.current = null
        entry.queue.length = 0
        entry.until = 0
        entry.nextAt = 0
        continue
      }
      if (entry.current && now >= entry.until) {
        entry.current = null
        entry.nextAt = now + 2200 // Let the working hammer show between updates.
      }
      if (!entry.current && now >= entry.nextAt && entry.queue.length) {
        entry.current = entry.queue.shift()
        entry.element.textContent = entry.current.text.slice(0, 220)
        entry.until = now + Math.min(10000, Math.max(4500, entry.current.text.length * 45))
      }
      entry.element.hidden = true
      if (!entry.current || agent.scale < .5 || placed.length >= 6) continue
      this.point.copy(agent.pos).addScaledVector(THREE.Object3D.DEFAULT_UP, 1.6 * (agent.isMini ? .58 : 1)).project(camera)
      if (this.point.z < -1 || this.point.z > 1 || Math.abs(this.point.x) > 1 || Math.abs(this.point.y) > 1) continue
      const x = (this.point.x * .5 + .5) * window.innerWidth
      const y = (-this.point.y * .5 + .5) * window.innerHeight - 18
      if (placed.some(p => Math.abs(p.x-x)<250 && Math.abs(p.y-y)<100)) continue
      placed.push({ x, y })
      entry.element.style.left = Math.max(132, Math.min(window.innerWidth-132, x)) + 'px'
      entry.element.style.top = Math.max(110,y) + 'px'
      entry.element.hidden = false
      this.visible.add(agent.id)
    }
    for (const [id, entry] of this.entries) if (!live.has(id)) {
      entry.element.remove(); this.entries.delete(id)
    }
  }
  dispose() { this.layer.remove(); this.entries.clear(); this.visible.clear() }
}
