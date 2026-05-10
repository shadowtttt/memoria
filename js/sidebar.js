// Sidebar
function tgSb(s){document.getElementById('sidebar').classList.toggle('on',!!s);document.getElementById('sb-overlay').classList.toggle('on',!!s);}
function saveConn(){S.apiUrl=document.getElementById('s-url').value.trim();S.pin=document.getElementById('s-pin').value.trim();localStorage.setItem('memoria_url',S.apiUrl);localStorage.setItem('memoria_pin',S.pin);toast('已保存');backSP();Promise.all([loadConvs(),loadMdls()]);}

// Conversations
async function loadConvs(){try{const cached=localStorage.getItem('memoria_convs');if(cached){try{S.allC=JSON.parse(cached);filterConvs();rFolderBar();}catch(e){}}const d=await api('list_conversations');S.allC=d?.conversations||[];localStorage.setItem('memoria_convs',JSON.stringify(S.allC));filterConvs();rFolderBar();}catch(e){}}
function filterConvs(){let cs=[...S.allC];if(S.curFolder==='__none__')cs=cs.filter(c=>!c.folder);else if(S.curFolder)cs=cs.filter(c=>c.folder===S.curFolder);const q=S.searchQ;if(q)cs=cs.filter(c=>(c.title||'').toLowerCase().includes(q.toLowerCase()));S.convs=cs;if(S.searchResults)rSearchView();else rConvs();}
function onSearchInput(v){S.searchQ=v.trim();document.getElementById('sb-search-clear').style.display=v?'flex':'none';filterConvs();clearTimeout(S.searchTimer);if(S.searchQ.length>=2){S.searchTimer=setTimeout(()=>doFullSearch(S.searchQ),350);}else{S.searchResults=null;filterConvs();}}
async function doFullSearch(q){if(q!==S.searchQ)return;try{const d=await api('search_messages',{query:q,limit:20});if(q!==S.searchQ)return;S.searchResults=d?.results||[];rSearchView();}catch(e){S.searchResults=[];rSearchView();}}
function clearSearch(){S.searchQ='';S.searchResults=null;const inp=document.getElementById('sb-search-input');if(inp)inp.value='';document.getElementById('sb-search-clear').style.display='none';filterConvs();}
function hlText(text,q){if(!q||!text)return E(text);const terms=(q.match(/[\u4e00-\u9fff]+|[a-zA-Z0-9]+/g)||[q]);let h=E(text);for(const t of terms){const re=new RegExp('('+t.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+')','gi');h=h.replace(re,'<mark>$1</mark>');}return h;}
function rSearchView(){const l=document.getElementById('conv-list');const q=S.searchQ;let html='';const titleMatches=S.convs;if(titleMatches.length>0){html+='<div class="sr-head"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>对话</div>';html+=titleMatches.slice(0,8).map(c=>{const fTag=c.folder?'<div class="ci-folder"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>'+E(c.folder)+'</div>':'';return '<div class="ci'+(c.id===S.cid?' on':'')+'" onclick="loadConv(\''+c.id+'\')"><span class="ci-t">'+hlText(c.title||'未命名',q)+'</span>'+fTag+'</div>';}).join('');}const msgResults=S.searchResults||[];if(msgResults.length>0){html+='<div class="sr-head" style="margin-top:4px"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>消息 ('+msgResults.length+')</div>';html+=msgResults.map(r=>{const roleLabel=r.role==='user'?'我':'AI';return '<div class="sr-item" onclick="goToMsg(\''+r.conversation_id+'\',\''+r.message_id+'\')"><div class="sr-conv"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>'+E(r.conversation_title)+'<span class="sr-role">· '+roleLabel+'</span></div><div class="sr-snip">'+hlText(r.snippet,q)+'</div></div>';}).join('');}if(!html){html='<div style="text-align:center;color:var(--t4);font-size:14px;padding:32px">'+(S.searchResults!==null?'无搜索结果':'搜索中...')+'</div>';}l.innerHTML=html;}
async function goToMsg(cid,mid){S._hlMsgId=mid;clearSearch();await loadConv(cid);
/* 目标不在已加载范围 → 用 around 拉目标周围 */
if(!S.msgs.some(m=>m.id===mid)){
  try{const d=await api('get_messages_around',{message_id:mid,window:25});_storeTree(d);rMsgs();/* partial 视图，_cacheConv 内部守卫会跳过缓存写入 */}
  catch(e){if(e?.body&&String(e.body).includes('inactive')){toast('该消息在已切换走的旧分支');}else{toast('定位失败');}S._hlMsgId=null;return;}
}
setTimeout(()=>{const el=document.querySelector('.msg[data-id="'+mid+'"]');if(el){el.scrollIntoView({behavior:'smooth',block:'center'});el.classList.add('hl');setTimeout(()=>el.classList.remove('hl'),2500);}S._hlMsgId=null;},200);}
function getTimeGroup(d){const now=new Date(),t=new Date(d);const ds=Math.floor((now-t)/864e5);const sameY=now.getFullYear()===t.getFullYear();if(ds<1&&now.getDate()===t.getDate())return '今天';const yd=new Date(now);yd.setDate(yd.getDate()-1);if(t.getDate()===yd.getDate()&&t.getMonth()===yd.getMonth()&&t.getFullYear()===yd.getFullYear())return '昨天';if(ds<7)return '本周';if(ds<30)return '本月';if(sameY)return '更早';return t.getFullYear()+'年';}
const _CONV_BATCH=50;let _convGroups=[];let _convRendered=0;
function rConvs(){const l=document.getElementById('conv-list');if(!S.convs.length){l.innerHTML='<div style="text-align:center;color:var(--t4);font-size:14px;padding:32px">暂无对话</div>';_convGroups=[];_convRendered=0;return;}_convGroups=[];let lastG='';for(const c of S.convs){const g=getTimeGroup(c.updated_at);if(g!==lastG){_convGroups.push({type:'label',text:g});lastG=g;}_convGroups.push({type:'item',c});}_convRendered=0;l.innerHTML='';_renderConvBatch();}
function _renderConvBatch(){const l=document.getElementById('conv-list');const end=Math.min(_convRendered+_CONV_BATCH,_convGroups.length);const frag=document.createDocumentFragment();for(let i=_convRendered;i<end;i++){const g=_convGroups[i];if(g.type==='label'){const d=document.createElement('div');d.className='cg-label';d.textContent=g.text;frag.appendChild(d);}else{const c=g.c;const d=document.createElement('div');d.className='ci'+(c.id===S.cid?' on':'');d.setAttribute('onclick',"loadConv('"+c.id+"')");d.dataset.id=c.id;let h='<span class="ci-t">'+E(c.title||'未命名')+'</span>';if(c.folder)h+='<div class="ci-folder"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>'+E(c.folder)+'</div>';d.innerHTML=h;frag.appendChild(d);}}_convRendered=end;/* Remove old sentinel */const old=l.querySelector('.conv-more');if(old)old.remove();l.appendChild(frag);if(_convRendered<_convGroups.length){const more=document.createElement('div');more.className='conv-more';more.style.cssText='text-align:center;padding:8px;font-size:13px;color:var(--t4)';more.textContent='滚动加载更多…';l.appendChild(more);}}
document.getElementById('conv-list').addEventListener('scroll',function(){if(_convRendered>=_convGroups.length)return;const el=this;if(el.scrollHeight-el.scrollTop-el.clientHeight<100)_renderConvBatch();},{passive:true});
function searchConv(q){S.searchQ=q;filterConvs();}
function rFolderBar(){const el=document.getElementById('folder-bar');if(!el)return;const folders=new Set();S.allC.forEach(c=>{if(c.folder)folders.add(c.folder);});if(folders.size===0){el.innerHTML='';return;}const arr=[...folders].sort();el.innerHTML='<button class="fc-chip'+(S.curFolder===null?' on':'')+'" onclick="setFolder(null)">全部</button>'+arr.map(f=>'<button class="fc-chip'+(S.curFolder===f?' on':'')+'" onclick="setFolder(\''+E(f)+'\')">'+E(f)+'</button>').join('')+'<button class="fc-chip'+(S.curFolder==='__none__'?' on':'')+'" onclick="setFolder(\'__none__\')">未分组</button>';}
function setFolder(f){S.curFolder=f;filterConvs();rFolderBar();}
async function loadConv(id){S.cid=id;tgSb(0);filterConvs();const inp=document.getElementById('msg-input');inp.value='';aR(inp);S.attachments=[];rAttach();updSendBtn();const c=S.allC.find(c=>c.id===id);document.getElementById('h-t').textContent=c?.title||'对话';try{const cached=await _idbGet(id);if(cached&&cached.msgs&&cached.msgs.length){S.msgs=cached.msgs;S.treeMeta=cached.treeMeta||[];S.hasMoreOlder=!!cached.hasMoreOlder;S.nextBeforeId=cached.nextBeforeId||null;S.hasMoreAfter=false;S.isPartialView=false;S.allMsgs=[];rMsgs();api('get_messages',{conversation_id:id,limit:50}).then(d=>{if(S.cid!==id)return;_storeTree(d);_mergeLocalMeta(cached.msgs);rMsgs();_cacheConv();}).catch(()=>{});}else{/* Show skeleton while loading */const mc=document.getElementById('msgs');const sk=document.createElement('div');sk.className='msg-skel';/* 用 createElement 构造原 skeleton 结构，避免 innerHTML */
function _mkSk(parts){const w=document.createElement('div');w.className='sk-wrap';if(parts.avatar){const a=document.createElement('div');a.className='sk-avatar';w.appendChild(a);}const l=document.createElement('div');l.className='sk-lines';for(const wd of parts.rows){const r=document.createElement('div');r.className='sk-row';r.style.width=wd;l.appendChild(r);}w.appendChild(l);return w;}
sk.appendChild(_mkSk({rows:['45%','70%']}));sk.appendChild(_mkSk({avatar:true,rows:['80%','60%','40%']}));mc.replaceChildren(sk);
const d=await api('get_messages',{conversation_id:id,limit:50});if(S.cid!==id)return;_storeTree(d);rMsgs();_cacheConv();}}catch(e){toast('加载失败');}}
function _mergeLocalMeta(cachedMsgs){if(!cachedMsgs)return;const metaMap=new Map();cachedMsgs.forEach(m=>{if(m.id&&(m._thinkDuration!==undefined||m._firstThink||m._resumeThink||m._memoryRecallDebug)){metaMap.set(m.id,{_thinkDuration:m._thinkDuration,_firstThink:m._firstThink,_resumeThink:m._resumeThink,_memoryRecallDebug:m._memoryRecallDebug});}});S.msgs.forEach(m=>{if(m.id&&metaMap.has(m.id)){const meta=metaMap.get(m.id);if(meta._thinkDuration!==undefined)m._thinkDuration=meta._thinkDuration;if(meta._firstThink)m._firstThink=meta._firstThink;if(meta._resumeThink)m._resumeThink=meta._resumeThink;if(meta._memoryRecallDebug)m._memoryRecallDebug=meta._memoryRecallDebug;}});}
function newConv(){S.cid=null;S.msgs=[];document.getElementById('h-t').textContent='新对话';rMsgs();filterConvs();tgSb(0);const inp=document.getElementById('msg-input');inp.value='';aR(inp);S.attachments=[];rAttach();updSendBtn();inp.focus();}
async function delConv(id){confirm_('删除对话','确定要删除？',async()=>{try{await api('delete_conversation',{conversation_id:id});_idbDel(id);if(S.cid===id)newConv();loadConvs();toast('已删除');}catch(e){toast('失败');}});}
async function renConv(id){const item=document.querySelector('.ci[data-id="'+id+'"]');if(!item)return;const te=item.querySelector('.ci-t'),cur=te.textContent;te.innerHTML='<input class="rn-in" value="'+E(cur)+'"/>';const inp=te.querySelector('input');inp.focus();inp.select();const sv=async()=>{const v=inp.value.trim();if(v&&v!==cur){try{await api('rename_conversation',{conversation_id:id,title:v});loadConvs();if(S.cid===id)document.getElementById('h-t').textContent=v;}catch(e){toast('失败');}}else te.textContent=cur;};inp.addEventListener('blur',sv);inp.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();inp.blur();}if(e.key==='Escape')te.textContent=cur;});}

// Long-press
let lpt=null;
function cMo2(){document.getElementById('act-sheet').classList.remove('on');}
function showConvAct(id){const c=S.allC.find(c=>c.id===id);document.getElementById('act-title').textContent=c?.title||'对话操作';document.getElementById('act-rename').onclick=()=>{cMo2();renConv(id);};document.getElementById('act-folder').onclick=()=>{cMo2();showFolderPicker(id);};document.getElementById('act-del').onclick=()=>{cMo2();delConv(id);};document.getElementById('act-sheet').classList.add('on');}
function showFolderPicker(cid){S._fpCid=cid;const c=S.allC.find(x=>x.id===cid);const curF=c?.folder||null;const folders=new Set();S.allC.forEach(c=>{if(c.folder)folders.add(c.folder);});const arr=[...folders].sort();const el=document.getElementById('fp-list');el.innerHTML='<button class="btn btn-g" style="width:100%;text-align:left'+(curF===null?';border:2px solid var(--accent)':'')+'" onclick="moveToFolder(null)">无文件夹</button>'+arr.map(f=>'<button class="btn btn-g" style="width:100%;text-align:left'+(curF===f?';border:2px solid var(--accent)':'')+'" onclick="moveToFolder(\''+E(f)+'\')">'+E(f)+'</button>').join('');document.getElementById('fp-new').value='';document.getElementById('folder-picker').classList.add('on');}
function closeFP(){document.getElementById('folder-picker').classList.remove('on');}
async function moveToFolder(f){const cid=S._fpCid;if(!cid)return;closeFP();try{await api('update_conversation',{conversation_id:cid,folder:f});const c=S.allC.find(x=>x.id===cid);if(c)c.folder=f;filterConvs();rFolderBar();toast(f?'已移入 '+f:'已移出文件夹');}catch(e){toast('失败');}}
async function addFolderFromPicker(){const n=document.getElementById('fp-new').value.trim();if(!n){toast('请输入文件夹名');return;}await moveToFolder(n);}
document.getElementById('conv-list').addEventListener('touchstart',e=>{const ci=e.target.closest('.ci');if(!ci)return;const id=ci.dataset.id;lpt=setTimeout(()=>{showConvAct(id);},500);},{passive:true});
document.getElementById('conv-list').addEventListener('touchend',()=>clearTimeout(lpt),{passive:true});
document.getElementById('conv-list').addEventListener('touchmove',()=>clearTimeout(lpt),{passive:true});

// === 当前对话日历 ===
async function openConvCalendar(){
  if(!S.cid){toast('请先选择一个对话');return;}
  if(S.streaming){toast('回复生成中，稍后再跳转');return;}
  const cid=S.cid;
  S.convCalCid=cid;
  const mo=document.getElementById('conv-cal-mo');
  const grid=document.getElementById('cal-grid');
  grid.replaceChildren();
  const loading=document.createElement('div');loading.className='cal-loading';loading.textContent='加载中…';grid.appendChild(loading);
  mo.classList.add('on');
  let dates=S.convDatesCache[cid];
  if(!dates){
    try{
      const d=await api('get_conversation_dates',{conversation_id:cid});
      if(S.cid!==cid||S.convCalCid!==cid){if(S.convCalCid===cid)closeConvCal();return;}
      const list=(d?.messages||[]).map(m=>({id:m.id,dayKey:_dayKey(m.created_at),ts:m.created_at})).filter(x=>x.dayKey);
      S.convDatesCache[cid]=list;
      dates=list;
    }catch(e){
      if(S.cid!==cid||S.convCalCid!==cid){if(S.convCalCid===cid)closeConvCal();return;}
      toast('加载失败');closeConvCal();return;
    }
  }
  if(S.cid!==cid||S.convCalCid!==cid){if(S.convCalCid===cid)closeConvCal();return;}
  const latest=dates.length>0?new Date(dates[dates.length-1].ts):new Date();
  S.convCalShown=latest.getFullYear()+'-'+String(latest.getMonth()+1).padStart(2,'0');
  _renderConvCal(dates);
}
function closeConvCal(){document.getElementById('conv-cal-mo').classList.remove('on');S.convCalShown=null;S.convCalCid=null;}
function convCalShift(delta){
  if(!S.convCalShown||!S.convCalCid)return;
  const [y,m]=S.convCalShown.split('-').map(Number);
  const d=new Date(y,m-1+delta,1);
  S.convCalShown=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
  _renderConvCal(S.convDatesCache[S.convCalCid]||[]);
}
function _renderConvCal(dates){
  const [y,m]=S.convCalShown.split('-').map(Number);
  document.getElementById('cal-title').textContent=y+'年'+m+'月';
  const byDay=new Map();
  for(const d of dates){if(!byDay.has(d.dayKey))byDay.set(d.dayKey,d.id);}
  const first=new Date(y,m-1,1);
  const daysInMonth=new Date(y,m,0).getDate();
  const firstWeekday=first.getDay();
  const grid=document.getElementById('cal-grid');
  grid.replaceChildren();
  const wkRow=document.createElement('div');wkRow.className='cal-wk-row';
  ['日','一','二','三','四','五','六'].forEach(w=>{const c=document.createElement('div');c.className='cal-wk';c.textContent=w;wkRow.appendChild(c);});
  grid.appendChild(wkRow);
  const daysWrap=document.createElement('div');daysWrap.className='cal-days';
  for(let i=0;i<firstWeekday;i++){const empty=document.createElement('div');empty.className='cal-day cal-day-empty';daysWrap.appendChild(empty);}
  const today=_dayKey(new Date().toISOString());
  for(let day=1;day<=daysInMonth;day++){
    const dk=y+'-'+String(m).padStart(2,'0')+'-'+String(day).padStart(2,'0');
    const cell=document.createElement('div');cell.className='cal-day';
    if(dk===today)cell.classList.add('cal-day-today');
    cell.textContent=day;
    if(byDay.has(dk)){
      cell.classList.add('cal-day-active');
      cell.dataset.id=byDay.get(dk);
      const targetId=byDay.get(dk);
      cell.onclick=()=>_convCalJumpTo(targetId);
    }
    daysWrap.appendChild(cell);
  }
  grid.appendChild(daysWrap);
}
async function _convCalJumpTo(messageId){
  if(S.streaming){toast('回复生成中，稍后再跳转');return;}
  const cid=S.convCalCid||S.cid;
  closeConvCal();
  S._hlMsgId=messageId;
  try{
    const d=await api('get_messages_around',{message_id:messageId,window:25});
    if(S.cid!==cid){S._hlMsgId=null;return;}
    _storeTree(d);rMsgs();
  }catch(e){
    if(S.cid!==cid){S._hlMsgId=null;return;}
    if(e?.body&&String(e.body).includes('inactive')){toast('该消息在已切换走的旧分支');}
    else{toast('跳转失败');}
    S._hlMsgId=null;return;
  }
  setTimeout(()=>{
    if(S.cid!==cid){S._hlMsgId=null;return;}
    const el=document.querySelector('.msg[data-id="'+messageId+'"]');
    if(el){el.scrollIntoView({behavior:'smooth',block:'start'});el.classList.add('hl');setTimeout(()=>el.classList.remove('hl'),2500);}
    S._hlMsgId=null;
  },200);
}

