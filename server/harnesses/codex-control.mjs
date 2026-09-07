import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'

export async function codexExecutable() {
  if (process.env.BOT_CROSSING_CODEX_BIN) return process.env.BOT_CROSSING_CODEX_BIN
  const root = path.join(process.env.LOCALAPPDATA || '', 'OpenAI', 'Codex', 'bin')
  const candidates = []
  for (const name of await fs.readdir(root).catch(() => [])) {
    const file = path.join(root, name, 'codex.exe')
    const stat = await fs.stat(file).catch(() => null)
    if (stat?.isFile()) candidates.push({ file, modified: stat.mtimeMs })
  }
  return candidates.sort((a, b) => b.modified - a.modified)[0]?.file || 'codex'
}

// A short-lived official app-server client. No model turn is started by these controls.
export async function codexRequest(method, params, { codexHome = process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), executable, timeout = 30000 } = {}) {
  executable ||= await codexExecutable()
  return new Promise((resolve, reject) => {
    const child = spawn(executable, ['app-server'], {
      windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, CODEX_HOME: codexHome },
    })
    const lines = createInterface({ input: child.stdout })
    let finished = false
    const finish = (error, result) => {
      if (finished) return
      finished = true
      clearTimeout(timer)
      lines.close()
      child.stdin.end()
      child.kill()
      error ? reject(error) : resolve(result)
    }
    const timer = setTimeout(() => finish(new Error('Codex took too long to respond. Refresh before trying again.')), timeout)
    const send = payload => child.stdin.write(JSON.stringify(payload) + '\n')
    child.on('error', () => finish(new Error('Could not start Codex. Open Codex, then try again.')))
    child.on('exit', () => finish(new Error('Codex closed before confirming the change. Refresh before trying again.')))
    child.stdin.on('error', () => finish(new Error('The connection to Codex closed.')))
    child.stderr.resume()
    lines.on('line', line => {
      let message
      try { message = JSON.parse(line) } catch { return }
      if (message.id !== 1 && message.id !== 2) return
      if (message.error) return finish(new Error(message.error.message || 'Codex could not complete the change.'))
      if (message.id === 1) {
        send({ method: 'initialized', params: {} })
        send({ id: 2, method, params })
      } else finish(null, message.result)
    })
    send({ id: 1, method: 'initialize', params: { clientInfo: { name: 'bot_crossing', title: 'Bot Crossing', version: '1.0.0' } } })
  })
}
