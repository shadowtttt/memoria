// 用量中心：从后端 usage_stats 拉数据，渲染 4 张数字卡 + 3 张表
let _usageRange = '7d';

function _fmtMoney(n) {
  if (n === null || n === undefined) return '$0.00';
  const x = Number(n);
  if (!isFinite(x) || x === 0) return '$0.00';
  if (x < 0.01) return '$' + x.toFixed(4);
  return '$' + x.toFixed(2);
}
function _fmtTok(n) {
  const x = Number(n) || 0;
  if (x >= 1e6) return (x / 1e6).toFixed(2) + 'M';
  if (x >= 1e3) return (x / 1e3).toFixed(1) + 'k';
  return String(x);
}
function _fmtPct(n) {
  return ((Number(n) || 0) * 100).toFixed(1) + '%';
}
function _fmtTime(s) {
  if (!s) return '';
  const d = new Date(s);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${m}-${day} ${h}:${mi}`;
}
function _modelShort(m) {
  if (!m) return '(unknown)';
  const i = m.lastIndexOf('/');
  return i >= 0 ? m.slice(i + 1) : m;
}

function setUsageRange(r) {
  _usageRange = r;
  document.querySelectorAll('.usg-range-btn').forEach(b => b.classList.toggle('on', b.dataset.r === r));
  loadUsageStats();
}

async function loadUsageStats() {
  const cont = document.getElementById('usage-body');
  if (!cont) return;
  cont.innerHTML = '<div style="padding:32px 16px;color:var(--t4);text-align:center">加载中...</div>';
  try {
    const r = await api('usage_stats', { range: _usageRange });
    if (r.error) { cont.innerHTML = '<div style="padding:32px 16px;color:#c33">加载失败：' + E(r.error) + '</div>'; return; }
    renderUsage(r);
  } catch (e) {
    cont.innerHTML = '<div style="padding:32px 16px;color:#c33">加载失败：' + E(apiErrMsg(e, '获取用量数据')) + '</div>';
  }
}

function renderUsage(d) {
  const t = d.totals || {};
  const cont = document.getElementById('usage-body');

  let html = '';

  // 4 张大数字卡
  html += '<div class="sc">';
  html += '<div class="si"><div class="si-info"><div class="si-n">实际花费</div><div class="si-d">' + _fmtMoney(t.actual_cost) + '</div></div></div>';
  html += '<div class="si"><div class="si-info"><div class="si-n">缓存命中率</div><div class="si-d">' + _fmtPct(t.cache_hit_rate) + '</div></div></div>';
  html += '<div class="si"><div class="si-info"><div class="si-n">总 tokens</div><div class="si-d">' + _fmtTok(t.total_tokens) + '</div></div></div>';
  if (Number(t.reported_savings) > 0) {
    html += '<div class="si"><div class="si-info"><div class="si-n">节省 (cache)</div><div class="si-d">' + _fmtMoney(t.reported_savings) + '</div></div></div>';
  }
  html += '</div>';

  // unknown 提示
  if (Number(t.unknown_cost_events) > 0) {
    html += '<div style="padding:10px 14px;background:var(--bg2);border-radius:8px;margin:12px 0;font-size:13px;color:var(--t4)">';
    html += '另有 <b>' + t.unknown_cost_events + '</b> 条调用未返回成本（如 DeepSeek 直连），不计入实际花费。要查 DeepSeek 总账请去 DeepSeek 官网。';
    html += '</div>';
  }

  // token 细分
  html += '<div style="padding:8px 0 4px 4px;font-size:12px;color:var(--t4)">Token 细分</div>';
  html += '<div class="sc">';
  html += '<div class="si"><div class="si-info"><div class="si-n">输入</div><div class="si-d">' + _fmtTok(t.input_tokens) + '</div></div></div>';
  html += '<div class="si"><div class="si-info"><div class="si-n">输出</div><div class="si-d">' + _fmtTok(t.output_tokens) + '</div></div></div>';
  html += '<div class="si"><div class="si-info"><div class="si-n">缓存读</div><div class="si-d">' + _fmtTok(t.cache_read_tokens) + '</div></div></div>';
  html += '<div class="si"><div class="si-info"><div class="si-n">缓存写</div><div class="si-d">' + _fmtTok(t.cache_write_tokens) + '</div></div></div>';
  html += '</div>';

  // 按模型
  const byModel = d.by_model || [];
  if (byModel.length > 0) {
    html += '<div style="padding:16px 0 6px 4px;font-size:13px;color:var(--t3);font-weight:600">按模型</div>';
    html += '<div class="usg-tbl">';
    html += '<div class="usg-tbl-h"><span style="flex:1.6">模型</span><span class="usg-r">花费</span><span class="usg-r">tokens</span><span class="usg-r">次数</span></div>';
    for (const m of byModel) {
      html += '<div class="usg-tbl-r">';
      html += '<span style="flex:1.6;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + E(m.model) + '">' + E(_modelShort(m.model)) + '</span>';
      html += '<span class="usg-r">' + _fmtMoney(m.actual_cost) + '</span>';
      html += '<span class="usg-r">' + _fmtTok(m.total_tokens) + '</span>';
      html += '<span class="usg-r">' + m.events + '</span>';
      html += '</div>';
    }
    html += '</div>';
  }

  // 按来源
  const bySource = d.by_source || [];
  if (bySource.length > 0) {
    html += '<div style="padding:16px 0 6px 4px;font-size:13px;color:var(--t3);font-weight:600">按来源</div>';
    html += '<div class="usg-tbl">';
    html += '<div class="usg-tbl-h"><span style="flex:1.6">来源</span><span class="usg-r">花费</span><span class="usg-r">tokens</span><span class="usg-r">次数</span></div>';
    for (const s of bySource) {
      html += '<div class="usg-tbl-r">';
      html += '<span style="flex:1.6;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + E(s.source) + '</span>';
      html += '<span class="usg-r">' + _fmtMoney(s.actual_cost) + '</span>';
      html += '<span class="usg-r">' + _fmtTok(s.total_tokens) + '</span>';
      html += '<span class="usg-r">' + s.events + '</span>';
      html += '</div>';
    }
    html += '</div>';
  }

  // 最近请求
  const recent = d.recent_events || [];
  if (recent.length > 0) {
    html += '<div style="padding:16px 0 6px 4px;font-size:13px;color:var(--t3);font-weight:600">最近请求 (前 50)</div>';
    html += '<div class="usg-tbl">';
    html += '<div class="usg-tbl-h"><span style="flex:1.4">时间</span><span style="flex:1.6">来源/模型</span><span class="usg-r">花费</span><span class="usg-r">tokens</span></div>';
    for (const e of recent) {
      const cs = e.cost_status === 'actual' ? _fmtMoney(e.cost) : '<span style="color:var(--t4)">—</span>';
      html += '<div class="usg-tbl-r">';
      html += '<span style="flex:1.4;font-size:11px;color:var(--t4)">' + _fmtTime(e.created_at) + '</span>';
      html += '<span style="flex:1.6;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px">' + E(e.source) + ' / ' + E(_modelShort(e.model)) + '</span>';
      html += '<span class="usg-r">' + cs + '</span>';
      html += '<span class="usg-r">' + _fmtTok(e.total_tokens) + '</span>';
      html += '</div>';
    }
    html += '</div>';
  }

  if (recent.length === 0 && byModel.length === 0) {
    html += '<div style="padding:32px 16px;color:var(--t4);text-align:center">暂无用量数据。发一条消息后再来看。</div>';
  }

  cont.innerHTML = html;
}
