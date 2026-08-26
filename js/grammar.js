/* ===== 语法大全模块 (Grammar) =====
 * 循序渐进：基础入门 → 时态语态 → 从句 → 高级语法 → 精通语法
 * 左侧分类按级别过滤（只显示当前级别及以下的分类），右侧语法点列表
 * 精讲视图：summary 摘要 / detail 详解 / examples 例句（点击 EM.tts.speak 发音）/ tips 口诀
 * 练习模式：每个语法点配 quiz 选择题，答对(达标)标记掌握，答错记入弱项
 * 搜索：输入关键词查询任意语法点（标题/摘要/详解）
 * 兼容 iOS Safari（所有发音由用户点击触发，不自动播放）
 */
window.EM = window.EM || {};

EM.grammar = {
  data: null,            // 从 data/grammar.json 加载的语法数据
  _container: null,      // 当前渲染容器（用于局部刷新）
  view: 'list',          // 'list' 列表 | 'detail' 精讲 | 'quiz' 练习 | 'search' 搜索
  activeCategory: 'basics',  // 当前分类 id
  currentTopicId: null,  // 当前精讲/练习的语法点 id
  searchQuery: '',       // 搜索关键字
  quizState: null,       // 练习状态 {topicId, qIdx, correctCount, answered}

  /* ===== 入口：由路由调用 ===== */
  async render(container) {
    this._container = container;
    this._injectStyles();
    container.innerHTML = '<div class="loading">加载语法数据中...</div>';

    // 异步加载数据（合并 grammar.json + grammar_extra.json，共 550 条）
    if (!this.data) {
      this.data = await this._loadMerged();
    }
    if (!this.data || !this.data.topics) {
      container.innerHTML = '<div class="card"><p>语法数据加载失败，请刷新重试。</p></div>';
      return;
    }

    // 从进度恢复上次位置（循序渐进，默认从 basics 第一个开始）
    const p = EM.progress.get();
    const cur = p.modules.grammar.current || 0;
    const ordered = this._allOrdered();
    if (cur > 0 && cur < ordered.length) {
      const t = ordered[cur];
      this.activeCategory = t.category;
      // 恢复到精讲视图，方便继续学习
      this.currentTopicId = t.id;
      this.view = 'detail';
    } else {
      this.activeCategory = this._firstUnlockedCategory() || 'basics';
      this.view = 'list';
    }

    this._renderShell();
  },

  /* ===== 加载并合并 grammar.json + grammar_extra.json (共550条) ===== */
  async _loadMerged() {
    const base = await EM.data.load('grammar');
    const extra = await EM.data.load('grammar_extra');
    if (!base) return null;
    // 分类归一化映射:extra 用单数,base 用复数
    const catMap = { 'tense':'tenses', 'clause':'clauses' };
    const normalizeCat = c => catMap[c] || c;
    // 合并 topics (按 id 去重,base 优先)
    const seen = new Set();
    const topics = [];
    (base.topics || []).forEach(t => {
      if (!seen.has(t.id)) { seen.add(t.id); topics.push(t); }
    });
    (extra && extra.topics || []).forEach(t => {
      if (!seen.has(t.id)) {
        seen.add(t.id);
        // 归一化 category
        const t2 = Object.assign({}, t, { category: normalizeCat(t.category) });
        topics.push(t2);
      }
    });
    // 合并 categories (base 优先,extra 中归一化后追加不重复的)
    const cats = (base.categories || []).slice();
    const seenCat = new Set(cats.map(c => c.id));
    if (extra && extra.categories) {
      extra.categories.forEach(c => {
        const nid = normalizeCat(c.id);
        if (!seenCat.has(nid)) {
          seenCat.add(nid);
          cats.push(Object.assign({}, c, { id: nid }));
        }
      });
    }
    return { categories: cats, topics, version: 2 };
  },

  /* ===== 注入本模块专用样式 ===== */
  _injectStyles() {
    if (document.getElementById('grammar-styles')) return;
    const style = document.createElement('style');
    style.id = 'grammar-styles';
    style.textContent = `
      .grammar-layout { display:grid; grid-template-columns:240px 1fr; gap:16px; align-items:start; }
      @media (max-width:768px) { .grammar-layout { grid-template-columns:1fr; } }
      .grammar-cat-list { display:flex; flex-direction:column; gap:8px; }
      .grammar-cat-item {
        padding:12px 14px; border:1px solid var(--border); border-radius:var(--radius-sm);
        background:var(--bg-card); cursor:pointer; transition:var(--transition);
        display:flex; flex-direction:column; gap:4px;
      }
      .grammar-cat-item:hover { border-color:var(--accent); background:var(--bg-hover); }
      .grammar-cat-item.active { border-color:var(--accent); background:var(--accent-bg); }
      .grammar-cat-item.active .gcat-name { color:var(--accent); font-weight:700; }
      .gcat-name { font-size:15px; font-weight:600; }
      .gcat-meta { font-size:12px; color:var(--text-secondary); }
      .grammar-cat-locked { opacity:0.45; cursor:not-allowed; }
      .grammar-cat-locked:hover { border-color:var(--border); background:var(--bg-card); }
      .grammar-topic-item {
        padding:14px 16px; border:1px solid var(--border); border-radius:var(--radius-sm);
        background:var(--bg-card); margin-bottom:10px; cursor:pointer; transition:var(--transition);
        display:flex; align-items:center; gap:12px;
      }
      .grammar-topic-item:hover { border-color:var(--accent); background:var(--bg-hover); transform:translateX(2px); }
      .grammar-topic-item.mastered { border-left:3px solid var(--success); }
      .grammar-topic-item.weak { border-left:3px solid var(--warning); }
      .gti-body { flex:1; min-width:0; }
      .gti-title { font-size:15px; font-weight:600; }
      .gti-summary { font-size:13px; color:var(--text-secondary); margin-top:3px;
        overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .gti-badge { font-size:13px; flex-shrink:0; }
      .gti-chevron { color:var(--text-muted); font-size:18px; flex-shrink:0; }
      .grammar-search-input {
        flex:1; min-width:160px; padding:9px 14px; background:var(--bg-card);
        border:1px solid var(--border); border-radius:var(--radius-sm);
        color:var(--text-primary); font-size:14px;
      }
      .grammar-search-input:focus { outline:none; border-color:var(--accent); }
      .grammar-detail-title { font-size:20px; font-weight:700; margin-bottom:6px; }
      .grammar-detail-summary {
        background:var(--accent-bg); padding:10px 14px; border-radius:var(--radius-sm);
        font-size:14px; margin-bottom:14px; border-left:3px solid var(--accent);
      }
      .grammar-detail-detail { font-size:14px; line-height:1.8; color:var(--text-primary); margin-bottom:14px; }
      .grammar-section-title { font-size:14px; font-weight:700; color:var(--accent); margin:16px 0 8px; }
      .grammar-example {
        display:flex; align-items:center; gap:10px; padding:10px 12px; margin-bottom:8px;
        background:var(--bg-card); border:1px solid var(--border); border-radius:var(--radius-sm);
        transition:var(--transition);
      }
      .grammar-example:hover { border-color:var(--accent); }
      .grammar-example .ge-en { font-size:15px; font-weight:600; cursor:pointer; flex:1; }
      .grammar-example .ge-en:hover { color:var(--accent); }
      .grammar-example .ge-cn { font-size:13px; color:var(--text-secondary); flex:2; }
      .grammar-example .ge-speak {
        width:32px; height:32px; border-radius:50%; background:var(--accent-bg);
        border:none; color:var(--accent); font-size:15px; cursor:pointer; flex-shrink:0;
        display:flex; align-items:center; justify-content:center;
      }
      .grammar-example .ge-speak:hover { background:var(--accent); color:#fff; }
      .grammar-tips {
        background:rgba(240,160,64,0.10); border-left:3px solid var(--warning);
        padding:12px 14px; border-radius:var(--radius-sm); font-size:14px; margin-top:14px;
      }
      .grammar-tips b { color:var(--warning); }
      .grammar-quiz-meta { font-size:13px; color:var(--text-secondary); margin-bottom:12px; }
      .grammar-quiz-question { font-size:17px; font-weight:600; margin-bottom:14px; }
      .grammar-quiz-options { display:flex; flex-direction:column; gap:8px; }
      .grammar-quiz-result { text-align:center; padding:20px; }
      .grammar-quiz-result .score { font-size:32px; font-weight:700; color:var(--accent); margin:8px 0; }
      .grammar-back { margin-bottom:12px; }
      .grammar-hint { font-size:13px; color:var(--text-secondary); margin-top:10px; }
      .grammar-search-result {
        padding:12px 14px; border:1px solid var(--border); border-radius:var(--radius-sm);
        background:var(--bg-card); margin-bottom:8px; cursor:pointer; transition:var(--transition);
      }
      .grammar-search-result:hover { border-color:var(--accent); background:var(--bg-hover); }
      .grammar-search-result .gsr-title { font-weight:600; font-size:15px; }
      .grammar-search-result .gsr-summary { font-size:13px; color:var(--text-secondary); margin-top:3px; }
      .grammar-search-result .gsr-cat { font-size:11px; color:var(--accent); margin-top:4px; }
      .grammar-empty { text-align:center; padding:30px; color:var(--text-secondary); }
    `;
    document.head.appendChild(style);
  },

  /* ===== 渲染外壳：进度条 + 搜索 + 左右布局 ===== */
  _renderShell() {
    const container = this._container;
    const stats = this._calcStats();
    const pct = stats.total ? Math.min(100, stats.mastered / stats.total * 100) : 0;

    container.innerHTML = `
      <div class="card">
        <div class="card-title">📖 语法大全 · 查询 / 精讲 / 例句 / 练习</div>
        <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
        <div class="font-sm text-secondary mt-16" style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;">
          <span>已掌握 <b data-stat="mastered">${stats.mastered}</b> / <span data-stat="total">${stats.total}</span></span>
          <span>练习得分 <b data-stat="score">${stats.score}</b> · 弱项 <b data-stat="weak">${stats.weakCount}</b></span>
        </div>
      </div>

      <div class="card">
        <div class="flex gap-8 flex-wrap align-center" style="margin-bottom:10px;">
          <input type="text" class="grammar-search-input" id="grammarSearch"
                 placeholder="搜索语法点：如 be动词、定语从句、虚拟语气..." value="${EM.ui.esc(this.searchQuery)}">
          <button class="btn btn-secondary" id="grammarSearchBtn">🔍 搜索</button>
        </div>
        <div class="grammar-hint">💡 学习路径：基础入门 → 时态语态 → 从句 → 高级语法 → 精通语法，按顺序逐点攻克。点击例句可听发音，学完做练习巩固。</div>
      </div>

      <div class="grammar-layout">
        <div class="card" id="grammarSidebar"></div>
        <div id="grammarContent"></div>
      </div>
    `;

    // 渲染左侧分类
    this._renderSidebar();
    // 绑定搜索
    const searchInput = document.getElementById('grammarSearch');
    const searchBtn = document.getElementById('grammarSearchBtn');
    if (searchInput) {
      searchInput.oninput = () => {
        this.searchQuery = searchInput.value;
        this.view = this.searchQuery.trim() ? 'search' : 'list';
        this._renderContent();
      };
      searchInput.onkeydown = (e) => { if (e.key === 'Enter') this._renderContent(); };
    }
    if (searchBtn) searchBtn.onclick = () => this._renderContent();

    // 渲染右侧内容
    this._renderContent();
  },

  /* ===== 左侧分类列表（按级别过滤） ===== */
  _renderSidebar() {
    const el = document.getElementById('grammarSidebar');
    if (!el) return;
    const p = EM.progress.get();
    // 解锁级别：零基础用户也能学基础入门，每升一级解锁更高分类
    const unlockedLevel = p.level + 1;
    const cats = this.data.categories || [];
    const topics = this.data.topics || [];

    let html = '<div class="card-title" style="font-size:15px;">分类</div><div class="grammar-cat-list">';
    let shownCount = 0;
    cats.forEach(c => {
      const unlocked = c.level <= unlockedLevel;
      if (!unlocked) return; // 只显示当前级别及以下
      shownCount++;
      const catTopics = topics.filter(t => t.category === c.id);
      const mastered = catTopics.filter(t => this._isMastered(t.id)).length;
      const active = c.id === this.activeCategory && this.view !== 'search';
      html += `
        <div class="grammar-cat-item ${active ? 'active' : ''}" data-cat="${EM.ui.esc(c.id)}">
          <div class="gcat-name">${EM.ui.esc(c.icon || '')} ${EM.ui.esc(c.name)}</div>
          <div class="gcat-meta">${mastered}/${catTopics.length} 掌握 · L${c.level}</div>
        </div>`;
    });
    html += '</div>';

    // 提示未解锁分类
    const lockedCats = cats.filter(c => c.level > unlockedLevel);
    if (lockedCats.length) {
      html += `<div class="grammar-hint" style="margin-top:12px;">🔒 还有 ${lockedCats.length} 个分类将在级别提升后解锁</div>`;
    }
    if (!shownCount) {
      html += '<div class="grammar-hint">暂无可用分类。</div>';
    }
    el.innerHTML = html;

    // 绑定分类点击
    el.querySelectorAll('[data-cat]').forEach(item => {
      item.onclick = () => {
        this.activeCategory = item.dataset.cat;
        this.searchQuery = '';
        const si = document.getElementById('grammarSearch');
        if (si) si.value = '';
        this.view = 'list';
        // 仅更新左侧高亮 + 右侧内容（保留搜索框不重渲染）
        el.querySelectorAll('.grammar-cat-item').forEach(i =>
          i.classList.toggle('active', i.dataset.cat === this.activeCategory));
        this._renderContent();
      };
    });
  },

  /* ===== 内容区分发 ===== */
  _renderContent() {
    const el = document.getElementById('grammarContent');
    if (!el) return;
    if (this.view === 'search') this._renderSearch(el);
    else if (this.view === 'detail') this._renderDetail(el);
    else if (this.view === 'quiz') this._renderQuiz(el);
    else this._renderList(el);
  },

  /* ===== 右侧：语法点列表 ===== */
  _renderList(el) {
    const topics = (this.data.topics || []).filter(t => t.category === this.activeCategory);
    if (!topics.length) {
      el.innerHTML = '<div class="card"><p class="text-secondary">该分类暂无内容。</p></div>';
      return;
    }
    const p = EM.progress.get();
    const cat = this._getCategory(this.activeCategory);

    el.innerHTML = `
      <div class="card">
        <div class="card-title">${EM.ui.esc(cat ? (cat.icon || '') + ' ' + cat.name : this.activeCategory)}</div>
        <div class="grammar-hint" style="margin-bottom:14px;">点击任一语法点查看精讲与例句，学完可做练习。</div>
        ${topics.map((t, i) => {
          const mastered = this._isMastered(t.id);
          const weak = (p.weaknesses.grammar || []).includes(t.id);
          let badge = '';
          if (mastered) badge = '<span class="gti-badge text-success">✓ 已掌握</span>';
          else if (weak) badge = '<span class="gti-badge" style="color:var(--warning);">★ 弱项</span>';
          else badge = `<span class="gti-badge text-secondary">${i + 1}</span>`;
          return `
            <div class="grammar-topic-item ${mastered ? 'mastered' : ''} ${weak ? 'weak' : ''}" data-topic="${EM.ui.esc(t.id)}">
              <div class="gti-body">
                <div class="gti-title">${EM.ui.esc(t.title)}</div>
                <div class="gti-summary">${EM.ui.esc(t.summary)}</div>
              </div>
              ${badge}
              <span class="gti-chevron">›</span>
            </div>`;
        }).join('')}
      </div>
    `;

    el.querySelectorAll('[data-topic]').forEach(item => {
      item.onclick = () => this._openDetail(item.dataset.topic);
    });
  },

  /* ===== 右侧：精讲视图 ===== */
  _renderDetail(el) {
    const t = this._getTopic(this.currentTopicId);
    if (!t) {
      el.innerHTML = '<div class="card"><p class="text-secondary">未找到该语法点。</p></div>';
      return;
    }
    const p = EM.progress.get();
    const mastered = this._isMastered(t.id);
    const weak = (p.weaknesses.grammar || []).includes(t.id);

    el.innerHTML = `
      <div class="card">
        <button class="btn btn-secondary btn-sm grammar-back" id="grammarBack">← 返回列表</button>
        <div class="grammar-detail-title">${EM.ui.esc(t.title)}</div>
        <div class="grammar-detail-summary">📌 ${EM.ui.esc(t.summary)}</div>

        <div class="grammar-section-title">📝 精讲</div>
        <div class="grammar-detail-detail">${EM.ui.esc(t.detail)}</div>

        <div class="grammar-section-title">💬 例句（点击英文或 🔊 听发音）</div>
        ${(t.examples || []).map((ex, i) => `
          <div class="grammar-example">
            <button class="ge-speak" data-ex="${i}" title="朗读">🔊</button>
            <span class="ge-en" data-ex="${i}">${EM.ui.esc(ex.en)}</span>
            <span class="ge-cn">${EM.ui.esc(ex.cn)}</span>
          </div>
        `).join('')}

        <div class="grammar-tips">💡 <b>口诀：</b>${EM.ui.esc(t.tips)}</div>

        <div class="flex gap-8 flex-wrap mt-16" style="margin-top:16px;">
          <button class="btn btn-primary" id="grammarQuiz">🎯 开始练习 (${(t.quiz || []).length} 题)</button>
          ${mastered
            ? '<span class="gti-badge text-success" style="align-self:center;">✓ 已掌握</span>'
            : (weak ? '<span class="gti-badge" style="align-self:center;color:var(--warning);">★ 弱项中</span>' : '')}
        </div>
      </div>
    `;

    // 返回列表
    document.getElementById('grammarBack').onclick = () => {
      this.view = 'list';
      this._renderContent();
    };
    // 例句发音（点击英文或喇叭均触发，符合 iOS 手势要求）
    el.querySelectorAll('[data-ex]').forEach(node => {
      node.onclick = () => {
        const i = parseInt(node.dataset.ex, 10);
        const ex = t.examples[i];
        if (ex) EM.tts.speak(ex.en, { rate: 0.85 });
      };
    });
    // 开始练习
    document.getElementById('grammarQuiz').onclick = () => this._startQuiz(t.id);
  },

  /* 打开精讲：记录当前位置到进度 */
  _openDetail(topicId) {
    this.currentTopicId = topicId;
    this.view = 'detail';
    // 保存当前索引（循序渐进位置）
    const idx = this._idxOf(topicId);
    if (idx >= 0) {
      EM.progress.update(d => {
        if (!d.modules.grammar) d.modules.grammar = { mastered: [], current: 0, score: 0 };
        d.modules.grammar.current = idx;
      });
    }
    this._renderContent();
  },

  /* ================= 练习模式 ================= */

  _startQuiz(topicId) {
    const t = this._getTopic(topicId);
    if (!t || !t.quiz || !t.quiz.length) {
      EM.ui.toast('该语法点暂无练习题');
      return;
    }
    this.quizState = { topicId: topicId, qIdx: 0, correctCount: 0, answered: false };
    this.view = 'quiz';
    this._renderContent();
  },

  _renderQuiz(el) {
    const t = this._getTopic(this.currentTopicId);
    if (!t || !this.quizState) {
      el.innerHTML = '<div class="card"><p class="text-secondary">练习未就绪。</p></div>';
      return;
    }
    const qs = this.quizState;
    // 已完成所有题目 → 显示结果
    if (qs.qIdx >= t.quiz.length) {
      this._renderQuizResult(el, t);
      return;
    }

    const q = t.quiz[qs.qIdx];
    const p = EM.progress.get();
    const score = p.modules.grammar.score || 0;

    el.innerHTML = `
      <div class="card">
        <button class="btn btn-secondary btn-sm grammar-back" id="grammarBack">← 返回精讲</button>
        <div class="grammar-quiz-meta">🎯 ${EM.ui.esc(t.title)} · 第 ${qs.qIdx + 1} / ${t.quiz.length} 题 · 累计得分 <b id="grammarScore">${score}</b></div>
        <div class="grammar-quiz-question">${EM.ui.esc(q.q)}</div>
        <div class="grammar-quiz-options">
          ${q.options.map((opt, i) => `<button class="quiz-option" data-i="${i}">${EM.ui.esc(opt)}</button>`).join('')}
        </div>
        <div class="grammar-hint" id="quizHint"></div>
        <div class="flex gap-8 mt-16" style="margin-top:14px; display:none;" id="quizNextWrap">
          <button class="btn btn-primary" id="quizNext">${qs.qIdx + 1 >= t.quiz.length ? '查看结果' : '下一题'} →</button>
        </div>
      </div>
    `;

    document.getElementById('grammarBack').onclick = () => {
      this.view = 'detail';
      this._renderContent();
    };

    el.querySelectorAll('[data-i]').forEach(btn => {
      btn.onclick = () => this._answerQuiz(btn, t, q);
    });
  },

  /* 作答处理 */
  _answerQuiz(btn, t, q) {
    const qs = this.quizState;
    if (!qs || qs.answered) return;
    qs.answered = true;
    const chosen = parseInt(btn.dataset.i, 10);
    const correct = chosen === q.answer;

    // 标记选项颜色
    const opts = btn.parentElement.querySelectorAll('[data-i]');
    opts.forEach(b => {
      b.disabled = true;
      const i = parseInt(b.dataset.i, 10);
      if (i === q.answer) b.classList.add('correct');
      else if (b === btn) b.classList.add('wrong');
    });

    const hint = document.getElementById('quizHint');
    if (correct) {
      qs.correctCount++;
      EM.progress.update(d => {
        if (!d.modules.grammar) d.modules.grammar = { mastered: [], current: 0, score: 0 };
        d.modules.grammar.score = (d.modules.grammar.score || 0) + 1;
      });
      const sc = document.getElementById('grammarScore');
      if (sc) sc.textContent = (parseInt(sc.textContent, 10) || 0) + 1;
      if (hint) hint.innerHTML = '<span class="text-success">✓ 答对了！</span>';
    } else {
      if (hint) hint.innerHTML = `<span class="text-danger">✗ 答错了。正确答案：<b>${EM.ui.esc(q.options[q.answer])}</b></span>`;
    }
    // 显示下一题按钮
    const nextWrap = document.getElementById('quizNextWrap');
    if (nextWrap) nextWrap.style.display = 'flex';
    const nextBtn = document.getElementById('quizNext');
    if (nextBtn) {
      nextBtn.onclick = () => {
        qs.qIdx++;
        qs.answered = false;
        this._renderContent();
      };
    }
  },

  /* 练习结果：达标则标记掌握，否则记入弱项 */
  _renderQuizResult(el, t) {
    const qs = this.quizState;
    const total = t.quiz.length;
    const correct = qs.correctCount;
    // 达标线：答对 ≥ 2/3 视为掌握
    const passed = correct >= Math.ceil(total * 2 / 3);

    if (passed) {
      // 标记掌握并移除弱项
      EM.progress.update(d => {
        if (!d.modules.grammar) d.modules.grammar = { mastered: [], current: 0, score: 0 };
        if (!d.modules.grammar.mastered) d.modules.grammar.mastered = [];
        if (!d.modules.grammar.mastered.includes(t.id)) d.modules.grammar.mastered.push(t.id);
      });
      EM.progress.removeWeakness('grammar', t.id);
      // 掌握一个语法点后自动检查路径推进(满足阈值时进入下一课)
      if (EM.path && typeof EM.path.advanceToNext === 'function') {
        setTimeout(() => EM.path.advanceToNext(), 1200);
      }
    } else {
      // 记入弱项
      EM.progress.addWeakness('grammar', t.id);
    }

    el.innerHTML = `
      <div class="card">
        <div class="grammar-quiz-result">
          <div style="font-size:40px;">${passed ? '🎉' : '💪'}</div>
          <div class="score">${correct} / ${total}</div>
          <div style="font-size:16px; font-weight:600; margin-bottom:8px;">
            ${passed ? '太棒了，已掌握该语法点！' : '还需加油，已记入弱项'}
          </div>
          <div class="grammar-hint">${passed
            ? '该语法点已标记为掌握 ✓，可继续学习下一个。'
            : '建议复习精讲后重做练习，弱项会在自适应中优先出现。'}</div>
        </div>
        <div class="flex gap-8 flex-wrap" style="justify-content:center;">
          <button class="btn btn-secondary" id="qrBack">← 返回精讲</button>
          <button class="btn btn-primary" id="qrRetry">🔄 再练一次</button>
          ${this._hasNextTopic(t) ? '<button class="btn btn-success" id="qrNext">下一个语法点 →</button>' : ''}
        </div>
      </div>
    `;

    document.getElementById('qrBack').onclick = () => {
      this.view = 'detail';
      this._renderContent();
    };
    document.getElementById('qrRetry').onclick = () => this._startQuiz(t.id);
    const nextBtn = document.getElementById('qrNext');
    if (nextBtn) nextBtn.onclick = () => this._goNextTopic(t);

    this._refreshStats();
    if (passed) EM.ui.toast('已掌握该语法点 ✓');
    else EM.ui.toast('已记入弱项，加油 💪');
  },

  /* ================= 搜索 ================= */
  _renderSearch(el) {
    const q = (this.searchQuery || '').trim().toLowerCase();
    if (!q) {
      el.innerHTML = '<div class="card"><p class="text-secondary">输入关键字搜索语法点。</p></div>';
      return;
    }
    const results = (this.data.topics || []).filter(t => {
      return (t.title || '').toLowerCase().includes(q) ||
             (t.summary || '').toLowerCase().includes(q) ||
             (t.detail || '').toLowerCase().includes(q) ||
             (t.tips || '').toLowerCase().includes(q);
    });

    if (!results.length) {
      el.innerHTML = `<div class="card grammar-empty">未找到包含 "${EM.ui.esc(this.searchQuery)}" 的语法点</div>`;
      return;
    }

    el.innerHTML = `
      <div class="card">
        <div class="card-title">🔍 搜索结果（${results.length} 个）</div>
        ${results.map(t => {
          const cat = this._getCategory(t.category);
          const mastered = this._isMastered(t.id);
          return `
            <div class="grammar-search-result" data-topic="${EM.ui.esc(t.id)}">
              <div class="gsr-title">${EM.ui.esc(t.title)} ${mastered ? '<span class="text-success">✓</span>' : ''}</div>
              <div class="gsr-summary">${EM.ui.esc(t.summary)}</div>
              <div class="gsr-cat">${EM.ui.esc(cat ? cat.name : t.category)} · L${t.level}</div>
            </div>`;
        }).join('')}
      </div>
    `;

    el.querySelectorAll('[data-topic]').forEach(item => {
      item.onclick = () => {
        // 跳转到该语法点（即使属于未解锁分类也允许查看，便于查询）
        this.activeCategory = this._getTopic(item.dataset.topic).category;
        this.searchQuery = '';
        const si = document.getElementById('grammarSearch');
        if (si) si.value = '';
        this._renderSidebar();
        this._openDetail(item.dataset.topic);
      };
    });
  },

  /* ===== 工具方法 ===== */

  _getCategory(id) {
    return (this.data.categories || []).find(c => c.id === id) || null;
  },

  _getTopic(id) {
    return (this.data.topics || []).find(t => t.id === id) || null;
  },

  // 按 categories 顺序、再按 topics 数组顺序的全局有序列表
  _allOrdered() {
    const cats = this.data.categories || [];
    const topics = this.data.topics || [];
    const out = [];
    cats.forEach(c => {
      topics.forEach(t => { if (t.category === c.id) out.push(t); });
    });
    return out;
  },

  _idxOf(topicId) {
    return this._allOrdered().findIndex(t => t.id === topicId);
  },

  // 第一个已解锁分类
  _firstUnlockedCategory() {
    const p = EM.progress.get();
    const unlockedLevel = p.level + 1;
    const cats = this.data.categories || [];
    const unlocked = cats.filter(c => c.level <= unlockedLevel);
    return unlocked.length ? unlocked[0].id : (cats[0] ? cats[0].id : 'basics');
  },

  _isMastered(topicId) {
    const p = EM.progress.get();
    return (p.modules.grammar.mastered || []).includes(topicId);
  },

  _hasNextTopic(currentTopic) {
    const ordered = this._allOrdered();
    const idx = ordered.findIndex(t => t.id === currentTopic.id);
    return idx >= 0 && idx < ordered.length - 1;
  },

  // 跳到下一个语法点（循序渐进）
  _goNextTopic(currentTopic) {
    const ordered = this._allOrdered();
    const idx = ordered.findIndex(t => t.id === currentTopic.id);
    if (idx < 0 || idx >= ordered.length - 1) {
      EM.ui.toast('已是最后一个语法点 🎓');
      return;
    }
    const next = ordered[idx + 1];
    this.activeCategory = next.category;
    this._renderSidebar();
    this._openDetail(next.id);
    EM.ui.toast('进入下一个语法点：' + next.title);
  },

  _calcStats() {
    const p = EM.progress.get();
    const total = (this.data.topics || []).length;
    const mastered = (p.modules.grammar.mastered || []).filter(id => this._getTopic(id)).length;
    const weak = (p.weaknesses.grammar || []).filter(id => this._getTopic(id)).length;
    return { total, mastered, weakCount: weak, score: p.modules.grammar.score || 0 };
  },

  // 局部刷新顶部统计 + 左侧分类计数
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
    const s = c.querySelector('[data-stat="score"]');
    if (s) s.textContent = stats.score;
    const w = c.querySelector('[data-stat="weak"]');
    if (w) w.textContent = stats.weakCount;
    // 左侧分类计数同步刷新
    this._renderSidebar();
  }
};

/* 注册模块：路由 navigate('grammar') 时调用 EM.modules.grammar.render(container) */
EM.registerModule('grammar', EM.grammar);
