const { app, BrowserWindow, Menu, dialog } = require('electron')
const path = require('node:path')
const fs = require('node:fs/promises')
const { pathToFileURL } = require('node:url')

const smoke = process.argv.includes('--smoke-test')
const portableRoot = app.isPackaged ? path.dirname(process.execPath) : path.resolve(__dirname, '..')
const dataRoot = path.join(portableRoot, 'data')
app.setName('Bot Crossing')
app.setAppUserModelId('local.bot-crossing.desktop')
app.setPath('userData', path.join(dataRoot, smoke ? 'test-profile' : 'desktop-profile'))
process.env.BOT_CROSSING_HARNESSES = 'codex'
process.env.BOT_CROSSING_DATA = path.join(dataRoot, smoke ? 'test-colony' : 'colony')
let mainWindow, server, origin, closeChats

if (!app.requestSingleInstanceLock()) app.quit()
else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()
    }
  })
  app.whenReady().then(start).catch(async error => {
    await fs.mkdir(dataRoot, { recursive: true })
    await fs.writeFile(path.join(dataRoot, 'startup-error.log'), error.stack || String(error))
    if (!smoke) dialog.showErrorBox('Bot Crossing could not start', error.message)
    app.exit(1)
  })
}

async function start() {
  await fs.mkdir(process.env.BOT_CROSSING_DATA, { recursive: true })
  const colonyFile = path.join(process.env.BOT_CROSSING_DATA, 'colony.json')
  // Preserve the user's existing map when first moving from the browser version.
  const previous = smoke ? path.join(dataRoot, 'colony', 'colony.json') : path.resolve(portableRoot, '..', 'bot-crossing-main', 'data', 'colony.json')
  try { await fs.copyFile(previous, colonyFile, require('node:fs').constants.COPYFILE_EXCL) } catch {}

  const { createColonyServer } = await import(pathToFileURL(path.resolve(__dirname, '../server/serve.mjs')).href)
  closeChats = (await import(pathToFileURL(path.resolve(__dirname, '../server/chat.mjs')).href)).closeChats
  server = createColonyServer()
  await new Promise((resolve, reject) => {
    server.once('error', error => {
      if (error.code !== 'EADDRINUSE') return reject(error)
      server.once('error', reject)
      server.listen(0, '127.0.0.1', resolve)
    })
    server.listen(smoke ? 0 : 5275, '127.0.0.1', resolve)
  })
  origin = `http://127.0.0.1:${server.address().port}`
  Menu.setApplicationMenu(null)
  mainWindow = new BrowserWindow({
    title: 'Bot Crossing', width: 1440, height: 940, minWidth: 900, minHeight: 640,
    backgroundColor: '#101216', show: false, autoHideMenuBar: true,
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: { offscreen: smoke && process.argv.includes('--hidden'), nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, backgroundThrottling: !smoke },
  })
  const session = mainWindow.webContents.session
  session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
  session.setPermissionCheckHandler(() => false)
  session.webRequest.onHeadersReceived((details, callback) => callback({ responseHeaders: {
    ...details.responseHeaders,
    'Content-Security-Policy': ["default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'none'"],
  } }))
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (new URL(url).origin !== origin) event.preventDefault()
  })
  mainWindow.webContents.on('will-attach-webview', event => event.preventDefault())
  mainWindow.on('page-title-updated', event => event.preventDefault())
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    fs.writeFile(path.join(dataRoot, 'renderer-error.log'), JSON.stringify(details)).catch(() => {})
  })
  const errors = []
  mainWindow.webContents.on('console-message', (_event, details) => {
    if (details.level === 'error') errors.push(details.message)
  })
  await mainWindow.loadURL(origin)
  if (smoke) { if (!process.argv.includes('--hidden')) mainWindow.showInactive() }
  else mainWindow.show()
  await fs.unlink(path.join(dataRoot, 'startup-error.log')).catch(() => {})
  if (smoke) {
    const deadline = Date.now() + 45000
    let result
    do {
      result = await mainWindow.webContents.executeJavaScript(`(() => {
        const b = window.botCrossing;
        return { ready: !!b?.colony?.stats?.agents, tasks: b?.threads?.length || 0,
          visible: b?.colony?.stats?.agents || 0, active: b?.colony?.stats?.working || 0,
          canvas: !!document.querySelector('canvas'), nodeExposed: typeof window.require !== 'undefined',
          legend: document.querySelector('.recency-legend')?.textContent?.trim(),
          suitColors: [...new Set((b?.colony?.astronauts?.agents || []).map(a => a.suit))] };
      })()`)
      if (result.ready) break
      await new Promise(resolve => setTimeout(resolve, 250))
    } while (Date.now() < deadline)
    const uiChecks = await mainWindow.webContents.executeJavaScript(`(async () => {
      const b = window.botCrossing, $ = s => document.querySelector(s);
      b.hud.toggleHelp(false);
      const choose = days => { $('#history-days').value = String(days); $('#history-days').dispatchEvent(new Event('change', {bubbles:true})); return b.colony.stats.agents };
      const defaultDays = b.settings.get('historyDays');
      const all = choose(0), projectCount = b.colony.plots.size;
      const recent = choose(1);
      const stableProjects = b.colony.plots.size === projectCount;
      choose(14);
      const headquarters = b.colony.plotOrder.every(p => !!p.headquarters && p.signText.includes('HQ') && p.label?.userData.physical && p.label.children.some(c => c.castShadow) && p.label.children.every(c => !c.material || (c.material.depthTest && c.material.depthWrite)));
      const project = b.colony.plotOrder[0];
      if (project) b.hud.actions.pickProject(project.name);
      const row = $('.side .threads .thread');
      row?.click();
      $('#btn-rename').click();
      const renameVisible = !$('#rename-form').hidden && document.activeElement === $('#session-name');
      $('#rename-cancel').click();
      $('#btn-archives').click();
      const archivesOpen = !$('.archive-panel').hidden;
      $('#close-archives').click();
      b.hud.actions.closeProject();
      b.hud.actions.resetView();
      return { defaultDays, all, recent, stableProjects, headquarters, renameVisible: row ? renameVisible : null, archivesOpen };
    })()`)
    const characterChecks = await mainWindow.webContents.executeJavaScript(`(async () => {
      const b=window.botCrossing, crew=b.colony.astronauts;
      const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
      const adult=crew.agents.find(a=>!a.isMini && a.state!=='gone');
      const personalityTypes=new Set(crew.agents.map(a=>a.personality.backpack.id)).size;
      const faceColors=new Set(crew.agents.map(a=>a.personality.faceColor)).size;
      const originalFetch=window.fetch, originalThreads=b.threads.slice();
      const parent=originalThreads.find(t=>t.id===adult.id);
      const mini={...parent,id:'test-mini-agent',isMini:true,parentId:parent.id,rootParentId:parent.id,title:'Test mini helper',running:true,archived:false,lastActivityAt:Date.now()};
      const buildingsBefore=b.colony.buildings.size;
      window.fetch=async (url,...args)=>url==='/api/threads'?{ok:true,json:async()=>({threads:[...originalThreads,mini]})}:originalFetch(url,...args);
      await b.poll(); await pause(100);
      const helper=crew.byId.get(mini.id);
      const miniSpawned=!!helper?.isMini;
      const helperSpeed=helper?.speed || 0;
      const noExtraBuilding=b.colony.buildings.size===buildingsBefore;
      window.fetch=originalFetch;await b.poll();await pause(100);
      const helperLeaving=!crew.byId.has(mini.id)||crew.byId.get(mini.id).state==='leaving';
      b.settings.set('reducedMotion',false);
      adult.scale=1;
      b.hud.actions.select(adult.id);
      b.rig.focus(adult.pos.clone(),{distance:12});
      await pause(1800);
      const greeted=!!adult.attention?.active;
      const greetingClip=adult.clipKey;
      const fixedLetters=b.colony.plotOrder.every(p=>p.label.userData.lettersOnly && p.label.userData.letterHeight>=12);
      b.hud.actions.select(null);
      const cancelled=adult.attention===null;
      b.settings.set('reducedMotion',true);
      b.hud.actions.select(adult.id);
      await pause(100);
      const reducedExpression=adult.faceFrame;
      const reducedNoWave=adult.clipKey!=='wave' && adult.clipKey!=='cheer';
      b.hud.actions.select(null);b.settings.set('reducedMotion',false);b.hud.actions.resetView();
      return {personalityTypes,faceColors,miniSpawned,helperSpeed,noExtraBuilding,helperLeaving,greeted,greetingClip,cancelled,reducedNoWave,reducedExpression,fixedLetters};
    })()`)
    result.characterChecks = characterChecks
    result.uiChecks = uiChecks
    const status = await (await fetch(origin + '/api/harnesses')).json()
    result.harnesses = status.harnesses
    result.errors = errors
    result.runtime = process.versions
    await fs.writeFile(path.join(dataRoot, 'desktop-test.json'), JSON.stringify(result, null, 2))
    await mainWindow.webContents.executeJavaScript('window.botCrossing?.hud.toggleHelp(false)')
    await new Promise(resolve => setTimeout(resolve, 2000))
    await fs.writeFile(path.join(dataRoot, 'desktop-test.png'), (await mainWindow.webContents.capturePage()).toPNG())
    await mainWindow.webContents.executeJavaScript(`(() => {
      const b=window.botCrossing, p=b.colony.plotOrder[0];
      b.hud.actions.pickProject(p.name);
      document.querySelector('.sign-editor').open=true;
      b.rig.focus(p.worldSlot(0).setY(5),{distance:44});b.rig.desiredPolar=0.98;b.rig.desiredAzimuth=Math.PI/4;
    })()`)
    await new Promise(resolve => setTimeout(resolve, 1800))
    await fs.writeFile(path.join(dataRoot, 'headquarters-test.png'), (await mainWindow.webContents.capturePage()).toPNG())
    await mainWindow.webContents.executeJavaScript(`(() => {
      const b=window.botCrossing, a=b.colony.astronauts.agents.find(a=>!a.isMini && a.personality.backpack.id==='cat') || b.colony.astronauts.agents[0];
      b.hud.actions.select(a.id); b.hud.toggleUi(false);
      a.attention=null; a.state='at-site'; a.status='waiting'; a.site.copy(a.pos);
      a.targetYaw=Math.PI/4; a.yaw=Math.PI/4;
      b.rig.focus(a.pos.clone(),{distance:7});b.rig.desiredAzimuth=Math.PI*1.25;b.rig.desiredPolar=1.2;
    })()`)
    await new Promise(resolve=>setTimeout(resolve,1600))
    await fs.writeFile(path.join(dataRoot,'backpack-test.png'),(await mainWindow.webContents.capturePage()).toPNG())
    await mainWindow.webContents.executeJavaScript(`(() => {
      const b=window.botCrossing, a=b.colony.astronauts.agents.find(a=>!a.isMini);
      a.attention=null;a.state='at-site';a.status='working';a.site.copy(a.pos);a.scale=1;
      b.rig.focus(a.pos.clone(),{distance:9});b.rig.desiredAzimuth=Math.PI/4;b.rig.desiredPolar=1.2;
    })()`)
    await new Promise(resolve=>setTimeout(resolve,1400))
    await fs.writeFile(path.join(dataRoot,'working-test.png'),(await mainWindow.webContents.capturePage()).toPNG())
    app.exit(result.ready && !result.nodeExposed && errors.length === 0 && uiChecks.stableProjects && uiChecks.headquarters && uiChecks.archivesOpen && uiChecks.all >= uiChecks.recent && characterChecks.miniSpawned && characterChecks.noExtraBuilding && characterChecks.helperLeaving && characterChecks.greeted && characterChecks.cancelled && characterChecks.reducedNoWave && characterChecks.fixedLetters ? 0 : 1)
  }
}

app.on('window-all-closed', () => app.quit())
app.on('before-quit', () => { closeChats?.(); server?.closeAllConnections(); server?.close() })
