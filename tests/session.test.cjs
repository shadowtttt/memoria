const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const {Marked} = require('marked');
const read = file => fs.readFileSync(new URL('../'+file, 'file:///'+__filename.replaceAll('\\','/')), 'utf8');

function context(fetch) {
  const elements = new Map();
  const ctx = vm.createContext({URL, AbortController, TypeError, Response, setTimeout, clearTimeout, fetch,
    location: {href:'https://private.example/memoria/', hostname:'private.example'},
    S: {}, document: {addEventListener(){},getElementById(id){if(!elements.has(id))elements.set(id,{hidden:true});return elements.get(id);}},
    _throwApiError(r){const e=new Error('HTTP '+r.status);e.status=r.status;throw e;}
  });
  vm.runInContext(read('js/session.js'),ctx);
  return ctx;
}
test('JSON and streaming requests use only same-origin session, not old credentials', async () => {
  const calls=[];
  const ctx=context(async (url,options)=>{
    calls.push({url,options});
    return new Response(calls.length===1?'{}':'data: {"done":true}\n\n', {headers:{'content-type':calls.length===1?'application/json':'text/event-stream'}});
  });
  await vm.runInContext("memoriaRequest('list_conversations')",ctx);
  const stream=await vm.runInContext("memoriaRequest('chat',{message:'synthetic'},true)",ctx);
  assert.match(await stream.text(),/done/);
  for(const {url,options} of calls){
    assert.equal(url,'/memoria/api');
    assert.equal(options.credentials,'same-origin');
    assert.equal(options.redirect,'error');
    assert.equal(options.headers['X-Memoria-Client'],'session');
    assert.equal(Object.keys(options.headers).length,2);
  }
});
test('expired sessions and unexpected login HTML show a reconnect notice',async()=>{
  for(const response of [new Response('',{status:401}),new Response('',{status:403}),new Response('<html>login</html>',{headers:{'content-type':'text/html'}})]){
    const ctx=context(async()=>response);
    await assert.rejects(vm.runInContext("memoriaRequest('list_models')",ctx),e=>e.status===401);
    assert.equal(ctx.document.getElementById('session-notice').hidden,false);
  }
});
test('HTTP errors keep their status and request cancellation remains available',async()=>{
  const ctx=context(async()=>new Response('{}',{status:500}));
  await assert.rejects(vm.runInContext("memoriaRequest('list_models')",ctx),e=>e.status===500);
  ctx.fetch=async (url,{signal})=>{assert.equal(signal,ctx.controller.signal);return new Response('data: done',{headers:{'content-type':'text/event-stream'}});};
  ctx.controller=new AbortController();
  await vm.runInContext("memoriaRequest('chat',{},true,controller)",ctx);
});
test('public Pages never contacts the private API or reads cached conversations',async()=>{
  const ctx=context(()=>{throw new Error('unexpected request');});
  const pub=vm.createContext({...ctx,location:{href:'https://owner.github.io/memoria/',hostname:'owner.github.io'}});
  vm.runInContext(read('js/session.js'),pub);
  await assert.rejects(vm.runInContext("memoriaRequest('list_conversations')",pub),e=>e.status===401);
  assert.match(read('js/core.js'),/if\(!MEMORIA_MANAGED\)return/);
});
test('markdown renders with the deployed Marked version and cannot run raw HTML',()=>{
  const source=read('js/chat.js');
  const start=source.indexOf('function safeMessageUrl');
  const end=source.indexOf('// Tool block renderer');
  const ctx=vm.createContext({marked:new Marked(),window:{},S:{streaming:false},location:{href:'https://private.example/memoria/'},URL,
    E:s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;'),
    btoa:s=>Buffer.from(s,'binary').toString('base64'),unescape,encodeURIComponent});
  vm.runInContext(source.slice(start,end)+'\n_initMarked();',ctx);
  const render=s=>ctx.marked.parse(s);
  assert.match(render('[hello](https://example.com)'),/>hello<\/a>/);
  assert.match(render('```js\nconst x = 1;\n```'),/const x = 1;/);
  assert.match(render('```html\n<h1>preview</h1>\n```'),/sandbox="allow-scripts allow-modals allow-popups"/);
  assert.doesNotMatch(render('<img src=x onerror=alert(1)>'),/<img/);
  assert.doesNotMatch(render('[bad](javascript:alert%281%29)'),/href=/);
  assert.doesNotMatch(render('![bad](javascript:alert%281%29)'),/<img/);
});
test('service worker never caches private responses or deletes unrelated caches',async()=>{
  const handlers={},removed=[];
  const ctx=vm.createContext({self:{addEventListener:(name,fn)=>handlers[name]=fn,clients:{claim:async()=>{}}},
    caches:{keys:async()=>['memoria-v29','another-app-cache'],delete:async k=>removed.push(k)}});
  vm.runInContext(read('sw.js'),ctx);
  await new Promise((resolve,reject)=>handlers.activate({waitUntil:p=>p.then(resolve,reject)}));
  assert.deepEqual(removed,['memoria-v29']);
  assert.equal(handlers.fetch,undefined);
});
