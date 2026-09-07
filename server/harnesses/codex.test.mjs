import test from 'node:test'
import assert from 'node:assert/strict'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { createCodexAdapter, summarize, parseRecords, normalizePath } from './codex.mjs'

const ID='11111111-1111-7111-8111-111111111111'
const time=Date.now()
const event=(type,extra={})=>({type:'event_msg',timestamp:new Date(time).toISOString(),payload:{type,...extra}})

test('activity lifecycle: running, completion, interruption, and errors',()=>{
  assert.equal(summarize([event('task_started')]).state,'working')
  for(const end of ['task_complete','task_completed','turn_aborted']) assert.equal(summarize([event('task_started'),event(end),event('token_count')]).state,'idle')
  assert.equal(summarize([event('turn_failed')]).state,'error')
  assert.equal(summarize([event('item_completed')]).state,'working')
})
test('legacy final response ends work and partial JSON is skipped',()=>{
  assert.equal(summarize([event('task_started'),{type:'response_item',payload:{type:'message',role:'assistant',phase:'final'}}]).state,'idle')
  assert.equal(parseRecords('{"type":"event_msg"}\n{"unfinished":').length,1)
})
test('Windows paths normalize for grouping without losing UNC roots',()=>{
  assert.equal(normalizePath('\\\\?\\C:\\Users\\a\\repo'),'C:/Users/a/repo')
  assert.equal(normalizePath('\\\\?\\UNC\\server\\repo'),'//server/repo')
})
test('SQLite metadata is read-only, authoritative, and refreshes on the next scan',async()=>{
  const dir=await fsp.mkdtemp(path.join(os.tmpdir(),'bot-crossing-test-'))
  try {
    const file=path.join(dir,'rollout.jsonl')
    await fsp.writeFile(file,JSON.stringify(event('task_started'))+'\n')
    const dbfile=path.join(dir,'state_5.sqlite')
    const db=new DatabaseSync(dbfile)
    db.exec('CREATE TABLE threads(id TEXT,rollout_path TEXT,name TEXT,cwd TEXT,archived INTEGER,updated_at_ms INTEGER,model TEXT,reasoning_effort TEXT,thread_source TEXT)')
    const insert=db.prepare('INSERT INTO threads VALUES(?,?,?,?,?,?,?,?,?)')
    insert.run(ID,file,'My task','C:\\work\\demo',0,time,'test-model','high','user')
    insert.run('22222222-2222-7222-8222-222222222222',file,'Internal review','C:\\work\\demo',0,time,'test-model','high','guardian_review')
    db.close()
    const before=await fsp.readFile(dbfile)
    const adapter=createCodexAdapter({codexHome:dir,now:()=>time+1000})
    let rows=await adapter.scanThreads()
    assert.equal(rows.length,1)
    assert.equal(rows[0].title,'My task')
    assert.equal(rows[0].running,true)
    assert.equal(rows[0].unread,false)
    assert.equal(rows[0].project,'demo')
    assert.equal(rows[0].model,'test-model')
    assert.equal(rows[0].canArchive,true)
    assert.equal(rows[0].canRename,true)
    assert.equal(adapter.openThread(rows[0].ref).url,`codex://threads/${ID}`)
    assert.equal(adapter.openThread({threadId:'../../bad'}).ok,false)
    assert.equal((await adapter.setArchived(rows[0].ref,true)).ok,false)
    assert.deepEqual(await fsp.readFile(dbfile),before)
    await fsp.appendFile(file,JSON.stringify(event('task_complete'))+'\n')
    rows=await adapter.scanThreads()
    assert.equal(rows[0].running,false)
    assert.ok(Object.values(rows[0]).every(v=>v!==undefined))
  } finally { await fsp.rm(dir,{recursive:true,force:true}) }
})
test('JSONL-only installs recover names, archive state, and stale activity',async()=>{
  const dir=await fsp.mkdtemp(path.join(os.tmpdir(),'bot-crossing-test-'))
  try {
    await fsp.mkdir(path.join(dir,'sessions','2026'),{recursive:true})
    const records=[{type:'session_meta',timestamp:new Date(time).toISOString(),payload:{id:ID,cwd:'C:/work/demo'}},event('task_started')]
    await fsp.writeFile(path.join(dir,'sessions','2026','rollout-test.jsonl'),records.map(JSON.stringify).join('\n')+'\n')
    await fsp.writeFile(path.join(dir,'session_index.jsonl'),JSON.stringify({id:ID,thread_name:'Renamed task'})+'\n')
    const adapter=createCodexAdapter({codexHome:dir,now:()=>time+3600000})
    const [row]=await adapter.scanThreads()
    assert.equal(row.title,'Renamed task')
    assert.equal(row.running,false)
    assert.equal(row.archived,false)
    assert.equal(row.id,`codex:${ID}`)
  } finally { await fsp.rm(dir,{recursive:true,force:true}) }
})

test('active spawned helpers inherit the root project and disappear after completion',async()=>{
  const dir=await fsp.mkdtemp(path.join(os.tmpdir(),'bot-mini-test-'))
  try {
    const now=Date.now(), parent='11111111-1111-7111-8111-111111111111', child='22222222-2222-7222-8222-222222222222'
    const parentFile=path.join(dir,'parent.jsonl'), childFile=path.join(dir,'child.jsonl')
    await fsp.writeFile(parentFile,JSON.stringify({timestamp:new Date(now).toISOString(),type:'event_msg',payload:{type:'task_started'}})+'\n')
    await fsp.writeFile(childFile,JSON.stringify({timestamp:new Date(now).toISOString(),type:'event_msg',payload:{type:'task_started'}})+'\n')
    const db=new DatabaseSync(path.join(dir,'state_5.sqlite'))
    db.exec('CREATE TABLE threads(id TEXT, rollout_path TEXT, name TEXT, cwd TEXT, archived INTEGER, updated_at_ms INTEGER, source TEXT, thread_source TEXT)')
    const add=db.prepare('INSERT INTO threads VALUES(?,?,?,?,?,?,?,?)')
    add.run(parent,parentFile,'Mechanic','C:/projects/Example Project',0,now,'vscode','user')
    add.run(child,childFile,'Temporary helper','C:/work/elsewhere',0,now,JSON.stringify({subagent:{thread_spawn:{parent_thread_id:parent}}}),'subagent')
    add.run('33333333-3333-7333-8333-333333333333',childFile,'Guardian','C:/work',0,now,JSON.stringify({subagent:{other:'guardian'}}),'subagent')
    db.close()
    const adapter=createCodexAdapter({codexHome:dir,now:()=>now+1000})
    const threads=await adapter.scanThreads(), mini=threads.find(t=>t.isMini)
    assert.equal(threads.length,2)
    assert.equal(mini.parentId,'codex:'+parent)
    assert.equal(mini.rootParentId,'codex:'+parent)
    assert.equal(mini.project,'Example Project')
    assert.equal(mini.canRename,false)
    assert.equal(mini.running,true)
    await fsp.appendFile(childFile,JSON.stringify({timestamp:new Date(now+500).toISOString(),type:'event_msg',payload:{type:'task_complete'}})+'\n')
    assert.equal((await adapter.scanThreads()).length,1)
  } finally {await fsp.rm(dir,{recursive:true,force:true})}
})
