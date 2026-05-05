const MEM_CATEGORIES = ['event','emotion','habit','preference','person','insight','fragment','daily','milestone','intimacy','conflict','conversation'];
const MEM_SOURCE_WARM = ['manual','ai','claude.ai'];
let memState = {cards:[],offset:0,category:null,sort:'time',search:'',loading:false,hasMore:true};
let _memSearchTimer = null;
let _memObserver = null;

async function loadMemCards(reset) {
  if (reset) { memState.cards=[]; memState.offset=0; memState.hasMore=true; }
  if (memState.loading || !memState.hasMore) return;
  memState.loading = true;
  const el = document.getElementById('mem-loading');
  if (el) el.style.display = 'block';
  try {
    const params = {limit:20, offset:memState.offset};
    if (memState.category) params.category = memState.category;
    if (memState.sort === 'importance') params.sort = 'importance';
    if (memState.search) params.search = memState.search;
    const d = await api('list_memories', params);
    const items = d?.memories || [];
    if (items.length < 20) memState.hasMore = false;
    memState.cards = reset ? items : [...memState.cards, ...items];
    memState.offset += items.length;
    rMemCards();
  } catch (err) {
    const tl = document.getElementById('mem-timeline');
    if (tl && memState.cards.length === 0) tl.innerHTML = '<div class="mem-empty">加载失败，请检查连接</div>';
  }
  memState.loading = false;
  if (el) el.style.display = 'none';
  _initMemObserver();
}

function rMemCards() {
  const tl = document.getElementById('mem-timeline');
  if (!tl) return;
  if (memState.cards.length === 0) {
    tl.innerHTML = '<div class="mem-empty">' + (memState.search ? '没有找到相关记忆' : '暂无记忆') + '</div>';
    return;
  }
  tl.innerHTML = memState.cards.map(c => {
    const imp = c.importance || 5;
    const impClass = imp >= 7 ? 'high' : imp >= 4 ? 'mid' : 'low';
    const srcClass = MEM_SOURCE_WARM.includes(c.source) ? 'warm' : 'cool';
    const date = c.occurred_at || c.created_at;
    const tags = (c.tags || []).slice(0, 4);
    return `<div class="mem-card ${srcClass}" data-imp="${impClass}" data-id="${c.id}" onclick="memToggle('${c.id}')">
      <div class="mem-card-head">
        <span class="mem-card-time" title="${E(date)}">${relTime(date)}</span>
        <span class="mem-card-cat">${E(c.category || '')}</span>
      </div>
      <div class="mem-card-content">${E(c.content || '')}</div>
      <div class="mem-card-detail">
        <div class="mem-card-tags">${tags.map(t => '<span class="mem-tag">' + E(t) + '</span>').join('')}</div>
        <div class="mem-card-meta">
          <span>重要性 ${imp}/10</span>
          <span>召回 ${c.hit_count || 0} 次</span>
          ${c.last_hit_round ? '<span>最近第 ' + c.last_hit_round + ' 轮</span>' : ''}
          <span>来源 ${E(c.source || '')}</span>
          <span>${E(date || '')}</span>
        </div>
      </div>
    </div>`;
  }).join('');
  rMemFilters();
}

function rMemFilters() {
  const el = document.getElementById('mem-filters');
  if (!el) return;
  const cats = ['all', ...MEM_CATEGORIES];
  el.innerHTML = cats.map(c => {
    const active = (c === 'all' && !memState.category) || c === memState.category ? ' active' : '';
    const label = c === 'all' ? '全部' : c;
    return `<button class="mem-pill${active}" onclick="memFilterCat('${c}')">${E(label)}</button>`;
  }).join('');
}

function memSearch(q) {
  clearTimeout(_memSearchTimer);
  _memSearchTimer = setTimeout(() => {
    memState.search = q.trim();
    loadMemCards(true);
  }, 300);
}

function memFilterCat(cat) {
  memState.category = cat === 'all' ? null : cat;
  loadMemCards(true);
}

function memSort(by) {
  memState.sort = by;
  document.getElementById('mem-sort-time').classList.toggle('active', by === 'time');
  document.getElementById('mem-sort-imp').classList.toggle('active', by === 'importance');
  loadMemCards(true);
}

function memToggle(id) {
  const el = document.querySelector(`.mem-card[data-id="${id}"]`);
  if (el) el.classList.toggle('expanded');
}

async function memRandom() {
  try {
    const d = await api('list_memories', {limit: 200});
    const items = d?.memories || [];
    if (items.length === 0) { toast('暂无记忆'); return; }
    const pick = items[Math.floor(Math.random() * items.length)];
    const imp = pick.importance || 5;
    const date = pick.occurred_at || pick.created_at;
    const tags = (pick.tags || []).slice(0, 4);
    const html = `<div class="mem-random-card">
      <div class="mem-card-time">${relTime(date)}</div>
      <div class="mem-card-cat">${E(pick.category || '')}</div>
      <div style="margin:12px 0;color:var(--t1);line-height:1.6">${E(pick.content || '')}</div>
      <div class="mem-card-tags">${tags.map(t => '<span class="mem-tag">' + E(t) + '</span>').join('')}</div>
      <div class="mem-card-meta" style="margin-top:8px"><span>重要性 ${imp}/10</span><span>召回 ${pick.hit_count || 0} 次</span></div>
    </div>`;
    const mo = document.getElementById('cf-mo');
    document.getElementById('cf-t').textContent = '随机记忆';
    document.getElementById('cf-tx').innerHTML = html;
    document.getElementById('cf-ok').textContent = '关闭';
    document.getElementById('cf-ok').onclick = cMo;
    mo.classList.add('on');
  } catch (e) { toast('加载失败'); }
}

function relTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = Date.now();
  const diff = now - d.getTime();
  if (diff < 0) return '刚刚';
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return '刚刚';
  if (mins < 60) return mins + '分钟前';
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + '小时前';
  const days = Math.floor(hrs / 24);
  if (days < 30) return days + '天前';
  const months = Math.floor(days / 30);
  if (months < 12) return months + '个月前';
  return Math.floor(months / 12) + '年前';
}

function _initMemObserver() {
  if (_memObserver) return;
  const sentinel = document.getElementById('mem-sentinel');
  if (!sentinel) return;
  _memObserver = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting && memState.hasMore && !memState.loading) {
      loadMemCards(false);
    }
  }, {rootMargin: '200px'});
  _memObserver.observe(sentinel);
}
