import { marked } from 'marked'
import DOMPurify from 'dompurify'

const defaults = { chatWidth: 380, chatHeight: 540, composerWidth: 660, composerHeight: 60 }
const limits = { chatWidth: [280,720], chatHeight: [200,900], composerWidth: [360,1100], composerHeight: [36,240] }
const safeRead = (key, fallback) => { try { const value=JSON.parse(localStorage.getItem(key)); return value && typeof value === 'object' && !Array.isArray(value) ? value : fallback } catch { return fallback } }
const save = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* Keep the current draft in memory. */ } }

/** Native-feeling chat over the city; provider calls stay in the local server. */
export class CityChat {
  constructor(root, hud, onChange) {
    this.root = root; this.hud = hud; this.onChange = onChange
    this.current = null; this.view = null; this.revision = 0; this.loading = false; this.sending = false; this.quiet = false
    this.drafts = safeRead('botcrossing.chat.drafts', {})
    this.sizes = { ...defaults }
    const stored = safeRead('botcrossing.chat.sizes', {})
    for (const key of Object.keys(defaults)) if (Number.isFinite(stored[key])) this.sizes[key] = Math.min(limits[key][1], Math.max(limits[key][0], stored[key]))
    this.layer = document.createElement('div'); this.layer.className = 'city-chat-layer'; this.layer.hidden = true
    this.layer.innerHTML = `<div class="city-chat-toolbar panel"><button class="btn chat-tab">Chat</button><button class="btn city-controls">City controls</button><button class="btn chat-graphics">Graphics</button><button class="btn chat-size-toggle" aria-expanded="false">Size</button><button class="btn chat-quiet">Hide panels</button></div>
      <aside class="city-chat-panel panel" aria-label="Conversation"><header><div><small>Conversation · Codex</small><strong class="chat-title"></strong></div><button class="btn icon ghost chat-close" aria-label="Close chat">×</button></header><div class="city-chat-messages" aria-live="polite"></div><div class="chat-requests"></div><footer class="chat-status" role="status"></footer></aside>
      <form class="city-chat-composer panel"><div class="chat-context"></div><label class="sr-only" for="city-chat-draft">Message</label><textarea id="city-chat-draft" placeholder="Describe what you want built, fixed, or inspected…"></textarea><div class="chat-compose-actions"><span class="chat-send-hint">Enter sends · Shift+Enter for a new line</span><button type="button" class="btn chat-stop" hidden>Stop</button><button type="submit" class="btn primary chat-send">Send ↑</button></div><p class="chat-error" role="alert" hidden></p></form>
      <div class="city-chat-sizes panel" hidden><header><strong>Chat size</strong><button class="btn chat-size-reset">Reset</button></header>${Object.entries({ chatWidth:'Replies width',chatHeight:'Replies height',composerWidth:'Message box width',composerHeight:'Message box height' }).map(([key,label])=>`<label><span>${label}<output></output></span><input type="range" data-size="${key}" aria-label="${label}" min="${limits[key][0]}" max="${limits[key][1]}" step="1"></label>`).join('')}<small>Sizes are saved. The city stays full screen.</small></div>`
    hud.el.append(this.layer)
    this.$ = selector => this.layer.querySelector(selector)
    this.$('.chat-close').onclick = () => this.close()
    this.$('.city-controls').onclick = () => this.close()
    this.$('.chat-tab').onclick = () => this.setQuiet(false)
    this.$('.chat-graphics').onclick = () => { this.close(); hud.toggleSettings(true) }
    this.$('.chat-quiet').onclick = () => this.setQuiet(!this.quiet)
    this.$('.chat-size-toggle').onclick = () => { const menu = this.$('.city-chat-sizes'); menu.hidden = !menu.hidden; this.$('.chat-size-toggle').setAttribute('aria-expanded',String(!menu.hidden)); this.setQuiet(false) }
    this.$('.chat-size-reset').onclick = () => { this.sizes = { ...defaults }; this.applySizes() }
    for (const input of this.layer.querySelectorAll('[data-size]')) input.oninput = () => { this.sizes[input.dataset.size] = Number(input.value); this.applySizes() }
    this.$('textarea').oninput = () => this.saveDraft()
    this.$('textarea').onkeydown = event => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); void this.send() } }
    this.$('form').onsubmit = event => { event.preventDefault(); void this.send() }
    this.$('.chat-stop').onclick = () => this.action('stop', { id: this.current?.id })
    this.observer = new ResizeObserver(() => this.syncInsets())
    this.observer.observe(this.$('.city-chat-panel')); this.observer.observe(this.$('.city-chat-composer'))
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && !this.$('.city-chat-sizes').hidden) { this.$('.city-chat-sizes').hidden = true; this.$('.chat-size-toggle').setAttribute('aria-expanded','false') } })
    this.timer = setInterval(() => { if (!this.layer.hidden && !document.hidden && this.current?.id) void this.refresh() }, 1500)
    this.applySizes()
  }
  key() { return this.current?.id || 'new:' + this.current?.folder }
  saveDraft() { if (!this.current) return; this.drafts[this.key()] = this.$('textarea').value; save('botcrossing.chat.drafts', this.drafts) }
  applySizes() {
    for (const [key,value] of Object.entries(this.sizes)) { this.layer.style.setProperty('--' + key,value+'px'); const input = this.$(`[data-size="${key}"]`); input.value = value; input.previousElementSibling.querySelector('output').textContent = value+' px' }
    save('botcrossing.chat.sizes',this.sizes); this.syncInsets()
  }
  syncInsets() {
    if (this.layer.hidden) return
    this.hud.setSideWidth(this.quiet ? 0 : this.$('.city-chat-panel').getBoundingClientRect().width + 32)
    this.hud._bottomInset = this.quiet ? 0 : this.$('.city-chat-composer').getBoundingClientRect().height + 24
  }
  setQuiet(value) { this.quiet = value; this.layer.classList.toggle('is-quiet',value); this.$('.chat-quiet').textContent=value?'Show panels':'Hide panels'; this.syncInsets() }
  async open(thread) {
    this.saveDraft(); this.current = { ...thread }; this.view = null; this.revision++; this.loading=false; this.messageSignature = ''; this.requestSignature = ''
    this.layer.hidden = false; this.root.classList.add('desktop-chat'); this.setQuiet(false); this.hud.toggleSettings(false); this.hud.toggleHelp(false)
    this.$('.chat-title').textContent = thread.title || 'New conversation'
    this.$('.chat-context').textContent = (thread.project || 'Project') + ' · Codex'
    this.$('textarea').value = this.drafts[this.key()] || ''
    this.$('.city-chat-messages').replaceChildren()
    this.$('.chat-requests').replaceChildren()
    this.error(''); this.controls(); this.syncInsets()
    if (thread.id) await this.refresh(true)
    else this.$('.chat-status').textContent = 'Ready · your Codex account'
    this.$('textarea').focus()
  }
  close() { this.saveDraft(); this.revision++; this.layer.hidden=true; this.root.classList.remove('desktop-chat'); this.hud._bottomInset=0; this.hud.setSideWidth(innerWidth<=820?0:334) }
  async request(endpoint, body) {
    const response = await fetch('/api/chat/' + endpoint, body ? { method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body) } : {})
    const value = await response.json(); if (!response.ok) throw new Error(value.error || 'Could not reach Codex.'); return value
  }
  error(message) { const element=this.$('.chat-error'); element.textContent=message; element.hidden=!message }
  controls() { this.$('.chat-send').disabled=this.sending || !!this.view?.running || (this.current?.id && !this.view); this.$('.chat-stop').hidden=!this.view?.canStop; this.$('.chat-send').textContent=this.sending?'Sending…':this.view?.running?'Working…':'Send ↑' }
  async refresh(force=false) {
    if (!this.current?.id || (this.loading && !force)) return
    const revision=this.revision,id=this.current.id; this.loading=true
    try {
      const view=await this.request('thread?id='+encodeURIComponent(id))
      if(revision!==this.revision || id!==this.current?.id)return
      this.view=view; this.render(view); this.controls()
    } catch(error) { if(revision===this.revision)this.error(error.message) }
    finally { if(revision===this.revision)this.loading=false }
  }
  render(view) {
    this.$('.chat-title').textContent=view.title
    this.$('.chat-context').textContent=(this.current.project || 'Project')+' · '+view.model
    this.$('.chat-status').textContent=view.pending.length?'Needs your answer':view.running?(view.activity||'Working…'):(view.error||'Ready')
    const signature=JSON.stringify(view.messages)
    const selection=window.getSelection(), selecting=selection && !selection.isCollapsed && this.$('.city-chat-messages').contains(selection.anchorNode)
    if(signature!==this.messageSignature && !selecting){
      this.messageSignature=signature
      const wrap=this.$('.city-chat-messages'),follow=wrap.scrollHeight-wrap.scrollTop-wrap.clientHeight<70 || !wrap.children.length
      const nodes=view.messages.map(message=>{
        const article=document.createElement('article');article.className='city-message '+message.role
        const heading=document.createElement('div');heading.className='city-message-head';heading.textContent=message.role==='user'?'You':'Codex'
        const copy=document.createElement('button');copy.className='btn ghost';copy.textContent='Copy';copy.onclick=()=>navigator.clipboard.writeText(message.text).catch(()=>this.error('Could not copy that message.'))
        heading.append(copy)
        const body=document.createElement('div');body.className='city-message-body';body.innerHTML=DOMPurify.sanitize(marked.parse(message.text,{ async:false }),{FORBID_TAGS:['img','iframe','style'],FORBID_ATTR:['style']})
        for(const link of body.querySelectorAll('a')){link.removeAttribute('target');link.onclick=event=>{event.preventDefault();navigator.clipboard.writeText(link.href).then(()=>this.hud.toast('Link copied')).catch(()=>{})}}
        article.append(heading,body);return article
      });wrap.replaceChildren(...nodes);if(follow)wrap.scrollTop=wrap.scrollHeight
    }
    const requestSignature=JSON.stringify(view.pending)
    if(requestSignature===this.requestSignature)return
    this.requestSignature=requestSignature;const requests=this.$('.chat-requests');requests.replaceChildren()
    if(view.pending.length)this.setQuiet(false)
    for(const request of view.pending){
      const card=document.createElement('form'),title=document.createElement('strong');title.textContent=request.method.includes('requestUserInput')?'Codex has a question':'Codex needs permission';card.append(title)
      if(request.method==='item/tool/requestUserInput'){
        for(const question of request.questions || []){const label=document.createElement('label');label.textContent=question.question;const input=document.createElement('input');input.name=question.id;input.required=true;input.placeholder=(question.options||[]).map(option=>option.label).join(' / ');label.append(input);card.append(label)}
        const send=document.createElement('button');send.className='btn primary';send.textContent='Reply';card.append(send);card.onsubmit=event=>{event.preventDefault();void this.action('answer',{id:this.current.id,requestId:request.id,answers:Object.fromEntries(new FormData(card))})}
      } else {
        const detail=document.createElement('pre');detail.textContent=[request.reason, request.command, request.cwd, request.networkApprovalContext ? JSON.stringify(request.networkApprovalContext,null,2) : '', request.additionalPermissions ? JSON.stringify(request.additionalPermissions,null,2) : '', request.grantRoot, request.changes ? JSON.stringify(request.changes,null,2) : ''].filter(Boolean).join('\n\n') || 'Allow this change for the current task?';card.append(detail)
        for(const allow of [true,false]){const button=document.createElement('button');button.type='button';button.className='btn '+(allow?'primary':'');button.textContent=allow?'Allow once':'Decline';button.onclick=()=>this.action('answer',{id:this.current.id,requestId:request.id,allow});card.append(button)}
      }requests.append(card)
    }
  }
  async action(endpoint,body) { try{await this.request(endpoint,body);await this.refresh(true)}catch(error){this.error(error.message)} }
  async send() {
    if(this.sending || !this.current || this.view?.running || (this.current.id && !this.view))return
    const text=this.$('textarea').value;if(!text.trim())return
    const current=this.current,key=this.key(),revision=this.revision
    this.sending=true;this.controls();this.error('');this.saveDraft()
    try{
      const result=await this.request('send',{id:current.id,folder:current.folder,text})
      if(this.drafts[key]===text){delete this.drafts[key];save('botcrossing.chat.drafts',this.drafts)}
      if(revision===this.revision){current.id=result.id;if(this.$('textarea').value===text)this.$('textarea').value='';this.saveDraft();await this.refresh(true)}
      this.onChange()
    }catch(error){if(revision===this.revision)this.error(error.message)}
    finally{this.sending=false;this.controls()}
  }
}
