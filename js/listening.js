/* ===== 听力训练模块 (Listening) =====
 * 分级 L1-L5 对应 CEFR A1-C2，从最简单对话开始循序渐进
 * 核心能力：
 *   1) 整段播放：逐句 TTS 顺序播放，高亮当前句
 *   2) 单句播放：点击任意一行只播放该句（iOS Safari 由用户点击触发，符合规范）
 *   3) 显示/隐藏中文翻译
 *   4) 跟读模式：每句播完后等待用户“读完了”再继续
 *   5) 听力测验：播放后做选择题，答错记入弱项，完成后存进度
 * 数据：EM.data.load('conversations') → data/conversations.json
 * 兼容 iOS Safari：所有发音均由用户点击触发；顺序播放通过 onend 链式调用
 */
window.EM = window.EM || {};

EM.listening = {
  data: null,            // 从 data/conversations.json 加载的对话数据
  _container: null,      // 当前渲染容器
  activeLevel: 1,        // 当前级别 1-5
  currentItemId: null,   // 当前正在练习的对话 id（null 表示在列表页）
  view: 'list',          // 'list' 列表 | 'practice' 练习 | 'quiz' 测验
  showCn: false,         // 是否显示中文翻译
  followMode: false,      // 跟读模式开关
  _playing: false,       // 是否正在整段播放
  _playIdx: -1,          // 整段播放当前句索引
  _followWaiting: false, // 跟读模式等待用户确认

  /* ===== 入口：由路由调用 ===== */
  async render(container) {
    this._container = container;
    this._injectStyles();
    // 停止任何正在进行的播放（避免切页面后继续）
    this._stopPlay();
    container.innerHTML = '<div class="loading">加载听力数据中...</div>';

    if (!this.data) {
      this.data = await EM.data.load('conversations');
    }
    if (!this.data || !this.data.levels) {
      container.innerHTML = '<div class="card"><p>听力数据加载失败，请刷新重试。</p></div>';
      return;
    }

    // 默认级别：从进度恢复，否则取用户当前级别（至少 L1）
    const p = EM.progress.get();
    this.activeLevel = Math.max(1, Math.min(5, (p.modules.listening && p.modules.listening.current) || p.level || 1));
    if (!this._levelExists(this.activeLevel)) this.activeLevel = 1;

    this._renderShell();
  },

  /* ===== 注入本模块专用样式 ===== */
  _injectStyles() {
    if (document.getElementById('listening-styles')) return;
    const style = document.createElement('style');
    style.id = 'listening-styles';
    style.textContent = `
      .listen-toolbar { display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-bottom:12px; }
      .listen-hint { font-size:13px; color:var(--text-secondary); margin-top:8px; }
      .conv-item {
        padding:14px 16px; border:1px solid var(--border); border-radius:var(--radius-sm);
        background:var(--bg-card); margin-bottom:10px; cursor:pointer; transition:var(--transition);
        display:flex; justify-content:space-between; align-items:center; gap:12px;
      }
      .conv-item:hover { border-color:var(--accent); background:var(--bg-hover); }
      .conv-item.done { border-color:var(--success); }
      .conv-item .ci-title { font-weight:600; font-size:15px; }
      .conv-item .ci-cn { font-size:13px; color:var(--text-secondary); margin-top:2px; }
      .conv-item .ci-meta { font-size:12px; color:var(--accent); white-space:nowrap; }
      .conv-lines { display:flex; flex-direction:column; gap:10px; margin:12px 0; }
      .conv-line {
        display:flex; gap:12px; padding:12px 14px; border:1px solid var(--border);
        border-radius:var(--radius-sm); background:var(--bg-card); cursor:pointer;
        transition:var(--transition); align-items:flex-start;
      }
      .conv-line:hover { border-color:var(--accent); background:var(--bg-hover); }
      .conv-line.active { border-color:var(--accent); background:var(--accent-bg); box-shadow:0 0 0 2px var(--accent-bg); }
      .conv-line .cl-speaker {
        width:28px; height:28px; border-radius:50%; flex-shrink:0;
        background:var(--accent); color:#fff; display:flex; align-items:center;
        justify-content:center; font-weight:700; font-size:13px;
      }
      .conv-line .cl-text { flex:1; }
      .conv-line .cl-en { font-size:15px; color:var(--text-primary); }
      .conv-line .cl-cn { font-size:13px; color:var(--text-secondary); margin-top:4px; }
      .conv-line .cl-play { color:var(--accent); font-size:16px; flex-shrink:0; margin-top:2px; }
      .listen-controls { display:flex; gap:8px; flex-wrap:wrap; margin:8px 0 4px; }
      .follow-banner {
        background:var(--accent-bg); border:1px solid var(--accent); border-radius:var(--radius-sm);
        padding:12px; margin:10px 0; display:flex; align-items:center; gap:10px; flex-wrap:wrap;
      }
      .follow-banner .fb-text { flex:1; min-width:160px; font-size:14px; color:var(--accent); }
      .quiz-progress { font-size:13px; color:var(--text-secondary); margin-bottom:10px; }
      .quiz-result { font-size:16px; font-weight:600; text-align:center; margin:14px 0; }
      .listen-score { font-size:13px; color:var(--text-secondary); }
      .listen-score b { color:var(--accent); }
    `;
    document.head.appendChild(style);
  },

  /* ===== 渲染外壳 ===== */
  _renderShell() {
    const container = this._container;
    const stats = this._calcStats();
    const lvl = this._getLevel(this.activeLevel);
    const lvlName = lvl ? lvl.name : '';
    const totalItems = lvl ? (lvl.items || []).length : 0;

    container.innerHTML = `
      <div class="card">
        <div class="card-title">👂 听力训练 · 分级对话 · 逐句精听 · 测验</div>
        <div class="progress-bar"><div class="progress-fill" style="width:${stats.pct}%"></div></div>
        <div class="font-sm text-secondary mt-16" style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;">
          <span>当前级别 <b>L${this.activeLevel} ${lvlName}</b> · 本级完成 <b data-stat="done">${stats.doneInLevel}</b> / <span data-stat="total">${totalItems}</span></span>
          <span class="listen-score">累计得分 <b data-stat="score">${stats.score}</b> · 弱项 <b data-stat="weak">${stats.weakCount}</b></span>
        </div>
      </div>

      <div class="card">
        <div class="level-selector">
          ${this.data.levels.map(lv => `
            <button class="level-btn ${lv.level === this.activeLevel ? 'active' : ''}" data-level="${lv.level}">L${lv.level} · ${lv.name}</button>
          `).join('')}
        </div>
        <div class="listen-hint">💡 学习路径：从 L1 第一段对话开始按顺序听。点击对话进入练习页，可整段播放、单句点听、跟读，最后做测验。</div>
      </div>

      <div id="listenContent"></div>
    `;

    // 级别切换
    container.querySelectorAll('[data-level]').forEach(b => {
      b.onclick = () => {
        this._stopPlay();
        this.activeLevel = parseInt(b.dataset.level, 10);
        this.currentItemId = null;
        this.view = 'list';
        // 记录当前级别到进度
        EM.progress.update(d => {
          if (!d.modules.listening) d.modules.listening = { completed: [], score: 0 };
          d.modules.listening.current = this.activeLevel;
        });
        this._renderShell();
      };
    });

    this._renderContent();
  },

  /* ===== 内容区分发 ===== */
  _renderContent() {
    const el = document.getElementById('listenContent');
    if (!el) return;
    if (this.view === 'list') this._renderList(el);
    else if (this.view === 'practice') this._renderPractice(el);
    else if (this.view === 'quiz') this._renderQuiz(el);
  },

  /* ===== 工具：级别数据 ===== */
  _getLevel(level) {
    return (this.data && this.data.levels || []).find(l => l.level === level) || null;
  },
  _levelExists(level) { return !!this._getLevel(level); },

  /* ===== 当前对话对象 ===== */
  _currentItem() {
    const lvl = this._getLevel(this.activeLevel);
    if (!lvl || !this.currentItemId) return null;
    return (lvl.items || []).find(i => i.id === this.currentItemId) || null;
  },

  /* ===== 统计 ===== */
  _calcStats() {
    const p = EM.progress.get();
    const completed = (p.modules.listening && p.modules.listening.completed) || [];
    const lvl = this._getLevel(this.activeLevel);
    const total = lvl ? (lvl.items || []).length : 0;
    const doneInLevel = lvl ? (lvl.items || []).filter(i => completed.includes(i.id)).length : 0;
    return {
      total, doneInLevel,
      pct: total ? Math.min(100, doneInLevel / total * 100) : 0,
      score: (p.modules.listening && p.modules.listening.score) || 0,
      weakCount: (p.weaknesses && p.weaknesses.listening || []).length
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

  /* ================= 列表页 ================= */

  _renderList(el) {
    const lvl = this._getLevel(this.activeLevel);
    if (!lvl || !lvl.items || !lvl.items.length) {
      el.innerHTML = '<div class="card"><p class="text-secondary">该级别暂无对话。</p></div>';
      return;
    }
    const p = EM.progress.get();
    const completed = new Set((p.modules.listening && p.modules.listening.completed) || []);
    const weak = new Set((p.weaknesses && p.weaknesses.listening) || []);

    el.innerHTML = `
      <div class="card">
        <div class="card-title">📜 L${this.activeLevel} · ${EM.ui.esc(lvl.name)} 对话列表</div>
        <div class="listen-hint">点击任意对话进入听力练习。✓ 表示已完成，★ 表示弱项。</div>
        ${lvl.items.map((it, idx) => {
          const done = completed.has(it.id);
          const isWeak = weak.has(it.id);
          return `
            <div class="conv-item ${done ? 'done' : ''}" data-id="${EM.ui.esc(it.id)}">
              <div>
                <div class="ci-title">${idx + 1}. ${EM.ui.esc(it.title)} ${done ? '✓' : ''} ${isWeak ? '<span style="color:var(--warning)">★</span>' : ''}</div>
                <div class="ci-cn">${EM.ui.esc(it.cn || '')} · ${it.lines.length} 句 · ${it.quiz.length} 题</div>
              </div>
              <div class="ci-meta">▶ 开始</div>
            </div>
          `;
        }).join('')}
      </div>
    `;

    el.querySelectorAll('.conv-item').forEach(node => {
      node.onclick = () => {
        this.currentItemId = node.dataset.id;
        this.view = 'practice';
        this.showCn = false;
        this.followMode = false;
        this._playIdx = -1;
        this._playing = false;
        this._followWaiting = false;
        this._renderContent();
      };
    });
  },

  /* ================= 练习页 ================= */

  _renderPractice(el) {
    const item = this._currentItem();
    if (!item) {
      el.innerHTML = '<div class="card"><p class="text-secondary">未找到对话内容。</p></div>';
      return;
    }
    const lvl = this._getLevel(this.activeLevel);

    el.innerHTML = `
      <div class="card">
        <div class="flex justify-between align-center mb-16" style="flex-wrap:wrap;gap:8px;">
          <button class="btn btn-secondary btn-sm" id="listenBack">⬅️ 返回列表</button>
          <span class="font-sm text-secondary">L${this.activeLevel} · ${EM.ui.esc(lvl.name)}</span>
        </div>
        <div class="card-title" style="margin-bottom:4px;">${EM.ui.esc(item.title)}</div>
        <div class="font-sm text-secondary mb-16">${EM.ui.esc(item.cn || '')}</div>

        <div class="listen-controls">
          <button class="btn btn-primary" id="playAll">▶ 整段播放</button>
          <button class="btn btn-secondary" id="stopPlay">⏹ 停止</button>
          <button class="btn ${this.showCn ? 'btn-primary' : 'btn-secondary'}" id="toggleCn">${this.showCn ? '🙈 隐藏中文' : '👁 显示中文'}</button>
          <button class="btn ${this.followMode ? 'btn-primary' : 'btn-secondary'}" id="toggleFollow">${this.followMode ? '🎙 跟读模式:开' : '🎙 跟读模式:关'}</button>
        </div>
        <div class="listen-hint">💡 点击每一行可单句播放；整段播放会逐句高亮。开启跟读模式后，每句播完需点击“读完了”继续。</div>

        <div class="conv-lines" id="convLines">
          ${item.lines.map((ln, i) => `
            <div class="conv-line" data-idx="${i}">
              <div class="cl-speaker">${EM.ui.esc(ln.speaker)}</div>
              <div class="cl-text">
                <div class="cl-en">${EM.ui.esc(ln.en)}</div>
                ${this.showCn ? `<div class="cl-cn">${EM.ui.esc(ln.cn)}</div>` : ''}
              </div>
              <div class="cl-play">🔊</div>
            </div>
          `).join('')}
        </div>

        <div id="followBanner"></div>

        <div class="listen-controls" style="margin-top:16px;">
          <button class="btn btn-success" id="goQuiz">🎯 开始测验</button>
        </div>
      </div>
    `;

    // 返回
    document.getElementById('listenBack').onclick = () => {
      this._stopPlay();
      this.currentItemId = null;
      this.view = 'list';
      this._renderContent();
    };

    // 控制按钮
    document.getElementById('playAll').onclick = () => this._playAll(item);
    document.getElementById('stopPlay').onclick = () => this._stopPlay();
    document.getElementById('toggleCn').onclick = () => {
      this.showCn = !this.showCn;
      this._renderContent();
    };
    document.getElementById('toggleFollow').onclick = () => {
      this.followMode = !this.followMode;
      if (!this.followMode) {
        this._followWaiting = false;
        this._renderFollowBanner();
      }
      this._renderContent();
    };

    // 单句点击
    el.querySelectorAll('.conv-line').forEach(node => {
      node.onclick = () => {
        const idx = parseInt(node.dataset.idx, 10);
        this._stopPlay();
        this._highlightLine(idx);
        this._speakLine(item.lines[idx]);
      };
    });

    document.getElementById('goQuiz').onclick = () => {
      this._stopPlay();
      this.view = 'quiz';
      this._renderContent();
    };
  },

  /* ===== 高亮某一行 ===== */
  _highlightLine(idx) {
    const lines = document.querySelectorAll('#convLines .conv-line');
    lines.forEach((n, i) => n.classList.toggle('active', i === idx));
  },
  _clearHighlight() {
    document.querySelectorAll('#convLines .conv-line').forEach(n => n.classList.remove('active'));
  },

  /* ===== 单句发音（直接构造 utterance，便于 onend 回调） ===== */
  _speakLine(line, onEnd) {
    if (!line || !line.en) { if (onEnd) onEnd(); return; }
    if (!('speechSynthesis' in window)) { if (onEnd) onEnd(); return; }
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(line.en);
    u.lang = EM.tts.lang || 'en-US';
    u.rate = EM.tts.rate || 0.9;
    u.pitch = 1;
    if (EM.tts.voice) u.voice = EM.tts.voice;
    // 两位说话人可通过音调略作区分
    if (line.speaker === 'B') u.pitch = 1.08;
    u.onend = () => { if (onEnd) onEnd(); };
    u.onerror = () => { if (onEnd) onEnd(); };
    speechSynthesis.speak(u);
  },

  /* ===== 整段顺序播放 ===== */
  _playAll(item) {
    this._stopPlay();
    if (!item.lines || !item.lines.length) return;
    this._playing = true;
    this._playIdx = -1;
    this._playNext(item);
  },

  /* 播放下一句（含跟读等待逻辑） */
  _playNext(item) {
    if (!this._playing) return;
    this._playIdx++;
    if (this._playIdx >= item.lines.length) {
      // 播放完成
      this._playing = false;
      this._playIdx = -1;
      this._clearHighlight();
      this._renderFollowBanner();
      EM.ui.toast('整段播放完成');
      return;
    }
    const idx = this._playIdx;
    this._highlightLine(idx);
    const line = item.lines[idx];

    if (this.followMode) {
      // 跟读模式：先播标准音，播完后进入等待状态
      this._followWaiting = false;
      this._renderFollowBanner(idx, 'listening');
      this._speakLine(line, () => {
        if (!this._playing) return; // 期间被停止
        this._followWaiting = true;
        this._renderFollowBanner(idx, 'waiting');
      });
    } else {
      // 普通模式：播完直接下一句
      this._speakLine(line, () => {
        if (!this._playing) return;
        this._playNext(item);
      });
    }
  },

  /* ===== 跟读模式：用户确认“读完了”，继续下一句 ===== */
  _followDone(item) {
    if (!this._playing || !this._followWaiting) return;
    this._followWaiting = false;
    this._playNext(item);
  },

  /* ===== 渲染跟读提示横幅 ===== */
  _renderFollowBanner(idx, phase) {
    const banner = document.getElementById('followBanner');
    if (!banner) return;
    if (!this.followMode || !this._playing) {
      banner.innerHTML = '';
      return;
    }
    if (phase === 'listening') {
      banner.innerHTML = `
        <div class="follow-banner">
          <div class="fb-text">🔊 正在播放第 ${(idx || 0) + 1} 句标准音，请仔细听…</div>
          <button class="btn btn-secondary btn-sm" id="followStop">⏹ 停止</button>
        </div>
      `;
      const stop = document.getElementById('followStop');
      if (stop) stop.onclick = () => this._stopPlay();
    } else if (phase === 'waiting') {
      banner.innerHTML = `
        <div class="follow-banner">
          <div class="fb-text">🎙 请大声跟读第 ${(idx || 0) + 1} 句，读完后点击继续。</div>
          <button class="btn btn-primary btn-sm" id="followRepeat">🔊 再听一次</button>
          <button class="btn btn-success btn-sm" id="followNext">✓ 读完了，下一句</button>
        </div>
      `;
      const item = this._currentItem();
      const repeat = document.getElementById('followRepeat');
      if (repeat) repeat.onclick = () => {
        if (!item || idx == null) return;
        this._followWaiting = false;
        this._renderFollowBanner(idx, 'listening');
        this._speakLine(item.lines[idx], () => {
          if (!this._playing) return;
          this._followWaiting = true;
          this._renderFollowBanner(idx, 'waiting');
        });
      };
      const next = document.getElementById('followNext');
      if (next) next.onclick = () => this._followDone(item);
    }
  },

  /* ===== 停止播放 ===== */
  _stopPlay() {
    this._playing = false;
    this._followWaiting = false;
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    this._playIdx = -1;
    this._clearHighlight();
    const banner = document.getElementById('followBanner');
    if (banner) banner.innerHTML = '';
  },

  /* ================= 测验页 ================= */

  _renderQuiz(el) {
    const item = this._currentItem();
    if (!item || !item.quiz || !item.quiz.length) {
      el.innerHTML = '<div class="card"><p class="text-secondary">该对话暂无测验题。</p></div>';
      return;
    }

    // 初始化测验状态（首次进入）
    if (!this._quizState || this._quizState.itemId !== item.id) {
      this._quizState = {
        itemId: item.id,
        idx: 0,
        correct: 0,
        answered: false
      };
    }
    const q = item.quiz[this._quizState.idx];
    if (!q) {
      this._renderQuizResult(el);
      return;
    }

    el.innerHTML = `
      <div class="card">
        <div class="flex justify-between align-center mb-16">
          <button class="btn btn-secondary btn-sm" id="quizBack">⬅️ 返回练习</button>
          <span class="quiz-progress">第 ${this._quizState.idx + 1} / ${item.quiz.length} 题 · 已对 ${this._quizState.correct}</span>
        </div>
        <div class="card-title" style="margin-bottom:4px;">🎯 听力测验</div>
        <div class="listen-hint">可点击下方按钮重新播放整段对话，再作答。</div>
        <button class="btn btn-secondary btn-sm mt-16" id="quizReplay">🔊 重新播放对话</button>
        <div class="quiz-question" style="margin-top:16px;">${EM.ui.esc(q.q)}</div>
        <div class="quiz-options">
          ${q.options.map((opt, i) => `<button class="quiz-option" data-i="${i}">${EM.ui.esc(opt)}</button>`).join('')}
        </div>
        <div id="quizFeedback"></div>
      </div>
    `;

    document.getElementById('quizBack').onclick = () => {
      this._stopPlay();
      this._quizState = null;
      this.view = 'practice';
      this._renderContent();
    };
    document.getElementById('quizReplay').onclick = () => this._playAll(item);

    el.querySelectorAll('.quiz-option').forEach(btn => {
      btn.onclick = () => this._answerQuiz(btn, q, item);
    });
  },

  /* 作答一题 */
  _answerQuiz(btn, q, item) {
    if (this._quizState.answered) return;
    this._quizState.answered = true;
    const chosen = parseInt(btn.dataset.i, 10);
    const correct = chosen === q.answer;

    const allOpts = btn.parentElement.querySelectorAll('.quiz-option');
    allOpts.forEach(b => {
      b.disabled = true;
      const i = parseInt(b.dataset.i, 10);
      if (i === q.answer) b.classList.add('correct');
      else if (b === btn) b.classList.add('wrong');
    });

    const fb = document.getElementById('quizFeedback');
    if (correct) {
      this._quizState.correct++;
      if (fb) fb.innerHTML = `<div class="quiz-result text-success">✓ 答对了！</div>`;
    } else {
      if (fb) fb.innerHTML = `<div class="quiz-result text-danger">✗ 答错了。正确答案：<b>${EM.ui.esc(q.options[q.answer])}</b></div>`;
      // 记入弱项
      EM.progress.addWeakness('listening', item.id);
    }

    // 下一题按钮
    if (this._quizState.idx + 1 < item.quiz.length) {
      const next = document.createElement('button');
      next.className = 'btn btn-primary';
      next.textContent = '下一题 ➡️';
      next.onclick = () => {
        this._quizState.idx++;
        this._quizState.answered = false;
        this._renderContent();
      };
      fb.appendChild(next);
    } else {
      const finish = document.createElement('button');
      finish.className = 'btn btn-success';
      finish.textContent = '✓ 完成测验';
      finish.onclick = () => {
        this._finishQuiz(item);
      };
      fb.appendChild(finish);
    }
  },

  /* 测验完成 */
  _finishQuiz(item) {
    this._stopPlay();
    const total = item.quiz.length;
    const correct = this._quizState.correct;
    const allCorrect = correct === total;

    // 完成记录 + 计分
    EM.progress.update(d => {
      if (!d.modules.listening) d.modules.listening = { completed: [], score: 0 };
      if (!d.modules.listening.completed.includes(item.id)) {
        d.modules.listening.completed.push(item.id);
      }
      d.modules.listening.score = (d.modules.listening.score || 0) + correct;
    });

    // 全对则移除该对话的弱项标记
    if (allCorrect) {
      EM.progress.removeWeakness('listening', item.id);
    }

    this._quizState = null;
    this._refreshStats();

    // 完成对话后自动检查路径推进(满足3段阈值时自动进入下一课)
    if (EM.path && typeof EM.path.advanceToNext === 'function') {
      setTimeout(() => EM.path.advanceToNext(), 1200);
    }

    // 显示完成结果
    const el = document.getElementById('listenContent');
    if (el) {
      el.innerHTML = `
        <div class="card">
          <div class="quiz-result text-success">🎉 测验完成！</div>
          <div class="text-center font-sm text-secondary">本题得分 ${correct} / ${total}</div>
          <div class="text-center mt-16">
            <button class="btn btn-primary" id="backToList">返回对话列表</button>
            <button class="btn btn-secondary" id="redoQuiz">重新测验</button>
          </div>
        </div>
      `;
      document.getElementById('backToList').onclick = () => {
        this.currentItemId = null;
        this.view = 'list';
        this._renderContent();
        this._refreshStats();
      };
      document.getElementById('redoQuiz').onclick = () => {
        this._quizState = null;
        this._renderContent();
      };
    }

    EM.ui.toast(allCorrect ? '全部答对，已掌握 ✓' : `测验完成 ${correct}/${total}`);
  }
};

/* 注册模块：路由 navigate('listening') 时调用 EM.modules.listening.render(container) */
EM.registerModule('listening', EM.listening);
