const S={apiUrl:localStorage.getItem('memoria_url')||'',pin:localStorage.getItem('memoria_pin')||'',cid:null,convs:[],allC:[],msgs:[],allMsgs:[],treeMeta:[],hasMoreOlder:false,nextBeforeId:null,hasMoreAfter:false,isPartialView:false,loadingOlder:false,streaming:false,ac:null,models:[],provs:[],stk:[],selModel:localStorage.getItem('memoria_model')||'',attachments:[],curFolder:null,searchQ:'',searchResults:null,searchTimer:null,_hlMsgId:null,recallDebug:localStorage.getItem('memoria_recall_debug')==='1',convDatesCache:{},convCalShown:null,convCalCid:null};
function _invalidateConvDates(cid){if(cid&&S.convDatesCache)delete S.convDatesCache[cid];}

// === IndexedDB 本地缓存层 ===
const IDB={db:null,NAME:'memoria_cache',VER:1};
function _idbOpen(){return new Promise((res,rej)=>{if(IDB.db)return res(IDB.db);const rq=indexedDB.open(IDB.NAME,IDB.VER);rq.onupgradeneeded=e=>{const db=e.target.result;if(!db.objectStoreNames.contains('convs'))db.createObjectStore('convs',{keyPath:'id'});};rq.onsuccess=e=>{IDB.db=e.target.result;res(IDB.db);};rq.onerror=()=>rej(rq.error);});}
async function _idbGet(cid){try{const db=await _idbOpen();const r=await new Promise((res)=>{const tx=db.transaction('convs','readonly');const st=tx.objectStore('convs');const rq=st.get(cid);rq.onsuccess=()=>res(rq.result||null);rq.onerror=()=>res(null);});if(!r)return null;/* 旧 schema 失效 */if((r.schema_v||1)<2){await _idbDel(cid);return null;}return r;}catch(e){return null;}}
async function _idbPut(cid,msgs,treeMeta,paging){try{const db=await _idbOpen();const _clone=typeof structuredClone==='function'?structuredClone:o=>JSON.parse(JSON.stringify(o));const data={id:cid,schema_v:2,msgs:_clone(msgs||[]),treeMeta:_clone(treeMeta||[]),hasMoreOlder:!!(paging&&paging.hasMoreOlder),nextBeforeId:paging?.nextBeforeId||null,ts:Date.now()};return new Promise((res,rej)=>{const tx=db.transaction('convs','readwrite');const st=tx.objectStore('convs');st.put(data);tx.oncomplete=()=>{res(true);_idbTrim();};tx.onerror=()=>res(false);});}catch(e){return false;}}
async function _idbTrim(){try{const db=await _idbOpen();const tx=db.transaction('convs','readonly');const st=tx.objectStore('convs');const all=await new Promise(r=>{const rq=st.getAll();rq.onsuccess=()=>r(rq.result||[]);rq.onerror=()=>r([]);});if(all.length<=100)return;all.sort((a,b)=>b.ts-a.ts);const toDelete=all.slice(100);const tx2=db.transaction('convs','readwrite');const st2=tx2.objectStore('convs');toDelete.forEach(d=>st2.delete(d.id));}catch(e){}}
async function _idbDel(cid){try{const db=await _idbOpen();return new Promise((res)=>{const tx=db.transaction('convs','readwrite');tx.objectStore('convs').delete(cid);tx.oncomplete=()=>res(true);tx.onerror=()=>res(false);});}catch(e){return false;}}
/* by-cid 缓存助手：旧流收尾不污染当前对话用 */
async function _cacheConvById(cid,msgs,treeMeta,paging){
  if(!cid)return;
  return _idbPut(cid,msgs||[],treeMeta||[],paging||{});
}
/* 增量 append：旧流 abort 时把 partial 单条加入 IDB（不动 S）*/
async function _appendCachedMsgById(cid,msg){
  if(!cid||!msg)return;
  const old=await _idbGet(cid);
  if(!old||!old.msgs)return;  /* 没缓存就跳过，不强行建 */
  const idx=msg.id?old.msgs.findIndex(m=>m.id===msg.id):-1;
  let msgs=old.msgs.slice();
  if(idx>=0)msgs[idx]=Object.assign({},msgs[idx],msg);
  else msgs.push(msg);
  if(msgs.length>50)msgs=msgs.slice(-50);
  return _idbPut(cid,msgs,old.treeMeta||[],{hasMoreOlder:!!old.hasMoreOlder,nextBeforeId:old.nextBeforeId||null});
}
function _cacheConv(){if(!S.cid)return;if(S.isPartialView)return;/* partial 视图不写主缓存 */
/* 只存 latest 50 条作为 cache，避免用户 loadOlder 后 cache 体积膨胀、首屏变慢 */
const latest=S.msgs.slice(-50);const cacheHasMoreOlder=S.msgs.length>50||S.hasMoreOlder;const cacheNextBeforeId=latest.length>0?latest[0].id:null;return _cacheConvById(S.cid,latest,S.treeMeta,{hasMoreOlder:cacheHasMoreOlder,nextBeforeId:cacheNextBeforeId});}
// === 缓存层结束 ===
function _buildChildMap(all){const m=new Map();all.forEach(msg=>{const p=msg.parent_id||null;if(!m.has(p))m.set(p,[]);m.get(p).push(msg);});return m;}
function _rebuildActivePath(all){if(!all||!all.length)return[];const cm=_buildChildMap(all);const r=[];let pid=null;while(true){const ch=cm.get(pid)||[];if(!ch.length)break;let ac=ch.find(c=>c.is_active)||ch[0];ac.sibling_count=ch.length;if(ch.length>1)ac.siblings=ch.map(c=>({id:c.id,branch_index:c.branch_index}));r.push(ac);pid=ac.id;}return r;}
function _storeTree(d){
  if(d?.has_more!==undefined||d?.tree_meta!==undefined){
    /* 新协议（含 around）*/
    S.msgs=d?.messages||[];S.treeMeta=d?.tree_meta||[];
    S.hasMoreOlder=!!d?.has_more;S.nextBeforeId=d?.next_before_id||null;
    S.hasMoreAfter=!!d?.has_more_after;S.isPartialView=!!d?.is_partial_view;
    S.allMsgs=[];
  }else if(d?.all_messages){
    /* 旧协议兼容（仅旁路触发）*/
    S.allMsgs=d.all_messages;S.msgs=_rebuildActivePath(S.allMsgs);
    S.treeMeta=[];S.hasMoreOlder=false;S.nextBeforeId=null;S.hasMoreAfter=false;S.isPartialView=false;
  }else{
    S.msgs=d?.messages||[];S.allMsgs=[];
    S.treeMeta=[];S.hasMoreOlder=false;S.nextBeforeId=null;S.hasMoreAfter=false;S.isPartialView=false;
  }
}
function _mergeOlderPage(older,hasMore,nextBeforeId){
  if(older&&older.length){
    const known=new Set(S.msgs.map(m=>m.id));
    const prepend=older.filter(m=>m.id&&!known.has(m.id));
    S.msgs=prepend.concat(S.msgs);
  }
  S.hasMoreOlder=!!hasMore;S.nextBeforeId=nextBeforeId;
}
/* 纯函数：不依赖全局，给旧流收尾 / by-cid 合并复用 */
function _mergeNewerInto(msgs,latest){
  if(!latest||!latest.length)return msgs;
  let out=msgs.slice();
  /* 1) 服务端 latest 里的 user 消息，按 content + _localCreatedAt 近似时间匹配本地 temp 占位 */
  for(const srv of latest){
    if(srv.role!=='user')continue;
    const tempIdx=out.findIndex(m=>m.role==='user'&&m.id==null&&m.content===srv.content&&m._localCreatedAt&&Math.abs(new Date(m._localCreatedAt)-new Date(srv.created_at))<60000);
    if(tempIdx>=0){const merged=Object.assign({},out[tempIdx],srv);delete merged._localCreatedAt;delete merged._unconfirmed;out[tempIdx]=merged;}
  }
  /* 2) 按 id upsert */
  const idx=new Map();
  out.forEach((m,i)=>{if(m.id)idx.set(m.id,i);});
  for(const m of latest){
    if(idx.has(m.id)){const i=idx.get(m.id);out[i]=Object.assign({},out[i],m);}
    else if(!out.some(x=>x.id===m.id)){out.push(m);idx.set(m.id,out.length-1);}
  }
  /* 3) 仍 id==null 的 user 消息标 _unconfirmed（让 UI 给"未送达"+重发按钮）*/
  out=out.map(m=>(m.role==='user'&&m.id==null&&!m._unconfirmed)?Object.assign({},m,{_unconfirmed:true}):m);
  return out;
}
/* wrapper：保持老接口语义 */
function _mergeNewerPage(latest){
  if(!latest||!latest.length)return;
  S.msgs=_mergeNewerInto(S.msgs,latest);
  /* 不动 hasMoreOlder/nextBeforeId */
}
function _mergeTreeMeta(meta){
  if(!meta||!meta.length)return;
  const map=new Map();(S.treeMeta||[]).forEach(t=>{if(t&&t.id)map.set(t.id,t);});
  for(const t of meta){if(t&&t.id)map.set(t.id,t);}
  S.treeMeta=Array.from(map.values());
}
async function _resetToLatest(){
  if(!S.cid)return;
  const d=await api('get_messages',{conversation_id:S.cid,limit:50});
  _storeTree(d);_cacheConv();
}
/* 日期分隔工具 */
function _dayKey(ts){if(!ts)return null;const d=new Date(ts);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function _dateLabel(ts){const t=new Date(ts),now=new Date();const same=(a,b)=>a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate();const yest=new Date(now);yest.setDate(yest.getDate()-1);if(same(t,now))return '今天';if(same(t,yest))return '昨天';const days=Math.floor((now-t)/864e5);const wd=['周日','周一','周二','周三','周四','周五','周六'][t.getDay()];if(days<7)return wd;if(t.getFullYear()===now.getFullYear())return (t.getMonth()+1)+'月'+t.getDate()+'日';return t.getFullYear()+'年'+(t.getMonth()+1)+'月'+t.getDate()+'日';}
document.addEventListener('DOMContentLoaded',()=>{_initTheme();const inp=document.getElementById('msg-input');inp.value='';if(!S.apiUrl){openSet();goSP('conn');}else{Promise.all([loadConvs(),loadMdls()]);}aR(inp);updSub();/* #20 Service Worker registration */if('serviceWorker' in navigator){navigator.serviceWorker.register('sw.js').catch(()=>{});}});
function _initTheme(){const t=localStorage.getItem('memoria_theme')||'light';document.documentElement.setAttribute('data-theme',t);if(t==='dark')document.querySelector('meta[name="theme-color"]').content='#1A1A1A';const sw=document.getElementById('theme-sw');if(sw&&t==='dark')sw.classList.add('on');const rs=document.getElementById('recall-debug-sw');if(rs)rs.classList.toggle('on',S.recallDebug);}
function toggleTheme(){const cur=document.documentElement.getAttribute('data-theme');const next=cur==='dark'?'light':'dark';document.documentElement.setAttribute('data-theme',next);localStorage.setItem('memoria_theme',next);document.querySelector('meta[name="theme-color"]').content=next==='dark'?'#1A1A1A':'#F5F5F0';const sw=document.getElementById('theme-sw');if(sw)sw.classList.toggle('on',next==='dark');document.querySelectorAll('.html-preview-frame').forEach(f=>{if(f.srcdoc){f.srcdoc='';f.style.height='200px';const wrap=f.closest('.html-preview-wrap');if(wrap)delete wrap.dataset.observed;}});_initHtmlPreviews();}
function toggleRecallDebug(){S.recallDebug=!S.recallDebug;localStorage.setItem('memoria_recall_debug',S.recallDebug?'1':'0');const sw=document.getElementById('recall-debug-sw');if(sw)sw.classList.toggle('on',S.recallDebug);rMsgs();}

const SB_ANON='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml0ZWFlbXhydWxrY2Frd3B1dWptIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyMTkwOTksImV4cCI6MjA4Nzc5NTA5OX0.1hkMSX8weGk6t55BbcKFTkjJN72APl4JNvqdfWedpw0';
async function _throwApiError(r){let text='';try{text=await r.text();}catch(e){}let msg=text;try{const d=JSON.parse(text);msg=d.error||d.message||text;}catch(e){}const err=new Error(msg||('HTTP '+r.status));err.status=r.status;err.body=text;throw err;}
function apiErrMsg(e,fallback='失败'){if(e?.name==='AbortError')return'请求超时';if(e?.status===401)return'PIN 不正确或未保存';if(e?.status===400&&String(e.message||'').includes('Unknown action'))return'后端还不支持这个接口';if(e?.status)return fallback+'：HTTP '+e.status;return fallback;}
async function api(a,p={},s=false,externalAc){if(!S.apiUrl)return null;const h={'Content-Type':'application/json','Authorization':'Bearer '+SB_ANON};if(S.pin)h['x-app-pin']=S.pin;const b=JSON.stringify({action:a,...p});if(s){const ac=externalAc||new AbortController();if(!externalAc)S.ac=ac;const _t=setTimeout(()=>ac.abort(),60000);const r=await fetch(S.apiUrl,{method:'POST',headers:h,body:b,signal:ac.signal});clearTimeout(_t);if(!r.ok)await _throwApiError(r);return r;}const _ac=new AbortController();const _t=setTimeout(()=>_ac.abort(),30000);const r=await fetch(S.apiUrl,{method:'POST',headers:h,body:b,signal:_ac.signal});clearTimeout(_t);if(!r.ok)await _throwApiError(r);return r.json();}
function E(s){return s===undefined||s===null?'':String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function toast(m){const t=document.getElementById('toast');t.textContent=m;t.classList.add('on');setTimeout(()=>t.classList.remove('on'),2e3);}
function cMo(){document.getElementById('cf-mo').classList.remove('on');}
function confirm_(t,tx,fn){document.getElementById('cf-t').textContent=t;document.getElementById('cf-tx').textContent=tx;document.getElementById('cf-ok').onclick=()=>{cMo();fn();};document.getElementById('cf-mo').classList.add('on');}
function tgEl(id){const e=document.getElementById(id);e.style.display=e.style.display==='none'?'block':'none';if(id==='m-form'&&e.style.display!=='none'){const sel=document.getElementById('m-prov');sel.innerHTML=S.provs.map(p=>'<option value="'+p.id+'">'+E(p.name)+'</option>').join('');}}
function hEl(id){document.getElementById(id).style.display='none';}
function scr(force){const c=document.getElementById('msgs-wrap');if(c._userScrolled&&!force)return;const atBottom=c.scrollHeight-c.scrollTop-c.clientHeight<150;if(force||atBottom)requestAnimationFrame(()=>c.scrollTop=c.scrollHeight);}
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&S.streaming){setTimeout(()=>scr(true),100);}});
document.addEventListener('DOMContentLoaded',()=>{const mw=document.getElementById('msgs-wrap');if(mw){let _t;mw.addEventListener('scroll',()=>{if(!S.streaming)return;clearTimeout(_t);_t=setTimeout(()=>{const ab=mw.scrollHeight-mw.scrollTop-mw.clientHeight<150;mw._userScrolled=!ab;},100);},{passive:true});}});
function aR(e){if(!e)return;e.style.height='auto';e.style.height=Math.min(e.scrollHeight,140)+'px';}
function hIK(e){if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){e.preventDefault();send();}}
function gMdl(){return S.selModel||S.models.find(m=>m.is_default)?.model_id||'anthropic/claude-sonnet-4';}
function updSub(){const mid=gMdl(),m=S.models.find(x=>x.model_id===mid);const tbm=document.getElementById('tb-model');if(tbm)tbm.textContent=m?.display_name||mid.split('/').pop()||'选择模型';}
function updSendBtn(){const b=document.getElementById('send-btn'),v=document.getElementById('msg-input').value.trim()||S.attachments.length>0;b.classList.toggle('ready',!!v);}
document.getElementById('msg-input').addEventListener('input',function(){updSendBtn();});

// File attachments
function onImgPick(inp){const files=Array.from(inp.files);inp.value='';for(const f of files){if(f.size>10*1024*1024){toast('图片不能超过 10MB');continue;}const item={file:f,type:'image',name:f.name,size:f.size};const rd=new FileReader();rd.onload=e=>{item.preview=e.target.result;S.attachments.push(item);rAttach();};rd.readAsDataURL(f);}}
async function onFilePick(inp){const f=inp.files[0];if(!f)return;inp.value='';if(f.size>20*1024*1024){toast('文件不能超过 20MB');return;}toast('正在读取文档...');try{const text=await extractFileText(f);if(!text){toast('不支持此格式或提取失败');return;}const item={type:'document',name:f.name,size:f.size,text:text.substring(0,30000)};S.attachments.push(item);rAttach();toast(f.name+' 已添加');}catch(e){toast('文件读取失败');}}
function rAttach(){const el=document.getElementById('attach-preview');if(!S.attachments.length){el.classList.remove('on');el.innerHTML='';updSendBtn();return;}el.classList.add('on');el.innerHTML=S.attachments.map((a,i)=>{const icon=a.type==='image'&&a.preview?'<img src="'+a.preview+'">':'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--t3)" stroke-width="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>';const sz=a.type==='document'&&a.text?(a.text.length>1000?Math.round(a.text.length/1000)+'k字符':a.text.length+'字符'):a.size<1024?a.size+'B':a.size<1024*1024?(a.size/1024).toFixed(0)+'KB':(a.size/1024/1024).toFixed(1)+'MB';return '<div class="att-item">'+icon+'<span class="att-name">'+E(a.name)+' <span style="color:var(--t4)">'+sz+'</span></span><button class="att-rm" onclick="rmAttach('+i+')"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button></div>';}).join('');updSendBtn();}
function rmAttach(i){S.attachments.splice(i,1);rAttach();}

// Image compression
function compressImage(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=async e=>{const MAX=1200;try{/* Fast path: createImageBitmap is non-blocking */if(typeof createImageBitmap==='function'){const blob=new Blob([e.target.result]);const bmp=await createImageBitmap(blob);let w=bmp.width,h=bmp.height;if(w>MAX||h>MAX){if(w>h){h=Math.round(h*MAX/w);w=MAX;}else{w=Math.round(w*MAX/h);h=MAX;}}/* Prefer OffscreenCanvas to avoid main-thread layout */if(typeof OffscreenCanvas!=='undefined'){const oc=new OffscreenCanvas(w,h);const ctx=oc.getContext('2d');ctx.drawImage(bmp,0,0,w,h);bmp.close();const oBlob=await oc.convertToBlob({type:'image/jpeg',quality:0.7});const r2=new FileReader();r2.onload=()=>resolve(r2.result);r2.onerror=reject;r2.readAsDataURL(oBlob);return;}/* Fallback to regular canvas */const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;const ctx=canvas.getContext('2d');ctx.drawImage(bmp,0,0,w,h);bmp.close();resolve(canvas.toDataURL('image/jpeg',0.7));return;}}catch(ex){/* fall through to legacy */}/* Legacy path */const img=new Image();img.onload=()=>{let w=img.width,h=img.height;if(w>MAX||h>MAX){if(w>h){h=Math.round(h*MAX/w);w=MAX;}else{w=Math.round(w*MAX/h);h=MAX;}}const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0,w,h);resolve(canvas.toDataURL('image/jpeg',0.7));};img.onerror=reject;img.src=e.target.result;};reader.onerror=reject;reader.readAsDataURL(file);});}
function viewImg(url){const d=document.createElement('div');d.className='msg-img-full';d.onclick=()=>d.remove();d.innerHTML='<img src="'+url+'">';document.body.appendChild(d);}

// Document text extraction
function loadLib(url){return new Promise((res,rej)=>{if(document.querySelector('script[src="'+url+'"]')){res();return;}const s=document.createElement('script');s.src=url;s.onload=res;s.onerror=rej;document.head.appendChild(s);})}
async function extractFileText(file){const ext=file.name.split('.').pop().toLowerCase();if(['txt','md','csv','json'].includes(ext))return await file.text();if(ext==='pdf'){try{await loadLib('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';const ab=await file.arrayBuffer();const pdf=await pdfjsLib.getDocument({data:ab}).promise;let t='';for(let i=1;i<=pdf.numPages;i++){const pg=await pdf.getPage(i);const tc=await pg.getTextContent();t+=tc.items.map(x=>x.str).join(' ')+'\n';}return t;}catch(e){return null;}}if(['doc','docx'].includes(ext)){try{await loadLib('https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.8.0/mammoth.browser.min.js');const ab=await file.arrayBuffer();const r=await mammoth.extractRawText({arrayBuffer:ab});return r.value;}catch(e){return null;}}if(ext==='xlsx'){try{await loadLib('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js');const ab=await file.arrayBuffer();const wb=XLSX.read(ab,{type:'array'});let t='';for(const sn of wb.SheetNames){t+='['+sn+']\n'+XLSX.utils.sheet_to_csv(wb.Sheets[sn])+'\n\n';}return t;}catch(e){return null;}}return null;}

// Settings nav
function openSet(){document.getElementById('settings').classList.add('on');S.stk=['home'];document.querySelectorAll('.sp').forEach(p=>p.classList.remove('on','out'));document.getElementById('sp-home').classList.add('on');}
function openQuickSP(pg){document.getElementById('settings').classList.add('on');S.stk=[pg];document.querySelectorAll('.sp').forEach(p=>p.classList.remove('on','out'));document.getElementById('sp-'+pg).classList.add('on');if(pg==='models'){loadProvs();loadMdlSet();}if(pg==='notes')loadNotes();if(pg==='avatar')loadAvatarSettings();}
let _termTimer=null;
function fetchTerminal(){fetch('https://api.catdial.org/terminal/').then(r=>r.text()).then(t=>{const el=document.getElementById('terminal-content');if(!el)return;const bd=document.getElementById('terminal-bd');const atBot=bd.scrollHeight-bd.scrollTop-bd.clientHeight<50;el.textContent=t;if(atBot)bd.scrollTop=bd.scrollHeight;}).catch(()=>{});}
function _termStart(){fetchTerminal();_termTimer=setInterval(fetchTerminal,5000);}
function _termStop(){if(_termTimer){clearInterval(_termTimer);_termTimer=null;}const el=document.getElementById('terminal-content');if(el)el.textContent='';}
function closeSet(){const el=document.getElementById('settings');el.classList.remove('on');S.stk=[];_termStop();}
function goSP(pg){if(!document.getElementById('settings').classList.contains('on'))openSet();const cur=S.stk[S.stk.length-1];if(cur){const ce=document.getElementById('sp-'+cur);if(ce){ce.classList.add('out');ce.classList.remove('on');}}S.stk.push(pg);const el=document.getElementById('sp-'+pg);if(el){el.classList.remove('out');el.classList.add('on');}if(pg==='prov')loadProvs();if(pg==='models'){loadProvs();loadMdlSet();}if(pg==='modeltasks')loadModelTasks();if(pg==='mcp')loadMCPs();if(pg==='notes')loadNotes();if(pg==='core')loadCore();if(pg==='conn'){document.getElementById('s-url').value=S.apiUrl;document.getElementById('s-pin').value=S.pin;}if(pg==='data')loadData();if(pg==='memories')loadMemCards(true);if(pg==='usage')loadUsageStats();if(pg==='chatparams')loadChatParams();if(pg==='terminal')_termStart();}
function backSP(){if(S.stk.length<=1){closeSet();return;}const cur=S.stk.pop();document.getElementById('sp-'+cur).classList.remove('on');if(cur==='terminal')_termStop();const prev=S.stk[S.stk.length-1];document.getElementById('sp-'+prev).classList.remove('out');document.getElementById('sp-'+prev).classList.add('on');}

