let adminCsrfPromise;
// Render a compact audit trend chart from the report API.
(() => { const draw=async()=>{const root=document.querySelector('#overview');if(!root?.classList.contains('active')||document.querySelector('#auditTrendChart'))return;try{const j=await fetch('/admin/api/reports',{credentials:'same-origin'}).then(r=>r.json());const rows=j.audit_trend||[];const max=Math.max(1,...rows.map(x=>Number(x.total)||0));const card=document.createElement('div');card.id='auditTrendChart';card.className='layui-card';card.style.marginTop='16px';card.innerHTML='<div class="layui-card-header">近 14 日审计趋势</div><div class="layui-card-body"><div style="display:flex;align-items:flex-end;gap:6px;height:100px">'+rows.map(x=>`<div title="${String(x.day||'')}：${x.total}" style="flex:1;background:#1e9fff;height:${Math.max(4,Math.round((Number(x.total)||0)/max*90))}px"></div>`).join('')+'</div></div>';root.appendChild(card);}catch(_){}};setInterval(()=>{document.querySelector('#auditTrendChart')?.remove();draw();},5000);setTimeout(draw,800);})();
window.adminApiRequest = async function adminApiRequest(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeout || 10000);
  if (options.method && !['GET','HEAD','OPTIONS'].includes(options.method.toUpperCase())) { adminCsrfPromise ||= fetch('/admin/csrf', { credentials: 'same-origin' }).then((r) => r.json()).then((j) => j.csrf_token); }
  const write = options.method && !['GET','HEAD','OPTIONS'].includes(options.method.toUpperCase());
  const headers = { Accept: 'application/json', 'X-Request-ID': (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`), ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(write ? { 'X-CSRF-Token': await adminCsrfPromise, 'Idempotency-Key': (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`) } : {}), ...(options.headers || {}) };
  try {
    const response = await fetch(url, { ...options, headers, credentials: 'same-origin', signal: controller.signal });
    if (response.status === 401) { location.href = '/admin/login'; throw new Error('admin_login_required'); }
    const payload = await response.json().catch(() => ({}));
    // Accept the normalized {ok,data,error,request_id} shape while retaining
    // compatibility with the existing flat admin payloads.
    if (payload && payload.ok === true && payload.data && typeof payload.data === 'object') Object.assign(payload, payload.data);
    if (!response.ok) { const error = new Error(payload.error || payload.message || `HTTP ${response.status}`); error.status = response.status; error.payload = payload; throw error; }
    return payload;
  } finally { clearTimeout(timer); }
};
(() => {
  const style=document.createElement('style'); style.textContent='#serverPager{display:none!important}'; document.head.appendChild(style);
  const initArchiveView = () => {
    const root=document.querySelector('#p2Settings'); if(!root||document.querySelector('#archiveView')) return;
    root.insertAdjacentHTML('beforeend','<div class="layui-col-md12" id="archiveView"><div class="layui-card"><div class="layui-card-header">归档审计日志 <button id="loadArchive" class="layui-btn layui-btn-xs layui-btn-primary" style="float:right">刷新归档</button></div><div class="layui-card-body"><table class="layui-table"><thead><tr><th>动作</th><th>结果</th><th>原因</th><th>IP</th><th>时间</th></tr></thead><tbody id="archiveRows"><tr><td colspan="5" class="muted">点击刷新归档</td></tr></tbody></table></div></div></div>');
    document.querySelector('#loadArchive').onclick=async()=>{try{const j=await adminApiRequest('/admin/audit/archive?limit=200',{cache:'no-store'});document.querySelector('#archiveRows').innerHTML=(j.logs||[]).map(x=>`<tr><td>${String(x.action||'')}</td><td>${String(x.result||'')}</td><td>${String(x.reason||'-')}</td><td>${String(x.ip_address||'-')}</td><td>${String(x.created_at||'')}</td></tr>`).join('')||'<tr><td colspan="5" class="muted">暂无归档日志</td></tr>';}catch(_){layui.layer.msg('归档日志加载失败',{icon:2});}};
  };
  setInterval(initArchiveView,500); setTimeout(initArchiveView,200);
})();

// Keep the canonical P1 renderer in control when legacy pagination finishes an async request.
(() => { setInterval(() => { const page=document.querySelector('#licenses'); if(page?.classList.contains('active') && typeof window.renderLicenses==='function') window.renderLicenses(); }, 1800); })();
(() => { setInterval(() => { ['cfgAnnEnabled','cfgForceRead','cfgForceUpdate'].forEach(id=>{const n=document.getElementById(id);if(n){n.style.display='inline-block';n.style.width='18px';n.style.height='18px';n.style.opacity='1';}}); }, 300); })();
(() => { setInterval(() => { const body=document.querySelector('#licenseRows'); if(!body) return; body.querySelectorAll('tr').forEach((row) => { const check=row.querySelector('.keyCheck'); const action=row.lastElementChild; if(!check||!action||action.querySelector('[data-fallback-suspend]')) return; const status=(row.children[3]?.textContent||''); const b=document.createElement('button'); b.className='layui-btn layui-btn-xs layui-btn-warm'; b.dataset.fallbackSuspend='1'; b.textContent=status.includes('封禁')?'解封':'封禁'; b.onclick=()=>window.toggleSuspend?.(check.value,status.includes('封禁')); action.insertBefore(b,action.firstChild); }); }, 500); })();

(() => {
  const nativeFetch = window.fetch.bind(window); let tokenPromise;
  window.fetch = async (input, init = {}) => {
    const target = typeof input === 'string' ? input : input.url; const method = String(init.method || (typeof input !== 'string' ? input.method : 'GET')).toUpperCase();
    if (target.includes('/admin/') && ['POST','PATCH','DELETE'].includes(method) && !target.includes('/admin/csrf') && !target.includes('/admin/login') && !target.includes('/admin/logout')) {
      tokenPromise ||= nativeFetch('/admin/csrf', { credentials: 'same-origin' }).then((r) => r.json()).then((j) => j.csrf_token);
      const headers = new Headers(init.headers || (typeof input !== 'string' ? input.headers : undefined)); headers.set('X-CSRF-Token', await tokenPromise); if (!headers.has('Idempotency-Key')) headers.set('Idempotency-Key', crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`); init = { ...init, headers, credentials: 'same-origin' };
    }
    return nativeFetch(input, init);
  };
  })();

// P2 device filters, device detail drawer, and report summary.
(() => {
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  let deviceBound = false;
  const loadDevices = async () => {
    const section = document.querySelector('#devices'); if (!section) return;
    if (!document.querySelector('#deviceFilters')) { section.querySelector('.layui-card-body')?.insertAdjacentHTML('afterbegin','<div id="deviceFilters" class="toolbar"><select id="deviceOnline" class="layui-input"><option value="">全部在线状态</option><option value="online">在线</option><option value="offline">离线</option></select><select id="deviceProduct" class="layui-input"><option value="">全部产品</option></select><input id="deviceKey" class="layui-input" placeholder="输入卡密前缀"><select id="deviceSince" class="layui-input"><option value="">全部心跳时间</option><option value="300">5 分钟内</option><option value="3600">1 小时内</option><option value="86400">1 天内</option></select></div>'); }
    const params = new URLSearchParams({page:'1',page_size:'200',online_status:document.querySelector('#deviceOnline')?.value||'',product_code:document.querySelector('#deviceProduct')?.value||'',license_key:document.querySelector('#deviceKey')?.value||'',since:document.querySelector('#deviceSince')?.value||''});
    try { const j=await adminApiRequest('/admin/api/devices?'+params); const rows=j.items||[]; const body=section.querySelector('#deviceRows'); if(body) body.innerHTML=rows.length?rows.map(x=>`<tr><td><code>${esc(x.key_prefix)}</code></td><td><code>${esc(x.device_id)}</code></td><td>${esc(x.product_code)}</td><td>${esc(x.online_status==='online'?'在线':'离线')}</td><td>${esc(x.last_seen_at||'-')}</td><td><button class="layui-btn layui-btn-xs layui-btn-primary" data-device-detail="${esc(x.id)}">详情</button></td></tr>`).join(''):'<tr><td colspan="6" class="muted">暂无设备</td></tr>'; const products=[...new Set(rows.map(x=>x.product_code).filter(Boolean))]; const sel=document.querySelector('#deviceProduct'); if(sel){const cur=sel.value;sel.innerHTML='<option value="">全部产品</option>'+products.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('');sel.value=products.includes(cur)?cur:'';} } catch (_) {}
    if(!deviceBound){deviceBound=true; ['#deviceOnline','#deviceProduct','#deviceKey','#deviceSince'].forEach(s=>document.querySelector(s)?.addEventListener('input',loadDevices));}
  };
  const loadReports = async () => { const root=document.querySelector('#overview'); if(!root||!root.classList.contains('active')) return; try { const j=await adminApiRequest('/admin/api/reports',{cache:'no-store'}); let card=document.querySelector('#reportCard'); if(!card){card=document.createElement('div');card.id='reportCard';card.className='layui-card';card.style.marginTop='16px';root.appendChild(card);} card.innerHTML='<div class="layui-card-header">运营报表</div><div class="layui-card-body"><table class="layui-table"><thead><tr><th>产品</th><th>卡密总数</th><th>已激活</th><th>已封禁</th></tr></thead><tbody>'+(j.by_product||[]).map(x=>`<tr><td>${esc(x.product_code)}</td><td>${x.licenses}</td><td>${x.active}</td><td>${x.suspended}</td></tr>`).join('')+'</tbody></table><div class="muted">失败原因：'+(j.failure_reasons||[]).map(x=>`${esc(x.reason||'未知')}（${x.total}）`).join('、')+'</div></div>'; } catch (_) {} };
  const init=()=>{ if(document.querySelector('#devices')?.classList.contains('active')) loadDevices(); loadReports(); };
  document.querySelectorAll('[data-view="devices"]').forEach(x=>x.addEventListener('click',()=>setTimeout(loadDevices,50))); setInterval(init,5000); setTimeout(init,500);
})();

// Late product selector binding, after all renderer functions have loaded.
(() => {
  const bind = () => {
    if (window.__lateProductSelector || typeof window.openCreate !== 'function') return false;
    window.__lateProductSelector = true;
    const original = window.openCreate;
    window.openCreate = function () {
      original.apply(this, arguments);
      setTimeout(async () => {
        const input = document.querySelector('#genProduct'); if (!input) return;
        try {
          const payload = await adminApiRequest('/admin/products', { cache: 'no-store' });
          const items = (payload.products || []).filter((p) => p.status === 'active');
          const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
          const select = document.createElement('select'); select.id = 'genProduct'; select.className = 'layui-input';
          select.innerHTML = '<option value="">请选择产品</option>' + items.map((p) => `<option value="${esc(p.code)}">${esc(p.name)}（${esc(p.code)}）</option>`).join('');
          select.value = items[0]?.code || ''; input.replaceWith(select); window.layui?.form?.render('select');
        } catch (_) {}
      }, 30);
    };
    return true;
  };
  if (!bind()) { const timer = setInterval(() => { if (bind()) clearInterval(timer); }, 100); setTimeout(() => clearInterval(timer), 10000); }
})();

// Late product selector binding, after all legacy functions have loaded.
(() => {
  if (window.__lateProductSelector || typeof window.openCreate !== 'function') return;
  window.__lateProductSelector = true;
  const original = window.openCreate;
  window.openCreate = function () {
    original.apply(this, arguments);
    setTimeout(async () => {
      const input = document.querySelector('#genProduct'); if (!input) return;
      try {
        const payload = await adminApiRequest('/admin/products', { cache: 'no-store' });
        const items = (payload.products || []).filter((p) => p.status === 'active');
        const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
        const select = document.createElement('select'); select.id = 'genProduct'; select.className = 'layui-input';
        select.innerHTML = '<option value="">请选择产品</option>' + items.map((p) => `<option value="${esc(p.code)}">${esc(p.name)}（${esc(p.code)}）</option>`).join('');
        select.value = items[0]?.code || ''; input.replaceWith(select); window.layui?.form?.render('select');
      } catch (_) {}
    }, 30);
  };
})();

// Final UX guard: generation always uses the product catalog and background refresh
// never changes the current hash/view or active filters.
(() => {
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const originalOpenCreate = window.openCreate;
  if (typeof originalOpenCreate === 'function' && !window.__catalogGenerationGuard) {
    window.__catalogGenerationGuard = true;
    window.openCreate = async function catalogOpenCreate() {
      originalOpenCreate();
      const selectProducts = async () => {
        const input = document.querySelector('#genProduct'); if (!input) return;
        try {
          const payload = await adminApiRequest('/admin/products', { cache: 'no-store' });
          const items = (payload.products || []).filter((p) => p.status === 'active');
          const current = input.value;
          const select = document.createElement('select'); select.id = 'genProduct'; select.className = 'layui-input';
          select.innerHTML = '<option value="">请选择产品</option>' + items.map((p) => `<option value="${esc(String(p.code))}">${esc(String(p.name))}（${esc(String(p.code))}）</option>`).join('');
          select.value = items.some((p) => p.code === current) ? current : (items[0]?.code || '');
          input.replaceWith(select); window.layui?.form?.render('select');
        } catch (_) {}
      };
      setTimeout(selectProducts, 0);
    };
  }
  const refresh = async () => {
    try {
      const summary = await adminApiRequest('/admin/summary', { cache: 'no-store' });
      const stats = summary.stats || {};
      const metrics = document.querySelector('#metrics');
      if (metrics && document.querySelector('#overview')?.classList.contains('active')) {
        metrics.innerHTML = [['授权总数', stats.licenses || 0], ['活跃授权', stats.active_licenses || 0], ['在线设备', stats.online_devices || 0], ['审计失败', stats.audit_failures || 0]].map(([label, value]) => `<div class="layui-col-md3"><div class="layui-card metric"><span class="muted">${label}</span><b>${value}</b></div></div>`).join('');
      }
      if (document.querySelector('#licenses')?.classList.contains('active') && typeof window.renderLicenses === 'function') window.renderLicenses();
    } catch (_) {}
  };
  setInterval(refresh, 5000);
})();

// Rebind after the legacy renderer has defined openCreate.
(() => {
  if (window.__catalogGenerationGuardLate || typeof window.openCreate !== 'function') return;
  window.__catalogGenerationGuardLate = true;
  const original = window.openCreate;
  window.openCreate = function () {
    original.apply(this, arguments);
    setTimeout(async () => {
      const input = document.querySelector('#genProduct'); if (!input) return;
      try {
        const payload = await adminApiRequest('/admin/products', { cache: 'no-store' });
        const items = (payload.products || []).filter((p) => p.status === 'active');
        const select = document.createElement('select'); select.id = 'genProduct'; select.className = 'layui-input';
        select.innerHTML = '<option value="">请选择产品</option>' + items.map((p) => `<option value="${String(p.code).replace(/[&<>"']/g, '')}">${String(p.name).replace(/[&<>"']/g, '')}（${String(p.code).replace(/[&<>"']/g, '')}）</option>`).join('');
        select.value = items[0]?.code || ''; input.replaceWith(select); window.layui?.form?.render('select');
      } catch (_) {}
    }, 20);
  };
})();

// Server-side license pagination. It is installed after all legacy renderers have loaded.
(() => {
  let installed=true, requestNo=0, page=1, size=20;
  const esc=(v)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const date=(v)=>{if(!v)return'永久';const d=new Date(v);if(Number.isNaN(d.getTime()))return v;const p=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;};
  const install=()=>{if(installed||!window.renderLicenses||!document.querySelector('#licenseRows'))return;installed=true;const original=window.renderLicenses;window.renderLicenses=async()=>{const n=++requestNo;const params=new URLSearchParams({page:String(page),page_size:String(size),search:document.querySelector('#search')?.value||'',product_code:document.querySelector('#productFilter')?.value||'',status:document.querySelector('#statusFilter')?.value||'',duration:document.querySelector('#durationFilter')?.value||''});try{const j=await adminApiRequest('/admin/api/licenses?'+params.toString());if(n!==requestNo)return;const rows=j.items||[],meta=j.pagination||{};const body=document.querySelector('#licenseRows');body.innerHTML=rows.length?rows.map((x)=>`<tr><td><input class="keyCheck" type="checkbox" value="${esc(x.id)}"></td><td class="license-key"><code>${esc(x.plain_key||x.key_prefix||'历史卡密不可恢复')}</code>${x.plain_key?` <button class="layui-btn layui-btn-xs layui-btn-primary" onclick="copyKey('${esc(x.plain_key)}')">复制</button>`:''}</td><td>${esc(x.product_code)}</td><td>${esc(({issued:'未激活',active:'已激活',suspended:'已封禁',revoked:'已撤销',expired:'已到期'})[x.status]||x.status)}</td><td>${esc(x.max_devices)}</td><td>${esc(x.duration_label||'永久')}</td><td>${esc(date(x.expires_at))}</td><td>${esc(date(x.created_at))}</td><td><button class="layui-btn layui-btn-xs layui-btn-danger" onclick="removeKey('${esc(x.id)}')">删除</button></td></tr>`).join(''):'<tr><td colspan="9" style="text-align:center;color:#8b95a7">没有匹配的卡密</td></tr>';let pager=document.querySelector('#serverPager');if(!pager){pager=document.createElement('div');pager.id='serverPager';pager.className='p1-pagination';body.closest('.layui-card-body')?.appendChild(pager);}const pages=Math.max(1,meta.pages||1);pager.innerHTML=`<span>共 ${meta.total||0} 条，第 ${page}/${pages} 页</span><button class="layui-btn layui-btn-sm layui-btn-primary" ${page<=1?'disabled':''} data-prev>上一页</button><select class="layui-input" style="width:80px;height:30px" data-size><option ${size===20?'selected':''}>20</option><option ${size===50?'selected':''}>50</option><option ${size===100?'selected':''}>100</option></select><button class="layui-btn layui-btn-sm layui-btn-primary" ${page>=pages?'disabled':''} data-next>下一页</button>`;pager.querySelector('[data-prev]').onclick=()=>{page--;window.renderLicenses();};pager.querySelector('[data-next]').onclick=()=>{page++;window.renderLicenses();};pager.querySelector('[data-size]').onchange=(e)=>{size=Number(e.target.value);page=1;window.renderLicenses();};}catch(e){if(n===requestNo)layui.layer?.msg('卡密列表加载失败',{icon:2});}};document.querySelectorAll('#search,#productFilter,#statusFilter,#durationFilter').forEach((x)=>x.addEventListener('input',()=>{page=1;window.renderLicenses();}));};setTimeout(install,0);setTimeout(install,300);
})();

// Theme toggle and license table column visibility.
(() => {
  const setup=()=>{const right=document.querySelector('.layui-header .layui-nav-right');if(right&&!document.querySelector('#themeToggle')){const li=document.createElement('li');li.className='layui-nav-item';li.innerHTML='<a href="javascript:" id="themeToggle"><i class="layui-icon layui-icon-theme"></i> 主题</a>';right.appendChild(li);li.querySelector('a').onclick=()=>{document.body.classList.toggle('admin-dark');localStorage.setItem('admin-theme',document.body.classList.contains('admin-dark')?'dark':'light');};if(localStorage.getItem('admin-theme')==='dark')document.body.classList.add('admin-dark');}const table=document.querySelector('#licenses table');if(table&&!document.querySelector('#licenseColumnToggle')){const box=document.createElement('div');box.id='licenseColumnToggle';box.className='toolbar';box.innerHTML='<button type="button" class="layui-btn layui-btn-xs layui-btn-primary">列设置</button>';table.parentElement.insertBefore(box,table);box.querySelector('button').onclick=()=>{layui.layer.open({type:1,title:'卡密列表列设置',area:['300px','auto'],content:'<div style="padding:18px"><label><input type="checkbox" data-col="4" checked> 设备上限</label><br><label><input type="checkbox" data-col="5" checked> 到期策略</label><br><label><input type="checkbox" data-col="6" checked> 到期时间</label><br><label><input type="checkbox" data-col="7" checked> 创建时间</label></div>',success:(node)=>node.find('input').on('change',function(){const col=Number(this.dataset.col)+1;table.querySelectorAll(`tr > *:nth-child(${col})`).forEach((cell)=>cell.style.display=this.checked?'':'none');})});};}};if(!document.querySelector('#adminThemeStyle')){const s=document.createElement('style');s.id='adminThemeStyle';s.textContent='.admin-dark,.admin-dark .layui-body{background:#18212f!important;color:#dbe5f2}.admin-dark .layui-card,.admin-dark .layui-table{background:#202c3d!important;color:#dbe5f2}.admin-dark .layui-card-header,.admin-dark .layui-table th{background:#243247!important;color:#dbe5f2}';document.head.appendChild(s);}setTimeout(setup,300);setInterval(setup,3000);
})();

// Header actions and audit export shortcuts.
(() => {
  const header=document.querySelector('.layui-header .layui-nav-right'); if(header&&!document.querySelector('#adminLogout')){const li=document.createElement('li');li.className='layui-nav-item';li.innerHTML='<a href="javascript:" id="adminLogout"><i class="layui-icon layui-icon-logout"></i> 退出</a>';header.appendChild(li);li.querySelector('#adminLogout').onclick=async()=>{await fetch('/admin/logout',{method:'POST',credentials:'same-origin'});location.href='/admin/login';};}
  const logs=document.querySelector('#logs .layui-card-header');if(logs&&!document.querySelector('#exportAuditCsv')){logs.insertAdjacentHTML('beforeend',' <span style="float:right"><button class="layui-btn layui-btn-xs layui-btn-primary" id="exportAuditCsv">导出 CSV</button><button class="layui-btn layui-btn-xs layui-btn-primary" id="exportAuditTxt">导出 TXT</button></span>');document.querySelector('#exportAuditCsv').onclick=()=>location.href='/admin/audit/export?format=csv';document.querySelector('#exportAuditTxt').onclick=()=>location.href='/admin/audit/export?format=txt';}
})();

// Administrator password change panel.
(() => {
  const mount=()=>{const root=document.querySelector('#p2Settings');if(!root||document.querySelector('#passwordPanel'))return;root.insertAdjacentHTML('beforeend','<div class="layui-col-md12" id="passwordPanel"><div class="layui-card"><div class="layui-card-header">修改管理员密码</div><div class="layui-card-body"><input id="currentAdminPassword" type="password" class="layui-input" style="width:220px;display:inline-block" placeholder="当前密码"><input id="newAdminPassword" type="password" class="layui-input" style="width:220px;display:inline-block;margin-left:8px" placeholder="新密码（至少10位）"><button id="changeAdminPassword" class="layui-btn layui-btn-sm" style="margin-left:8px">保存密码</button></div></div></div>');document.querySelector('#changeAdminPassword').onclick=async()=>{try{await adminApiRequest('/admin/password',{method:'POST',body:JSON.stringify({current_password:document.querySelector('#currentAdminPassword').value,new_password:document.querySelector('#newAdminPassword').value})});layui.layer.msg('密码已更新',{icon:1});document.querySelector('#currentAdminPassword').value='';document.querySelector('#newAdminPassword').value='';}catch(e){layui.layer.msg(e.payload?.error==='password_too_short'?'新密码至少10位':'密码修改失败',{icon:2});}};};setInterval(mount,500);setTimeout(mount,200);
})();

(() => {
  'use strict';

  const statusNames = { issued: '未激活', active: '已激活', suspended: '已封禁', revoked: '已撤销', expired: '已到期' };
  const durationNames = { forever: '永久', hour: '1小时', day: '1天', week: '1周', month: '1个月', quarter: '一季度', year: '1年', custom: '自定义' };
  const durationMs = { hour: 3600000, day: 86400000, week: 604800000, month: 2592000000, quarter: 7776000000, year: 31536000000 };
  const stateKey = 'license-admin-state';
  // The dashboard template declares `const data` at global script scope, which is
  // a global lexical binding rather than window.data. Read both forms.
  const getAdminData = () => {
    try { return typeof data !== 'undefined' ? data : (window.data || {}); } catch (_) { return window.data || {}; }
  };

  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const formatDate = (value) => {
    if (!value) return '永久';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    const p = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())} ${p(date.getHours())}:${p(date.getMinutes())}:${p(date.getSeconds())}`;
  };
  const notify = (message, icon = 1) => window.layui?.layer ? layui.layer.msg(message, { icon, time: 2200 }) : window.alert(message);
  const confirmAction = (message) => new Promise((resolve) => {
    if (window.layui?.layer) layui.layer.confirm(message, { title: '请确认操作', btn: ['确认', '取消'] }, () => resolve(true), () => resolve(false));
    else resolve(window.confirm(message));
  });
  const getState = () => { try { return JSON.parse(sessionStorage.getItem(stateKey) || '{}'); } catch (_) { return {}; } };
  const saveState = () => {
    const state = {
      search: document.querySelector('#search')?.value || '', product: document.querySelector('#productFilter')?.value || '',
      status: document.querySelector('#statusFilter')?.value || '', maxDevices: document.querySelector('#maxDevicesFilter')?.value || '',
      duration: document.querySelector('#durationFilter')?.value || ''
    };
    sessionStorage.setItem(stateKey, JSON.stringify(state));
  };

  function installMotion() {
    if (document.querySelector('#adminMotion')) return;
    const style = document.createElement('style');
    style.id = 'adminMotion';
    style.textContent = '.page.active{animation:adminPageIn .22s ease both}.layui-table tbody tr{transition:background .15s ease}.layui-table tbody tr:hover{background:#f5f8ff}.toolbar{display:flex;flex-wrap:wrap;gap:8px;align-items:center}.toolbar input{width:240px!important}.toolbar select{width:150px!important;min-width:120px;height:38px}.toolbar .layui-btn{margin:0}.license-key{font-family:Consolas,monospace;letter-spacing:.2px}@keyframes adminPageIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}';
    document.head.appendChild(style);
  }

  function installToolbar() {
    const toolbar = document.querySelector('#licenses .toolbar');
    if (!toolbar || document.querySelector('#productFilter')) return;
    const oldStatus = document.querySelector('#status');
    if (oldStatus) oldStatus.remove();
    document.querySelector('[onclick="exportKeys()"]')?.remove();
    document.querySelector('[onclick="bulkDelete()"]')?.remove();
    toolbar.insertAdjacentHTML('beforeend', `
      <select id="productFilter" class="layui-input" title="产品筛选"><option value="">全部产品</option></select>
      <select id="statusFilter" class="layui-input" title="状态筛选"><option value="">全部状态</option><option value="issued">未激活</option><option value="active">已激活</option><option value="suspended">已封禁</option><option value="revoked">已撤销</option><option value="expired">已到期</option></select>
      <select id="maxDevicesFilter" class="layui-input" title="设备上限筛选"><option value="">全部设备上限</option></select>
      <select id="durationFilter" class="layui-input" title="到期策略筛选"><option value="">全部到期策略</option>${Object.values(durationNames).map((x) => `<option value="${esc(x)}">${esc(x)}</option>`).join('')}</select>
      <button type="button" class="layui-btn layui-btn-primary" id="clearLicenseFilters">清空筛选</button>
      <button type="button" class="layui-btn layui-btn-warm" id="bulkSuspend">批量封禁</button>
      <button type="button" class="layui-btn layui-btn-normal" id="bulkUnsuspend">批量解封</button>
      <button type="button" class="layui-btn layui-btn-danger" id="bulkDeleteFinal">批量删除</button>
      <button type="button" class="layui-btn layui-btn-primary" id="exportCsv">导出 CSV</button>
      <button type="button" class="layui-btn layui-btn-primary" id="exportTxt">导出 TXT</button>`);
    ['#search', '#productFilter', '#statusFilter', '#maxDevicesFilter', '#durationFilter'].forEach((selector) => document.querySelector(selector)?.addEventListener('input', renderLicenses));
    ['#productFilter', '#statusFilter', '#maxDevicesFilter', '#durationFilter'].forEach((selector) => document.querySelector(selector)?.addEventListener('change', renderLicenses));
    document.querySelector('#clearLicenseFilters').onclick = () => { ['#search', '#productFilter', '#statusFilter', '#maxDevicesFilter', '#durationFilter'].forEach((selector) => { const node = document.querySelector(selector); if (node) node.value = ''; }); renderLicenses(); };
    document.querySelector('#exportCsv').onclick = () => exportLicenses('csv');
    document.querySelector('#exportTxt').onclick = () => exportLicenses('txt');
    document.querySelector('#bulkDeleteFinal').onclick = () => bulkDeleteSelected();
    document.querySelector('#bulkSuspend').onclick = () => bulkChangeStatus('suspend');
    document.querySelector('#bulkUnsuspend').onclick = () => bulkChangeStatus('unsuspend');
  }

  function populateFilterOptions() {
    const licenses = getAdminData().licenses || [];
    const product = document.querySelector('#productFilter');
    const maxDevices = document.querySelector('#maxDevicesFilter');
    if (product) { const selected = product.value; const values = [...new Set(licenses.map((x) => x.product_code).filter(Boolean))].sort(); product.innerHTML = '<option value="">全部产品</option>' + values.map((x) => `<option value="${esc(x)}">${esc(x)}</option>`).join(''); product.value = values.includes(selected) ? selected : ''; }
    if (maxDevices) { const selected = maxDevices.value; const values = [...new Set(licenses.map((x) => String(x.max_devices)).filter(Boolean))].sort((a, b) => Number(a) - Number(b)); maxDevices.innerHTML = '<option value="">全部设备上限</option>' + values.map((x) => `<option value="${esc(x)}">${esc(x)} 台</option>`).join(''); maxDevices.value = values.includes(selected) ? selected : ''; }
  }

  function filteredLicenses() {
    const keyword = (document.querySelector('#search')?.value || '').trim().toLowerCase();
    const product = document.querySelector('#productFilter')?.value || '';
    const status = document.querySelector('#statusFilter')?.value || '';
    const maxDevices = document.querySelector('#maxDevicesFilter')?.value || '';
    const duration = document.querySelector('#durationFilter')?.value || '';
    return (getAdminData().licenses || []).filter((license) => {
      const key = String(license.plain_key || license.key_prefix || '').toLowerCase();
      const productCode = String(license.product_code || '').toLowerCase();
      return (!keyword || key.includes(keyword) || productCode.includes(keyword)) && (!product || license.product_code === product) && (!status || license.status === status) && (!maxDevices || String(license.max_devices) === maxDevices) && (!duration || (license.duration_label || '永久') === duration);
    });
  }

  window.renderLicenses = function renderLicenses() {
    installToolbar();
    populateFilterOptions();
    const head = document.querySelector('#licenses thead tr');
    if (head) head.innerHTML = '<th style="width:36px"><input type="checkbox" id="checkAllLicenses" title="全选"></th><th>卡密</th><th>产品</th><th>状态</th><th>在线情况</th><th>设备上限</th><th>到期策略</th><th>到期时间</th><th>创建时间</th><th>操作</th>';
    const body = document.querySelector('#licenseRows');
    if (!body) return;
    const rows = filteredLicenses();
    body.innerHTML = rows.length ? rows.map((license) => {
      const key = license.plain_key || license.key_prefix || '历史卡密不可恢复';
      const statusClass = license.status === 'active' ? 'layui-bg-green' : license.status === 'issued' ? 'layui-bg-gray' : 'layui-bg-red';
      const action = license.status === 'suspended' ? `<button class="layui-btn layui-btn-xs" onclick="toggleSuspend('${esc(license.id)}',true)">解封</button>` : license.status === 'revoked' ? '' : `<button class="layui-btn layui-btn-xs layui-btn-warm" onclick="toggleSuspend('${esc(license.id)}',false)">封禁</button>`;
      return `<tr><td><input class="keyCheck" type="checkbox" value="${esc(license.id)}"></td><td class="license-key">${esc(key)}${license.plain_key ? ` <button class="layui-btn layui-btn-xs layui-btn-primary" onclick="copyKey('${esc(license.plain_key)}')">复制</button>` : ''}</td><td>${esc(license.product_code)}</td><td><span class="layui-badge ${statusClass}">${esc(statusNames[license.status] || license.status)}</span></td><td>${esc(license.max_devices)}</td><td>${esc(license.duration_label || '永久')}</td><td>${esc(formatDate(license.expires_at))}</td><td>${esc(formatDate(license.created_at))}</td><td>${action} <button class="layui-btn layui-btn-xs layui-btn-danger" onclick="removeKey('${esc(license.id)}')">删除</button></td></tr>`;
    }).join('') : '<tr><td colspan="9" style="text-align:center;color:#8b95a7">没有匹配的卡密</td></tr>';
    const selectAll = document.querySelector('#checkAllLicenses');
    if (selectAll) selectAll.onchange = () => document.querySelectorAll('.keyCheck').forEach((node) => { node.checked = selectAll.checked; });
    saveState();
  };

  window.copyKey = (key) => navigator.clipboard?.writeText(key).then(() => notify('已复制完整卡密'));
  window.toggleSuspend = async (id, suspended) => { if (!await confirmAction(`确定${suspended ? '解封' : '封禁'}这张卡密吗？`)) return; const response = await fetch(`/admin/licenses/${id}/${suspended ? 'unsuspend' : 'suspend'}`, { method: 'POST' }); if (!response.ok) return notify('操作失败', 2); notify(`${suspended ? '解封' : '封禁'}成功`); setTimeout(() => location.reload(), 300); };
  window.removeKey = async (id) => { if (!await confirmAction('确定删除这张卡密吗？删除后不可恢复。')) return; const response = await fetch(`/admin/licenses/${id}`, { method: 'DELETE' }); if (!response.ok) return notify('删除失败', 2); notify('删除成功'); setTimeout(() => location.reload(), 300); };

  window.bulkDelete = async () => { const ids = [...document.querySelectorAll('.keyCheck:checked')].map((node) => node.value); if (!ids.length) return notify('请先选择卡密', 2); if (!await confirmAction(`确定删除 ${ids.length} 张卡密吗？删除后不可恢复。`)) return; const response = await fetch('/admin/licenses/bulk-delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }) }); if (!response.ok) return notify('批量删除失败', 2); notify(`已删除 ${ids.length} 张卡密`); setTimeout(() => location.reload(), 350); };
  window.exportLicenses = (format) => { const ids = [...document.querySelectorAll('.keyCheck:checked')].map((node) => node.value); const params = new URLSearchParams({ format }); if (ids.length) params.set('ids', ids.join(',')); else { const filters = { search: '#search', product: '#productFilter', status: '#statusFilter', max_devices: '#maxDevicesFilter', duration: '#durationFilter' }; Object.entries(filters).forEach(([key, selector]) => { const value = document.querySelector(selector)?.value || ''; if (value) params.set(key, value); }); } saveState(); location.href = `/admin/licenses/export?${params.toString()}`; };
  const selectedIds = () => [...document.querySelectorAll('.keyCheck:checked')].map((node) => node.value);
  const bulkDeleteSelected = () => window.bulkDelete();
  const bulkChangeStatus = async (action) => { const ids = selectedIds(); if (!ids.length) return notify('请先选择卡密', 2); const label = action === 'suspend' ? '封禁' : '解封'; if (!await confirmAction(`确定${label} ${ids.length} 张卡密吗？`)) return; const results = await Promise.all(ids.map((id) => fetch(`/admin/licenses/${id}/${action}`, { method: 'POST' }))); const failed = results.filter((response) => !response.ok).length; if (failed) notify(`${label}完成，失败 ${failed} 张`, 2); else notify(`${label}成功，共 ${ids.length} 张`); setTimeout(() => location.reload(), 350); };

  window.openCreate = () => {
    layui.layer.open({ type: 1, title: '批量生成卡密', area: ['500px', 'auto'], content: `<div style="padding:22px"><div class="layui-form-item"><label class="layui-form-label">产品</label><div class="layui-input-block"><input id="genProduct" class="layui-input" value="debug"></div></div><div class="layui-form-item"><label class="layui-form-label">数量</label><div class="layui-input-block"><input id="genCount" type="number" class="layui-input" min="1" max="1000" value="1"></div></div><div class="layui-form-item"><label class="layui-form-label">设备上限</label><div class="layui-input-block"><input id="genMax" type="number" class="layui-input" min="1" value="1"></div></div><div class="layui-form-item"><label class="layui-form-label">卡密长度</label><div class="layui-input-block"><input id="genLength" type="number" class="layui-input" min="4" max="128" value="16"></div></div><div class="layui-form-item"><label class="layui-form-label">到期策略</label><div class="layui-input-block"><select id="genExpiry" class="layui-input" style="display:block">${Object.entries(durationNames).map(([key, value]) => `<option value="${key}">${value}</option>`).join('')}</select></div></div><div id="genCustomWrap" class="layui-form-item" style="display:none"><label class="layui-form-label">到期时间</label><div class="layui-input-block"><input id="genCustom" type="datetime-local" class="layui-input"></div></div><div class="layui-form-item"><div class="layui-input-block"><button id="submitCreate" class="layui-btn layui-btn-fluid">确认生成</button></div></div></div>` });
    document.querySelector('#genExpiry').onchange = (event) => { document.querySelector('#genCustomWrap').style.display = event.target.value === 'custom' ? 'block' : 'none'; };
    document.querySelector('#submitCreate').onclick = async () => { const mode = document.querySelector('#genExpiry').value; let expiresAt = null; if (mode === 'custom') { const value = document.querySelector('#genCustom').value; if (!value) return notify('请选择到期时间', 2); expiresAt = new Date(value).toISOString(); } else if (mode !== 'forever') expiresAt = new Date(Date.now() + durationMs[mode]).toISOString(); const response = await fetch('/admin/licenses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ product_code: document.querySelector('#genProduct').value, count: Number(document.querySelector('#genCount').value), max_devices: Number(document.querySelector('#genMax').value), key_length: Number(document.querySelector('#genLength').value), expires_at: expiresAt, duration_code: mode, duration_label: durationNames[mode] }) }); const result = await response.json(); if (!response.ok || !result.licenses) return notify('生成失败', 2); layui.layer.closeAll(); notify(`成功生成 ${result.licenses.length} 张卡密`); setTimeout(() => location.reload(), 450); };
  };

  function restoreState() { const state = getState(); for (const [id, value] of Object.entries({ search: state.search, productFilter: state.product, statusFilter: state.status, maxDevicesFilter: state.maxDevices, durationFilter: state.duration })) { const node = document.querySelector(`#${id}`); if (node && value != null) node.value = value; } }
  function activate(view) { document.querySelectorAll('.page').forEach((page) => page.classList.toggle('active', page.id === view)); document.querySelectorAll('[data-view]').forEach((item) => item.parentElement.classList.toggle('layui-this', item.dataset.view === view)); location.hash = view; if (view === 'licenses') window.renderLicenses(); }

  installMotion();
  document.querySelectorAll('[data-view]').forEach((item) => item.addEventListener('click', () => activate(item.dataset.view)));
  installToolbar();
  restoreState();
  activate(location.hash.replace('#', '') || 'overview');
  setTimeout(() => { installToolbar(); restoreState(); window.renderLicenses(); }, 50);
})();

// Final product-filter guard must run after the pagination module above.
(() => {
  if (window.__catalogFilterFinalized) return;
  const sync = async () => {
    const select = document.querySelector('#productFilter'); if (!select) return;
    try { const response = await fetch('/admin/products', { cache: 'no-store', credentials: 'same-origin' }); if (!response.ok) return; const payload = await response.json(); const current = select.value; const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c])); const items = (payload.products || []).filter((p) => p.status === 'active').sort((a,b) => String(a.name).localeCompare(String(b.name))); select.innerHTML = '<option value="">全部产品</option>' + items.map((p) => `<option value="${esc(p.code)}">${esc(p.name)}（${esc(p.code)}）</option>`).join(''); select.value = items.some((p) => p.code === current) ? current : ''; } catch (_) {}
  };
  setTimeout(() => { const render = window.renderLicenses; if (typeof render === 'function') window.renderLicenses = function catalogRender() { render.apply(this, arguments); setTimeout(sync, 0); }; }, 0);
  window.__catalogFilterFinalized = true; setTimeout(sync, 350); setInterval(sync, 5000);
})();

// Final render guard: P1 pagination replaces renderLicenses later in the file.
(() => {
  if (window.__finalProductFilterGuard) return;
  const syncCatalog = async () => {
    const select = document.querySelector('#productFilter'); if (!select) return;
    try {
      const response = await fetch('/admin/products', { cache: 'no-store', credentials: 'same-origin' });
      if (!response.ok) return;
      const payload = await response.json(); const current = select.value;
      const items = (payload.products || []).filter((p) => p.status === 'active').sort((a, b) => String(a.name).localeCompare(String(b.name)));
      const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
      select.innerHTML = '<option value="">全部产品</option>' + items.map((p) => `<option value="${escapeHtml(p.code)}">${escapeHtml(p.name)}（${escapeHtml(p.code)}）</option>`).join('');
      select.value = items.some((p) => p.code === current) ? current : '';
    } catch (_) {}
  };
  const render = window.renderLicenses;
  if (typeof render === 'function') window.renderLicenses = function finalRenderLicenses() { render.apply(this, arguments); setTimeout(syncCatalog, 0); };
  window.__finalProductFilterGuard = true;
  setTimeout(syncCatalog, 250); setInterval(syncCatalog, 5000);
})();

// Keep the license product filter in sync with the product catalog, including products without licenses yet.
(() => {
  let busy=false;
  const sync=async()=>{const select=document.querySelector('#productFilter');if(!select||busy)return;busy=true;try{const r=await fetch('/admin/products',{cache:'no-store'});const j=await r.json();const current=select.value;const items=(j.products||[]).filter((p)=>p.status==='active').sort((a,b)=>String(a.name).localeCompare(String(b.name)));const safe=(v)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));select.innerHTML='<option value="">全部产品</option>'+items.map((p)=>`<option value="${safe(p.code)}">${safe(p.name)}（${safe(p.code)}）</option>`).join('');select.value=items.some((p)=>p.code===current)?current:'';}catch(_){}finally{busy=false;}};
  const originalRender=window.renderLicenses; if(originalRender&&!window.__productFilterWrapped){window.__productFilterWrapped=true;window.renderLicenses=function(){originalRender.apply(this,arguments);setTimeout(sync,0);};}
  setTimeout(sync,300);setInterval(sync,5000);
})();

// Split audit logs by source and filter by product.
(() => {
  const esc=(v)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt=(v)=>{const d=new Date(v);if(Number.isNaN(d.getTime()))return v||'';const p=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;};
  const names={activate:'卡密激活',login:'客户端登录',heartbeat:'心跳验证',verify:'会话验证',logout:'客户端退出','license.create':'生成卡密','license.update':'编辑卡密','license.delete':'删除卡密','license.suspend':'封禁卡密','license.unsuspend':'解封卡密','product.create':'添加产品','product.update':'编辑产品','product.delete':'删除产品','audit.archive':'审计归档'};
  let auditRows=[];
  const loadAudit=async()=>{const j=await adminApiRequest('/admin/audit',{cache:'no-store'});auditRows=j.logs||[];return auditRows;};
  const setup=async()=>{const section=document.querySelector('#logs');if(!section)return;const card=section.querySelector('.layui-card-body');if(!card)return;if(!document.querySelector('#auditFilters'))card.insertAdjacentHTML('afterbegin','<div id="auditFilters" class="toolbar"><select id="auditSource" class="layui-input" style="width:160px"><option value="">全部来源</option><option value="client">客户端操作</option><option value="admin">后台操作</option></select><select id="auditProduct" class="layui-input" style="width:180px"><option value="">全部产品</option></select><input id="auditKey" class="layui-input" style="width:240px" placeholder="输入卡密或卡密前缀"></div>');await loadAudit();const products=[...new Set(auditRows.map(x=>x.product_code).filter(Boolean))];const saved=JSON.parse(sessionStorage.getItem('audit-filter')||'{}');document.querySelector('#auditProduct').innerHTML='<option value="">全部产品</option>'+products.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('');document.querySelector('#auditSource').value=saved.source||'';document.querySelector('#auditProduct').value=saved.product||'';document.querySelector('#auditKey').value=saved.key||'';const save=()=>{sessionStorage.setItem('audit-filter',JSON.stringify({source:document.querySelector('#auditSource').value,product:document.querySelector('#auditProduct').value,key:document.querySelector('#auditKey').value}));render();};document.querySelector('#auditSource').onchange=save;document.querySelector('#auditProduct').onchange=save;document.querySelector('#auditKey').oninput=save;render();};
  const render=()=>{const source=document.querySelector('#auditSource')?.value||'',product=document.querySelector('#auditProduct')?.value||'',key=(document.querySelector('#auditKey')?.value||'').trim().toLowerCase(),rows=auditRows.filter(x=>(!source||x.source===source)&&(!product||x.product_code===product)&&(!key||String(x.key_prefix||'').toLowerCase().includes(key)||String(x.license_key||'').toLowerCase().includes(key))),body=document.querySelector('#logRows');if(!body)return;body.innerHTML=rows.length?rows.map(x=>`<tr><td>${x.source==='client'?'客户端':'后台'}</td><td>${esc(x.product_code||'系统')}</td><td><code>${esc(x.key_prefix||'-')}</code></td><td>${esc(names[x.action]||x.action)}</td><td>${x.result==='ok'?'<span class="layui-badge layui-bg-green">成功</span>':'<span class="layui-badge layui-bg-red">失败</span>'}</td><td>${esc(x.reason||'-')}</td><td>${esc(x.ip_address||'-')}</td><td>${esc(fmt(x.created_at))}</td></tr>`).join(''):'<tr><td colspan="8" style="text-align:center;color:#8b95a7">暂无匹配日志</td></tr>';};
  const head= document.querySelector('#logs thead tr'); if(head)head.innerHTML='<th>来源</th><th>产品</th><th>卡密</th><th>动作</th><th>结果</th><th>原因</th><th>IP</th><th>时间</th>'; const title=document.querySelector('#logs .layui-card-header');if(title)title.textContent='审计日志';window.renderAudit=()=>{if(document.querySelector('#auditFilters')){loadAudit().then(render);}else setup();};document.querySelectorAll('[data-view="logs"]').forEach(x=>x.addEventListener('click',()=>setTimeout(setup,0)));setTimeout(setup,180);
})();

// Product catalog management and product-backed license generation.
(() => {
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  let products = [];
  const loadProducts = async () => { const j = await adminApiRequest('/admin/products', { cache: 'no-store' }); products = j.products || []; return products; };
  const ensurePage = () => {
    const nav = document.querySelector('[data-view="licenses"]')?.parentElement;
    if (nav && !document.querySelector('[data-view="products"]')) nav.insertAdjacentHTML('afterend', '<li class="layui-nav-item"><a href="javascript:" data-view="products"><i class="layui-icon layui-icon-component"></i> 产品管理</a></li>');
    if (!document.querySelector('#products')) document.querySelector('.layui-body')?.insertAdjacentHTML('beforeend', '<section id="products" class="page"><div class="layui-card"><div class="layui-card-header">产品管理 <button class="layui-btn layui-btn-sm layui-btn-normal" style="float:right;margin-top:8px" id="addProduct"><i class="layui-icon layui-icon-add-1"></i> 添加产品</button></div><div class="layui-card-body"><table class="layui-table"><thead><tr><th>产品编号</th><th>产品名称</th><th>状态</th><th>创建时间</th><th>操作</th></tr></thead><tbody id="productRows"></tbody></table></div></div></section>');
    document.querySelectorAll('[data-view="products"]').forEach((x) => { if (!x.dataset.bound) { x.dataset.bound='1'; x.addEventListener('click', () => { activateProducts(); }); } });
  };
  const activateProducts = async () => { ensurePage(); document.querySelectorAll('.page').forEach((p) => p.classList.toggle('active', p.id === 'products')); document.querySelectorAll('[data-view]').forEach((x) => x.parentElement.classList.toggle('layui-this', x.dataset.view === 'products')); location.hash='products'; await loadProducts(); renderProducts(); };
  const renderProducts = () => { const body=document.querySelector('#productRows'); if(!body)return; body.innerHTML=products.map((p)=>`<tr><td><code>${esc(p.code)}</code></td><td>${esc(p.name)}</td><td>${p.status==='active'?'启用':'停用'}</td><td>${esc(p.created_at||'')}</td><td><button class="layui-btn layui-btn-xs" data-product-config="${esc(p.id)}">配置</button> <button class="layui-btn layui-btn-xs layui-btn-normal" data-product-publish="${esc(p.id)}">发布</button> <button class="layui-btn layui-btn-xs layui-btn-warm" data-product-rollback="${esc(p.id)}">回滚</button> <button class="layui-btn layui-btn-xs layui-btn-primary" data-product-rotate="${esc(p.id)}">轮换</button> <button class="layui-btn layui-btn-xs" data-product-edit="${esc(p.id)}">编辑</button> <button class="layui-btn layui-btn-xs layui-btn-danger" data-product-delete="${esc(p.id)}">删除</button></td></tr>`).join('') || '<tr><td colspan="5" class="muted">暂无产品</td></tr>'; body.querySelectorAll('[data-product-config]').forEach((b)=>b.onclick=()=>editProductConfig(b.dataset.productConfig)); ['publish','rollback','rotate'].forEach((a)=>body.querySelectorAll('[data-product-'+a+']').forEach((b)=>b.onclick=async()=>{try{await adminApiRequest('/admin/products/'+b.dataset['product'+a[0].toUpperCase()+a.slice(1)]+'/config/'+a,{method:'POST',body:'{}'});notify(a==='publish'?'配置已发布':a==='rollback'?'配置已回滚':'加密配置已轮换');}catch(_){notify('操作失败',2);}})); body.querySelectorAll('[data-product-edit]').forEach((b)=>b.onclick=()=>editProduct(b.dataset.productEdit)); body.querySelectorAll('[data-product-delete]').forEach((b)=>b.onclick=()=>deleteProduct(b.dataset.productDelete)); };
  const editProductConfig = async (id) => { let c; try { c=(await adminApiRequest('/admin/products/'+id+'/config',{cache:'no-store'})).config; } catch (_) { return notify('读取产品配置失败',2); } const v=(x)=>esc(x??''); const content=`<form class="layui-form" style="padding:20px 28px"><div class="layui-form-item"><label class="layui-form-label">公告开关</label><div class="layui-input-block"><input type="checkbox" id="cfgAnnEnabled" lay-skin="switch" title="启用" ${c.announcement_enabled?'checked':''}></div></div><div class="layui-form-item"><label class="layui-form-label">公告标题</label><div class="layui-input-block"><input id="cfgAnnTitle" class="layui-input" value="${v(c.announcement_title)}"></div></div><div class="layui-form-item"><label class="layui-form-label">公告内容</label><div class="layui-input-block"><textarea id="cfgAnn" class="layui-textarea">${v(c.announcement)}</textarea></div></div><div class="layui-form-item"><label class="layui-form-label">强制阅读</label><div class="layui-input-block"><input type="checkbox" id="cfgForceRead" lay-skin="switch" title="是" ${c.force_read?'checked':''}></div></div><div class="layui-form-item"><label class="layui-form-label">当前版本</label><div class="layui-input-block"><input id="cfgVersion" class="layui-input" value="${v(c.version||'1.0.0')}"></div></div><div class="layui-form-item"><label class="layui-form-label">最低版本</label><div class="layui-input-block"><input id="cfgMinVersion" class="layui-input" value="${v(c.min_version||'1.0.0')}"></div></div><div class="layui-form-item"><label class="layui-form-label">强制升级</label><div class="layui-input-block"><input type="checkbox" id="cfgForceUpdate" lay-skin="switch" title="是" ${c.force_update?'checked':''}></div></div><div class="layui-form-item"><label class="layui-form-label">更新地址</label><div class="layui-input-block"><input id="cfgUrl" class="layui-input" value="${v(c.update_url)}"></div></div><div class="layui-form-item"><label class="layui-form-label">更新说明</label><div class="layui-input-block"><textarea id="cfgNotes" class="layui-textarea">${v(c.update_notes)}</textarea></div></div><div class="layui-form-item"><label class="layui-form-label">加密配置</label><div class="layui-input-block"><input id="cfgProfile" class="layui-input" value="${v(c.crypto_profile||'default-v3')}"><textarea id="cfgCrypto" class="layui-textarea" style="margin-top:8px">${v(JSON.stringify(c.crypto_config||{},null,2))}</textarea></div></div><div class="layui-form-item"><div class="layui-input-block"><button type="button" class="layui-btn" id="saveProductConfig">保存配置</button></div></div></form>`; layui.layer.open({type:1,title:'产品配置 - '+v(c.name||c.product_code),area:['680px','680px'],content,success:(layero,index)=>{layui.form.render(null,layero);layero.find('#saveProductConfig').on('click',async()=>{let crypto={};try{crypto=JSON.parse(layero.find('#cfgCrypto').val()||'{}');}catch(_){return notify('加密配置必须是有效 JSON',2);}const payload={announcement_enabled:layero.find('#cfgAnnEnabled').prop('checked')?1:0,announcement_title:layero.find('#cfgAnnTitle').val(),announcement:layero.find('#cfgAnn').val(),force_read:layero.find('#cfgForceRead').prop('checked')?1:0,version:layero.find('#cfgVersion').val(),min_version:layero.find('#cfgMinVersion').val(),force_update:layero.find('#cfgForceUpdate').prop('checked')?1:0,update_url:layero.find('#cfgUrl').val(),update_notes:layero.find('#cfgNotes').val(),crypto_profile:layero.find('#cfgProfile').val(),crypto_config:crypto};try{await adminApiRequest('/admin/products/'+id+'/config',{method:'PATCH',body:JSON.stringify(payload)});}catch(_){return notify('保存失败，请检查版本号格式',2);}layui.layer.close(index);notify('产品配置已保存');});}}); };
  const productForm = (p) => `<form class="layui-form" lay-filter="productForm" style="padding:22px 28px 8px"><div class="layui-form-item"><label class="layui-form-label">产品编号</label><div class="layui-input-block"><input id="productCode" class="layui-input" value="${esc(p?.code||'')}" ${p?'readonly':''} required></div></div><div class="layui-form-item"><label class="layui-form-label">产品名称</label><div class="layui-input-block"><input id="productName" class="layui-input" value="${esc(p?.name||'')}" required></div></div><div class="layui-form-item"><label class="layui-form-label">状态</label><div class="layui-input-block"><select id="productStatus" name="status" lay-filter="productStatus"><option value="active" ${(p?.status||'active')==='active'?'selected':''}>启用</option><option value="disabled" ${(p?.status||'')==='disabled'?'selected':''}>停用</option></select></div></div><div class="layui-form-item"><div class="layui-input-block"><button type="button" class="layui-btn" id="saveProduct">保存</button></div></div></form>`;
  const renderProductForm = () => { if (window.layui?.form) layui.form.render('select', 'productForm'); };
  const editProduct = (id) => { const p=products.find((x)=>x.id===id); if(!p)return; layui.layer.open({type:1,title:'编辑产品',area:['480px','auto'],content:productForm(p),success:(layero,index)=>{renderProductForm(layero);layero.find('#saveProduct').on('click',async()=>{try{await adminApiRequest('/admin/products/'+id,{method:'PATCH',body:JSON.stringify({name:layero.find('#productName').val().trim(),status:layero.find('#productStatus').val()})});}catch(_){return notify('保存失败',2);}layui.layer.close(index);await loadProducts();renderProducts();notify('产品已保存');});}}); };
  const deleteProduct = async (id) => { const p=products.find((x)=>x.id===id); layui.layer.confirm(`确定删除产品“${esc(p?.name||'')}”吗？`,{title:'删除产品',icon:3},async(index)=>{try{await adminApiRequest('/admin/products/'+id,{method:'DELETE'});}catch(_){layui.layer.close(index);return notify('产品已被卡密使用，不能删除',2);}layui.layer.close(index);await loadProducts();renderProducts();notify('产品已删除');}); };
  const add = () => { layui.layer.open({type:1,title:'添加产品',area:['480px','auto'],content:productForm(),success:(layero,index)=>{renderProductForm(layero);layero.find('#saveProduct').on('click',async()=>{const code=layero.find('#productCode').val().trim(),name=layero.find('#productName').val().trim();if(!code||!name)return notify('请填写产品编号和名称',2);try{await adminApiRequest('/admin/products',{method:'POST',body:JSON.stringify({code,name,status:layero.find('#productStatus').val()||'active'})});}catch(_){return notify('添加失败，产品编号可能已存在',2);}layui.layer.close(index);await loadProducts();renderProducts();notify('产品已添加');});}}); };
  const oldOpen = window.openCreate;
  window.openCreate = async () => { await loadProducts(); if(!products.filter((p)=>p.status==='active').length)return notify('请先在产品管理中添加启用产品',2); oldOpen(); setTimeout(()=>{ const input=document.querySelector('#genProduct'); if(input){ const select=document.createElement('select'); select.id='genProduct'; select.className='layui-input'; select.innerHTML=products.filter((p)=>p.status==='active').map((p)=>`<option value="${esc(p.code)}">${esc(p.name)} (${esc(p.code)})</option>`).join(''); input.replaceWith(select); } },30); };
  ensurePage(); document.querySelector('#addProduct')?.addEventListener('click',add); document.querySelectorAll('[data-view="products"]').forEach((x)=>x.addEventListener('click',activateProducts)); if(location.hash==='#products')activateProducts();
})();

(() => {
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const initSettings = () => {
    const page = document.querySelector('#settings'); if (!page || page.querySelector('#p2Settings')) return;
    page.innerHTML = `<div class="head"><div><h1>系统设置</h1><p>P2 本地部署控制面板</p></div></div><div id="p2Settings" class="layui-row layui-col-space16"><div class="layui-col-md6"><div class="layui-card"><div class="layui-card-header">实时同步</div><div class="layui-card-body"><p>后台数据每 5 秒自动更新。</p><p>最近同步：<strong id="p2SyncTime">等待同步</strong></p><button class="layui-btn layui-btn-sm" id="p2Refresh">立即同步</button></div></div></div><div class="layui-col-md6"><div class="layui-card"><div class="layui-card-header">审计归档</div><div class="layui-card-body"><p>将指定编号以前的审计记录移动到归档表。</p><div class="layui-inline"><input id="p2ArchiveId" class="layui-input" type="number" min="1" placeholder="归档到日志 ID"></div><button class="layui-btn layui-btn-sm layui-btn-warm" id="p2Archive">执行归档</button></div></div></div><div class="layui-col-md12"><div class="layui-card"><div class="layui-card-header">API 密钥</div><div class="layui-card-body"><div class="layui-form"><input id="p2ApiName" class="layui-input" style="width:220px;display:inline-block" placeholder="密钥名称"><select id="p2ApiRole" class="layui-input" style="width:140px;display:inline-block"><option value="readonly">只读</option><option value="operator">操作员</option><option value="admin">管理员</option></select><button class="layui-btn layui-btn-sm" id="p2ApiCreate">生成密钥</button></div><div id="p2ApiList" style="margin-top:14px"></div></div></div></div>`;
    const listKeys = async () => { const r=await fetch('/admin/api-keys',{cache:'no-store'}); const j=await r.json(); document.querySelector('#p2ApiList').innerHTML=(j.api_keys||[]).map((x)=>`<p><code>${esc(x.name)}</code> · ${esc({readonly:'只读',operator:'操作员',admin:'管理员'}[x.role]||x.role)} · ${x.status==='active'?'启用':'停用'} · ${esc(x.created_at)}</p>`).join('')||'<span class="muted">暂无 API 密钥</span>'; };
    document.querySelector('#p2Refresh').onclick=()=>window.refreshAdminData?.(); document.querySelector('#p2Archive').onclick=async()=>{const id=Number(document.querySelector('#p2ArchiveId').value);if(!id)return layui.layer.msg('请输入日志 ID');const r=await fetch('/admin/audit/archive',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({before_id:id})});const j=await r.json();layui.layer.msg(j.archived!=null?`已归档 ${j.archived} 条日志`:'归档失败');window.refreshAdminData?.();}; document.querySelector('#p2ApiCreate').onclick=async()=>{const name=document.querySelector('#p2ApiName').value.trim();if(!name)return layui.layer.msg('请输入密钥名称');const r=await fetch('/admin/api-keys',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,role:document.querySelector('#p2ApiRole').value})});const j=await r.json();if(j.api_key){layui.layer.alert(`新 API 密钥（只显示一次）：<br><code>${esc(j.api_key)}</code>`);document.querySelector('#p2ApiName').value='';listKeys();}}; listKeys();
  };
  document.querySelectorAll('[data-view="settings"]').forEach((x)=>x.addEventListener('click',()=>setTimeout(initSettings,0))); setTimeout(initSettings,160);
})();

// Live dashboard refresh. Keeps the current view/filter/page while replacing data.
(() => {
  let refreshing = false;
  const refreshData = async () => {
    if (refreshing || document.hidden) return;
    refreshing = true;
    try {
      const response = await fetch('/admin/data', { cache: 'no-store', headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error('refresh failed');
      const next = await response.json();
      if (typeof data !== 'undefined') { data.licenses = next.licenses || []; data.devices = next.devices || []; data.logs = next.logs || []; }
      window.__adminLastSync = next.server_time || new Date().toISOString();
      if (typeof window.renderLicenses === 'function') window.renderLicenses();
      if (typeof window.renderDevicesOnline === 'function') window.renderDevicesOnline();
      if (typeof window.renderAudit === 'function') window.renderAudit();
      const active = document.querySelector('.page.active')?.id;
      if (active === 'overview') {
        const metrics = document.querySelector('#metrics');
        if (metrics) metrics.innerHTML = [['授权总数', data.licenses.length], ['活跃授权', data.licenses.filter((x) => x.status === 'active').length], ['绑定设备', data.devices.length], ['审计事件', data.logs.length]].map((x) => `<div class="layui-col-md3"><div class="layui-card metric"><span class="muted">${x[0]}</span><b>${x[1]}</b></div></div>`).join('');
      }
    } catch (_) { /* transient network errors are retried on the next interval */ }
    finally { refreshing = false; }
  };
  window.refreshAdminData = refreshData;
  setInterval(refreshData, 5000);
  setTimeout(refreshData, 500);
})();

// Audit log presentation: detailed Chinese business labels and license/IP columns.
(() => {
  const actionNames = { activate: '卡密激活', heartbeat: '心跳验证', verify: '会话验证', 'license.create': '生成卡密', 'license.update': '编辑卡密', 'license.delete': '删除卡密', 'license.suspend': '封禁卡密', 'license.unsuspend': '解封卡密' };
  const resultNames = { ok: '成功', fail: '失败', error: '错误' };
  const reasonNames = { license_suspended: '卡密已封禁', license_expired: '卡密已到期', license_revoked: '卡密已撤销', invalid_license: '卡密不存在或错误', device_not_bound: '设备未绑定', device_limit_reached: '设备数量已达上限', bulk: '批量操作', active: '恢复为已激活', issued: '恢复为未激活' };
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (v) => { if (!v) return ''; const d = new Date(v); if (Number.isNaN(d.getTime())) return v; const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`; };
  function renderAudit() {
    const body = document.querySelector('#logRows'); const logs = (() => { try { return typeof data !== 'undefined' ? data.logs : (window.data?.logs || []); } catch (_) { return []; } })();
    if (!body) return;
    body.innerHTML = logs.length ? logs.map((log) => `<tr><td><code>${esc(log.license_key || log.key_prefix || '系统')}</code></td><td>${esc(actionNames[log.action] || log.action || '未知动作')}</td><td><span class="layui-badge ${log.result === 'ok' ? 'layui-bg-green' : 'layui-bg-red'}">${esc(resultNames[log.result] || log.result || '未知')}</span></td><td>${esc(reasonNames[log.reason] || log.reason || '无')}</td><td>${esc(log.ip_address || '未知')}</td><td>${esc(fmt(log.created_at))}</td></tr>`).join('') : '<tr><td colspan="6" style="text-align:center;color:#8b95a7">暂无审计日志</td></tr>';
  }
  const auditSection = document.querySelector('#logs');
  if (false && auditSection) {
    const head = auditSection.querySelector('thead tr');
    if (head) head.innerHTML = '<th>卡密</th><th>动作</th><th>结果</th><th>原因</th><th>IP</th><th>时间</th>';
    const title = auditSection.querySelector('.layui-card-header'); if (title) title.textContent = '审计日志（详细记录）';
  }
  window.__legacyRenderAudit = renderAudit;
})();

// P1 operations layer: sorting, pagination, detail drawer and overview alerts.
(() => {
  const state = { page: 1, size: 10, sort: 'created_at', dir: 'desc' };
  const getData = () => { try { return typeof data !== 'undefined' ? data : (window.data || {}); } catch (_) { return window.data || {}; } };
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const dateText = (v) => { if (!v) return '永久'; const d = new Date(v); if (Number.isNaN(d.getTime())) return v; const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`; };
  const statusText = { issued: '未激活', active: '已激活', suspended: '已封禁', revoked: '已撤销', expired: '已到期' };
  const notify = (m) => window.layui?.layer ? layui.layer.msg(m, { time: 1800 }) : alert(m);

  function ensureP1Ui() {
    if (!document.querySelector('#p1Style')) { const s = document.createElement('style'); s.id = 'p1Style'; s.textContent = '.p1-pagination{display:flex;align-items:center;justify-content:flex-end;gap:8px;padding-top:14px}.p1-pagination button{margin:0}.p1-drawer{position:fixed;z-index:9999;right:0;top:0;height:100vh;width:min(440px,95vw);background:#fff;box-shadow:-12px 0 35px #17203326;padding:24px;overflow:auto;transform:translateX(100%);transition:transform .22s ease}.p1-drawer.open{transform:none}.p1-drawer-back{display:none;position:fixed;z-index:9998;inset:0;background:#16203355}.p1-drawer-back.open{display:block}.p1-detail dt{color:#7a8699;font-size:12px;margin-top:14px}.p1-detail dd{margin:4px 0 0;word-break:break-all}.p1-alert{border-left:3px solid #ff5722;background:#fff7f2;padding:12px;margin-top:12px}.p1-alert strong{color:#d9480f}.sortable{cursor:pointer;user-select:none}.sortable:hover{color:#1e9fff}'; document.head.appendChild(s); }
    if (!document.querySelector('#p1Drawer')) document.body.insertAdjacentHTML('beforeend', '<div id="p1DrawerBack" class="p1-drawer-back"></div><aside id="p1Drawer" class="p1-drawer"><div style="display:flex;justify-content:space-between;align-items:center"><h2 style="margin:0">卡密详情</h2><button class="layui-btn layui-btn-sm layui-btn-primary" id="p1Close">关闭</button></div><div id="p1Detail" class="p1-detail"></div></aside>');
    document.querySelector('#p1Close').onclick = closeDetail; document.querySelector('#p1DrawerBack').onclick = closeDetail;
    const table = document.querySelector('#licenses table'); const head = table?.querySelector('thead tr');
    if (head && !head.querySelector('[data-sort="created_at"]')) { [...head.children].forEach((th, i) => { const map = { 1: 'plain_key', 2: 'product_code', 3: 'status', 4: 'max_devices', 5: 'duration_label', 6: 'expires_at', 7: 'created_at' }; if (map[i]) { th.classList.add('sortable'); th.dataset.sort = map[i]; th.title = '点击排序'; th.onclick = () => { state.dir = state.sort === map[i] && state.dir === 'desc' ? 'asc' : 'desc'; state.sort = map[i]; state.page = 1; renderP1(); }; } }); }
  }
  function openDetail(license) { ensureP1Ui(); document.querySelector('#p1Detail').innerHTML = `<dl><dt>卡密</dt><dd><code>${esc(license.plain_key || license.key_prefix || '历史卡密不可恢复')}</code></dd><dt>产品</dt><dd>${esc(license.product_code)}</dd><dt>状态</dt><dd>${esc(statusText[license.status] || license.status)}</dd><dt>设备上限</dt><dd>${esc(license.max_devices)}</dd><dt>到期策略</dt><dd>${esc(license.duration_label || '永久')}</dd><dt>到期时间</dt><dd>${esc(dateText(license.expires_at))}</dd><dt>创建时间</dt><dd>${esc(dateText(license.created_at))}</dd><dt>卡密 ID</dt><dd>${esc(license.id)}</dd></dl>`; document.querySelector('#p1Drawer').classList.add('open'); document.querySelector('#p1DrawerBack').classList.add('open'); }
  function closeDetail() { document.querySelector('#p1Drawer')?.classList.remove('open'); document.querySelector('#p1DrawerBack')?.classList.remove('open'); }
  function getFiltered() {
    const q = (document.querySelector('#search')?.value || '').toLowerCase(); const product = document.querySelector('#productFilter')?.value || ''; const status = document.querySelector('#statusFilter')?.value || ''; const max = document.querySelector('#maxDevicesFilter')?.value || ''; const duration = document.querySelector('#durationFilter')?.value || '';
    const onlinePrefixes = new Set((getData().devices || []).filter((d) => d.online_status === 'online' && d.status === 'active').map((d) => d.key_prefix));
    return (getData().licenses || []).map((x) => ({ ...x, online_status: x.online_status || (onlinePrefixes.has(x.key_prefix) ? 'online' : 'offline') })).filter((x) => { const key = `${x.plain_key || ''} ${x.key_prefix || ''} ${x.product_code || ''}`.toLowerCase(); return (!q || key.includes(q)) && (!product || x.product_code === product) && (!status || x.status === status) && (!max || String(x.max_devices) === max) && (!duration || (x.duration_label || '永久') === duration); });
  }
  function renderP1() {
    ensureP1Ui(); const body = document.querySelector('#licenseRows'); if (!body) return; let rows = getFiltered(); rows.sort((a,b) => { let av = a[state.sort] || '', bv = b[state.sort] || ''; if (state.sort === 'plain_key') { av = a.plain_key || a.key_prefix || ''; bv = b.plain_key || b.key_prefix || ''; } if (state.sort === 'max_devices') return (Number(av)-Number(bv)) * (state.dir === 'asc' ? 1 : -1); return String(av).localeCompare(String(bv), 'zh-CN') * (state.dir === 'asc' ? 1 : -1); });
    const total = rows.length; const pages = Math.max(1, Math.ceil(total / state.size)); state.page = Math.min(state.page, pages); const visible = rows.slice((state.page - 1) * state.size, state.page * state.size); body.innerHTML = visible.length ? visible.map((x) => { const online = x.online_status === 'online'; const action = x.status === 'suspended' ? `<button class="layui-btn layui-btn-xs" onclick="toggleSuspend('${esc(x.id)}',true)">解封</button>` : x.status === 'revoked' ? '' : `<button class="layui-btn layui-btn-xs layui-btn-warm" onclick="toggleSuspend('${esc(x.id)}',false)">封禁</button>`; return `<tr><td><input class="keyCheck" type="checkbox" value="${esc(x.id)}"></td><td class="license-key"><code>${esc(x.plain_key || x.key_prefix || '历史卡密不可恢复')}</code>${x.plain_key ? ` <button class="layui-btn layui-btn-xs layui-btn-primary" onclick="copyKey('${esc(x.plain_key)}')">复制</button>` : ''}</td><td>${esc(x.product_code)}</td><td>${esc(statusText[x.status] || x.status)}</td><td>${online ? '<span class="layui-badge layui-bg-green">在线</span>' : '<span class="layui-badge layui-bg-gray">离线</span>'}</td><td>${esc(x.max_devices)}</td><td>${esc(x.duration_label || '永久')}</td><td>${esc(dateText(x.expires_at))}</td><td>${esc(dateText(x.created_at))}</td><td><button class="layui-btn layui-btn-xs" onclick='showLicenseDetail(${JSON.stringify(x)})'>详情</button> ${action} <button class="layui-btn layui-btn-xs layui-btn-danger" onclick="removeKey('${esc(x.id)}')">删除</button></td></tr>`; }).join('') : '<tr><td colspan="10" style="text-align:center;color:#8b95a7">没有匹配的卡密</td></tr>';
    const selectAll = document.querySelector('#checkAllLicenses'); if (selectAll) selectAll.onchange = () => document.querySelectorAll('.keyCheck').forEach((node) => { node.checked = selectAll.checked; }); let pager = document.querySelector('#p1Pager'); if (!pager) { pager = document.createElement('div'); pager.id = 'p1Pager'; pager.className = 'p1-pagination'; body.closest('.layui-card-body')?.appendChild(pager); } pager.innerHTML = `<span>共 ${total} 条，第 ${state.page}/${pages} 页</span><button class="layui-btn layui-btn-sm layui-btn-primary" ${state.page <= 1 ? 'disabled' : ''} data-prev>上一页</button><select class="layui-input" style="width:80px;height:30px" data-size><option ${state.size===10?'selected':''}>10</option><option ${state.size===20?'selected':''}>20</option><option ${state.size===50?'selected':''}>50</option></select><button class="layui-btn layui-btn-sm layui-btn-primary" ${state.page >= pages ? 'disabled' : ''} data-next>下一页</button>`; pager.querySelector('[data-prev]').onclick = () => { state.page--; renderP1(); }; pager.querySelector('[data-next]').onclick = () => { state.page++; renderP1(); }; pager.querySelector('[data-size]').onchange = (e) => { state.size = Number(e.target.value); state.page = 1; renderP1(); };
  }
  window.showLicenseDetail = openDetail;
  window.renderLicenses = renderP1;

  function renderOverviewP1() { const root = document.querySelector('#overview'); if (!root || document.querySelector('#p1Overview')) return; const licenses = getData().licenses || []; const now = Date.now(); const soon = licenses.filter((x) => x.expires_at && new Date(x.expires_at).getTime() > now && new Date(x.expires_at).getTime() <= now + 7 * 86400000); const abnormal = licenses.filter((x) => ['suspended', 'revoked'].includes(x.status)); const panel = document.createElement('div'); panel.id = 'p1Overview'; panel.className = 'layui-card'; panel.style.marginTop = '16px'; panel.innerHTML = `<div class="layui-card-header">运营预警</div><div class="layui-card-body"><div class="p1-alert"><strong>7 天内到期：${soon.length} 张</strong>${soon.length ? `<button class="layui-btn layui-btn-xs layui-btn-primary" style="float:right" onclick="location.hash='licenses';location.reload()">查看卡密</button>` : ''}</div><div class="p1-alert" style="border-left-color:#ffb800;background:#fffaf0"><strong>封禁/撤销：${abnormal.length} 张</strong></div></div>`; root.appendChild(panel); }
  const initP1 = () => { ensureP1Ui(); renderOverviewP1(); renderP1(); };
  document.addEventListener('DOMContentLoaded', initP1); setTimeout(initP1, 120);
})();

(() => {
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const renderDevicesOnline = () => { let rows; try { rows = typeof data !== 'undefined' ? data.devices : (window.data?.devices || []); } catch (_) { rows = []; } const body = document.querySelector('#deviceRows, #devRows'); if (!body) return; body.innerHTML = rows.length ? rows.map((x) => { const online = x.online_status === 'online' && x.status === 'active'; return `<tr><td>${esc(x.license_key || x.key_prefix || '')}</td><td>${esc(x.device_name || '未命名设备')}</td><td>${online ? '<span class="layui-badge layui-bg-green">在线</span>' : '<span class="layui-badge layui-bg-gray">离线</span>'}</td><td>${esc(x.last_seen_at || '')}</td></tr>`; }).join('') : '<tr><td colspan="4" class="empty">暂无设备</td></tr>'; };
  const section = document.querySelector('#devices'); const head = section?.querySelector('thead tr'); if (head) head.innerHTML = '<th>卡密</th><th>设备唯一码</th><th>在线情况</th><th>最后心跳</th>'; window.renderDevicesOnline = renderDevicesOnline; document.querySelectorAll('[data-view="devices"]').forEach((x) => x.addEventListener('click', () => setTimeout(renderDevicesOnline, 0))); document.addEventListener('DOMContentLoaded', renderDevicesOnline); setTimeout(renderDevicesOnline, 140);
})();
