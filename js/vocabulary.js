/* ===== 词汇学习模块 (Vocabulary) =====
 * 分级 L1-L5 对应 CEFR A1-C2，从最常用词开始循序渐进
 * 学习模式：单词卡(拼写/音标/词性/释义/例句/联想)，点击发音
 * 翻卡模式：先看中文猜英文，翻转看答案
 * 测验模式：选择题(英→中 / 中→英)、拼写测验(听音拼词)，自适应从弱项抽题
 * 搜索：本地过滤查询
 * 兼容 iOS Safari（所有发音由用户点击触发）
 */
window.EM = window.EM || {};

EM.vocabulary = {
  data: null,            // 从 data/vocabulary.json 加载的词汇数据
  _container: null,     // 当前渲染容器（用于局部刷新）
  mode: 'learn',        // 'learn' 学习 | 'flip' 翻卡 | 'quiz' 测验 | 'search' 搜索
  activeLevel: 1,       // 当前级别 1-5
  currentIdx: 0,        // 当前级别内单词索引
  flipRevealed: false,  // 翻卡是否已翻开
  quizState: null,      // 当前测验题目状态
  searchQuery: '',      // 搜索关键字

  /* ===== 入口：由路由调用 ===== */
  async render(container) {
    this._container = container;
    this._injectStyles();
    container.innerHTML = '<div class="loading">加载词汇数据中...</div>';

    // 异步加载数据（EM.data 带缓存）
    if (!this.data) {
      this.data = await EM.data.load('vocabulary');
    }
    if (!this.data || !this.data.levels) {
      container.innerHTML = '<div class="card"><p>词汇数据加载失败，请刷新重试。</p></div>';
      return;
    }

    // 从进度恢复上次级别（默认对应用户当前级别，至少 L1）
    const p = EM.progress.get();
    this.activeLevel = Math.max(1, p.modules.vocabulary.current || p.level || 1);
    if (!this._levelExists(this.activeLevel)) this.activeLevel = 1;
    // 恢复当前级别内的索引（顺序学习）
    const idx = p.modules.vocabulary.idxByLevel || {};
    this.currentIdx = idx[this.activeLevel] || 0;
    const lvlData = this._getLevel(this.activeLevel);
    if (lvlData && this.currentIdx >= lvlData.words.length) this.currentIdx = 0;

    this._renderShell();
  },

  /* ===== 注入本模块专用样式（复用全局 .word-card 等） ===== */
  _injectStyles() {
    if (document.getElementById('vocab-styles')) return;
    const style = document.createElement('style');
    style.id = 'vocab-styles';
    style.textContent = `
      .vocab-mode-bar { display:flex; gap:8px; margin-bottom:12px; flex-wrap:wrap; }
      .vocab-toolbar { display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-bottom:12px; }
      .vocab-search-input {
        flex:1; min-width:160px; padding:8px 12px; background:var(--bg-card);
        border:1px solid var(--border); border-radius:var(--radius-sm);
        color:var(--text-primary); font-size:14px;
      }
      .vocab-search-input:focus { outline:none; border-color:var(--accent); }
      .word-card.clickable { cursor:pointer; transition:var(--transition); }
      .word-card.clickable:hover { border-color:var(--accent); }
      .word-pos { display:inline-block; padding:1px 8px; border-radius:10px;
        background:var(--accent-bg); color:var(--accent); font-size:12px;
        font-weight:600; margin-left:6px; vertical-align:middle; }
      .word-extras { font-size:13px; color:var(--text-secondary); margin-top:8px; }
      .word-card.mastered { border-color:var(--success); background:rgba(76,175,136,0.10); }
      .word-card.weak { border-color:var(--warning); background:rgba(240,160,64,0.10); }
      .word-action-bar { display:flex; gap:8px; justify-content:center; flex-wrap:wrap; margin-top:16px; }
      .flip-card { perspective:1200px; min-height:280px; cursor:pointer; }
      .flip-inner {
        position:relative; width:100%; min-height:280px;
        transition:transform 0.6s; transform-style:preserve-3d;
      }
      .flip-card.revealed .flip-inner { transform:rotateY(180deg); }
      .flip-front, .flip-back {
        position:absolute; inset:0; backface-visibility:hidden;
        -webkit-backface-visibility:hidden; display:flex; flex-direction:column;
        align-items:center; justify-content:center; padding:24px; text-align:center;
      }
      .flip-back { transform:rotateY(180deg); }
      .flip-front .flip-prompt { font-size:30px; font-weight:700; color:var(--text-primary); }
      .flip-front .flip-hint { font-size:13px; color:var(--text-secondary); margin-top:10px; }
      .flip-back .flip-spelling { font-size:32px; font-weight:700; color:var(--accent); }
      .flip-back .flip-phonetic { font-size:16px; color:var(--text-secondary); margin-top:6px; }
      .flip-back .flip-meaning { font-size:14px; color:var(--text-primary); margin-top:8px; }
      .quiz-meta { font-size:13px; color:var(--text-secondary); margin-bottom:12px; }
      .quiz-question { font-size:18px; font-weight:600; margin-bottom:14px; text-align:center; }
      .quiz-prompt-word { font-size:34px; font-weight:700; text-align:center; margin:8px 0 16px; color:var(--accent); }
      .quiz-prompt-cn { font-size:24px; font-weight:600; text-align:center; margin:8px 0 16px; color:var(--accent); }
      .quiz-replay { margin:0 auto 14px; display:block; }
      .quiz-spell-input {
        width:100%; padding:12px; background:var(--bg-card);
        border:2px solid var(--border); border-radius:var(--radius-sm);
        color:var(--text-primary); font-size:18px; text-align:center; margin-bottom:12px;
      }
      .quiz-spell-input:focus { outline:none; border-color:var(--accent); }
      .search-result-item {
        padding:10px 14px; border:1px solid var(--border); border-radius:var(--radius-sm);
        background:var(--bg-card); margin-bottom:8px; cursor:pointer; transition:var(--transition);
      }
      .search-result-item:hover { border-color:var(--accent); background:var(--bg-hover); }
      .search-result-item .sr-word { font-weight:700; font-size:15px; }
      .search-result-item .sr-phonetic { color:var(--text-secondary); font-size:13px; margin-left:8px; }
      .search-result-item .sr-meaning { color:var(--text-primary); font-size:14px; margin-top:4px; }
      .search-result-item .sr-level { font-size:11px; color:var(--accent); margin-top:4px; }
      .vocab-hint { font-size:13px; color:var(--text-secondary); margin-top:8px; }
      .word-card .word-spelling { color:var(--text-primary); }
      .word-card .word-spelling:hover { color:var(--accent); }
      .word-card .word-phonetic:hover { color:var(--accent); cursor:pointer; }
      .word-card .word-example:hover { color:var(--accent-light); cursor:pointer; }
      /* 记忆口诀区(醒目) */
      .vocab-mnemonic {
        background: linear-gradient(135deg, rgba(255,193,7,0.18), rgba(76,175,136,0.10));
        border-left:4px solid var(--warning);
        padding:12px 14px; border-radius:var(--radius-sm); margin-top:10px;
      }
      .vocab-mnemonic-title { font-size:13px; font-weight:700; color:var(--warning); }
      .vocab-mnemonic-body { font-size:14px; line-height:1.7; margin-top:6px; color:var(--text-primary); }
      /* 复习提醒 */
      .vocab-review-box {
        margin-top:10px; padding:10px 12px; border-radius:var(--radius-sm);
        background:var(--bg-secondary); border:1px dashed var(--border);
        font-size:13px; color:var(--text-secondary);
      }
      .vocab-review-box.due { border-color:var(--warning); background:rgba(240,160,64,0.12); color:var(--text-primary); }
      /* 词性 emoji */
      .word-emoji { font-size:24px; margin-right:6px; vertical-align:middle; }
    `;
    document.head.appendChild(style);
  },

  /* ===== 词性→emoji 映射,用于加强视觉记忆 ===== */
  _posEmoji(pos) {
    const p = (pos || '').toLowerCase();
    if (p.indexOf('n.') === 0 || p.indexOf('noun') === 0) return '📦';
    if (p.indexOf('v.') === 0 || p.indexOf('vi.') === 0 || p.indexOf('vt.') === 0 || p.indexOf('verb') === 0) return '🏃';
    if (p.indexOf('adj.') === 0 || p.indexOf('adjective') === 0) return '🎨';
    if (p.indexOf('adv.') === 0 || p.indexOf('adverb') === 0) return '💨';
    if (p.indexOf('prep.') === 0) return '📍';
    if (p.indexOf('conj.') === 0) return '🔗';
    if (p.indexOf('pron.') === 0) return '👥';
    if (p.indexOf('interj.') === 0) return '❗';
    if (p.indexOf('num.') === 0) return '🔢';
    if (p.indexOf('abbr.') === 0) return '🔤';
    if (p.indexOf('art.') === 0) return '🟰';
    if (p.indexOf('aux.') === 0) return '🛠️';
    if (p.indexOf('modal') === 0) return '🛠️';
    return '📘';
  },

  /* ===== 艾宾浩斯复习计划:基于首次学习时间返回提醒信息 =====
   * 复习节点:1天/2天/4天/7天/15天/30天
   * 返回 { due:bool, nextStage:string, daysToNext:int, learnedDays:int }
   */
  _reviewStatus(word) {
    const p = EM.progress.get();
    const reviews = p.modules.vocabulary.reviews || {};
    const firstAt = reviews[word] ? reviews[word].firstAt : null;
    if (!firstAt) return { due:false, learned:false };
    const now = Date.now();
    const dayMs = 86400000;
    const learnedDays = Math.floor((now - firstAt) / dayMs);
    const stages = [1, 2, 4, 7, 15, 30];
    // 找下一个未到的复习节点
    let nextStage = null;
    const reviewHistory = (reviews[word].history || []).slice();
    for (const s of stages) {
      if (!reviewHistory.includes(s) && learnedDays >= s) {
        return { due:true, learned:true, nextStage:'立即复习', learnedDays, stage:s };
      }
      if (!reviewHistory.includes(s) && nextStage === null) {
        nextStage = s;
        const daysToNext = s - learnedDays;
        return { due:false, learned:true, nextStage:'第'+s+'天复习', daysToNext:Math.max(0,daysToNext), learnedDays };
      }
    }
    return { due:false, learned:true, nextStage:'已永久记忆', learnedDays };
  },

  /* ===== 标记某词为已学习(首次学习时记录时间戳) =====
   * 用于艾宾浩斯复习追踪。返回 true 表示首次学习。
   */
  _markLearnedSilent(word) {
    const p = EM.progress.get();
    if ((p.modules.vocabulary.learned || []).includes(word)) return false;
    EM.progress.update(d => {
      if (!d.modules.vocabulary.learned) d.modules.vocabulary.learned = [];
      if (!d.modules.vocabulary.learned.includes(word)) d.modules.vocabulary.learned.push(word);
      if (!d.modules.vocabulary.reviews) d.modules.vocabulary.reviews = {};
      if (!d.modules.vocabulary.reviews[word]) {
        d.modules.vocabulary.reviews[word] = { firstAt: Date.now(), history: [] };
      }
    });
    EM.progress.removeWeakness('vocabulary', word);
    this._refreshStats();
    return true;
  },

  /* ===== 记录一次复习(把当前节点加入history) ===== */
  _recordReview(word, stage) {
    EM.progress.update(d => {
      if (!d.modules.vocabulary.reviews) d.modules.vocabulary.reviews = {};
      if (!d.modules.vocabulary.reviews[word]) {
        d.modules.vocabulary.reviews[word] = { firstAt: Date.now(), history: [] };
      }
      const h = d.modules.vocabulary.reviews[word].history;
      if (!h.includes(stage)) h.push(stage);
    });
  },

  /* ===== 路径自动推进:词汇学习完成后通知 app.js 检查路径 ===== */
  _autoAdvancePath() {
    setTimeout(async () => {
      try {
        const before = EM.progress.get().pathStep || 0;
        const step = EM.path.currentStep();
        if (!step) return;
        // 仅当当前步骤属于 vocabulary 模块才推进
        if (step.module !== 'vocabulary') return;
        if (!EM.path.isCurrentStepDone()) return;
        const after = await EM.path.advanceToNext();
        if (after > before) {
          EM.ui.toast(`🎉 第 ${step.step + 1} 课目标达成!自动进入第 ${after + 1} 课`, 4000);
        }
      } catch (e) { console.warn('vocab autoAdvance err', e); }
    }, 300);
  },

  /* ===== 渲染外壳：进度条 + 模式/级别切换 + 内容占位 ===== */
  _renderShell() {
    const container = this._container;
    const stats = this._calcStats();
    const pct = stats.total ? Math.min(100, stats.learned / stats.total * 100) : 0;
    const lvl = this._getLevel(this.activeLevel);
    const lvlName = lvl ? lvl.name : '';

    container.innerHTML = `
      <div class="card">
        <div class="card-title">📚 词汇学习 · 分级词汇 · 联想记忆 · 发音</div>
        <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
        <div class="font-sm text-secondary mt-16" style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;">
          <span>已学 <b data-stat="learned">${stats.learned}</b> / <span data-stat="total">${stats.total}</span> · 当前级别 <b data-stat="level">L${this.activeLevel} ${lvlName}</b></span>
          <span>测验得分 <b data-stat="score">${stats.score}</b> · 弱项 <b data-stat="weak">${stats.weakCount}</b></span>
        </div>
      </div>

      <div class="card">
        <div class="vocab-mode-bar">
          <button class="btn ${this.mode === 'learn' ? 'btn-primary' : 'btn-secondary'}" data-mode="learn">📖 学习</button>
          <button class="btn ${this.mode === 'flip' ? 'btn-primary' : 'btn-secondary'}" data-mode="flip">🔄 翻卡</button>
          <button class="btn ${this.mode === 'quiz' ? 'btn-primary' : 'btn-secondary'}" data-mode="quiz">🎯 测验</button>
          <button class="btn ${this.mode === 'search' ? 'btn-primary' : 'btn-secondary'}" data-mode="search">🔍 搜索</button>
        </div>
        ${this.mode !== 'search' ? `
          <div class="level-selector">
            ${this.data.levels.map(lv => `
              <button class="level-btn ${lv.level === this.activeLevel ? 'active' : ''}" data-level="${lv.level}">L${lv.level} · ${lv.name}</button>
            `).join('')}
          </div>
          <div class="vocab-hint">💡 学习路径：从 L1 第一个词开始按顺序学习。点击单词拼写或音标可播放发音，点击例句可朗读整句。</div>
        ` : `
          <div class="vocab-toolbar">
            <input type="text" class="vocab-search-input" id="vocabSearch" placeholder="输入英文单词或中文释义..." value="${EM.ui.esc(this.searchQuery)}">
            <button class="btn btn-secondary" id="vocabSearchBtn">搜索</button>
          </div>
          <div class="vocab-hint">💡 在所有级别的词汇中本地搜索。点击结果可跳转到该词的学习卡片。</div>
        `}
      </div>

      <div id="vocabContent"></div>
    `;

    // 模式切换
    container.querySelectorAll('[data-mode]').forEach(b => {
      b.onclick = () => {
        this.mode = b.dataset.mode;
        this.flipRevealed = false;
        if (this.mode === 'quiz') this._nextQuiz();
        this._renderShell();
      };
    });

    // 级别切换
    container.querySelectorAll('[data-level]').forEach(b => {
      b.onclick = () => {
        this.activeLevel = parseInt(b.dataset.level, 10);
        this.currentIdx = 0;
        this.flipRevealed = false;
        EM.progress.update(d => {
          if (!d.modules.vocabulary) d.modules.vocabulary = { learned: [], current: 1, score: 0, reviews: {} };
          d.modules.vocabulary.current = this.activeLevel;
          if (!d.modules.vocabulary.idxByLevel) d.modules.vocabulary.idxByLevel = {};
          d.modules.vocabulary.idxByLevel[this.activeLevel] = 0;
        });
        if (this.mode === 'quiz') this._nextQuiz();
        this._renderShell();
      };
    });

    // 搜索输入
    const searchInput = document.getElementById('vocabSearch');
    const searchBtn = document.getElementById('vocabSearchBtn');
    if (searchInput) {
      searchInput.oninput = () => { this.searchQuery = searchInput.value; this._renderSearchResults(); };
      searchInput.onkeydown = (e) => { if (e.key === 'Enter') this._renderSearchResults(); };
    }
    if (searchBtn) searchBtn.onclick = () => this._renderSearchResults();

    // 渲染内容区
    this._renderContent();
  },

  /* ===== 内容区分发 ===== */
  _renderContent() {
    const el = document.getElementById('vocabContent');
    if (!el) return;
    if (this.mode === 'learn') this._renderLearn(el);
    else if (this.mode === 'flip') this._renderFlip(el);
    else if (this.mode === 'quiz') this._renderQuiz(el);
    else if (this.mode === 'search') this._renderSearchResults(el);
  },

  /* ===== 工具：获取级别数据 ===== */
  _getLevel(level) {
    return (this.data && this.data.levels || []).find(l => l.level === level) || null;
  },
  _levelExists(level) { return !!this._getLevel(level); },

  /* ===== 计算当前级别统计 ===== */
  _calcStats() {
    const p = EM.progress.get();
    const learned = (p.modules.vocabulary.learned || []).slice();
    const lvl = this._getLevel(this.activeLevel);
    const total = lvl ? lvl.words.length : 0;
    // 当前级别内已学的数量
    const learnedInLevel = lvl ? lvl.words.filter(w => learned.includes(w.word)).length : 0;
    const weak = (p.weaknesses.vocabulary || []).slice();
    return {
      total, learned: learnedInLevel, score: p.modules.vocabulary.score || 0,
      weakCount: weak.length
    };
  },

  /* ===== 当前单词 ===== */
  _currentWord() {
    const lvl = this._getLevel(this.activeLevel);
    if (!lvl || !lvl.words.length) return null;
    if (this.currentIdx >= lvl.words.length) this.currentIdx = lvl.words.length - 1;
    if (this.currentIdx < 0) this.currentIdx = 0;
    return lvl.words[this.currentIdx] || null;
  },

  /* ===== 记录当前索引到进度 ===== */
  _saveCurrentIdx() {
    EM.progress.update(d => {
      if (!d.modules.vocabulary) d.modules.vocabulary = { learned: [], current: 1, score: 0, reviews: {} };
      if (!d.modules.vocabulary.idxByLevel) d.modules.vocabulary.idxByLevel = {};
      d.modules.vocabulary.idxByLevel[this.activeLevel] = this.currentIdx;
      d.modules.vocabulary.current = this.activeLevel;
    });
  },

  /* ================= 学习模式 ================= */

  _renderLearn(el) {
    const w = this._currentWord();
    if (!w) {
      el.innerHTML = '<div class="card"><p class="text-secondary">该级别暂无词汇。</p></div>';
      return;
    }
    const p = EM.progress.get();
    const learned = new Set(p.modules.vocabulary.learned || []);
    const weak = new Set(p.weaknesses.vocabulary || []);
    const isLearned = learned.has(w.word);
    const isWeak = weak.has(w.word);
    const lvl = this._getLevel(this.activeLevel);
    const total = lvl.words.length;
    const pos = (this.currentIdx + 1) + ' / ' + total;
    const emoji = this._posEmoji(w.pos);
    const review = this._reviewStatus(w.word);

    // 复习提醒框
    let reviewBox = '';
    if (review.learned) {
      const dueCls = review.due ? 'due' : '';
      const reviewText = review.due
        ? `📅 该词已学 ${review.learnedDays} 天,到了第 ${review.stage} 天复习节点,建议立即复习巩固`
        : `📅 已学 ${review.learnedDays} 天,下次复习:${review.nextStage}${review.daysToNext!==undefined ? '(还有 '+review.daysToNext+' 天)' : ''}`;
      reviewBox = `<div class="vocab-review-box ${dueCls}">${reviewText}${
        review.due ? `<button class="btn btn-secondary" style="margin-left:8px;padding:4px 10px;font-size:12px;" id="wordReview">✓ 已复习</button>` : ''
      }</div>`;
    }

    el.innerHTML = `
      <div class="card">
        <div class="flex justify-between align-center mb-16">
          <span class="font-sm text-secondary">位置 ${pos}</span>
          <span class="font-sm text-secondary">L${this.activeLevel} · ${EM.ui.esc(lvl.name)}</span>
        </div>
        <div class="word-card ${isLearned ? 'mastered' : ''} ${isWeak ? 'weak' : ''}">
          <div class="word-spelling" data-speak="word" title="点击发音">
            <span class="word-emoji">${emoji}</span>${EM.ui.esc(w.word)}
          </div>
          <div class="word-phonetic" data-speak="phonetic" title="点击音标发音">${EM.ui.esc(w.phonetic)}</div>
          <div class="word-meaning"><b>${EM.ui.esc(w.meaning)}</b><span class="word-pos">${EM.ui.esc(w.pos)}</span></div>
          <div class="word-example" data-speak="example" title="点击朗读例句">${EM.ui.esc(w.example)}</div>
          <div class="font-sm text-secondary">${EM.ui.esc(w.exampleCn)}</div>
          ${w.association ? `
            <div class="vocab-mnemonic">
              <div class="vocab-mnemonic-title">💡 记忆口诀(关键!)</div>
              <div class="vocab-mnemonic-body">${EM.ui.esc(w.association)}</div>
            </div>
          ` : ''}
          ${reviewBox}
          ${w.roots ? `<div class="word-extras">🌱 词根: ${EM.ui.esc(w.roots)}</div>` : ''}
          ${(w.synonyms && w.synonyms.length) ? `<div class="word-extras">🔁 同义: ${w.synonyms.map(s => EM.ui.esc(s)).join(', ')}</div>` : ''}
          ${(w.antonyms && w.antonyms.length) ? `<div class="word-extras">↔ 反义: ${w.antonyms.map(s => EM.ui.esc(s)).join(', ')}</div>` : ''}
        </div>
        <div class="word-action-bar">
          <button class="btn btn-secondary" id="wordPrev">⬅️ 上一个</button>
          <button class="btn ${isLearned ? 'btn-success' : 'btn-primary'}" id="wordLearn">${isLearned ? '✓ 已学' : '✓ 标记已学'}</button>
          <button class="btn ${isWeak ? 'btn-danger' : 'btn-secondary'}" id="wordWeak">${isWeak ? '★ 困难' : '★ 标记困难'}</button>
          <button class="btn btn-primary" id="wordNext">下一个 ➡️</button>
        </div>
      </div>
    `;

    // 点击拼写/音标/例句发音
    el.querySelectorAll('[data-speak]').forEach(node => {
      node.onclick = () => {
        const t = node.dataset.speak;
        if (t === 'word') EM.tts.speak(w.word);
        else if (t === 'phonetic') EM.tts.speak(w.word, { rate: 0.7 });
        else if (t === 'example') EM.tts.speak(w.example, { rate: 0.8 });
      };
    });

    document.getElementById('wordPrev').onclick = () => this._go(-1);
    document.getElementById('wordNext').onclick = () => this._go(1);
    document.getElementById('wordLearn').onclick = () => this._toggleLearned(w.word);
    document.getElementById('wordWeak').onclick = () => this._toggleWeak(w.word);
    const reviewBtn = document.getElementById('wordReview');
    if (reviewBtn) reviewBtn.onclick = () => {
      this._recordReview(w.word, review.stage);
      EM.ui.toast('已记录本次复习 ✓');
      this._renderContent();
    };
  },

  /* 前进/后退 */
  _go(step) {
    const lvl = this._getLevel(this.activeLevel);
    if (!lvl) return;
    let next = this.currentIdx + step;
    if (next < 0) next = 0;
    if (next >= lvl.words.length) next = lvl.words.length - 1;
    if (next === this.currentIdx) {
      EM.ui.toast(step > 0 ? '已是本级别最后一个词' : '已是本级别第一个词');
      return;
    }
    this.currentIdx = next;
    this.flipRevealed = false;
    this._saveCurrentIdx();
    this._renderContent();
  },

  /* 标记已学 */
  _toggleLearned(word) {
    const p = EM.progress.get();
    const has = (p.modules.vocabulary.learned || []).includes(word);
    if (has) {
      // 取消已学标记
      EM.progress.update(d => {
        if (!d.modules.vocabulary.learned) d.modules.vocabulary.learned = [];
        d.modules.vocabulary.learned = d.modules.vocabulary.learned.filter(x => x !== word);
        // 同时移除复习记录
        if (d.modules.vocabulary.reviews) delete d.modules.vocabulary.reviews[word];
      });
      EM.ui.toast('已取消已学标记');
    } else {
      // 标记为已学,并记录首次学习时间(用于艾宾浩斯复习)
      this._markLearnedSilent(word);
      EM.ui.toast('已标记学会 ✓');
      // 触发路径推进检查
      this._autoAdvancePath();
    }
    this._refreshStats();
    this._renderContent();
  },

  /* 标记困难(弱项) */
  _toggleWeak(word) {
    const p = EM.progress.get();
    const has = (p.weaknesses.vocabulary || []).includes(word);
    if (has) {
      EM.progress.removeWeakness('vocabulary', word);
      EM.ui.toast('已移出弱项');
    } else {
      EM.progress.addWeakness('vocabulary', word);
      EM.ui.toast('已记入弱项 ★');
    }
    this._refreshStats();
    this._renderContent();
  },

  /* 局部刷新顶部统计 */
  _refreshStats() {
    const stats = this._calcStats();
    const pct = stats.total ? Math.min(100, stats.learned / stats.total * 100) : 0;
    const c = this._container;
    if (!c) return;
    const fill = c.querySelector('.progress-fill');
    if (fill) fill.style.width = pct + '%';
    const m = c.querySelector('[data-stat="learned"]');
    if (m) m.textContent = stats.learned;
    const t = c.querySelector('[data-stat="total"]');
    if (t) t.textContent = stats.total;
    const s = c.querySelector('[data-stat="score"]');
    if (s) s.textContent = stats.score;
    const w = c.querySelector('[data-stat="weak"]');
    if (w) w.textContent = stats.weakCount;
  },

  /* ================= 翻卡模式 ================= */

  _renderFlip(el) {
    const w = this._currentWord();
    if (!w) {
      el.innerHTML = '<div class="card"><p class="text-secondary">该级别暂无词汇。</p></div>';
      return;
    }
    const lvl = this._getLevel(this.activeLevel);
    const pos = (this.currentIdx + 1) + ' / ' + lvl.words.length;

    el.innerHTML = `
      <div class="card">
        <div class="flex justify-between align-center mb-16">
          <span class="font-sm text-secondary">位置 ${pos}</span>
          <span class="font-sm text-secondary">${this.flipRevealed ? '已翻开' : '未翻开'}</span>
        </div>
        <div class="flip-card ${this.flipRevealed ? 'revealed' : ''}" id="flipCard">
          <div class="flip-inner">
            <div class="flip-front">
              <div class="flip-prompt">${EM.ui.esc(w.meaning)}</div>
              <div class="flip-hint">💬 看中文猜英文，点击卡片翻面</div>
            </div>
            <div class="flip-back">
              <div class="flip-spelling">${EM.ui.esc(w.word)}</div>
              <div class="flip-phonetic">${EM.ui.esc(w.phonetic)}</div>
              <div class="flip-meaning">${EM.ui.esc(w.meaning)} <span class="word-pos">${EM.ui.esc(w.pos)}</span></div>
              <div class="font-sm text-secondary mt-16" style="margin-top:12px;">${EM.ui.esc(w.example)}</div>
            </div>
          </div>
        </div>
        <div class="word-action-bar">
          <button class="btn btn-secondary" id="flipPrev">⬅️ 上一个</button>
          <button class="btn btn-primary" id="flipSpeak">🔊 听发音</button>
          <button class="btn btn-success" id="flipLearn">✓ 标记已学</button>
          <button class="btn btn-primary" id="flipNext">下一个 ➡️</button>
        </div>
      </div>
    `;

    // 点击卡片翻面 + 听发音
    const flipCard = document.getElementById('flipCard');
    flipCard.onclick = () => {
      this.flipRevealed = !this.flipRevealed;
      flipCard.classList.toggle('revealed', this.flipRevealed);
      // 翻开后自动播放一次发音
      if (this.flipRevealed) {
        setTimeout(() => EM.tts.speak(w.word), 350);
      }
    };
    document.getElementById('flipPrev').onclick = () => this._go(-1);
    document.getElementById('flipNext').onclick = () => this._go(1);
    document.getElementById('flipSpeak').onclick = () => EM.tts.speak(w.word, { rate: 0.8 });
    document.getElementById('flipLearn').onclick = () => this._toggleLearned(w.word);
  },

  /* ================= 测验模式 ================= */

  /* 生成一题：自适应优先从弱项抽，其次从本级别随机 */
  _nextQuiz() {
    const lvl = this._getLevel(this.activeLevel);
    if (!lvl || !lvl.words.length) { this.quizState = null; return; }

    // 题型随机：'mc_en_cn'(英→中) / 'mc_cn_en'(中→英) / 'spell'(听音拼词)
    const types = ['mc_en_cn', 'mc_cn_en', 'spell'];
    const type = types[Math.floor(Math.random() * types.length)];

    // 自适应：优先从弱项中选词（如果该级别有弱项词）
    const p = EM.progress.get();
    const weak = (p.weaknesses.vocabulary || []).filter(w =>
      lvl.words.some(item => item.word === w)
    );
    let target;
    if (weak.length && Math.random() < 0.6) {
      // 60% 概率从弱项中抽
      const wordStr = weak[Math.floor(Math.random() * weak.length)];
      target = lvl.words.find(item => item.word === wordStr);
    } else {
      target = lvl.words[Math.floor(Math.random() * lvl.words.length)];
    }
    if (!target) { this.quizState = null; return; }

    let question, options, answer, speakText, promptWord, promptCn;
    if (type === 'mc_en_cn') {
      // 看英文选中文
      answer = target.meaning;
      speakText = target.word;
      promptWord = target.word;
      promptCn = '';
      const pool = lvl.words.filter(i => i !== target && i.meaning !== target.meaning).map(i => i.meaning);
      const distractors = this._sample(this._unique(pool), 3);
      options = this._shuffle([target.meaning].concat(distractors));
      question = '🔊 看英文选出正确的中文释义';
    } else if (type === 'mc_cn_en') {
      // 看中文选英文
      answer = target.word;
      speakText = target.word;
      promptWord = '';
      promptCn = target.meaning;
      const pool = lvl.words.filter(i => i !== target && i.word !== target.word).map(i => i.word);
      const distractors = this._sample(this._unique(pool), 3);
      options = this._shuffle([target.word].concat(distractors));
      question = '看中文选出正确的英文单词';
    } else {
      // 听音拼词
      answer = target.word;
      speakText = target.word;
      promptWord = '';
      promptCn = target.meaning; // 提示中文
      options = null;
      question = '🔊 听发音拼写单词';
    }

    this.quizState = {
      type, target, answer, options, question,
      speakText, promptWord, promptCn, answered: false
    };
  },

  /* 渲染测验 */
  _renderQuiz(el) {
    if (!this.quizState) {
      el.innerHTML = '<div class="card"><p class="text-secondary">该级别暂无可测验的词汇。</p></div>';
      return;
    }
    const q = this.quizState;
    const p = EM.progress.get();
    const score = p.modules.vocabulary.score || 0;
    const weakCount = (p.weaknesses.vocabulary || []).length;

    let body = '';
    if (q.type === 'spell') {
      // 拼写题
      body = `
        <div class="quiz-prompt-cn">${EM.ui.esc(q.promptCn)}</div>
        <button class="btn btn-primary quiz-replay" id="quizReplay">🔊 再听一次</button>
        <input type="text" class="quiz-spell-input" id="spellInput" placeholder="输入你听到的单词..." autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false">
        <div class="flex gap-8" style="justify-content:center;">
          <button class="btn btn-primary" id="spellSubmit">提交答案</button>
        </div>
      `;
    } else {
      // 选择题
      body = `
        ${q.promptWord ? `<div class="quiz-prompt-word">${EM.ui.esc(q.promptWord)}</div>` : ''}
        ${q.promptCn ? `<div class="quiz-prompt-cn">${EM.ui.esc(q.promptCn)}</div>` : ''}
        ${q.type === 'mc_en_cn' ? `<button class="btn btn-primary quiz-replay" id="quizReplay">🔊 听发音</button>` : ''}
        <div class="quiz-options">
          ${q.options.map(opt => `<button class="quiz-option" data-opt="${EM.ui.esc(opt)}">${EM.ui.esc(opt)}</button>`).join('')}
        </div>
      `;
    }

    el.innerHTML = `
      <div class="card">
        <div class="quiz-meta">🎯 L${this.activeLevel} 测验 · 累计得分 <b id="quizScore">${score}</b> · 弱项 ${weakCount} · 自适应优先抽弱项</div>
        <div class="quiz-question">${EM.ui.esc(q.question)}</div>
        ${body}
        <div class="mt-16" style="margin-top:16px;">
          <button class="btn btn-secondary" id="quizNext">⏭️ 下一题</button>
          <span class="vocab-hint">提示：答错会自动记入弱项，下次优先抽到。</span>
        </div>
      </div>
    `;

    // 听力题自动播放一次（iOS 需用户手势，由点击测验模式触发）
    if (q.type === 'spell' || q.type === 'mc_en_cn') {
      setTimeout(() => EM.tts.speak(q.speakText), 300);
    }
    const replay = document.getElementById('quizReplay');
    if (replay) replay.onclick = () => EM.tts.speak(q.speakText, { rate: 0.8 });

    // 选择题处理
    el.querySelectorAll('[data-opt]').forEach(btn => {
      btn.onclick = () => this._answerChoice(btn);
    });
    // 拼写题处理
    const spellInput = document.getElementById('spellInput');
    const spellSubmit = document.getElementById('spellSubmit');
    if (spellSubmit) {
      spellSubmit.onclick = () => this._answerSpell(spellInput.value);
    }
    if (spellInput) {
      spellInput.onkeydown = (e) => { if (e.key === 'Enter') this._answerSpell(spellInput.value); };
    }
    // 下一题
    const next = document.getElementById('quizNext');
    if (next) next.onclick = () => {
      this._nextQuiz();
      this._renderQuiz(el);
    };
  },

  /* 选择题作答 */
  _answerChoice(btn) {
    const q = this.quizState;
    if (!q || q.answered) return;
    q.answered = true;
    const chosen = btn.dataset.opt;
    const correct = chosen === q.answer;

    const allOpts = btn.parentElement.querySelectorAll('[data-opt]');
    allOpts.forEach(b => {
      b.disabled = true;
      if (b.dataset.opt === q.answer) b.classList.add('correct');
      else if (b === btn) b.classList.add('wrong');
    });

    if (correct) {
      EM.progress.update(d => { d.modules.vocabulary.score = (d.modules.vocabulary.score || 0) + 1; });
      const sc = document.getElementById('quizScore');
      if (sc) sc.textContent = (parseInt(sc.textContent, 10) || 0) + 1;
      // 关键:答对自动标记为已学(若未标记)
      const newly = this._markLearnedSilent(q.target.word);
      EM.ui.toast(newly ? '答对了 ✓ 已自动标记已学' : '答对了 ✓ +1');
      // 触发路径推进检查
      this._autoAdvancePath();
    } else {
      EM.progress.addWeakness('vocabulary', q.target.word);
      EM.ui.toast('答错了，已记入弱项 ✗');
      this._refreshStats();
    }
  },

  /* 拼写题作答 */
  _answerSpell(value) {
    const q = this.quizState;
    if (!q || q.answered) return;
    q.answered = true;
    const input = document.getElementById('spellInput');
    const submit = document.getElementById('spellSubmit');
    if (input) input.disabled = true;
    if (submit) submit.disabled = true;

    const userAns = (value || '').trim().toLowerCase();
    const correct = userAns === q.answer.toLowerCase();

    if (input) {
      if (correct) input.style.borderColor = 'var(--success)';
      else input.style.borderColor = 'var(--danger)';
    }
    // 显示正确答案
    const hintEl = document.createElement('div');
    hintEl.className = 'vocab-hint';
    hintEl.style.textAlign = 'center';
    hintEl.style.marginTop = '8px';
    hintEl.innerHTML = correct
      ? `✓ 答对了！`
      : `✗ 正确答案：<b>${EM.ui.esc(q.answer)}</b>`;
    if (submit && submit.parentElement) {
      submit.parentElement.appendChild(hintEl);
    }

    if (correct) {
      EM.progress.update(d => { d.modules.vocabulary.score = (d.modules.vocabulary.score || 0) + 1; });
      const sc = document.getElementById('quizScore');
      if (sc) sc.textContent = (parseInt(sc.textContent, 10) || 0) + 1;
      // 关键:答对自动标记为已学(若未标记)
      const newly = this._markLearnedSilent(q.target.word);
      EM.ui.toast(newly ? '拼写正确 ✓ 已自动标记已学' : '拼写正确 ✓ +1');
      // 触发路径推进检查
      this._autoAdvancePath();
    } else {
      EM.progress.addWeakness('vocabulary', q.target.word);
      EM.ui.toast('拼写错误，已记入弱项 ✗');
      this._refreshStats();
    }
  },

  /* ================= 搜索模式 ================= */

  _renderSearchResults(el) {
    const target = el || document.getElementById('vocabContent');
    if (!target) return;
    const q = (this.searchQuery || '').trim().toLowerCase();
    if (!q) {
      target.innerHTML = '<div class="card"><p class="text-secondary">输入关键字搜索单词（支持英文或中文）。</p></div>';
      return;
    }
    const results = [];
    (this.data.levels || []).forEach(lv => {
      (lv.words || []).forEach(w => {
        if (w.word.toLowerCase().includes(q) ||
            (w.meaning || '').toLowerCase().includes(q) ||
            (w.exampleCn || '').includes(this.searchQuery)) {
          results.push({ ...w, level: lv.level, levelName: lv.name });
        }
      });
    });

    if (!results.length) {
      target.innerHTML = `<div class="card"><p class="text-secondary">未找到包含 "${EM.ui.esc(this.searchQuery)}" 的单词。</p></div>`;
      return;
    }

    target.innerHTML = `
      <div class="card">
        <div class="card-title">🔍 搜索结果（${results.length} 个）</div>
        ${results.slice(0, 50).map(w => `
          <div class="search-result-item" data-word="${EM.ui.esc(w.word)}" data-level="${w.level}">
            <div><span class="sr-word">${EM.ui.esc(w.word)}</span><span class="sr-phonetic">${EM.ui.esc(w.phonetic)}</span><span class="word-pos">${EM.ui.esc(w.pos)}</span></div>
            <div class="sr-meaning">${EM.ui.esc(w.meaning)}</div>
            <div class="sr-level">L${w.level} · ${EM.ui.esc(w.levelName)}</div>
          </div>
        `).join('')}
        ${results.length > 50 ? `<div class="vocab-hint">仅显示前 50 条，请细化关键字。</div>` : ''}
      </div>
    `;

    // 点击搜索结果跳转学习
    target.querySelectorAll('.search-result-item').forEach(item => {
      item.onclick = () => {
        const word = item.dataset.word;
        const level = parseInt(item.dataset.level, 10);
        const lvl = this._getLevel(level);
        if (!lvl) return;
        const idx = lvl.words.findIndex(w => w.word === word);
        if (idx < 0) return;
        this.activeLevel = level;
        this.currentIdx = idx;
        this.mode = 'learn';
        this.flipRevealed = false;
        this._saveCurrentIdx();
        this._renderShell();
      };
    });
  },

  /* ===== 工具函数 ===== */
  _unique(arr) { return Array.from(new Set(arr)); },
  _shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = a[i]; a[i] = a[j]; a[j] = tmp;
    }
    return a;
  },
  _sample(arr, n) {
    return this._shuffle(arr).slice(0, Math.max(0, n));
  }
};

/* 注册模块：路由 navigate('vocabulary') 时调用 EM.modules.vocabulary.render(container) */
EM.registerModule('vocabulary', EM.vocabulary);
