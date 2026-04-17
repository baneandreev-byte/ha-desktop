/* HA Desktop — app.js */

// Tauri 2.x sa withGlobalTauri:true — __TAURI__ je globalan
function getInvoke() {
  return window.__TAURI__?.core?.invoke || window.__TAURI__?.tauri?.invoke || null;
}

const App = {
  instances: [], activeId: null, activeView: 'widgets',
  entities: {}, activeFilter: 'all', refreshTimer: null, REFRESH: 20000,
};

const Store = {
  KEY: 'ha-desktop-v2',
  save: d => { try { localStorage.setItem(Store.KEY, JSON.stringify(d)); } catch {} },
  load: () => { try { return JSON.parse(localStorage.getItem(Store.KEY) || '[]'); } catch { return []; } }
};

async function apiGetStates(url, token) {
  const inv = getInvoke();
  if (inv) {
    try { return await inv('ha_get_states', { url, token }); }
    catch(e) { return { success:false, error:e.toString() }; }
  }
  try {
    const r = await fetch(`${url.replace(/\/$/,'')}/api/states`, { headers:{ Authorization:`Bearer ${token}` } });
    if (!r.ok) return { success:false, error:`HTTP ${r.status}` };
    return { success:true, data:await r.json() };
  } catch(e) { return { success:false, error:e.message }; }
}

async function apiCallService(url, token, domain, service, entityId, extra=null) {
  const inv = getInvoke();
  if (inv) {
    try { return await inv('ha_call_service', { url, token, domain, service, entityId, extra }); }
    catch(e) { return { success:false, error:e.toString() }; }
  }
  try {
    const r = await fetch(`${url.replace(/\/$/,'')}/api/services/${domain}/${service}`, {
      method:'POST', headers:{ Authorization:`Bearer ${token}`, 'Content-Type':'application/json' },
      body: JSON.stringify({ entity_id:entityId, ...(extra||{}) })
    });
    return { success:r.ok, error:r.ok?null:`HTTP ${r.status}` };
  } catch(e) { return { success:false, error:e.message }; }
}

async function apiTest(url, token) {
  const inv = getInvoke();
  if (inv) {
    try { return await inv('ha_test_connection', { url, token }); }
    catch(e) { return { success:false, error:e.toString() }; }
  }
  try {
    const r = await fetch(`${url.replace(/\/$/,'')}/api/`, { headers:{ Authorization:`Bearer ${token}` } });
    if (!r.ok) return { success:false, error:`HTTP ${r.status}` };
    return { success:true, data:await r.json() };
  } catch(e) { return { success:false, error:e.message }; }
}

// ── WINDOW CONTROLS + DRAG ──
function setupWinControls() {
  const inv = getInvoke();

  if (!inv) {
    ['btnMin','btnMax','btnClose'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
    return;
  }

  document.getElementById('btnMin').onclick   = () => inv('window_minimize');
  document.getElementById('btnMax').onclick   = () => inv('window_maximize');
  document.getElementById('btnClose').onclick = () => inv('window_close');

  // Drag — koristimo Tauri startDragging na mousedown na titlebar-drag elementu
  // data-tauri-drag-region radi samo u Tauri asset protokolu (tauri://), ne u http://
  // Eksplicitno dodajemo mousedown handler kao fallback
  document.querySelectorAll('[data-tauri-drag-region]').forEach(el => {
    el.addEventListener('mousedown', e => {
      // Ne drajguj ako kliknemo na dugme ili tab
      if (e.target.closest('button, .tab, .titlebar-right, .titlebar-tabs')) return;
      if (e.button !== 0) return;
      try {
        window.__TAURI__.window.getCurrentWindow().startDragging();
      } catch {
        try { inv('plugin:window|start_dragging'); } catch {}
      }
    });
  });
}

// ── ENTITY HELPERS ──
const dom   = id => id.split('.')[0];
const fname = e  => e.attributes?.friendly_name || e.entity_id.split('.')[1].replace(/_/g,' ');

function entityIcon(e) {
  const d=dom(e.entity_id), s=e.state, dc=e.attributes?.device_class;
  const map={
    light:s==='on'?'💡':'🔆', switch:s==='on'?'🔌':'⚫', climate:'🌡️',
    media_player:s==='playing'?'▶️':'📺', cover:s==='open'?'🟢':'🚪',
    fan:s==='on'?'🌀':'💨', lock:s==='locked'?'🔒':'🔓',
    scene:'🎬', automation:s==='on'?'⚙️':'🔧', input_boolean:s==='on'?'✅':'⭕',
    weather:{sunny:'☀️',cloudy:'☁️',rainy:'🌧️',snowy:'❄️',windy:'💨'}[s]||'🌤️',
    person:'👤',
  };
  if (d==='sensor') {
    const m={temperature:'🌡️',humidity:'💧',pressure:'📊',battery:'🔋',
              power:'⚡',energy:'🔌',illuminance:'☀️',co2:'💨',pm25:'🌫️',voltage:'⚡'};
    return m[dc]||'📡';
  }
  if (d==='binary_sensor') {
    const m={motion:'👁️',door:'🚪',window:'🪟',smoke:'🔥',moisture:'💧',connectivity:'📶',battery:'🔋',occupancy:'👁️'};
    return m[dc]||(s==='on'?'🟢':'⚪');
  }
  return map[d]||'📦';
}

const HIDDEN = new Set(['persistent_notification','update','number','select','button',
  'input_number','input_select','input_text','stt','tts','wake_word','conversation',
  'intent_script','timer','zone']);

const USEFUL_SENSOR_DC = new Set(['temperature','humidity','pressure','battery',
  'power','energy','illuminance','co2','pm25','voltage','current','gas','moisture','speed']);

function shouldShow(e) {
  const d = dom(e.entity_id);
  if (HIDDEN.has(d)) return false;
  if (d === 'sensor') {
    const dc = e.attributes?.device_class;
    if (dc && USEFUL_SENSOR_DC.has(dc)) return true;
    if (!dc && !isNaN(parseFloat(e.state))) return true;
    return false;
  }
  return true;
}

function matchFilter(e, f) {
  const d = dom(e.entity_id);
  if (f==='all')    return true;
  if (f==='light')  return d==='light';
  if (f==='switch') return d==='switch'||d==='input_boolean';
  if (f==='sensor') return d==='sensor';
  if (f==='binary') return d==='binary_sensor';
  if (f==='climate')return d==='climate'||d==='weather';
  if (f==='scene')  return d==='scene'||d==='automation';
  return true;
}

const LABELS = {
  on:'Uključeno',off:'Isključeno',unavailable:'Nedostupno',unknown:'Nepoznato',
  playing:'Svira',paused:'Pauzirano',idle:'Mirovanje',standby:'Čekanje',
  open:'Otvoreno',closed:'Zatvoreno',locked:'Zaključano',unlocked:'Otključano',
  cleaning:'Čisti',docked:'Priključen',home:'Kod kuće',away:'Odsutan',
  heat:'Grejanje',cool:'Hlađenje',auto:'Automatski',triggered:'Aktiviran',
};

// ── TABS ──
function renderTabs() {
  const bar = document.getElementById('tabBar');
  bar.innerHTML = '';
  App.instances.forEach(inst => {
    const tab = document.createElement('div');
    tab.className = 'tab'+(inst.id===App.activeId?' active':'');
    const sc = inst.status==='online'?'online':inst.status==='error'?'error':'';
    tab.innerHTML = `<span class="tab-icon">${inst.icon}</span><span class="tab-name">${inst.name}</span><span class="tab-status ${sc}"></span><button class="tab-close">✕</button>`;
    tab.addEventListener('click', e => { if(e.target.closest('.tab-close')) return; selectInstance(inst.id); });
    tab.querySelector('.tab-close').addEventListener('click', e => { e.stopPropagation(); confirmRemove(inst.id); });
    tab.addEventListener('contextmenu', e => { e.preventDefault(); showCtx(e,inst); });
    bar.appendChild(tab);
  });
}

function selectInstance(id) { App.activeId=id; renderTabs(); renderView(); }

async function renderView() {
  const inst = App.instances.find(i=>i.id===App.activeId);
  if (!inst) { showPanel('emptyState'); return; }
  document.getElementById('emptyState').style.display='none';
  document.getElementById('instanceName').textContent = inst.name;
  if (App.activeView==='fullha') renderFullHA(inst);
  else await loadWidgets(inst);
}

async function loadWidgets(inst) {
  showPanel('loadingState');
  const res = await apiGetStates(inst.url, inst.token);
  if (!res.success) {
    inst.status='error';
    document.getElementById('instanceDot').className='instance-dot error';
    renderTabs();
    document.getElementById('errorMsg').textContent = res.error||'Greška pri konekciji.';
    showPanel('errorState'); return;
  }
  inst.status='online';
  document.getElementById('instanceDot').className='instance-dot';
  renderTabs();
  App.entities[inst.id] = res.data;
  showPanel('widgetsView');
  renderWidgets(inst);
  startRefresh(inst);
}

function renderWidgets(inst) {
  const all=App.entities[inst.id]||[], f=App.activeFilter;
  const search=document.getElementById('searchInput').value.toLowerCase();
  let filtered = all.filter(e=>
    shouldShow(e) && matchFilter(e,f) &&
    (!search || fname(e).toLowerCase().includes(search) || e.entity_id.toLowerCase().includes(search))
  );
  filtered.sort((a,b)=>{
    const ao=['on','open','unlocked','playing','home'].includes(a.state)?0:1;
    const bo=['on','open','unlocked','playing','home'].includes(b.state)?0:1;
    if(ao!==bo) return ao-bo;
    return fname(a).localeCompare(fname(b),'sr');
  });
  document.getElementById('entityCount').textContent = `${filtered.length} entiteta`;
  const grid=document.getElementById('widgetsGrid');
  grid.innerHTML='';
  if (!filtered.length) {
    grid.innerHTML=`<div style="grid-column:1/-1;text-align:center;color:var(--text-3);padding:50px 0">Nema entiteta</div>`;
    return;
  }
  filtered.forEach(e=>grid.appendChild(buildCard(e,inst)));
}

function buildCard(e, inst) {
  const d=dom(e.entity_id), name=fname(e), icon=entityIcon(e), state=e.state;
  const isOn=['on','open','unlocked','playing','cleaning','home'].includes(state);
  const isUnav=['unavailable','unknown'].includes(state);
  const card=document.createElement('div');
  card.className='entity-card'+(isOn?' on':'')+(isUnav?' unavailable':'');
  const hasToggle=['light','switch','fan','input_boolean'].includes(d)&&!isUnav;
  const isClickable=['scene','automation'].includes(d)&&!isUnav;
  if(isClickable) card.classList.add('clickable');

  let valueHtml='', brightnessHtml='', extraHtml='';
  const numVal=parseFloat(state);
  if(d==='sensor'&&!isNaN(numVal)) {
    const unit=e.attributes?.unit_of_measurement||'';
    valueHtml=`<div class="card-value">${numVal%1===0?numVal:numVal.toFixed(1)}<span class="card-unit">${unit}</span></div>`;
  }
  if(d==='light'&&isOn&&e.attributes?.brightness!=null) {
    const pct=Math.round((e.attributes.brightness/255)*100);
    brightnessHtml=`<div class="brightness-bar"><div class="brightness-fill" style="width:${pct}%"></div></div><div class="card-extra">${pct}% osvetljenosti</div>`;
  }
  if(d==='climate') {
    const cur=e.attributes?.current_temperature, tgt=e.attributes?.temperature;
    if(cur!=null) valueHtml=`<div class="card-value">${cur}<span class="card-unit">°C</span></div>`;
    if(tgt!=null) extraHtml=`<div class="card-extra">Cilj: ${tgt}°C</div>`;
  }

  card.innerHTML=`
    <div class="card-header">
      <span class="card-icon">${icon}</span>
      ${hasToggle?'<div class="card-toggle"></div>':''}
    </div>
    <div class="card-name">${name}</div>
    <div class="card-state"><span class="state-dot"></span><span>${LABELS[state]||state}</span></div>
    ${valueHtml||brightnessHtml}${extraHtml}`;

  if(hasToggle) {
    card.querySelector('.card-toggle').addEventListener('click', async ev => {
      ev.stopPropagation();
      const svc=isOn?'turn_off':'turn_on';
      const res=await apiCallService(inst.url,inst.token,d,svc,e.entity_id);
      if(res.success) { e.state=isOn?'off':'on'; showToast(`${name} ${isOn?'isključeno':'uključeno'}`,'success'); renderWidgets(inst); }
      else showToast('Greška: '+(res.error||'?'),'error');
    });
  }
  if(isClickable) {
    card.addEventListener('click', async ()=>{
      const res=await apiCallService(inst.url,inst.token,d,'turn_on',e.entity_id);
      if(res.success) showToast(`${name} aktivirano`,'success');
      else showToast('Greška: '+res.error,'error');
    });
  }
  return card;
}

function closeHaWebview() {
  document.getElementById('haIframe').src = '';
}

async function openInBrowser(url) {
  const inv = getInvoke();
  if (inv) {
    // Pokušaj Chrome direktno
    try {
      const res = await inv('open_in_chrome', { url });
      if (res === null || res === undefined) return; // uspeh
    } catch {}
    // Fallback: podrazumevani browser
    try { await window.__TAURI__.shell.open(url); return; } catch {}
    try { await inv('plugin:shell|open', { path: url }); return; } catch {}
  }
  window.open(url, '_blank');
}

function renderFullHA(inst) {
  showPanel('fullHaView');
  document.getElementById('haUrl').textContent = inst.url;
  document.getElementById('openExternalBtn').onclick = () => openInBrowser(inst.url);

  const inv = getInvoke();
  if (inv) {
    // Tauri: otvori u sistemskom browseru (WebView2 ima problem sa spoljnim URL-ovima)
    const iframe = document.getElementById('haIframe');
    const overlay = document.getElementById('iframeLoading');
    iframe.style.display = 'none';
    overlay.classList.add('hidden');

    const container = document.querySelector('.webview-container');
    container.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;
                  height:100%;gap:16px;color:var(--text-2)">
        <div style="font-size:52px">🏠</div>
        <div style="font-size:15px;font-weight:700;color:var(--text-1)">Home Assistant</div>
        <div style="font-size:12px;color:var(--text-3);max-width:280px;text-align:center;line-height:1.6">
          Klikni dugme ispod da otvoriš HA u podrazumevanom browseru
        </div>
        <button class="btn-primary" id="openHaBtn" style="margin-top:4px;padding:10px 22px;font-size:14px">
          ↗ Otvori Home Assistant
        </button>
        <div style="font-size:11px;color:var(--text-3);font-family:monospace">${inst.url}</div>
      </div>`;

    document.getElementById('openHaBtn').onclick = () => openInBrowser(inst.url);

  } else {
    // Browser/dev preview fallback — iframe
    const iframe = document.getElementById('haIframe');
    const overlay = document.getElementById('iframeLoading');
    iframe.style.display = '';
    overlay.classList.remove('hidden');
    iframe.src = '';
    setTimeout(() => {
      iframe.src = inst.url;
      setTimeout(() => overlay.classList.add('hidden'), 5000);
      iframe.onload = () => {
        try { if (iframe.contentDocument) overlay.classList.add('hidden'); } catch { overlay.classList.add('hidden'); }
      };
    }, 100);
  }
}

function startRefresh(inst) {
  stopRefresh();
  App.refreshTimer=setInterval(async()=>{
    if(App.activeView!=='widgets'||App.activeId!==inst.id) return;
    const res=await apiGetStates(inst.url,inst.token);
    if(res.success) { App.entities[inst.id]=res.data; renderWidgets(inst); }
  }, App.REFRESH);
}
function stopRefresh() { if(App.refreshTimer){clearInterval(App.refreshTimer);App.refreshTimer=null;} }

function showPanel(panel) {
  ['emptyState','widgetsView','fullHaView','loadingState','errorState'].forEach(id=>{
    document.getElementById(id).style.display = id===panel?'flex':'none';
  });
}

// ── MODAL ──
let editingId=null, selIcon='🏠';

function openModal(id=null) {
  editingId=id;
  const inst=id?App.instances.find(i=>i.id===id):null;
  document.getElementById('modalTitle').textContent=id?'Uredi lokaciju':'Dodaj lokaciju';
  document.getElementById('inputName').value=inst?.name||'';
  document.getElementById('inputUrl').value=inst?.url||'https://';
  document.getElementById('inputToken').value=inst?.token||'';
  selIcon=inst?.icon||'🏠';
  document.querySelectorAll('.icon-opt').forEach(b=>b.classList.toggle('selected',b.dataset.icon===selIcon));
  document.getElementById('connResult').style.display='none';
  document.getElementById('instanceModal').style.display='flex';
  setTimeout(()=>document.getElementById('inputName').focus(),60);
}
function closeModal() { document.getElementById('instanceModal').style.display='none'; }

document.getElementById('addTabBtn').onclick   = ()=>openModal();
document.getElementById('emptyAddBtn').onclick = ()=>openModal();
document.getElementById('modalClose').onclick  = closeModal;
document.getElementById('modalCancel').onclick = closeModal;
document.getElementById('instanceModal').addEventListener('click',e=>{if(e.target===e.currentTarget)closeModal();});

document.getElementById('iconPicker').addEventListener('click',e=>{
  const btn=e.target.closest('.icon-opt'); if(!btn) return;
  selIcon=btn.dataset.icon;
  document.querySelectorAll('.icon-opt').forEach(b=>b.classList.toggle('selected',b===btn));
});

document.getElementById('toggleToken').onclick=()=>{
  const i=document.getElementById('inputToken'); i.type=i.type==='password'?'text':'password';
};

document.getElementById('testConnBtn').onclick=async()=>{
  const url=document.getElementById('inputUrl').value.trim();
  const tok=document.getElementById('inputToken').value.trim();
  if(!url||!tok){connResult(false,'Unesi URL i token.');return;}
  connResult(null,'⏳ Testiranje...');
  const res=await apiTest(url,tok);
  if(res.success) connResult(true,`✅ Povezano! HA v${res.data?.version||'?'}`);
  else connResult(false,`❌ ${res.error}`);
};

function connResult(ok,msg){
  const el=document.getElementById('connResult');
  el.style.display='block';
  el.className='conn-result'+(ok===true?' success':ok===false?' error':'');
  el.textContent=msg;
}

document.getElementById('modalSave').onclick=()=>{
  const name=document.getElementById('inputName').value.trim();
  const url=document.getElementById('inputUrl').value.trim().replace(/\/$/,'');
  const token=document.getElementById('inputToken').value.trim();
  if(!name||!url||!token){showToast('Popuni sva polja.','error');return;}
  if(editingId) {
    const inst=App.instances.find(i=>i.id===editingId);
    if(inst) Object.assign(inst,{name,url,token,icon:selIcon,status:'unknown'});
  } else {
    const inst={id:genId(),name,url,token,icon:selIcon,status:'unknown'};
    App.instances.push(inst);
    if(!App.activeId) App.activeId=inst.id;
  }
  Store.save(App.instances);
  closeModal(); renderTabs(); renderView();
  showToast(editingId?'Ažurirano':'Lokacija dodana ✓','success');
  editingId=null;
};

// ── CONFIRM REMOVE ──
let removingId=null;
function confirmRemove(id) {
  removingId=id;
  const inst=App.instances.find(i=>i.id===id);
  document.getElementById('confirmMsg').textContent=`Ukloniti "${inst?.name}"?`;
  document.getElementById('confirmModal').style.display='flex';
}
document.getElementById('confirmCancel').onclick=()=>{document.getElementById('confirmModal').style.display='none';removingId=null;};
document.getElementById('confirmOk').onclick=()=>{
  if(!removingId) return;
  App.instances=App.instances.filter(i=>i.id!==removingId);
  delete App.entities[removingId];
  if(App.activeId===removingId) App.activeId=App.instances[0]?.id||null;
  Store.save(App.instances);
  removingId=null;
  document.getElementById('confirmModal').style.display='none';
  renderTabs();
  if(App.activeId) renderView(); else showPanel('emptyState');
  showToast('Lokacija uklonjena','info');
};
document.getElementById('confirmModal').addEventListener('click',e=>{if(e.target===e.currentTarget)document.getElementById('confirmModal').style.display='none';});

// ── CONTEXT MENU ──
function showCtx(e,inst) {
  document.querySelectorAll('.ctx-menu').forEach(m=>m.remove());
  const menu=document.createElement('div');
  menu.className='ctx-menu';
  menu.innerHTML=`<div class="ctx-item" data-a="edit">✏️ Uredi</div><div class="ctx-item" data-a="refresh">🔄 Osveži</div><div class="ctx-sep"></div><div class="ctx-item danger" data-a="remove">🗑️ Ukloni</div>`;
  menu.style.cssText=`left:${Math.min(e.clientX,window.innerWidth-170)}px;top:${e.clientY}px`;
  document.body.appendChild(menu);
  menu.addEventListener('click',ev=>{
    const a=ev.target.closest('[data-a]')?.dataset.a; menu.remove();
    if(a==='edit') openModal(inst.id);
    if(a==='refresh') selectInstance(inst.id);
    if(a==='remove') confirmRemove(inst.id);
  });
  setTimeout(()=>document.addEventListener('click',()=>menu.remove(),{once:true}),0);
}

// ── VIEW SWITCH ──
document.getElementById('viewWidgets').addEventListener('click',()=>{
  closeHaWebview();
  App.activeView='widgets';
  document.getElementById('viewWidgets').classList.add('active');
  document.getElementById('viewFullHA').classList.remove('active');
  if(App.activeId) renderView();
});
document.getElementById('viewFullHA').addEventListener('click',()=>{
  closeHaWebview(); // zatvori stari webview pre novog
  App.activeView='fullha';
  document.getElementById('viewFullHA').classList.add('active');
  document.getElementById('viewWidgets').classList.remove('active');
  stopRefresh();
  if(App.activeId) renderView();
});

// ── FILTERS ──
document.querySelectorAll('[data-filter]').forEach(btn=>{
  btn.addEventListener('click',()=>{
    App.activeFilter=btn.dataset.filter;
    document.querySelectorAll('[data-filter]').forEach(b=>b.classList.toggle('active-filter',b.dataset.filter===App.activeFilter));
    const inst=App.instances.find(i=>i.id===App.activeId);
    if(inst&&App.entities[inst.id]) renderWidgets(inst);
  });
});

document.getElementById('searchInput').addEventListener('input',()=>{
  const inst=App.instances.find(i=>i.id===App.activeId);
  if(inst&&App.entities[inst.id]) renderWidgets(inst);
});

document.getElementById('refreshBtn').onclick=async()=>{
  const inst=App.instances.find(i=>i.id===App.activeId);
  if(!inst) return;
  showToast('Osvežavanje...','info');
  await loadWidgets(inst);
};
document.getElementById('settingsBtn').onclick=()=>showToast('Uskoro...','info');
document.getElementById('retryBtn').onclick=()=>{if(App.activeId) renderView();};

// ── TOAST ──
function showToast(msg,type='info') {
  const el=document.createElement('div');
  el.className=`toast ${type}`;
  el.innerHTML=`<span>${{success:'✅',error:'❌',info:'ℹ️'}[type]||''}</span><span>${msg}</span>`;
  document.getElementById('toastContainer').appendChild(el);
  setTimeout(()=>{
    el.style.transition='opacity .3s,transform .3s';
    el.style.opacity='0';el.style.transform='translateX(14px)';
    setTimeout(()=>el.remove(),300);
  },3000);
}

function genId() { return 'i'+Date.now()+Math.random().toString(36).slice(2,6); }

// ── BOOT ──
function init() {
  setupWinControls();
  App.instances=Store.load();
  if(App.instances.length) { App.activeId=App.instances[0].id; renderTabs(); renderView(); }
  else { showPanel('emptyState'); renderTabs(); }
}

if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init);
else init();
