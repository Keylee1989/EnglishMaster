/* ===== 阅读理解模块 (Reading) =====
 * 分级 L1-L5 对应 CEFR A1-C2，从最简单短文开始循序渐进
 * 核心能力：
 *   1) 文章列表：标题/字数/已读状态，按级别浏览
 *   2) 阅读视图：英文正文逐句点击 TTS 朗读，整篇朗读按钮自动逐句播放并高亮
 *   3) 翻译切换：显示/隐藏全文中文翻译
 *   4) 生词表：点击单词发音 + 看释义
 *   5) 理解测验：选择题，完成后存进度，答错记弱项
 * 数据：EM.data.load('articles') → data/articles.json
 * 兼容 iOS Safari：所有发音均由用户点击触发；整篇播放通过 onend 链式调用
 */
window.EM = window.EM || {};

EM.reading = {
  data: null,             // 从 data/articles.json 加载的文章数据
  _container: null,       // 当前渲染容器
  activeLevel: 1,          // 当前级别 1-5
  currentArticleId: null, // 当前正在阅读的文章 id（null 表示在列表页）
  view: 'list',            // 'list' 列表 | 'read' 阅读 | 'quiz' 测验
  showCn: false,          // 是否显示中文翻译
  intensiveMode: false,   // 是否处于精读模式（逐句翻译+生词标注+语法提示）
  _playing: false,        // 是否正在整篇播放
  _playIdx: -1,           // 整篇播放当前句索引
  _sentences: [],         // 当前文章切分后的英文句子数组
  _cnSentences: [],       // 当前文章切分后的中文句子数组

  /* ===== 入口：由路由调用 ===== */
  async render(container) {
    this._container = container;
    this._injectStyles();
    // 停止任何正在进行的播放（避免切页面后继续）
    this._stopPlay();
    container.innerHTML = '<div class="loading">加载文章数据中...</div>';

    if (!this.data) {
      this.data = await EM.data.load('articles');
    }
    if (!this.data || !this.data.levels) {
      container.innerHTML = '<div class="card"><p>文章数据加载失败，请刷新重试。</p></div>';
      return;
    }

    // 默认级别：从进度恢复，否则取用户当前级别（至少 L1）
    const p = EM.progress.get();
    this.activeLevel = Math.max(1, Math.min(5,
      (p.modules.reading && p.modules.reading.current) || Math.max(1, p.level || 1)));
    if (!this._levelExists(this.activeLevel)) this.activeLevel = 1;

    this._renderShell();
  },

  /* ===== 注入本模块专用样式 ===== */
  _injectStyles() {
    if (document.getElementById('reading-styles')) return;
    const style = document.createElement('style');
    style.id = 'reading-styles';
    style.textContent = `
      .read-hint { font-size:13px; color:var(--text-secondary); margin-top:8px; }
      .article-item {
        padding:14px 16px; border:1px solid var(--border); border-radius:var(--radius-sm);
        background:var(--bg-card); margin-bottom:10px; cursor:pointer; transition:var(--transition);
        display:flex; justify-content:space-between; align-items:center; gap:12px;
      }
      .article-item:hover { border-color:var(--accent); background:var(--bg-hover); }
      .article-item.done { border-color:var(--success); }
      .article-item .ai-title { font-weight:600; font-size:15px; }
      .article-item .ai-cn { font-size:13px; color:var(--text-secondary); margin-top:2px; }
      .article-item .ai-meta { font-size:12px; color:var(--accent); white-space:nowrap; }
      .read-toolbar { display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-bottom:12px; }
      .article-body {
        font-size:16px; line-height:1.9; color:var(--text-primary);
        padding:16px; background:var(--bg-card); border:1px solid var(--border);
        border-radius:var(--radius-sm); margin:12px 0;
      }
      .article-sentence {
        cursor:pointer; padding:2px 4px; border-radius:4px;
        transition:background 0.2s, color 0.2s; display:inline;
      }
      .article-sentence:hover { background:var(--accent-bg); color:var(--accent); }
      .article-sentence.active {
        background:var(--accent); color:#fff;
      }
      .article-cn {
        margin-top:16px; padding:14px 16px; background:var(--bg-hover);
        border-left:3px solid var(--accent); border-radius:var(--radius-sm);
        font-size:15px; line-height:1.85; color:var(--text-primary);
      }
      .article-cn .acn-title { font-weight:600; margin-bottom:8px; color:var(--accent); }
      .vocab-list {
        margin-top:16px; padding:14px 16px; background:var(--bg-card);
        border:1px solid var(--border); border-radius:var(--radius-sm);
      }
      .vocab-list .vl-title { font-weight:600; margin-bottom:10px; color:var(--accent); }
      .vocab-list .vl-item {
        display:flex; align-items:center; gap:10px; padding:6px 0;
        border-bottom:1px dashed var(--border); flex-wrap:wrap;
      }
      .vocab-list .vl-item:last-child { border-bottom:none; }
      .vocab-list .vl-word {
        font-weight:600; color:var(--text-primary); cursor:pointer;
        min-width:120px; transition:color 0.2s;
      }
      .vocab-list .vl-word:hover { color:var(--accent); }
      .vocab-list .vl-meaning { color:var(--text-secondary); font-size:14px; }
      .quiz-meta { font-size:13px; color:var(--text-secondary); margin-bottom:12px; }
      .quiz-question { font-size:16px; font-weight:600; margin:16px 0 10px; }
      .quiz-options { display:flex; flex-direction:column; gap:8px; margin-bottom:8px; }
      .quiz-result { font-size:18px; font-weight:700; text-align:center; margin:18px 0; padding:14px; border-radius:var(--radius-sm); }
      .quiz-result.pass { background:rgba(76,175,136,0.12); color:var(--success); }
      .quiz-result.fail { background:rgba(240,80,80,0.12); color:var(--danger); }
      .read-controls { display:flex; gap:8px; flex-wrap:wrap; margin:8px 0 4px; }
      .read-score { font-size:13px; color:var(--text-secondary); }
      .read-score b { color:var(--accent); }
      /* 文章状态徽章 */
      .ai-status { font-size:11px; padding:2px 8px; border-radius:10px; white-space:nowrap; font-weight:600; }
      .ai-status.unread { background:var(--bg-hover); color:var(--text-secondary); }
      .ai-status.read { background:rgba(96,165,250,0.15); color:var(--accent); }
      .ai-status.tested { background:rgba(76,175,136,0.18); color:var(--success); }
      /* 精读模式 */
      .intensive-block {
        margin-bottom:14px; padding:14px 16px; background:var(--bg-card);
        border:1px solid var(--border); border-radius:var(--radius-sm);
        transition:border-color 0.2s, box-shadow 0.2s;
      }
      .intensive-block.active { border-color:var(--accent); box-shadow:0 0 0 2px var(--accent-bg); }
      .intensive-en { font-size:16px; line-height:1.8; color:var(--text-primary); cursor:pointer; }
      .intensive-en .vocab-hl {
        background:rgba(255,214,0,0.28); border-bottom:2px solid var(--warning);
        padding:0 2px; border-radius:3px; cursor:pointer; font-weight:600;
      }
      .intensive-cn { font-size:14px; line-height:1.7; color:var(--text-secondary); margin-top:8px; padding-left:10px; border-left:3px solid var(--border); }
      .intensive-grammar { font-size:13px; color:var(--accent); margin-top:8px; background:var(--bg-hover); padding:6px 10px; border-radius:var(--radius-sm); }
      .intensive-grammar b { color:var(--warning); }
      .intensive-pos { font-size:12px; color:var(--text-secondary); margin-bottom:2px; }
      /* 测验分区标题 */
      .quiz-section-title { font-size:14px; font-weight:600; color:var(--accent); margin:20px 0 8px; padding-bottom:4px; border-bottom:1px dashed var(--border); }
    `;
    document.head.appendChild(style);
  },

  /* ===== 渲染外壳 ===== */
  _renderShell() {
    const container = this._container;
    const stats = this._calcStats();
    const lvl = this._getLevel(this.activeLevel);
    const lvlName = lvl ? lvl.name : '';
    const totalArticles = lvl ? (lvl.articles || []).length : 0;

    container.innerHTML = `
      <div class="card">
        <div class="card-title">📰 阅读理解 · 分级文章 · 精读 · 测验</div>
        <div class="progress-bar"><div class="progress-fill" style="width:${stats.pct}%"></div></div>
        <div class="font-sm text-secondary mt-16" style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;">
          <span>当前级别 <b>L${this.activeLevel} ${lvlName}</b> · 本级完成 <b data-stat="done">${stats.doneInLevel}</b> / <span data-stat="total">${totalArticles}</span></span>
          <span class="read-score">累计得分 <b data-stat="score">${stats.score}</b> · 弱项 <b data-stat="weak">${stats.weakCount}</b></span>
        </div>
      </div>

      <div class="card">
        <div class="level-selector">
          ${this.data.levels.map(lv => `
            <button class="level-btn ${lv.level === this.activeLevel ? 'active' : ''}" data-level="${lv.level}">L${lv.level} · ${lv.name}</button>
          `).join('')}
        </div>
        <div class="read-hint">💡 学习路径：从 L1 第一篇开始按顺序阅读。点击文章进入阅读页，可逐句点读、整篇朗读、看翻译、查生词，最后做理解测验。</div>
      </div>

      <div id="readContent"></div>
    `;

    // 级别切换
    container.querySelectorAll('[data-level]').forEach(b => {
      b.onclick = () => {
        this._stopPlay();
        this.activeLevel = parseInt(b.dataset.level, 10);
        this.currentArticleId = null;
        this.view = 'list';
        // 记录当前级别到进度
        EM.progress.update(d => {
          if (!d.modules.reading) d.modules.reading = { completed: [], score: 0 };
          d.modules.reading.current = this.activeLevel;
        });
        this._renderShell();
      };
    });

    this._renderContent();
  },

  /* ===== 内容区分发 ===== */
  _renderContent() {
    const el = document.getElementById('readContent');
    if (!el) return;
    if (this.view === 'list') this._renderList(el);
    else if (this.view === 'read') this._renderRead(el);
    else if (this.view === 'quiz') this._renderQuiz(el);
  },

  /* ===== 工具：级别数据 ===== */
  _getLevel(level) {
    return (this.data && this.data.levels || []).find(l => l.level === level) || null;
  },
  _levelExists(level) { return !!this._getLevel(level); },

  /* ===== 当前文章对象 ===== */
  _currentArticle() {
    const lvl = this._getLevel(this.activeLevel);
    if (!lvl || !this.currentArticleId) return null;
    return (lvl.articles || []).find(a => a.id === this.currentArticleId) || null;
  },

  /* ===== 统计 ===== */
  _calcStats() {
    const p = EM.progress.get();
    const completed = (p.modules.reading && p.modules.reading.completed) || [];
    const lvl = this._getLevel(this.activeLevel);
    const total = lvl ? (lvl.articles || []).length : 0;
    const doneInLevel = lvl ? (lvl.articles || []).filter(a => completed.includes(a.id)).length : 0;
    return {
      total, doneInLevel,
      pct: total ? Math.min(100, doneInLevel / total * 100) : 0,
      score: (p.modules.reading && p.modules.reading.score) || 0,
      weakCount: (p.weaknesses && p.weaknesses.reading || []).length
    };
  },

  /* 局部刷新顶部统计 */
  _refreshStats() {
    const stats = this._calcStats();
    const c = this._container;
    if (!c) return;
    const fill = c.querySelector('.progress-fill');
    if (fill) fill.style.width = stats.pct + '%';
    const m = c.querySelector('[data-stat="done"]');
    if (m) m.textContent = stats.doneInLevel;
    const t = c.querySelector('[data-stat="total"]');
    if (t) t.textContent = stats.total;
    const s = c.querySelector('[data-stat="score"]');
    if (s) s.textContent = stats.score;
    const w = c.querySelector('[data-stat="weak"]');
    if (w) w.textContent = stats.weakCount;
  },

  /* ===== 句子切分：把文章正文切成句子数组 ===== */
  _splitSentences(text) {
    if (!text) return [];
    // 按句末标点切分，保留标点
    const matches = text.match(/[^.!?]+[.!?]+["')\]]*\s*/g);
    if (!matches || !matches.length) return [text];
    return matches.map(s => s.trim()).filter(s => s.length > 0);
  },

  /* ===== 中文句子切分：按中文句末标点（。！？）切分 ===== */
  _splitSentencesCn(textCn) {
    if (!textCn) return [];
    const matches = textCn.match(/[^。！？]+[。！？]+[”’）\]]*\s*/g);
    if (!matches || !matches.length) return [textCn];
    return matches.map(s => s.trim()).filter(s => s.length > 0);
  },

  /* ===== 标记文章为已读（独立于测验完成状态） ===== */
  _markRead(id) {
    if (!id) return;
    EM.progress.update(d => {
      if (!d.modules.reading) d.modules.reading = { completed: [], score: 0 };
      if (!Array.isArray(d.modules.reading.read)) d.modules.reading.read = [];
      if (!d.modules.reading.read.includes(id)) d.modules.reading.read.push(id);
    });
  },

  /* ================= 列表页 ================= */

  _renderList(el) {
    const lvl = this._getLevel(this.activeLevel);
    if (!lvl || !lvl.articles || !lvl.articles.length) {
      el.innerHTML = '<div class="card"><p class="text-secondary">该级别暂无文章。</p></div>';
      return;
    }
    const p = EM.progress.get();
    const completed = new Set((p.modules.reading && p.modules.reading.completed) || []);
    const readSet = new Set((p.modules.reading && p.modules.reading.read) || []);
    const weak = new Set((p.weaknesses && p.weaknesses.reading) || []);

    el.innerHTML = `
      <div class="card">
        <div class="card-title">📜 L${this.activeLevel} · ${EM.ui.esc(lvl.name)} 文章列表</div>
        <div class="read-hint">点击任意文章进入阅读。状态：<span class="ai-status unread">未读</span> <span class="ai-status read">已读</span> <span class="ai-status tested">已测</span> · ★ 表示弱项。</div>
        ${lvl.articles.map((a, idx) => {
          const done = completed.has(a.id);
          const isRead = readSet.has(a.id);
          const isWeak = weak.has(a.id);
          const status = done
            ? { cls: 'tested', txt: '已测' }
            : (isRead ? { cls: 'read', txt: '已读' } : { cls: 'unread', txt: '未读' });
          const totalQ = (a.quiz ? a.quiz.length : 0) + (a.comprehension ? a.comprehension.length : 0);
          return `
            <div class="article-item ${done ? 'done' : ''}" data-id="${EM.ui.esc(a.id)}">
              <div>
                <div class="ai-title">${idx + 1}. ${EM.ui.esc(a.title)} ${isWeak ? '<span style="color:var(--warning)">★</span>' : ''}</div>
                <div class="ai-cn">${EM.ui.esc(a.titleCn)} · ${a.wordCount} 词 · ${a.vocab.length} 生词 · ${totalQ} 题</div>
              </div>
              <span class="ai-status ${status.cls}">${status.txt}</span>
            </div>
          `;
        }).join('')}
      </div>
    `;

    el.querySelectorAll('.article-item').forEach(node => {
      node.onclick = () => {
        this.currentArticleId = node.dataset.id;
        this.view = 'read';
        this.showCn = false;
        this.intensiveMode = false;
        this._playIdx = -1;
        this._playing = false;
        // 预切分句子
        const art = this._currentArticle();
        this._sentences = art ? this._splitSentences(art.text) : [];
        this._cnSentences = art ? this._splitSentencesCn(art.textCn) : [];
        // 标记为已读
        this._markRead(art && art.id);
        this._renderContent();
      };
    });
  },

  /* ================= 阅读页 ================= */

  _renderRead(el) {
    const art = this._currentArticle();
    if (!art) {
      el.innerHTML = '<div class="card"><p class="text-secondary">未找到文章内容。</p></div>';
      return;
    }
    const lvl = this._getLevel(this.activeLevel);

    // 把正文渲染成可点击的句子
    const sentencesHtml = this._sentences.map((s, i) =>
      `<span class="article-sentence" data-idx="${i}">${EM.ui.esc(s)}</span> `
    ).join('');

    // 精读模式：逐句翻译 + 生词标注 + 语法提示
    const intensiveHtml = this.intensiveMode ? this._renderIntensiveBlocks(art) : '';

    el.innerHTML = `
      <div class="card">
        <div class="flex justify-between align-center mb-16" style="flex-wrap:wrap;gap:8px;">
          <button class="btn btn-secondary btn-sm" id="readBack">⬅️ 返回列表</button>
          <span class="font-sm text-secondary">L${this.activeLevel} · ${EM.ui.esc(lvl.name)} · ${art.wordCount} 词</span>
        </div>
        <div class="card-title" style="margin-bottom:4px;">${EM.ui.esc(art.title)}</div>
        <div class="font-sm text-secondary mb-16">${EM.ui.esc(art.titleCn)}</div>

        <div class="read-controls">
          <button class="btn btn-primary" id="playAll">▶ 整篇朗读</button>
          <button class="btn btn-secondary" id="stopPlay">⏹ 停止</button>
          <button class="btn ${this.showCn ? 'btn-primary' : 'btn-secondary'}" id="toggleCn">${this.showCn ? '🙈 隐藏中文' : '👁 显示中文'}</button>
          <button class="btn ${this.intensiveMode ? 'btn-primary' : 'btn-secondary'}" id="toggleIntensive">${this.intensiveMode ? '退出精读' : '🔍 精读模式'}</button>
          <button class="btn btn-success" id="goQuiz">🎯 开始测验</button>
        </div>
        <div class="read-hint">💡 ${this.intensiveMode ? '精读模式：逐句中英对照，黄色高亮为生词，下方为语法提示。点击英文句子可朗读。' : '点击任意句子可单句朗读；整篇朗读会逐句高亮。先理解英文，需要时再查看中文翻译。'}</div>

        ${this.intensiveMode ? intensiveHtml : `<div class="article-body" id="articleBody">${sentencesHtml}</div>`}

        ${this.showCn && !this.intensiveMode ? `
          <div class="article-cn">
            <div class="acn-title">📖 中文翻译</div>
            ${EM.ui.esc(art.textCn)}
          </div>
        ` : ''}

        <div class="vocab-list">
          <div class="vl-title">📚 生词表（点击单词听发音）</div>
          ${art.vocab.map(v => `
            <div class="vl-item">
              <span class="vl-word" data-word="${EM.ui.esc(v.word)}">🔊 ${EM.ui.esc(v.word)}</span>
              <span class="vl-meaning">${EM.ui.esc(v.meaning)}</span>
            </div>
          `).join('')}
        </div>

        <div class="read-controls" style="margin-top:16px;">
          <button class="btn btn-success" id="goQuiz2">🎯 开始测验</button>
        </div>
      </div>
    `;

    // 返回
    document.getElementById('readBack').onclick = () => {
      this._stopPlay();
      this.currentArticleId = null;
      this.view = 'list';
      this._renderContent();
    };

    // 控制按钮
    document.getElementById('playAll').onclick = () => this._playAll();
    document.getElementById('stopPlay').onclick = () => this._stopPlay();
    document.getElementById('toggleCn').onclick = () => {
      this.showCn = !this.showCn;
      this._renderContent();
    };
    const toggleIntensive = document.getElementById('toggleIntensive');
    if (toggleIntensive) toggleIntensive.onclick = () => {
      this._stopPlay();
      this.intensiveMode = !this.intensiveMode;
      this._renderContent();
    };
    const goQuiz = document.getElementById('goQuiz');
    if (goQuiz) goQuiz.onclick = () => {
      this._stopPlay();
      this.view = 'quiz';
      this._renderContent();
    };
    const goQuiz2 = document.getElementById('goQuiz2');
    if (goQuiz2) goQuiz2.onclick = () => {
      this._stopPlay();
      this.view = 'quiz';
      this._renderContent();
    };

    // 单句点击
    el.querySelectorAll('.article-sentence').forEach(node => {
      node.onclick = () => {
        const idx = parseInt(node.dataset.idx, 10);
        this._stopPlay();
        this._highlightSentence(idx);
        this._speakSentence(this._sentences[idx]);
      };
    });

    // 精读模式：英文句子点击朗读 + 高亮当前块
    el.querySelectorAll('.intensive-en').forEach(node => {
      node.onclick = () => {
        const idx = parseInt(node.dataset.idx, 10);
        this._stopPlay();
        el.querySelectorAll('.intensive-block').forEach(b => b.classList.remove('active'));
        const block = node.closest('.intensive-block');
        if (block) block.classList.add('active');
        this._speakSentence(this._sentences[idx]);
      };
    });

    // 精读模式：生词高亮点击发音
    el.querySelectorAll('.vocab-hl').forEach(node => {
      node.onclick = (e) => {
        e.stopPropagation();
        const w = node.dataset.word;
        EM.tts.speak(w, { rate: 0.8 });
      };
    });

    // 生词点击
    el.querySelectorAll('.vl-word').forEach(node => {
      node.onclick = () => {
        const w = node.dataset.word;
        EM.tts.speak(w, { rate: 0.8 });
      };
    });
  },

  /* ===== 精读模式：渲染逐句精读块 ===== */
  _renderIntensiveBlocks(art) {
    const vocab = art.vocab || [];
    const total = this._sentences.length;
    return this._sentences.map((en, i) => {
      const cn = this._cnSentences[i] || '';
      const enHtml = this._highlightVocab(en, vocab);
      const grammar = this._grammarTip(en);
      return `
        <div class="intensive-block" data-block="${i}">
          <div class="intensive-pos">第 ${i + 1} / ${total} 句</div>
          <div class="intensive-en" data-idx="${i}">${enHtml}</div>
          <div class="intensive-cn">${EM.ui.esc(cn)}</div>
          <div class="intensive-grammar">💡 ${grammar}</div>
        </div>
      `;
    }).join('');
  },

  /* ===== 生词高亮：把句子中的生词包裹成可点击高亮 ===== */
  _highlightVocab(sentence, vocab) {
    let html = EM.ui.esc(sentence);
    if (!vocab || !vocab.length) return html;
    // 按词长降序，避免短词先替换导致冲突
    const sorted = [...vocab].sort((a, b) => b.word.length - a.word.length);
    const placeholders = [];
    sorted.forEach(v => {
      const word = v.word;
      const escWord = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp('\\b(' + escWord + ')\\b', 'gi');
      html = html.replace(re, (m) => {
        const ph = '\u0001' + placeholders.length + '\u0002';
        placeholders.push('<span class="vocab-hl" data-word="' + EM.ui.esc(word) + '">' + EM.ui.esc(m) + '</span>');
        return ph;
      });
    });
    // 还原占位符
    placeholders.forEach((span, i) => {
      html = html.split('\u0001' + i + '\u0002').join(span);
    });
    return html;
  },

  /* ===== 语法点提示：简单启发式检测 ===== */
  _grammarTip(sentence) {
    if (!sentence) return '本句无特别语法点，注意整体句意。';
    const tips = [];
    if (/\b(was|were|had|did|went|said|came|made|took|gave|saw|knew|thought|found|told|asked|wanted|started|learned|played|worked|lived|liked)\b/i.test(sentence) || /\b\w{3,}ed\b/i.test(sentence)) {
      tips.push('<b>过去时</b>：描述过去发生的事，动词常加 -ed 或用不规则形式（was/went/said）。');
    }
    if (/\b(am|is|are)\s+\w+ing\b/i.test(sentence)) {
      tips.push('<b>现在进行时</b>：am/is/are + 动词-ing，表示正在发生的动作。');
    }
    if (/\b(will|shall|going to)\b/i.test(sentence)) {
      tips.push('<b>将来时</b>：will/shall 或 be going to，表示将要发生的事。');
    }
    if (/\b(has|have)\s+\w+(ed|en)\b/i.test(sentence)) {
      tips.push('<b>现在完成时</b>：have/has + 过去分词，表示已完成或经历。');
    }
    if (/\b(the|a|an)\b/i.test(sentence)) {
      tips.push('<b>冠词</b>：the（特指）、a/an（泛指）。');
    }
    if (/\b\w{3,}er\b/i.test(sentence) || /\bmore\s+\w+\b/i.test(sentence)) {
      tips.push('<b>比较级</b>：形容词 +er 或 more + 形容词，用于两者比较。');
    }
    if (/\b\w{3,}est\b/i.test(sentence) || /\bmost\s+\w+\b/i.test(sentence)) {
      tips.push('<b>最高级</b>：形容词 +est 或 most + 形容词，表示三者及以上之最。');
    }
    if (/\b(can|could|should|would|must|may|might)\b/i.test(sentence)) {
      tips.push('<b>情态动词</b>：can/should/must 等表达能力、建议或必要。');
    }
    return tips.length ? tips.join(' ') : '本句无特别语法点，注意整体句意。';
  },

  /* ===== 合并 quiz + comprehension 题目 ===== */
  _allQuestions(art) {
    return [...(art.quiz || []), ...(art.comprehension || [])];
  },

  /* ===== 高亮某一句 ===== */
  _highlightSentence(idx) {
    const sents = document.querySelectorAll('#articleBody .article-sentence');
    sents.forEach((n, i) => n.classList.toggle('active', i === idx));
  },
  _clearHighlight() {
    document.querySelectorAll('#articleBody .article-sentence').forEach(n => n.classList.remove('active'));
  },

  /* ===== 单句发音（直接构造 utterance，便于 onend 回调） ===== */
  _speakSentence(text, onEnd) {
    if (!text) { if (onEnd) onEnd(); return; }
    if (!('speechSynthesis' in window)) { if (onEnd) onEnd(); return; }
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = EM.tts.lang || 'en-US';
    u.rate = EM.tts.rate || 0.9;
    u.pitch = 1;
    if (EM.tts.voice) u.voice = EM.tts.voice;
    u.onend = () => { if (onEnd) onEnd(); };
    u.onerror = () => { if (onEnd) onEnd(); };
    speechSynthesis.speak(u);
  },

  /* ===== 整篇顺序朗读 ===== */
  _playAll() {
    this._stopPlay();
    if (!this._sentences.length) return;
    this._playing = true;
    this._playIdx = -1;
    this._playNext();
  },

  /* 播放下一句 */
  _playNext() {
    if (!this._playing) return;
    this._playIdx++;
    if (this._playIdx >= this._sentences.length) {
      // 播放完成
      this._playing = false;
      this._playIdx = -1;
      this._clearHighlight();
      EM.ui.toast('整篇朗读完成');
      return;
    }
    const idx = this._playIdx;
    this._highlightSentence(idx);
    const sentence = this._sentences[idx];
    // 滚动到当前句
    const node = document.querySelector(`#articleBody .article-sentence[data-idx="${idx}"]`);
    if (node && node.scrollIntoView) {
      node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    this._speakSentence(sentence, () => {
      if (this._playing) this._playNext();
    });
  },

  /* ===== 停止播放 ===== */
  _stopPlay() {
    this._playing = false;
    this._playIdx = -1;
    this._clearHighlight();
    if ('speechSynthesis' in window) speechSynthesis.cancel();
  },

  /* ================= 测验页 ================= */

  _renderQuiz(el) {
    const art = this._currentArticle();
    if (!art || !this._allQuestions(art).length) {
      el.innerHTML = '<div class="card"><p class="text-secondary">该文章暂无测验题目。</p></div>';
      return;
    }
    const lvl = this._getLevel(this.activeLevel);
    const p = EM.progress.get();
    const alreadyDone = (p.modules.reading && p.modules.reading.completed || []).includes(art.id);
    const totalQ = this._allQuestions(art).length;

    el.innerHTML = `
      <div class="card">
        <div class="flex justify-between align-center mb-16" style="flex-wrap:wrap;gap:8px;">
          <button class="btn btn-secondary btn-sm" id="quizBack">⬅️ 返回阅读</button>
          <span class="font-sm text-secondary">L${this.activeLevel} · ${EM.ui.esc(lvl.name)} · ${totalQ} 题${(art.comprehension && art.comprehension.length) ? `（含 ${art.comprehension.length} 推理题）` : ''}</span>
        </div>
        <div class="card-title" style="margin-bottom:8px;">🎯 理解测验：${EM.ui.esc(art.title)}</div>
        <div class="quiz-meta">${alreadyDone ? '✓ 你已完成本文测验，可重新作答更新成绩。' : '请根据文章内容选择正确答案，答错会记入弱项。'}</div>
        <div id="quizArea"></div>
        <div class="read-controls" style="margin-top:16px;">
          <button class="btn btn-primary" id="submitQuiz">📝 提交答案</button>
          <button class="btn btn-secondary" id="resetQuiz">↻ 重新作答</button>
        </div>
        <div id="quizResult"></div>
      </div>
    `;

    document.getElementById('quizBack').onclick = () => {
      this.view = 'read';
      this._renderContent();
    };

    this._renderQuizQuestions();
    document.getElementById('submitQuiz').onclick = () => this._submitQuiz();
    document.getElementById('resetQuiz').onclick = () => {
      this._renderQuizQuestions();
      document.getElementById('quizResult').innerHTML = '';
    };
  },

  /* 渲染测验题目（未作答状态） */
  _renderQuizQuestions() {
    const art = this._currentArticle();
    const area = document.getElementById('quizArea');
    if (!area || !art) return;
    const quizQs = art.quiz || [];
    const compQs = art.comprehension || [];
    const all = this._allQuestions(art);
    let html = '';
    all.forEach((q, i) => {
      // 在推理理解题开始前加分隔标题
      if (compQs.length && i === quizQs.length) {
        html += '<div class="quiz-section-title">🧠 推理理解题（需推断与归纳）</div>';
      }
      const tag = q.type === 'inference' ? ' <span class="font-sm text-secondary">（推理题）</span>' : '';
      html += `
        <div class="quiz-question" data-q="${i}">${i + 1}. ${EM.ui.esc(q.q)}${tag}</div>
        <div class="quiz-options" data-opts="${i}">
          ${q.options.map((opt, j) => `
            <button class="quiz-option" data-q="${i}" data-opt="${j}">${EM.ui.esc(opt)}</button>
          `).join('')}
        </div>
      `;
    });
    area.innerHTML = html;
    // 绑定选择
    area.querySelectorAll('.quiz-option').forEach(btn => {
      btn.onclick = () => {
        const qi = btn.dataset.q;
        // 同组取消选中
        area.querySelectorAll(`.quiz-option[data-q="${qi}"]`).forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
      };
    });
  },

  /* 提交测验 */
  _submitQuiz() {
    const art = this._currentArticle();
    if (!art) return;
    const area = document.getElementById('quizArea');
    const resultEl = document.getElementById('quizResult');
    if (!area || !resultEl) return;

    let correct = 0;
    let wrongIdx = [];
    this._allQuestions(art).forEach((q, i) => {
      const selected = area.querySelector(`.quiz-option.selected[data-q="${i}"]`);
      const chosen = selected ? parseInt(selected.dataset.opt, 10) : -1;
      const isCorrect = chosen === q.answer;
      // 标记正误
      area.querySelectorAll(`.quiz-option[data-q="${i}"]`).forEach(b => {
        b.disabled = true;
        const optI = parseInt(b.dataset.opt, 10);
        b.classList.remove('correct', 'wrong');
        if (optI === q.answer) b.classList.add('correct');
        else if (optI === chosen && !isCorrect) b.classList.add('wrong');
      });
      if (isCorrect) correct++;
      else wrongIdx.push(i);
    });

    const total = this._allQuestions(art).length;
    const pass = correct >= Math.ceil(total * 0.6); // 60% 通过
    const score = correct * 10;

    resultEl.innerHTML = `
      <div class="quiz-result ${pass ? 'pass' : 'fail'}">
        ${pass ? '🎉 通过' : '⚠️ 未通过'} · 答对 ${correct} / ${total} · 得 ${score} 分
      </div>
      <div class="read-hint" style="text-align:center;">
        ${wrongIdx.length ? '错题：第 ' + wrongIdx.map(i => i + 1).join('、') + ' 题' : '全部答对，太棒了！'}
      </div>
    `;

    // 写入进度：完成（无论通过与否，提交即记完成）+ 得分
    const articleKey = art.id;
    EM.progress.update(d => {
      if (!d.modules.reading) d.modules.reading = { completed: [], score: 0 };
      if (!d.modules.reading.completed.includes(articleKey)) {
        d.modules.reading.completed.push(articleKey);
      }
      d.modules.reading.score = (d.modules.reading.score || 0) + score;
      // 记录当前级别
      d.modules.reading.current = this.activeLevel;
    });

    // 答错记弱项：用文章 id 作为弱项标识，方便提示复习哪篇
    if (wrongIdx.length) {
      EM.progress.addWeakness('reading', articleKey);
    } else {
      // 全对则移除该文章的弱项标记
      EM.progress.removeWeakness('reading', articleKey);
    }

    // 禁用提交按钮，避免重复
    const submitBtn = document.getElementById('submitQuiz');
    if (submitBtn) submitBtn.disabled = true;

    this._refreshStats();
    EM.ui.toast(pass ? `测验通过！得 ${score} 分` : `未通过，已记入弱项，可重新作答`);
  }
};

/* 注册模块：路由 navigate('reading') 时调用 EM.modules.reading.render(container) */
EM.registerModule('reading', EM.reading);
