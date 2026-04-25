/* ===================================================
   日本語 学習帳 — app.js
   LocalStorage + Google Sheets sync
=================================================== */

const DB_KEY = 'nihongo_db';
const HISTORY_KEY = 'nihongo_history';
const SETTINGS_KEY = 'nihongo_settings';

// ===== State =====
let state = {
  words: [],        // all entries
  filter: { level: 'all', cat: 'vocab' },
  quiz: { level: 'all', cat: 'vocab', count: 20 },
  form: { cat: 'vocab', level: 'N1' },
  editId: null,
};

// ===== Init =====
window.addEventListener('DOMContentLoaded', () => {
  loadDB();
  loadSettings();
  setTimeout(() => {
    document.getElementById('splash').classList.add('fade-out');
    setTimeout(() => {
      document.getElementById('splash').style.display = 'none';
      document.getElementById('app').classList.remove('hidden');
    }, 500);
  }, 1200);
  bindEvents();
  renderHome();
});

// ===== LocalStorage DB =====
function loadDB() {
  try {
    const raw = localStorage.getItem(DB_KEY);
    state.words = raw ? JSON.parse(raw) : [];
  } catch { state.words = []; }
}
function saveDB() {
  localStorage.setItem(DB_KEY, JSON.stringify(state.words));
}

function loadSettings() {
  try {
    const s = localStorage.getItem(SETTINGS_KEY);
    if (s) {
      const parsed = JSON.parse(s);
      document.getElementById('gs-sheet-id').value = parsed.sheetId || '';
      document.getElementById('gs-script-url').value = parsed.scriptUrl || '';
    }
  } catch {}
}

function getSettings() {
  return {
    sheetId: document.getElementById('gs-sheet-id').value.trim(),
    scriptUrl: document.getElementById('gs-script-url').value.trim(),
  };
}

// ===== History =====
function logStudyToday(count) {
  const today = new Date().toISOString().slice(0, 10);
  let h = {};
  try { h = JSON.parse(localStorage.getItem(HISTORY_KEY)) || {}; } catch {}
  h[today] = (h[today] || 0) + count;
  localStorage.setItem(HISTORY_KEY, JSON.stringify(h));
}

function getHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || {}; } catch { return {}; }
}

// ===== Navigation =====
function navigateTo(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('page-' + page)?.classList.add('active');
  document.querySelector(`.nav-btn[data-page="${page}"]`)?.classList.add('active');
  const titles = { home: 'ホーム', quiz: 'テスト', progress: '進度', settings: '設定', add: state.editId ? '編集' : '新增' };
  document.getElementById('page-title').textContent = titles[page] || '';
  document.getElementById('fab-btn').style.display = (page === 'home' || page === 'progress') ? 'flex' : 'none';
  if (page === 'progress') renderProgress();
  if (page === 'home') renderHome();
}

function bindEvents() {
  // Nav
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => navigateTo(btn.dataset.page));
  });

  // FAB
  document.getElementById('fab-btn').addEventListener('click', openAddForm);

  // Settings btn
  document.getElementById('settings-btn').addEventListener('click', () => navigateTo('settings'));

  // Sync btn
  document.getElementById('sync-btn').addEventListener('click', syncGoogleSheets);

  // Level pills (home)
  document.querySelectorAll('.level-pill[data-level]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.level-pill[data-level]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.filter.level = btn.dataset.level;
      renderWordList();
    });
  });

  // Category tabs
  document.querySelectorAll('.cat-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.cat-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.filter.cat = btn.dataset.cat;
      renderWordList();
    });
  });

  // Quiz level pills
  document.querySelectorAll('.level-pill[data-qlevel]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.level-pill[data-qlevel]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.quiz.level = btn.dataset.qlevel;
    });
  });

  // Quiz cat
  document.querySelectorAll('.level-pill[data-qcat]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.level-pill[data-qcat]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.quiz.cat = btn.dataset.qcat;
    });
  });

  // Quiz count
  document.querySelectorAll('.level-pill[data-qcount]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.level-pill[data-qcount]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.quiz.count = parseInt(btn.dataset.qcount);
    });
  });

  // Start quiz
  document.getElementById('start-quiz-btn').addEventListener('click', startQuiz);

  // Form category
  document.querySelectorAll('.level-pill[data-fcat]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.level-pill[data-fcat]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.form.cat = btn.dataset.fcat;
      showFormFields(btn.dataset.fcat);
    });
  });

  // Form level
  document.querySelectorAll('.level-pill[data-flevel]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.level-pill[data-flevel]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.form.level = btn.dataset.flevel;
    });
  });

  // Form save
  document.getElementById('save-word-btn').addEventListener('click', saveEntry);
  document.getElementById('cancel-add-btn').addEventListener('click', () => navigateTo('home'));

  // Settings
  document.getElementById('save-gs-btn').addEventListener('click', saveGSSettings);
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

  // Set pills active
  document.querySelectorAll('.level-pill[data-fcat]').forEach(b => b.classList.toggle('active', b.dataset.fcat === cat));
  document.querySelectorAll('.level-pill[data-flevel]').forEach(b => b.classList.toggle('active', b.dataset.flevel === level));

  showFormFields(cat);

  if (editWord) {
    document.getElementById('form-title').textContent = '編集';
    if (cat === 'vocab') {
      document.getElementById('f-word').value = editWord.word || '';
      document.getElementById('f-reading').value = editWord.reading || '';
      document.getElementById('f-meaning').value = editWord.meaning || '';
      document.getElementById('f-example').value = editWord.example || '';
      document.getElementById('f-example-zh').value = editWord.exampleZh || '';
    } else if (cat === 'grammar') {
      document.getElementById('f-grammar-pattern').value = editWord.word || '';
      document.getElementById('f-grammar-desc').value = editWord.meaning || '';
      document.getElementById('f-grammar-example').value = editWord.example || '';
      document.getElementById('f-grammar-example-zh').value = editWord.exampleZh || '';
    } else {
      document.getElementById('f-reading-title').value = editWord.word || '';
      document.getElementById('f-reading-text').value = editWord.text || '';
      document.getElementById('f-reading-qa').value = editWord.qa || '';
      document.getElementById('f-reading-source').value = editWord.source || '';
    }
    document.getElementById('f-note').value = editWord.note || '';
  } else {
    document.getElementById('form-title').textContent = '新増単語';
    clearForm();
  }

  navigateTo('add');
}

function showFormFields(cat) {
  document.getElementById('vocab-fields').style.display = cat === 'vocab' ? 'block' : 'none';
  document.getElementById('grammar-fields').style.display = cat === 'grammar' ? 'block' : 'none';
  document.getElementById('reading-fields').style.display = cat === 'reading' ? 'block' : 'none';
}

function clearForm() {
  ['f-word','f-reading','f-meaning','f-example','f-example-zh',
   'f-grammar-pattern','f-grammar-desc','f-grammar-example','f-grammar-example-zh',
   'f-reading-title','f-reading-text','f-reading-qa','f-reading-source','f-note']
    .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
}

function saveEntry() {
  const cat = state.form.cat;
  const level = state.form.level;
  let entry = { cat, level, note: document.getElementById('f-note').value.trim(), mastered: false };

  if (cat === 'vocab') {
    const word = document.getElementById('f-word').value.trim();
    const meaning = document.getElementById('f-meaning').value.trim();
    if (!word || !meaning) { toast('単語と意味は必須です'); return; }
    entry.word = word;
    entry.reading = document.getElementById('f-reading').value.trim();
    entry.meaning = meaning;
    entry.example = document.getElementById('f-example').value.trim();
    entry.exampleZh = document.getElementById('f-example-zh').value.trim();
  } else if (cat === 'grammar') {
    const pattern = document.getElementById('f-grammar-pattern').value.trim();
    if (!pattern) { toast('文法句型は必須です'); return; }
    entry.word = pattern;
    entry.meaning = document.getElementById('f-grammar-desc').value.trim();
    entry.example = document.getElementById('f-grammar-example').value.trim();
    entry.exampleZh = document.getElementById('f-grammar-example-zh').value.trim();
  } else {
    const text = document.getElementById('f-reading-text').value.trim();
    if (!text) { toast('文章内容は必須です'); return; }
    entry.word = document.getElementById('f-reading-title').value.trim() || '読解';
    entry.text = text;
    entry.qa = document.getElementById('f-reading-qa').value.trim();
    entry.source = document.getElementById('f-reading-source').value.trim();
  }

  if (state.editId) {
    const idx = state.words.findIndex(w => w.id === state.editId);
    if (idx !== -1) {
      entry.id = state.editId;
      entry.mastered = state.words[idx].mastered;
      entry.createdAt = state.words[idx].createdAt;
      entry.updatedAt = Date.now();
      state.words[idx] = entry;
      toast('更新しました ✓');
    }
  } else {
    entry.id = Date.now().toString();
    entry.createdAt = Date.now();
    entry.updatedAt = Date.now();
    state.words.unshift(entry);
    toast('追加しました ✓');
  }

  saveDB();
  navigateTo('home');
}

// ===== Render Home =====
function renderHome() {
  const total = state.words.length;
  const mastered = state.words.filter(w => w.mastered).length;
  const today = new Date().toISOString().slice(0, 10);
  const hist = getHistory();
  document.getElementById('stat-total').textContent = total;
  document.getElementById('stat-today').textContent = hist[today] || 0;
  document.getElementById('stat-mastered').textContent = mastered;
  renderWordList();
}

function renderWordList() {
  const list = document.getElementById('word-list');
  const empty = document.getElementById('empty-state');
  const { level, cat } = state.filter;

  let words = state.words.filter(w => w.cat === cat);
  if (level !== 'all') words = words.filter(w => w.level === level);

  if (words.length === 0) {
    list.innerHTML = '';
    list.appendChild(empty);
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  list.innerHTML = words.map(w => `
    <div class="word-card ${w.level.toLowerCase()}" data-id="${w.id}">
      <div class="word-card-main">
        <div class="word-jp">${escHtml(w.word)}</div>
        ${w.reading ? `<div class="word-reading">${escHtml(w.reading)}</div>` : ''}
        <div class="word-meaning">${escHtml(w.meaning || w.text?.slice(0, 40) || '')}</div>
      </div>
      <div class="word-card-meta">
        <span class="word-level-badge badge-${w.level.toLowerCase()}">${w.level}</span>
        <div class="word-mastered-dot ${w.mastered ? 'mastered' : ''}"></div>
      </div>
    </div>
  `).join('');

  list.querySelectorAll('.word-card').forEach(card => {
    card.addEventListener('click', () => {
      const w = state.words.find(x => x.id === card.dataset.id);
      if (w) showWordDetail(w);
    });
  });
}

function showWordDetail(w) {
  const existing = document.querySelector('.word-detail-sheet');
  if (existing) existing.remove();

  const sheet = document.createElement('div');
  sheet.className = 'word-detail-sheet';
  sheet.innerHTML = `
    <div class="sheet-backdrop"></div>
    <div class="sheet-content">
      <div class="sheet-handle"></div>
      <div class="sheet-word">${escHtml(w.word)}</div>
      ${w.reading ? `<div class="sheet-reading">${escHtml(w.reading)}</div>` : ''}
      ${w.meaning ? `<div class="sheet-meaning">${escHtml(w.meaning)}</div>` : ''}
      ${w.example ? `<div class="sheet-example"><div style="margin-bottom:4px;font-family:var(--font-serif)">${escHtml(w.example)}</div>${w.exampleZh ? `<div style="color:var(--ink-faint);font-size:13px">${escHtml(w.exampleZh)}</div>` : ''}</div>` : ''}
      ${w.text ? `<div class="sheet-example" style="font-family:var(--font-serif);white-space:pre-wrap">${escHtml(w.text)}</div>` : ''}
      ${w.note ? `<div class="sheet-note">📝 ${escHtml(w.note)}</div>` : ''}
      <div class="sheet-actions">
        <button class="sheet-mastered-btn ${w.mastered ? 'mastered' : ''}" id="detail-master-btn">${w.mastered ? '✓ 已掌握' : '標記已掌握'}</button>
        <button class="sheet-edit-btn" id="detail-edit-btn">編集</button>
        <button class="sheet-delete-btn" id="detail-delete-btn">🗑</button>
      </div>
    </div>
  `;
  document.body.appendChild(sheet);

  sheet.querySelector('.sheet-backdrop').addEventListener('click', () => sheet.remove());
  sheet.querySelector('#detail-master-btn').addEventListener('click', () => {
    const idx = state.words.findIndex(x => x.id === w.id);
    state.words[idx].mastered = !state.words[idx].mastered;
    saveDB();
    sheet.remove();
    renderHome();
  });
  sheet.querySelector('#detail-edit-btn').addEventListener('click', () => {
    sheet.remove();
    openAddForm(w);
  });
  sheet.querySelector('#detail-delete-btn').addEventListener('click', () => {
    if (confirm('削除しますか？')) {
      state.words = state.words.filter(x => x.id !== w.id);
      saveDB();
      sheet.remove();
      renderHome();
      toast('削除しました');
    }
  });
}

// ===== Progress =====
function renderProgress() {
  const total = state.words.length;
  const mastered = state.words.filter(w => w.mastered).length;

  document.getElementById('progress-overview').innerHTML = `
    <div class="progress-card">
      <div class="progress-card-num">${total}</div>
      <div class="progress-card-label">總學習數</div>
    </div>
    <div class="progress-card">
      <div class="progress-card-num">${mastered}</div>
      <div class="progress-card-label">已掌握</div>
    </div>
    <div class="progress-card">
      <div class="progress-card-num">${total > 0 ? Math.round(mastered / total * 100) : 0}%</div>
      <div class="progress-card-label">完成率</div>
    </div>
    <div class="progress-card">
      <div class="progress-card-num">${state.words.filter(w => w.cat === 'vocab').length}</div>
      <div class="progress-card-label">単語</div>
    </div>
  `;

  const levels = ['N1','N2','N3','N4','N5'];
  document.getElementById('level-progress').innerHTML = levels.map(lv => {
    const lvWords = state.words.filter(w => w.level === lv);
    const lvMastered = lvWords.filter(w => w.mastered).length;
    const pct = lvWords.length > 0 ? Math.round(lvMastered / lvWords.length * 100) : 0;
    return `<div class="level-row-item">
      <div class="level-name" style="color:${lvColor(lv)}">${lv}</div>
      <div class="level-bar-wrap">
        <div class="level-bar-fill ${lv.toLowerCase()}" style="width:${pct}%"></div>
      </div>
      <div class="level-count">${lvMastered}/${lvWords.length}</div>
    </div>`;
  }).join('');

  // History
  const hist = getHistory();
  const days = [];
  const dayNames = ['日','月','火','水','木','金','土'];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const count = hist[key] || 0;
    const intensity = count === 0 ? '#f0ede8' : count < 10 ? '#f0b8b3' : count < 20 ? '#e06c64' : '#c0392b';
    days.push(`<div class="history-day">
      <div class="history-dot" style="background:${intensity}"></div>
      <div class="history-day-label">${dayNames[d.getDay()]}</div>
    </div>`);
  }
  document.getElementById('history-grid').innerHTML = days.join('');
}

function lvColor(lv) {
  const map = { N1:'#c0392b', N2:'#e67e22', N3:'#3498db', N4:'#27ae60', N5:'#9b59b6' };
  return map[lv] || '#888';
}

// ===== Quiz =====
let quizState = {};

function startQuiz() {
  const { level, cat, count } = state.quiz;
  let pool = state.words.filter(w => w.cat === cat || cat === 'all');
  if (level !== 'all') pool = pool.filter(w => w.level === level);

  if (pool.length === 0) { toast('この条件の単語がありません'); return; }

  // Shuffle and limit
  const shuffled = [...pool].sort(() => Math.random() - 0.5).slice(0, count);

  quizState = {
    cards: shuffled,
    idx: 0,
    correct: 0,
    wrong: 0,
    total: shuffled.length,
  };

  document.getElementById('quiz-overlay').classList.remove('hidden');
  showQuizCard();
}

function showQuizCard() {
  const { cards, idx, total, correct, wrong } = quizState;
  const w = cards[idx];

  document.getElementById('quiz-prog-text').textContent = `${idx + 1}/${total}`;
  document.getElementById('qscore-correct').textContent = `${correct} ✓`;
  document.getElementById('qscore-wrong').textContent = `${wrong} ✗`;
  document.getElementById('quiz-progress-fill').style.width = `${(idx / total) * 100}%`;

  document.getElementById('quiz-badge').textContent = w.level;
  document.getElementById('quiz-badge').className = `quiz-level-badge badge-${w.level.toLowerCase()}`;

  if (w.cat === 'grammar') {
    document.getElementById('quiz-question').textContent = w.word;
    document.getElementById('quiz-reading').textContent = '';
  } else {
    document.getElementById('quiz-question').textContent = w.word;
    document.getElementById('quiz-reading').textContent = w.reading || '';
  }

  document.getElementById('quiz-tap-hint').classList.remove('hidden');
  document.getElementById('quiz-answer').classList.add('hidden');
  document.getElementById('quiz-actions').classList.add('hidden');
  document.getElementById('quiz-result').classList.add('hidden');
  document.getElementById('quiz-card').classList.remove('hidden');

  document.getElementById('answer-text').textContent = w.meaning || w.text?.slice(0, 60) || '';
  document.getElementById('answer-example').textContent = w.example ? `例：${w.example}` : (w.exampleZh ? w.exampleZh : '');

  // Tap to reveal
  const card = document.getElementById('quiz-card');
  card.onclick = null;
  card.onclick = () => {
    document.getElementById('quiz-tap-hint').classList.add('hidden');
    document.getElementById('quiz-answer').classList.remove('hidden');
    document.getElementById('quiz-actions').classList.remove('hidden');
    card.onclick = null;
  };
}

document.getElementById('btn-correct').addEventListener('click', () => {
  quizState.correct++;
  nextCard();
});
document.getElementById('btn-wrong').addEventListener('click', () => {
  quizState.wrong++;
  nextCard();
});

function nextCard() {
  quizState.idx++;
  logStudyToday(1);
  if (quizState.idx >= quizState.total) {
    showQuizResult();
  } else {
    showQuizCard();
  }
}

function showQuizResult() {
  document.getElementById('quiz-card').classList.add('hidden');
  document.getElementById('quiz-actions').classList.add('hidden');
  const result = document.getElementById('quiz-result');
  result.classList.remove('hidden');

  const pct = Math.round((quizState.correct / quizState.total) * 100);
  document.getElementById('result-score').textContent = `${pct}%`;
  document.getElementById('result-detail').innerHTML =
    `正解 ${quizState.correct} 問<br>不正解 ${quizState.wrong} 問<br>合計 ${quizState.total} 問`;

  document.getElementById('quiz-progress-fill').style.width = '100%';
}

document.getElementById('retry-btn').addEventListener('click', () => {
  quizState.idx = 0;
  quizState.correct = 0;
  quizState.wrong = 0;
  quizState.cards = [...quizState.cards].sort(() => Math.random() - 0.5);
  showQuizCard();
});

document.getElementById('finish-btn').addEventListener('click', closeQuiz);
document.getElementById('quiz-close-btn').addEventListener('click', closeQuiz);

function closeQuiz() {
  document.getElementById('quiz-overlay').classList.add('hidden');
  renderHome();
}

// ===== Settings =====
function saveGSSettings() {
  const settings = getSettings();
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  toast('設定を保存しました ✓');
}

// ===== Google Sheets Sync =====
async function syncGoogleSheets() {
  const { scriptUrl } = getSettings();
  if (!scriptUrl) { toast('先に Apps Script URL を設定してください'); navigateTo('settings'); return; }

  const btn = document.getElementById('sync-btn');
  btn.classList.add('spinning');

  try {
    // Push all words to GAS
    const res = await fetch(scriptUrl, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'sync', words: state.words }),
    });
    toast('Google Sheets に同期しました ✓');
  } catch (e) {
    toast('同期に失敗しました。設定を確認してください');
  } finally {
    btn.classList.remove('spinning');
  }
}

// ===== Export / Import =====
function exportJSON() {
  const data = JSON.stringify({ words: state.words, exportedAt: new Date().toISOString() }, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `nihongo_backup_${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  toast('エクスポートしました');
}

function importJSON(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const data = JSON.parse(ev.target.result);
      if (data.words && Array.isArray(data.words)) {
        if (confirm(`${data.words.length} 件のデータをインポートしますか？\n（既存データに追加されます）`)) {
          const existing = new Set(state.words.map(w => w.id));
          const newWords = data.words.filter(w => !existing.has(w.id));
          state.words = [...state.words, ...newWords];
          saveDB();
          renderHome();
          toast(`${newWords.length} 件をインポートしました`);
        }
      }
    } catch { toast('ファイル形式が正しくありません'); }
    e.target.value = '';
  };
  reader.readAsText(file);
}

function clearAll() {
  if (confirm('すべてのデータを削除しますか？この操作は元に戻せません。')) {
    state.words = [];
    saveDB();
    renderHome();
    navigateTo('home');
    toast('データを削除しました');
  }
}

// ===== Toast =====
function toast(msg, duration = 2200) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  el.classList.add('show');
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.classList.add('hidden'), 300);
  }, duration);
}

function escHtml(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
