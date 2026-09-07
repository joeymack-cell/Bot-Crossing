import fsp from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { rcedit } from 'rcedit'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const output = path.resolve(process.argv[2] || path.join(root, '../Bot Crossing App'))
if (process.platform !== 'win32') throw new Error('Build the Windows portable app on Windows.')
const existing = await fsp.readdir(output).catch(error => { if (error.code === 'ENOENT') return []; throw error })
if (existing.length) throw new Error('Choose an empty output folder. Existing app files and data are never overwritten.')
const metadata = JSON.parse(await fsp.readFile(path.join(root, 'package.json'), 'utf8'))
await fsp.mkdir(output, { recursive: true })
await fsp.cp(path.join(root, 'node_modules/electron/dist'), output, { recursive: true })
await fsp.rename(path.join(output, 'electron.exe'), path.join(output, 'Bot Crossing.exe'))
await rcedit(path.join(output, 'Bot Crossing.exe'), {
  icon: path.join(root, 'desktop/icon.ico'),
  'version-string': { ProductName: 'Bot Crossing', FileDescription: 'Bot Crossing Desktop — Codex colony', CompanyName: 'Bot Crossing', OriginalFilename: 'Bot Crossing.exe' },
  'file-version': metadata.version, 'product-version': metadata.version,
})
const bundled = path.join(output, 'resources/app')
await fsp.mkdir(bundled, { recursive: true })
for (const name of ['dist', 'server', 'desktop', 'LICENSE', 'README.md', 'RELEASE-NOTES.md', 'THIRD-PARTY-NOTICES.md', 'licenses']) await fsp.cp(path.join(root, name), path.join(bundled, name), { recursive: true })
await fsp.copyFile(path.join(root, 'public/assets/CREDITS.md'), path.join(bundled, 'ART-CREDITS.md'))
await fsp.writeFile(path.join(bundled, 'package.json'), JSON.stringify({ name: 'bot-crossing-desktop', productName: 'Bot Crossing', version: metadata.version, main: 'desktop/main.cjs', type: 'module', license: 'MIT' }, null, 2))
await fsp.writeFile(path.join(output, 'START HERE.txt'), 'Extract this whole folder before opening Bot Crossing.exe. Keep all files together.\r\nUse your own signed-in Codex app to view local sessions and chat.\r\nThe data folder is created on first launch. Keep it for your own updates; leave it out of copies you share.\r\nWatching the city does not make AI requests. Sending messages uses your Codex account.\r\nFull instructions and credits: resources/app/README.md and THIRD-PARTY-NOTICES.md.\r\n')
console.log(output)
