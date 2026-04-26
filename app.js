/* ===================================================
   日本語 学習帳 — app.js (Google Sheets 主資料庫版)
   每次開啟從 Sheets 讀取；新增/編輯/刪除直接寫入 Sheets
   LocalStorage 作為離線快取
=================================================== */

const CACHE_KEY    = 'nihongo_cache';
const HISTORY_KEY  = 'nihongo_history';
const SETTINGS_KEY = 'nihongo_settings';

let state = {
  words: [],
  filter: { level: 'all', cat: 'vocab' },
  quiz: { level: 'all', cat: 'vocab', count: 20 },
  form: { cat: 'vocab', level: 'N1' },
  editId: null,
  scriptUrl: '',
};

// ===== Init =====
window.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  loadCache();
  setTimeout(() => {
    document.getElementById('splash').classList.add('fade-out');
    setTimeout(() => {
      document.getElementById('splash').style.display = 'none';
      document.getElementById('app').classList.remove('hidden');
      renderHome();
      if (state.scriptUrl) fetchFromSheets();
      else showNoUrlBanner();
    }, 500);
  }, 1000);
  bindEvents();
});

// ===== Settings =====
function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    state.scriptUrl = s.scriptUrl || '';
    document.getElementById('gs-script-url').value = state.scriptUrl;
  } catch {}
}

function saveSettings() {
  state.scriptUrl = document.getElementById('gs-script-url').value.trim();
  localStorage.setItem(SETTINGS_KEY, JSON.stringify({ scriptUrl: state.scriptUrl }));
}

// ===== Cache =====
function loadCache() {
  try { state.words = JSON.parse(localStorage.getItem(CACHE_KEY) || '[]'); } catch { state.words = []; }
}
function saveCache() { localStorage.setItem(CACHE_KEY, JSON.stringify(state.words)); }

// ===== Sheets API =====
async function sheetsGet(action) {
  const url = state.scriptUrl + '?action=' + action;
  const res = await fetch(url);
  return res.json();
}

async function sheetsPost(body) {
  const res = await fetch(state.scriptUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function fetchFromSheets() {
  if (!state.scriptUrl) return;
  setLoading(true);
  try {
    const data = await sheetsGet('fetch');
    if (data.status === 'ok') {
      state.words = data.words;
      saveCache();
      renderHome();
      toast('✓ 已從 Google Sheets 載入');
    } else {
      toast('讀取失敗：' + (data.message || '請檢查 Script URL'));
    }
  } catch {
    toast('無法連線，顯示離線資料');
  } finally {
    setLoading(false);
  }
}

async function addToSheets(word) {
  if (!state.scriptUrl) return true;
  try { const d = await sheetsPost({ action: 'add', word }); return d.status === 'ok'; }
  catch { return false; }
}

async function updateInSheets(word) {
  if (!state.scriptUrl) return true;
  try { const d = await sheetsPost({ action: 'update', word }); return d.status === 'ok'; }
  catch { return false; }
}

async function deleteFromSheets(id, cat) {
  if (!state.scriptUrl) return true;
  try { const d = await sheetsPost({ action: 'delete', id, cat }); return d.status === 'ok'; }
  catch { return false; }
}

async function logStudy(count) {
  const today = new Date().toISOString().slice(0, 10);
  const h = getHistory();
  h[today] = (h[today] || 0) + count;
  localStorage.setItem(HISTORY_KEY, JSON.stringify(h));
  if (state.scriptUrl) {
    try { await sheetsPost({ action: 'log', date: today, count }); } catch {}
  }
}

function getHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || {}; } catch { return {}; }
}

function setLoading(v) {
  const btn = document.getElementById('sync-btn');
  v ? btn.classList.add('spinning') : btn.classList.remove('spinning');
}

function showNoUrlBanner() {
  toast('請先到「設定」頁面填入 Script URL', 4000);
}

// ===== Navigation =====
function navigateTo(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('page-' + page)?.classList.add('active');
  document.querySelector(`.nav-btn[data-page="${page}"]`)?.classList.add('active');
  const titles = { home:'ホーム', quiz:'テスト', progress:'進度', settings:'設定', add: state.editId ? '編集' : '新增' };
  document.getElementById('page-title').textContent = titles[page] || '';
  document.getElementById('fab-btn').style.display = (page==='home'||page==='progress') ? 'flex' : 'none';
  if (page === 'progress') renderProgress();
  if (page === 'home') renderHome();
}

// ===== Events =====
function bindEvents() {
  document.querySelectorAll('.nav-btn').forEach(btn => btn.addEventListener('click', () => navigateTo(btn.dataset.page)));
  document.getElementById('fab-btn').addEventListener('click', () => openAddForm());
  document.getElementById('settings-btn').addEventListener('click', () => navigateTo('settings'));
  document.getElementById('sync-btn').addEventListener('click', fetchFromSheets);

  const makePillGroup = (selector, key) => {
    document.querySelectorAll(selector).forEach(btn => btn.addEventListener('click', () => {
      document.querySelectorAll(selector).forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const [obj, prop] = key.split('.');
      if (obj === 'filter') { state.filter[prop] = btn.dataset[prop] || btn.dataset[Object.keys(btn.dataset)[0]]; renderWordList(); }
      else if (obj === 'quiz') { state.quiz[prop] = prop === 'count' ? parseInt(btn.dataset[prop] || btn.dataset[Object.keys(btn.dataset)[0]]) : (btn.dataset[prop] || btn.dataset[Object.keys(btn.dataset)[0]]); }
    }));
  };

  document.querySelectorAll('.level-pill[data-level]').forEach(btn => btn.addEventListener('click', () => {
    document.querySelectorAll('.level-pill[data-level]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active'); state.filter.level = btn.dataset.level; renderWordList();
  }));
  document.querySelectorAll('.cat-tab').forEach(btn => btn.addEventListener('click', () => {
    document.querySelectorAll('.cat-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active'); state.filter.cat = btn.dataset.cat; renderWordList();
  }));
  document.querySelectorAll('.level-pill[data-qlevel]').forEach(btn => btn.addEventListener('click', () => {
    document.querySelectorAll('.level-pill[data-qlevel]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active'); state.quiz.level = btn.dataset.qlevel;
  }));
  document.querySelectorAll('.level-pill[data-qcat]').forEach(btn => btn.addEventListener('click', () => {
    document.querySelectorAll('.level-pill[data-qcat]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active'); state.quiz.cat = btn.dataset.qcat;
  }));
  document.querySelectorAll('.level-pill[data-qcount]').forEach(btn => btn.addEventListener('click', () => {
    document.querySelectorAll('.level-pill[data-qcount]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active'); state.quiz.count = parseInt(btn.dataset.qcount);
  }));
  document.querySelectorAll('.level-pill[data-fcat]').forEach(btn => btn.addEventListener('click', () => {
    document.querySelectorAll('.level-pill[data-fcat]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active'); state.form.cat = btn.dataset.fcat; showFormFields(btn.dataset.fcat);
  }));
  document.querySelectorAll('.level-pill[data-flevel]').forEach(btn => btn.addEventListener('click', () => {
    document.querySelectorAll('.level-pill[data-flevel]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active'); state.form.level = btn.dataset.flevel;
  }));

  document.getElementById('start-quiz-btn').addEventListener('click', startQuiz);
  document.getElementById('save-word-btn').addEventListener('click', saveEntry);
  document.getElementById('cancel-add-btn').addEventListener('click', () => navigateTo('home'));
  document.getElementById('save-gs-btn').addEventListener('click', () => {
    saveSettings(); toast('設定已儲存，正在連線...');
    if (state.scriptUrl) fetchFromSheets(); else toast('請填入 Script URL');
  });
  document.getElementById('export-btn').addEventListener('click', exportJSON);
  document.getElementById('import-btn').addEventListener('click', () => document.getElementById('import-file').click());
  document.getElementById('import-file').addEventListener('change', importJSON);
  document.getElementById('clear-btn').addEventListener('click', clearAll);
}

// ===== Form =====
function openAddForm(editWord = null) {
  state.editId = editWord ? editWord.id : null;
  const cat = editWord ? editWord.cat : 'vocab';
  const level = editWord ? editWord.level : 'N1';
  state.form = { cat, level };
  document.querySelectorAll('.level-pill[data-fcat]').forEach(b => b.classList.toggle('active', b.dataset.fcat === cat));
  document.querySelectorAll('.level-pill[data-flevel]').forEach(b => b.classList.toggle('active', b.dataset.flevel === level));
  showFormFields(cat);
  if (editWord) {
    document.getElementById('form-title').textContent = '編集';
    const sv = (id, v) => { const el = document.getElementById(id); if(el) el.value = v||''; };
    if (cat==='vocab') { sv('f-word',editWord.word); sv('f-reading',editWord.reading); sv('f-meaning',editWord.meaning); sv('f-example',editWord.example); sv('f-example-zh',editWord.exampleZh); }
    else if (cat==='grammar') { sv('f-grammar-pattern',editWord.word); sv('f-grammar-desc',editWord.meaning); sv('f-grammar-example',editWord.example); sv('f-grammar-example-zh',editWord.exampleZh); }
    else { sv('f-reading-title',editWord.word); sv('f-reading-text',editWord.text); sv('f-reading-qa',editWord.qa); sv('f-reading-source',editWord.source); }
    sv('f-note', editWord.note);
  } else {
    document.getElementById('form-title').textContent = '新増単語';
    ['f-word','f-reading','f-meaning','f-example','f-example-zh','f-grammar-pattern','f-grammar-desc','f-grammar-example','f-grammar-example-zh','f-reading-title','f-reading-text','f-reading-qa','f-reading-source','f-note'].forEach(id => { const el=document.getElementById(id); if(el) el.value=''; });
  }
  navigateTo('add');
}

function showFormFields(cat) {
  document.getElementById('vocab-fields').style.display = cat==='vocab' ? 'block' : 'none';
  document.getElementById('grammar-fields').style.display = cat==='grammar' ? 'block' : 'none';
  document.getElementById('reading-fields').style.display = cat==='reading' ? 'block' : 'none';
}

async function saveEntry() {
  const cat = state.form.cat, level = state.form.level;
  const g = id => document.getElementById(id)?.value.trim() || '';
  let entry = { cat, level, note: g('f-note'), mastered: false };

  if (cat==='vocab') {
    if (!g('f-word') || !g('f-meaning')) { toast('単語と意味は必須です'); return; }
    Object.assign(entry, { word:g('f-word'), reading:g('f-reading'), meaning:g('f-meaning'), example:g('f-example'), exampleZh:g('f-example-zh') });
  } else if (cat==='grammar') {
    if (!g('f-grammar-pattern')) { toast('文法句型は必須です'); return; }
    Object.assign(entry, { word:g('f-grammar-pattern'), meaning:g('f-grammar-desc'), example:g('f-grammar-example'), exampleZh:g('f-grammar-example-zh') });
  } else {
    if (!g('f-reading-text')) { toast('文章内容は必須です'); return; }
    Object.assign(entry, { word:g('f-reading-title')||'読解', text:g('f-reading-text'), qa:g('f-reading-qa'), source:g('f-reading-source') });
  }

  const btn = document.getElementById('save-word-btn');
  btn.disabled = true; btn.textContent = '儲存中...';

  try {
    if (state.editId) {
      const idx = state.words.findIndex(w => w.id === state.editId);
      if (idx !== -1) {
        Object.assign(entry, { id:state.editId, mastered:state.words[idx].mastered, createdAt:state.words[idx].createdAt, updatedAt:Date.now() });
        state.words[idx] = entry;
        saveCache();
        const ok = await updateInSheets(entry);
        toast(ok ? '更新しました ✓' : '本地已更新，Sheets 連線失敗');
      }
    } else {
      Object.assign(entry, { id:Date.now().toString(), createdAt:Date.now(), updatedAt:Date.now() });
      state.words.unshift(entry);
      saveCache();
      const ok = await addToSheets(entry);
      toast(ok ? '追加しました ✓' : '本地已儲存，Sheets 連線失敗');
    }
    navigateTo('home');
  } finally {
    btn.disabled = false; btn.textContent = '儲存';
  }
}

// ===== Render =====
function renderHome() {
  const today = new Date().toISOString().slice(0,10), hist = getHistory();
  document.getElementById('stat-total').textContent = state.words.length;
  document.getElementById('stat-today').textContent = hist[today] || 0;
  document.getElementById('stat-mastered').textContent = state.words.filter(w=>w.mastered).length;
  renderWordList();
}

function renderWordList() {
  const list = document.getElementById('word-list'), empty = document.getElementById('empty-state');
  let words = state.words.filter(w => w.cat === state.filter.cat);
  if (state.filter.level !== 'all') words = words.filter(w => w.level === state.filter.level);
  if (words.length === 0) { list.innerHTML=''; list.appendChild(empty); empty.style.display='block'; return; }
  empty.style.display = 'none';
  list.innerHTML = words.map(w => `
    <div class="word-card ${w.level.toLowerCase()}" data-id="${w.id}">
      <div class="word-card-main">
        <div class="word-jp">${esc(w.word)}</div>
        ${w.reading ? `<div class="word-reading">${esc(w.reading)}</div>` : ''}
        <div class="word-meaning">${esc(w.meaning || w.text?.slice(0,40) || '')}</div>
      </div>
      <div class="word-card-meta">
        <span class="word-level-badge badge-${w.level.toLowerCase()}">${w.level}</span>
        <div class="word-mastered-dot ${w.mastered?'mastered':''}"></div>
      </div>
    </div>`).join('');
  list.querySelectorAll('.word-card').forEach(card => {
    card.addEventListener('click', () => { const w=state.words.find(x=>x.id===card.dataset.id); if(w) showWordDetail(w); });
  });
}

function showWordDetail(w) {
  document.querySelector('.word-detail-sheet')?.remove();
  const sheet = document.createElement('div');
  sheet.className = 'word-detail-sheet';
  sheet.innerHTML = `
    <div class="sheet-backdrop"></div>
    <div class="sheet-content">
      <div class="sheet-handle"></div>
      <div class="sheet-word">${esc(w.word)}</div>
      ${w.reading ? `<div class="sheet-reading">${esc(w.reading)}</div>` : ''}
      ${w.meaning ? `<div class="sheet-meaning">${esc(w.meaning)}</div>` : ''}
      ${w.example ? `<div class="sheet-example"><div style="font-family:var(--font-serif);margin-bottom:4px">${esc(w.example)}</div>${w.exampleZh?`<div style="color:var(--ink-faint);font-size:13px">${esc(w.exampleZh)}</div>`:''}</div>` : ''}
      ${w.text ? `<div class="sheet-example" style="font-family:var(--font-serif);white-space:pre-wrap">${esc(w.text)}</div>` : ''}
      ${w.note ? `<div class="sheet-note">📝 ${esc(w.note)}</div>` : ''}
      <div class="sheet-actions">
        <button class="sheet-mastered-btn ${w.mastered?'mastered':''}" id="dm-btn">${w.mastered?'✓ 已掌握':'標記已掌握'}</button>
        <button class="sheet-edit-btn" id="de-btn">編集</button>
        <button class="sheet-delete-btn" id="dd-btn">🗑</button>
      </div>
    </div>`;
  document.body.appendChild(sheet);
  sheet.querySelector('.sheet-backdrop').addEventListener('click', () => sheet.remove());
  sheet.querySelector('#dm-btn').addEventListener('click', async () => {
    const idx = state.words.findIndex(x=>x.id===w.id);
    state.words[idx].mastered = !state.words[idx].mastered;
    state.words[idx].updatedAt = Date.now();
    saveCache(); await updateInSheets(state.words[idx]);
    sheet.remove(); renderHome();
  });
  sheet.querySelector('#de-btn').addEventListener('click', () => { sheet.remove(); openAddForm(w); });
  sheet.querySelector('#dd-btn').addEventListener('click', async () => {
    if (confirm('削除しますか？')) {
      state.words = state.words.filter(x=>x.id!==w.id);
      saveCache(); await deleteFromSheets(w.id, w.cat);
      sheet.remove(); renderHome(); toast('削除しました');
    }
  });
}

function renderProgress() {
  const total=state.words.length, mastered=state.words.filter(w=>w.mastered).length;
  document.getElementById('progress-overview').innerHTML = `
    <div class="progress-card"><div class="progress-card-num">${total}</div><div class="progress-card-label">總學習數</div></div>
    <div class="progress-card"><div class="progress-card-num">${mastered}</div><div class="progress-card-label">已掌握</div></div>
    <div class="progress-card"><div class="progress-card-num">${total>0?Math.round(mastered/total*100):0}%</div><div class="progress-card-label">完成率</div></div>
    <div class="progress-card"><div class="progress-card-num">${state.words.filter(w=>w.cat==='vocab').length}</div><div class="progress-card-label">単語</div></div>`;
  const lvColors = {N1:'#c0392b',N2:'#e67e22',N3:'#3498db',N4:'#27ae60',N5:'#9b59b6'};
  document.getElementById('level-progress').innerHTML = ['N1','N2','N3','N4','N5'].map(lv => {
    const lvW=state.words.filter(w=>w.level===lv), lvM=lvW.filter(w=>w.mastered).length;
    const pct=lvW.length>0?Math.round(lvM/lvW.length*100):0;
    return `<div class="level-row-item"><div class="level-name" style="color:${lvColors[lv]}">${lv}</div><div class="level-bar-wrap"><div class="level-bar-fill ${lv.toLowerCase()}" style="width:${pct}%"></div></div><div class="level-count">${lvM}/${lvW.length}</div></div>`;
  }).join('');
  const hist=getHistory(), dayNames=['日','月','火','水','木','金','土'];
  document.getElementById('history-grid').innerHTML = Array.from({length:7},(_,i)=>{
    const d=new Date(); d.setDate(d.getDate()-(6-i));
    const key=d.toISOString().slice(0,10), cnt=hist[key]||0;
    const color=cnt===0?'#f0ede8':cnt<10?'#f0b8b3':cnt<20?'#e06c64':'#c0392b';
    return `<div class="history-day"><div class="history-dot" style="background:${color}"></div><div class="history-day-label">${dayNames[d.getDay()]}</div></div>`;
  }).join('');
}

// ===== Quiz =====
let quizState = {};
function startQuiz() {
  let pool = state.words.filter(w => state.quiz.cat==='all' || w.cat===state.quiz.cat);
  if (state.quiz.level!=='all') pool = pool.filter(w=>w.level===state.quiz.level);
  if (pool.length===0) { toast('この条件の単語がありません'); return; }
  quizState = { cards:[...pool].sort(()=>Math.random()-0.5).slice(0,state.quiz.count), idx:0, correct:0, wrong:0 };
  quizState.total = quizState.cards.length;
  document.getElementById('quiz-overlay').classList.remove('hidden');
  showQuizCard();
}
function showQuizCard() {
  const { cards,idx,total,correct,wrong } = quizState, w=cards[idx];
  document.getElementById('quiz-prog-text').textContent = `${idx+1}/${total}`;
  document.getElementById('qscore-correct').textContent = `${correct} ✓`;
  document.getElementById('qscore-wrong').textContent = `${wrong} ✗`;
  document.getElementById('quiz-progress-fill').style.width = `${idx/total*100}%`;
  document.getElementById('quiz-badge').textContent = w.level;
  document.getElementById('quiz-badge').className = `quiz-level-badge badge-${w.level.toLowerCase()}`;
  document.getElementById('quiz-question').textContent = w.word;
  document.getElementById('quiz-reading').textContent = w.reading||'';
  document.getElementById('quiz-tap-hint').classList.remove('hidden');
  document.getElementById('quiz-answer').classList.add('hidden');
  document.getElementById('quiz-actions').classList.add('hidden');
  document.getElementById('quiz-result').classList.add('hidden');
  document.getElementById('quiz-card').classList.remove('hidden');
  document.getElementById('answer-text').textContent = w.meaning||w.text?.slice(0,60)||'';
  document.getElementById('answer-example').textContent = w.example?`例：${w.example}`:(w.exampleZh||'');
  const card = document.getElementById('quiz-card');
  card.onclick = null;
  card.onclick = () => { document.getElementById('quiz-tap-hint').classList.add('hidden'); document.getElementById('quiz-answer').classList.remove('hidden'); document.getElementById('quiz-actions').classList.remove('hidden'); card.onclick=null; };
}
document.getElementById('btn-correct').addEventListener('click', () => { quizState.correct++; nextCard(); });
document.getElementById('btn-wrong').addEventListener('click', () => { quizState.wrong++; nextCard(); });
async function nextCard() {
  quizState.idx++;
  await logStudy(1);
  if (quizState.idx>=quizState.total) {
    document.getElementById('quiz-card').classList.add('hidden');
    document.getElementById('quiz-actions').classList.add('hidden');
    document.getElementById('quiz-result').classList.remove('hidden');
    const pct=Math.round(quizState.correct/quizState.total*100);
    document.getElementById('result-score').textContent = `${pct}%`;
    document.getElementById('result-detail').innerHTML = `正解 ${quizState.correct} 問<br>不正解 ${quizState.wrong} 問<br>合計 ${quizState.total} 問`;
    document.getElementById('quiz-progress-fill').style.width = '100%';
  } else showQuizCard();
}
document.getElementById('retry-btn').addEventListener('click', () => { quizState.idx=0; quizState.correct=0; quizState.wrong=0; quizState.cards=[...quizState.cards].sort(()=>Math.random()-0.5); showQuizCard(); });
document.getElementById('finish-btn').addEventListener('click', closeQuiz);
document.getElementById('quiz-close-btn').addEventListener('click', closeQuiz);
function closeQuiz() { document.getElementById('quiz-overlay').classList.add('hidden'); renderHome(); }

// ===== Export/Import =====
function exportJSON() {
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(new Blob([JSON.stringify({words:state.words,exportedAt:new Date().toISOString()},null,2)],{type:'application/json'})),
    download: `nihongo_backup_${new Date().toISOString().slice(0,10)}.json`
  });
  a.click(); toast('エクスポートしました');
}
async function importJSON(e) {
  const file=e.target.files[0]; if(!file) return;
  const reader=new FileReader();
  reader.onload = async ev => {
    try {
      const data=JSON.parse(ev.target.result);
      if (data.words && Array.isArray(data.words)) {
        const existing=new Set(state.words.map(w=>w.id));
        const newWords=data.words.filter(w=>!existing.has(w.id));
        if (confirm(`${newWords.length} 件をインポートしますか？`)) {
          state.words=[...state.words,...newWords]; saveCache();
          if (state.scriptUrl) { toast('Sheets に同期中...'); await sheetsPost({action:'sync',words:state.words}); }
          renderHome(); toast(`${newWords.length} 件をインポートしました`);
        }
      }
    } catch { toast('ファイル形式が正しくありません'); }
    e.target.value='';
  };
  reader.readAsText(file);
}
async function clearAll() {
  if (confirm('すべてのデータを削除しますか？')) {
    state.words=[]; saveCache();
    if (state.scriptUrl) await sheetsPost({action:'sync',words:[]});
    renderHome(); navigateTo('home'); toast('データを削除しました');
  }
}

// ===== Utils =====
function toast(msg, duration=2500) {
  const el=document.getElementById('toast');
  el.textContent=msg; el.classList.remove('hidden'); el.classList.add('show');
  clearTimeout(window._tt);
  window._tt=setTimeout(()=>{ el.classList.remove('show'); setTimeout(()=>el.classList.add('hidden'),300); }, duration);
}
function esc(s) { return s?String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'):''; }
