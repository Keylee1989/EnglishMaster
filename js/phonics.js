/* ===== 自然拼读模块 (Phonics) =====
 * 循序渐进学习路径：字母 → 元音长短 → 辅音组合 → CVC拼读 → Magic E → 元音组合 → R控制音
 * 学习模式：点卡片听发音 + 一键标记"已掌握"
 * 测验模式：听音选词 / 看词选拆分 / 看短词选Magic E长词，答错记入弱项
 * 兼容 iOS Safari（仅使用标准 Web Speech API，所有发音由用户点击触发）
 */
window.EM = window.EM || {};

EM.phonics = {
  data: null,            // 从 data/phonics.json 加载的拼读数据
  _container: null,      // 当前渲染容器（用于局部刷新）
  mode: 'learn',         // 'learn' 学习模式 | 'quiz' 测验模式
  activeTab: 'letters',  // 当前分类 key
  quizState: null,       // 测验当前题目状态

  // 7 个分类标签（按学习顺序排列）
  tabs: [
    { key: 'letters',     label: '字母发音', icon: '🔤' },
    { key: 'vowels',      label: '元音长短', icon: '🅰️' },
    { key: 'consonants',  label: '辅音组合', icon: '🔡' },
    { key: 'cvc',         label: 'CVC拼读', icon: '🧩' },
    { key: 'magicE',      label: 'Magic E', icon: '✨' },
    { key: 'vowelTeams',  label: '元音组合', icon: '👥' },
    { key: 'rControlled', label: 'R控制音', icon: '🔴' }
  ],

  /* ===== 入口：由路由调用，container 为 #content DOM 元素 ===== */
  async render(container) {
    this._container = container;
    this._injectStyles();
    container.innerHTML = '<div class="loading">加载拼读数据中...</div>';

    // 异步加载数据（EM.data 内部带缓存）
    if (!this.data) {
      this.data = await EM.data.load('phonics');
    }
    if (!this.data) {
      container.innerHTML = '<div class="card"><p>拼读数据加载失败，请检查网络后刷新重试。</p></div>';
      return;
    }

    // 从进度中恢复上次学习的分类
    const p = EM.progress.get();
    const idx = p.modules.phonics.current || 0;
    this.activeTab = (this.tabs[idx] || this.tabs[0]).key;

    this._renderShell();
  },

  /* ===== 注入本模块专用样式（复用全局 .phonics-cell/.phonics-grid/.quiz-option 等） ===== */
  _injectStyles() {
    if (document.getElementById('phonics-styles')) return;
    const style = document.createElement('style');
    style.id = 'phonics-styles';
    style.textContent = `
      .phonics-mode-bar { display:flex; gap:8px; margin-bottom:12px; flex-wrap:wrap; }
      .phonics-tabs { display:flex; gap:8px; flex-wrap:wrap; margin-bottom:10px; overflow-x:auto; }
      .phonics-tabs .level-btn { white-space:nowrap; }
      .phonics-cell { position:relative; }
      .phonics-cell.mastered { border-color: var(--success); background: rgba(76,175,136,0.12); }
      .phonics-cell.mastered .phonics-mark { background: var(--success); color:#fff; border-color: var(--success); }
      .phonics-mark {
        position:absolute; top:6px; right:6px; width:24px; height:24px; border-radius:50%;
        border:1px solid var(--border); background: var(--bg-secondary); color: var(--text-secondary);
        font-size:13px; cursor:pointer; display:flex; align-items:center; justify-content:center;
        line-height:1; padding:0;
      }
      .phonics-mark:hover { border-color: var(--success); color: var(--success); }
      .phonics-sound { font-size:13px; color: var(--accent); margin-top:4px; font-family: Georgia, serif; }
      .phonics-cn { font-size:12px; color: var(--text-secondary); margin-top:2px; }
      .group-header { width:100%; font-size:14px; font-weight:600; color: var(--text-secondary); margin:10px 0 4px; padding-left:4px; }
      .quiz-question { font-size:18px; font-weight:600; margin-bottom:14px; }
      .quiz-meta { font-size:13px; color: var(--text-secondary); margin-bottom:12px; }
      .quiz-replay { margin-bottom:14px; }
      .quiz-prompt-word { font-size:34px; font-weight:700; text-align:center; margin:8px 0 16px; color: var(--accent); }
      .phonics-hint { font-size:13px; color: var(--text-secondary); margin-top:8px; }
    `;
    document.head.appendChild(style);
  },

  /* ===== 渲染外壳：进度条 + 模式/分类切换 + 内容占位 ===== */
  _renderShell() {
    const container = this._container;
    const stats = this._calcStats();
    const pct = stats.total ? Math.min(100, stats.mastered / stats.total * 100) : 0;
    const tabIdx = Math.max(0, this.tabs.findIndex(t => t.key === this.activeTab));

    container.innerHTML = `
      <div class="card">
        <div class="card-title">🔤 自然拼读 · 从字母到拼读规则</div>
        <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
        <div class="font-sm text-secondary mt-16" style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;">
          <span>已掌握 <b data-stat="mastered">${stats.mastered}</b> / <span data-stat="total">${stats.total}</span></span>
          <span>当前阶段：${this.tabs[tabIdx].icon} ${this.tabs[tabIdx].label}</span>
        </div>
      </div>

      <div class="card">
        <div class="phonics-mode-bar">
          <button class="btn ${this.mode === 'learn' ? 'btn-primary' : 'btn-secondary'}" data-mode="learn">📖 学习模式</button>
          <button class="btn ${this.mode === 'quiz' ? 'btn-primary' : 'btn-secondary'}" data-mode="quiz">🎯 测验模式</button>
        </div>
        <div class="phonics-tabs level-selector">
          ${this.tabs.map(t => `<button class="level-btn ${t.key === this.activeTab ? 'active' : ''}" data-tab="${t.key}">${t.icon} ${t.label}</button>`).join('')}
        </div>
        <div class="phonics-hint">💡 学习路径：字母 → 元音 → 辅音 → CVC → Magic E → 元音组合 → R控制音，按顺序逐关攻克。点卡片听发音，点右上角 ○ 标记"已掌握"。</div>
      </div>

      <div id="phonicsContent"></div>
    `;

    // 模式切换
    container.querySelectorAll('[data-mode]').forEach(b => {
      b.onclick = () => {
        this.mode = b.dataset.mode;
        if (this.mode === 'quiz') this._nextQuiz();
        this._renderShell();
      };
    });

    // 分类切换
    container.querySelectorAll('[data-tab]').forEach(b => {
      b.onclick = () => {
        this.activeTab = b.dataset.tab;
        const idx = this.tabs.findIndex(t => t.key === this.activeTab);
        EM.progress.update(d => { d.modules.phonics.current = idx; });
        if (this.mode === 'quiz') this._nextQuiz();
        this._renderShell();
      };
    });

    // 渲染内容区
    this._renderContent();
  },

  /* ===== 内容区分发 ===== */
  _renderContent() {
    const el = document.getElementById('phonicsContent');
    if (!el) return;
    if (this.mode === 'learn') this._renderLearn(el);
    else this._renderQuiz(el);
  },

  /* ===== 把不同分类的数据统一成卡片项数组 =====
   * 每项字段：id(唯一)、group(分组标题，可空)、symbol(主显示)、sound(音标)、words(例词)、cn(中文)、speakText(朗读文本)、emoji
   */
  _getItems(tabKey) {
    const d = this.data;
    if (!d) return [];
    const items = [];
    switch (tabKey) {
      case 'letters':
        (d.letters || []).forEach(o => {
          items.push({
            id: 'letters:' + o.letter,
            group: '',
            symbol: o.letter.toUpperCase() + ' ' + o.letter.toLowerCase(),
            sound: o.sound,
            words: [o.word],
            cn: o.cn,
            emoji: o.emoji,
            speakText: o.letter + '. ' + o.word
          });
        });
        break;
      case 'vowels':
        (d.vowels || []).forEach(o => {
          items.push({
            id: 'vowels:' + o.combo,
            group: '',
            symbol: o.combo.toUpperCase() + ' ' + o.combo.toLowerCase(),
            sound: '短 ' + o.short + '  长 ' + o.long,
            words: [o.shortEg, o.longEg],
            cn: '短音例词:' + o.shortEg + ' · 长音例词:' + o.longEg,
            speakText: o.shortEg + '. ' + o.longEg
          });
        });
        break;
      case 'consonants':
        // 单辅音 + 辅音连缀，分两组展示
        (d.consonants || []).forEach(o => {
          items.push({
            id: 'consonants:' + o.combo,
            group: '单辅音',
            symbol: o.combo,
            sound: o.sound,
            words: o.words,
            cn: o.cn,
            speakText: o.words.join('. ')
          });
        });
        (d.blends || []).forEach(o => {
          items.push({
            id: 'blends:' + o.combo,
            group: '辅音连缀',
            symbol: o.combo,
            sound: o.sound,
            words: o.words,
            cn: o.cn,
            speakText: o.words.join('. ')
          });
        });
        break;
      case 'cvc':
        (d.cvc || []).forEach(o => {
          items.push({
            id: 'cvc:' + o.word,
            group: '',
            symbol: o.word,
            sound: o.sound,
            split: o.split,
            words: [o.word],
            cn: o.cn,
            speakText: o.word
          });
        });
        break;
      case 'magicE':
        (d.magicE || []).forEach(o => {
          items.push({
            id: 'magicE:' + o.short,
            group: '',
            symbol: o.short + ' → ' + o.long,
            sound: '',
            words: [o.short, o.long],
            cn: o.cn,
            speakText: o.short + '. ' + o.long
          });
        });
        break;
      case 'vowelTeams':
        (d.vowelTeams || []).forEach(o => {
          items.push({
            id: 'vowelTeams:' + o.combo,
            group: '',
            symbol: o.combo,
            sound: o.sound,
            words: o.words,
            cn: '',
            speakText: o.words.join('. ')
          });
        });
        break;
      case 'rControlled':
        (d.rControlled || []).forEach(o => {
          items.push({
            id: 'rControlled:' + o.combo,
            group: '',
            symbol: o.combo,
            sound: o.sound,
            words: o.words,
            cn: '',
            speakText: o.words.join('. ')
          });
        });
        break;
    }
    return items;
  },

  /* ===== 计算总进度 ===== */
  _calcStats() {
    let total = 0;
    const allIds = new Set();
    this.tabs.forEach(t => {
      const items = this._getItems(t.key);
      total += items.length;
      items.forEach(i => allIds.add(i.id));
    });
    const p = EM.progress.get();
    const mastered = (p.modules.phonics.mastered || []).filter(id => allIds.has(id));
    return { total: total, mastered: mastered.length };
  },

  /* ===== 跨分类查找某 id 的卡片项 ===== */
  _findItem(id) {
    for (const t of this.tabs) {
      const found = this._getItems(t.key).find(i => i.id === id);
      if (found) return found;
    }
    return null;
  },

  /* ===== 学习模式：渲染卡片网格 ===== */
  _renderLearn(el) {
    const items = this._getItems(this.activeTab);
    if (!items.length) {
      el.innerHTML = '<div class="card"><p class="text-secondary">暂无数据。</p></div>';
      return;
    }
    const p = EM.progress.get();
    const mastered = new Set(p.modules.phonics.mastered || []);

    let html = '<div class="card"><div class="phonics-grid">';
    let lastGroup = '__none__';
    items.forEach(it => {
      if (it.group && it.group !== lastGroup) {
        html += `<div class="group-header">${EM.ui.esc(it.group)}</div>`;
        lastGroup = it.group;
      }
      const isM = mastered.has(it.id);
      const symbol = it.emoji ? (it.emoji + ' ' + it.symbol) : it.symbol;
      const eg = (it.words && it.words.length) ? it.words.slice(0, 2).join(' · ') : '';
      html += `
        <div class="phonics-cell ${isM ? 'mastered' : ''}" data-id="${EM.ui.esc(it.id)}">
          <button class="phonics-mark" data-mark="${EM.ui.esc(it.id)}" title="标记已掌握">${isM ? '✓' : '○'}</button>
          <div class="phonics-symbol">${EM.ui.esc(symbol)}</div>
          <div class="phonics-eg">${EM.ui.esc(eg)}</div>
          ${it.sound ? `<div class="phonics-sound">${EM.ui.esc(it.sound)}</div>` : ''}
          ${it.cn ? `<div class="phonics-cn">${EM.ui.esc(it.cn)}</div>` : ''}
        </div>`;
    });
    html += '</div></div>';
    el.innerHTML = html;

    // 点击卡片播放发音；点击右上角标记按钮切换掌握
    el.querySelectorAll('.phonics-cell').forEach(cell => {
      cell.onclick = (e) => {
        if (e.target.closest('[data-mark]')) return; // 标记按钮单独处理
        const it = this._findItem(cell.dataset.id);
        if (it) this._playItem(it);
      };
    });
    el.querySelectorAll('[data-mark]').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        this._toggleMastered(btn.dataset.mark);
      };
    });
  },

  /* ===== 朗读：调用 EM.tts.speak ===== */
  _playItem(it) {
    if (!it) return;
    const text = it.speakText || (it.words && it.words[0]) || it.symbol;
    EM.tts.speak(text);
  },

  /* ===== 标记/取消"已掌握"，写入进度，并局部刷新 ===== */
  _toggleMastered(id) {
    const p = EM.progress.get();
    const has = (p.modules.phonics.mastered || []).includes(id);
    EM.progress.update(d => {
      if (!d.modules.phonics.mastered) d.modules.phonics.mastered = [];
      if (has) {
        d.modules.phonics.mastered = d.modules.phonics.mastered.filter(x => x !== id);
      } else {
        d.modules.phonics.mastered.push(id);
      }
    });
    if (!has) {
      // 新掌握则移除对应弱项
      EM.progress.removeWeakness('phonics', id);
      EM.ui.toast('已标记掌握 ✓');
    }
    // 局部更新该卡片视觉
    const cell = document.querySelector('.phonics-cell[data-id="' + id + '"]');
    if (cell) {
      cell.classList.toggle('mastered', !has);
      const mark = cell.querySelector('[data-mark]');
      if (mark) mark.textContent = !has ? '✓' : '○';
    }
    this._refreshStats();
  },

  /* ===== 局部刷新顶部进度数字 ===== */
  _refreshStats() {
    const stats = this._calcStats();
    const pct = stats.total ? Math.min(100, stats.mastered / stats.total * 100) : 0;
    const c = this._container;
    if (!c) return;
    const fill = c.querySelector('.progress-fill');
    if (fill) fill.style.width = pct + '%';
    const m = c.querySelector('[data-stat="mastered"]');
    if (m) m.textContent = stats.mastered;
    const t = c.querySelector('[data-stat="total"]');
    if (t) t.textContent = stats.total;
  },

  /* ================= 测验模式 ================= */

  /* 生成一题 */
  _nextQuiz() {
    const items = this._getItems(this.activeTab).filter(i => i.words && i.words.length);
    if (!items.length) { this.quizState = null; return; }

    // 根据分类选择题型
    let type;
    if (this.activeTab === 'cvc') type = 'split';        // 看词选拆分
    else if (this.activeTab === 'magicE') type = 'magic'; // 看短词选长词
    else type = 'listen';                                  // 听音选词

    const target = items[Math.floor(Math.random() * items.length)];
    let question, options, answer, speakText, showWord;

    if (type === 'split') {
      answer = target.split;
      speakText = target.words[0];
      showWord = target.words[0];
      // 干扰项：用其他 CVC 词的拆分
      const others = items.filter(i => i !== target && i.split && i.split !== target.split).map(i => i.split);
      const distractors = this._sample(this._unique(others), 3);
      options = this._shuffle([target.split].concat(distractors));
      question = '选出下面单词的正确音节拆分';
    } else if (type === 'magic') {
      answer = target.words[1]; // 长词
      speakText = target.words[1];
      showWord = target.words[0];
      const pool = items.filter(i => i !== target).map(i => i.words[1]);
      const distractors = this._sample(this._unique(pool), 3);
      options = this._shuffle([target.words[1]].concat(distractors));
      question = '把短词加上 Magic E，会变成哪个词？';
    } else {
      // 听音选词
      const correctWord = target.words[Math.floor(Math.random() * target.words.length)];
      answer = correctWord;
      speakText = correctWord;
      showWord = null;
      const pool = items.filter(i => i !== target).reduce((arr, i) => arr.concat(i.words), []);
      const uniq = this._unique(pool).filter(w => w !== correctWord);
      const distractors = this._sample(uniq, 3);
      options = this._shuffle([correctWord].concat(distractors));
      question = '🔊 听发音，选出你听到的单词';
    }

    this.quizState = {
      type: type, target: target, answer: answer, options: options,
      question: question, speakText: speakText, showWord: showWord, answered: false
    };
  },

  /* 渲染测验界面 */
  _renderQuiz(el) {
    if (!this.quizState) {
      el.innerHTML = '<div class="card"><p class="text-secondary">该分类暂无可测验内容。</p></div>';
      return;
    }
    const q = this.quizState;
    const p = EM.progress.get();
    const score = p.modules.phonics.score || 0;

    el.innerHTML = `
      <div class="card">
        <div class="quiz-meta">🎯 ${this.tabs.find(t => t.key === this.activeTab).label} · 累计得分 <b id="quizScore">${score}</b> · 答错自动记入弱项</div>
        <div class="quiz-question">${EM.ui.esc(q.question)}</div>
        ${q.showWord ? `<div class="quiz-prompt-word">${EM.ui.esc(q.showWord)}</div>` : ''}
        <button class="btn btn-primary quiz-replay" id="quizReplay">🔊 ${q.type === 'listen' ? '再听一次' : '听发音'}</button>
        <div class="quiz-options">
          ${q.options.map(opt => `<button class="quiz-option" data-opt="${EM.ui.esc(opt)}">${EM.ui.esc(opt)}</button>`).join('')}
        </div>
        <div class="mt-16">
          <button class="btn btn-secondary" id="quizNext">⏭️ 下一题</button>
          <span class="phonics-hint">提示：可重复点"听发音"再选答案。</span>
        </div>
      </div>`;

    // 听力题自动播放一次（延迟以确保按钮就绪；iOS 需用户手势链，由点击切到测验触发）
    if (q.type === 'listen') {
      setTimeout(() => EM.tts.speak(q.speakText), 250);
    }
    const replay = document.getElementById('quizReplay');
    if (replay) replay.onclick = () => EM.tts.speak(q.speakText);

    el.querySelectorAll('[data-opt]').forEach(btn => {
      btn.onclick = () => this._answerQuiz(btn);
    });
    const next = document.getElementById('quizNext');
    if (next) next.onclick = () => {
      this._nextQuiz();
      this._renderQuiz(el);
    };
  },

  /* 处理作答 */
  _answerQuiz(btn) {
    const q = this.quizState;
    if (!q || q.answered) return;
    q.answered = true;
    const chosen = btn.dataset.opt;
    const correct = chosen === q.answer;

    // 标记选项颜色
    const allOpts = btn.parentElement.querySelectorAll('[data-opt]');
    allOpts.forEach(b => {
      b.disabled = true;
      if (b.dataset.opt === q.answer) b.classList.add('correct');
      else if (b === btn) b.classList.add('wrong');
    });

    if (correct) {
      EM.progress.update(d => { d.modules.phonics.score = (d.modules.phonics.score || 0) + 1; });
      const sc = document.getElementById('quizScore');
      if (sc) sc.textContent = (parseInt(sc.textContent, 10) || 0) + 1;
      EM.ui.toast('答对了 ✓ +1');
    } else {
      // 记入弱项
      EM.progress.addWeakness('phonics', q.target.id);
      EM.ui.toast('答错了，已记入弱项，回头重点复习 ✗');
    }
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

/* 注册模块：路由 navigate('phonics') 时调用 EM.modules.phonics.render(container) */
EM.registerModule('phonics', EM.phonics);
