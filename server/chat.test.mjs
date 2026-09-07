import test from 'node:test'
import assert from 'node:assert/strict'
import { sendChat, chatView, publicThread, answerChat, stopChat, decorateChatThreads, closeChats } from './chat.mjs'

const id='11111111-1111-4111-8111-111111111111', cwd='C:/Projects/city'
const thread={ id, cwd, name:'Mechanic', model:'saved-model', status:{type:'idle'}, turns:[{status:'completed',items:[
  {id:'u',type:'userMessage',content:[{type:'text',text:'Fix this'}]},
  {id:'r',type:'reasoning',text:'Private reasoning'},
  {id:'a',type:'agentMessage',text:'Finished the fix'},
]}] }
function fixture() {
  const calls=[],responses=[],connections=[]
  const options={knownThreads:[{id:'codex:'+id, projectPath:cwd,running:false}], resolveFolder:async value=>value,read:async()=>({thread}),executableFor:async()=> 'fake',connectionFor:(_exe,event,request,exit)=>{
    const client={event,ask:request,exit,closed:false,start:async()=>{},write:value=>responses.push(value),close(){this.closed=true},request:async(method,params)=>{ calls.push({method,params}); return method.startsWith('thread/') ? {thread} : {turn:{id:'turn-1'}} }}
    connections.push(client);return client
  }}
  return {options,calls,responses,connections}
}
test('public history excludes reasoning and tools',()=>{assert.deepEqual(publicThread(thread).messages.map(x=>x.text),['Fix this','Finished the fix'])})
test('resume, stream, review a proposed change, answer a question, stop, and reopen',async()=>{
  const f=fixture();try{
    assert.deepEqual(await sendChat({id:'codex:'+id,text:'Add a garage'},f.options),{id:'codex:'+id})
    assert.equal(f.calls[0].method,'thread/resume');assert.equal(f.calls[0].params.threadId,id)
    assert.equal(f.calls[0].params.model,undefined)
    assert.equal(f.calls[1].params.input[0].text,'Add a garage')
    const c=f.connections[0]
    c.event('item/agentMessage/delta',{threadId:id,itemId:'new-a',delta:'Starting garage'})
    c.event('item/completed',{threadId:id,item:{id:'new-a',type:'agentMessage',text:'Starting garage'}})
    assert.equal((await chatView(id)).messages.filter(m=>m.id==='new-a').length,1)
    c.event('item/started',{threadId:id,item:{id:'patch',type:'fileChange',changes:[{path:'garage.js',diff:'+ garage'}]}})
    c.ask({id:88,method:'item/fileChange/requestApproval',params:{threadId:id,itemId:'patch',reason:'Create the garage'}})
    const view=await chatView(id);assert.equal(view.pending[0].changes[0].path,'garage.js')
    assert.equal(f.responses.length,0)
    assert.equal(decorateChatThreads(f.options.knownThreads)[0].running,false)
    answerChat({id,requestId:88,allow:false});assert.deepEqual(f.responses[0],{id:88,result:{decision:'decline'}})
    assert.equal(decorateChatThreads(f.options.knownThreads)[0].running,true)
    assert.equal(decorateChatThreads(f.options.knownThreads)[0].progressUpdates[0].text,'Starting garage')
    c.ask({id:89,method:'item/tool/requestUserInput',params:{threadId:id,questions:[{id:'color',question:'Color?'}]}})
    assert.throws(()=>answerChat({id,requestId:89,answers:{}}),/Answer each/)
    answerChat({id,requestId:89,answers:{color:'Blue'}});assert.deepEqual(f.responses[1].result,{answers:{color:{answers:['Blue']}}})
    await stopChat(id);assert.equal(f.calls.at(-1).method,'turn/interrupt')
    c.event('turn/completed',{threadId:id,turn:{status:'interrupted'}})
    assert.equal((await chatView(id)).running,false)
    await sendChat({id,text:'Continue'},f.options);assert.equal(f.connections.length,2)
  } finally {closeChats()}
})
test('duplicate delivery and externally running sessions cannot start overlapping turns',async()=>{
  const f=fixture();let release
  f.options.read=()=>new Promise(resolve=>{release=()=>resolve({thread})})
  const first=sendChat({id,text:'A'},f.options)
  await assert.rejects(sendChat({id,text:'A'},f.options),/already being sent/)
  release();await first
  await assert.rejects(sendChat({id,text:'B'},f.options),/still working/)
  closeChats();f.options.knownThreads[0].running=true
  await assert.rejects(sendChat({id,text:'B'},f.options),/another Codex window/)
})
test('new conversations require a known project; failed connection can be retried',async()=>{
  const f=fixture();try{
    await assert.rejects(sendChat({folder:'C:/Elsewhere',text:'Hi'},f.options),/existing project/)
    await sendChat({folder:cwd,text:'New section'},f.options);assert.equal(f.calls[0].method,'thread/start')
    f.connections[0].exit();assert.equal((await chatView(id)).running,false)
    await sendChat({id,text:'Retry'},f.options);assert.equal(f.connections.length,2)
  } finally {closeChats()}
})
