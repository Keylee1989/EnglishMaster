/* ===== 口语练习模块 (Speaking) =====
 * 三种模式：
 *   1) 跟读练习 (read)：从 conversations.json + vocabulary.json 取句子，TTS 播标准音 → 用户跟读
 *   2) 情景对话 (dialogue)：选择场景，系统给中文提示 → 用户用英文回答 → 给出参考答案
 *   3) 发音对比 (compare)：TTS 播标准音 → 用户跟读 → 词级对比（如支持语音识别）
 * 评分：支持 Speech Recognition API 时按单词匹配率；不支持（如 iOS Safari）降级为自评
 * 数据：EM.data.load('conversations') 为主，EM.data.load('vocabulary') 为辅
 * 兼容 iOS Safari：TTS 由用户点击触发；语音识别不支持时自动降级为自评模式
 */
window.EM = window.EM || {};

EM.speaking = {
  data: null,            // conversations 数据
  vocab: null,           // vocabulary 数据（辅）
  _container: null,
  mode: 'read',          // 'read' | 'dialogue' | 'compare'
  activeLevel: 1,        // 当前级别 1-5
  // 跟读/对比模式状态
  _pool: [],             // 句子池 [{en, cn, source}]
  _poolIdx: 0,
  _recognizing: false,    // 是否正在识别
  _recSupported: null,    // 是否支持语音识别（缓存）
  // 情景对话状态
  _sceneId: null,         // 当前场景对话 id
  _dialogueIdx: 0,        // 对话内当前句索引
  _dialogueRevealed: false,
  _dialogueInput: '',     // 用户输入

  /* ===== 入口 ===== */
  async render(container) {
    this._container = container;
    this._injectStyles();
    this._stopRec();
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    container.innerHTML = '<div class="loading">加载口语数据中...</div>';

    if (!this.data) {
      this.data = await EM.data.load('conversations');
    }
    // vocabulary 为辅助数据，加载失败不阻断
    if (!this.vocab) {
      this.vocab = await EM.data.load('vocabulary');
    }
    if (!this.data || !this.data.levels) {
      container.innerHTML = '<div class="card"><p>口语数据加载失败，请刷新重试。</p></div>';
      return;
    }

    // 检测语音识别支持（仅一次）
    if (this._recSupported === null) {
      this._recSupported = !!(window.SpeechRecognition || window.webkitSpeechRecognition);
    }

    // 默认级别
    const p = EM.progress.get();
    this.activeLevel = Math.max(1, Math.min(5, (p.modules.speaking && p.modules.speaking.current) || p.level || 1));
    if (!this._levelExists(this.activeLevel)) this.activeLevel = 1;

    this._renderShell();
  },

  /* ===== 注入样式 ===== */
  _injectStyles() {
    if (document.getElementById('speaking-styles')) return;
    const style = document.createElement('style');
    style.id = 'speaking-styles';
    style.textContent = `
      .speak-mode-bar { display:flex; gap:8px; margin-bottom:12px; flex-wrap:wrap; }
      .speak-hint { font-size:13px; color:var(--text-secondary); margin-top:8px; }
      .speak-sentence-card {
        background:var(--bg-card); border:1px solid var(--border); border-radius:var(--radius);
        padding:24px; text-align:center; margin:12px 0; box-shadow:var(--shadow);
      }
      .speak-sentence-en { font-size:22px; font-weight:600; line-height:1.5; color:var(--text-primary); }
      .speak-sentence-cn { font-size:14px; color:var(--text-secondary); margin-top:10px; }
      .speak-source { font-size:12px; color:var(--accent); margin-top:8px; }
      .speak-controls { display:flex; gap:8px; flex-wrap:wrap; justify-content:center; margin-top:16px; }
      .speak-result {
        border:1px solid var(--border); border-radius:var(--radius-sm); padding:14px;
        background:var(--bg-card); margin-top:14px;
      }
      .speak-result .sr-label { font-size:13px; color:var(--text-secondary); margin-bottom:6px; }
      .speak-result .sr-transcript { font-size:16px; color:var(--text-primary); }
      .speak-result .sr-rate { font-size:30px; font-weight:700; color:var(--accent); }
      .speak-match-bar { width:100%; height:10px; background:var(--bg-hover); border-radius:5px; overflow:hidden; margin-top:8px; }
      .speak-match-fill { height:100%; background:linear-gradient(90deg,var(--success),var(--accent)); border-radius:5px; transition:width .5s; }
      .speak-word-diff { display:flex; flex-wrap:wrap; gap:6px; margin-top:10px; }
      .speak-word { padding:2px 8px; border-radius:10px; font-size:13px; background:var(--bg-hover); color:var(--text-secondary); }
      .speak-word.hit { background:rgba(76,175,136,0.25); color:var(--success); }
      .speak-word.miss { background:rgba(232,90,90,0.2); color:var(--danger); text-decoration:line-through; }
      .speak-self-eval { display:flex; gap:8px; justify-content:center; margin-top:14px; flex-wrap:wrap; }
      .speak-star { font-size:26px; cursor:pointer; color:var(--text-muted); transition:var(--transition); }
      .speak-star.active { color:var(--warning); }
      .scene-grid { display:grid; gap:12px; grid-template-columns:repeat(2,1fr); }
      @media (max-width:600px){ .scene-grid { grid-template-columns:1fr; } }
      .scene-card {
        padding:16px; border:1px solid var(--border); border-radius:var(--radius-sm);
        background:var(--bg-card); cursor:pointer; transition:var(--transition);
      }
      .scene-card:hover { border-color:var(--accent); background:var(--bg-hover); }
      .scene-card .sc-title { font-weight:600; font-size:15px; }
      .scene-card .sc-meta { font-size:12px; color:var(--text-secondary); margin-top:4px; }
      .dialogue-prompt {
        background:var(--accent-bg); border-left:4px solid var(--accent); padding:14px 16px;
        border-radius:var(--radius-sm); margin:12px 0;
      }
      .dialogue-prompt .dp-label { font-size:12px; color:var(--accent); font-weight:600; }
      .dialogue-prompt .dp-cn { font-size:18px; margin-top:6px; }
      .dialogue-input {
        width:100%; padding:12px; background:var(--bg-card); border:2px solid var(--border);
        border-radius:var(--radius-sm); color:var(--text-primary); font-size:16px; margin:8px 0;
      }
      .dialogue-input:focus { outline:none; border-color:var(--accent); }
      .dialogue-answer {
        background:rgba(76,175,136,0.12); border-left:4px solid var(--success);
        padding:14px 16px; border-radius:var(--radius-sm); margin:12px 0;
      }
      .dialogue-answer .da-label { font-size:12px; color:var(--success); font-weight:600; }
      .dialogue-answer .da-en { font-size:18px; margin-top:6px; font-weight:600; }
      .rec-indicator {
        display:inline-flex; align-items:center; gap:6px; font-size:13px;
        padding:4px 10px; border-radius:12px; background:var(--bg-hover); color:var(--text-secondary);
      }
      .rec-indicator.on { background:rgba(232,90,90,0.2); color:var(--danger); }
      .rec-dot { width:8px; height:8px; border-radius:50%; background:currentColor; }
      .rec-indicator.on .rec-dot { animation:recPulse 1s infinite; }
      @keyframes recPulse { 0%,100%{opacity:1;} 50%{opacity:0.3;} }
    `;
    document.head.appendChild(style);
  },

  /* ===== 渲染外壳 ===== */
  _renderShell() {
    const container = this._container;
    const stats = this._calcStats();
    const lvl = this._getLevel(this.activeLevel);
    const lvlName = lvl ? lvl.name : '';
    const recNote = this._recSupported
      ? '<span class="rec-indicator"><span class="rec-dot"></span>语音识别可用</span>'
      : '<span class="rec-indicator"><span class="rec-dot"></span>语音识别不可用·自评模式</span>';

    container.innerHTML = `
      <div class="card">
        <div class="card-title">🗣️ 口语练习 · 跟读 · 情景对话 · 发音对比</div>
        <div class="progress-bar"><div class="progress-fill" style="width:${stats.pct}%"></div></div>
        <div class="font-sm text-secondary mt-16" style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;">
          <span>当前级别 <b>L${this.activeLevel} ${lvlName}</b> · 已完成 <b data-stat="done">${stats.done}</b> 次</span>
          <span class="listen-score">累计得分 <b data-stat="score">${stats.score}</b></span>
        </div>
        <div class="mt-16">${recNote}</div>
      </div>

      <div class="card">
        <div class="speak-mode-bar">
          <button class="btn ${this.mode === 'read' ? 'btn-primary' : 'btn-secondary'}" data-mode="read">📖 跟读练习</button>
          <button class="btn ${this.mode === 'dialogue' ? 'btn-primary' : 'btn-secondary'}" data-mode="dialogue">💬 情景对话</button>
          <button class="btn ${this.mode === 'compare' ? 'btn-primary' : 'btn-secondary'}" data-mode="compare">⚖️ 发音对比</button>
        </div>
        <div class="level-selector">
          ${this.data.levels.map(lv => `
            <button class="level-btn ${lv.level === this.activeLevel ? 'active' : ''}" data-level="${lv.level}">L${lv.level} · ${lv.name}</button>
          `).join('')}
        </div>
        <div class="speak-hint">💡 ${this._modeHint()}</div>
      </div>

      <div id="speakContent"></div>
    `;

    container.querySelectorAll('[data-mode]').forEach(b => {
      b.onclick = () => {
        this._stopRec();
        if ('speechSynthesis' in window) speechSynthesis.cancel();
        this.mode = b.dataset.mode;
        this._sceneId = null;
        this._poolIdx = 0;
        this._renderShell();
      };
    });
    container.querySelectorAll('[data-level]').forEach(b => {
      b.onclick = () => {
        this._stopRec();
        if ('speechSynthesis' in window) speechSynthesis.cancel();
        this.activeLevel = parseInt(b.dataset.level, 10);
        this._sceneId = null;
        this._poolIdx = 0;
        EM.progress.update(d => {
          if (!d.modules.speaking) d.modules.speaking = { completed: [], score: 0 };
          d.modules.speaking.current = this.activeLevel;
        });
        this._renderShell();
      };
    });

    this._renderContent();
  },

  _modeHint() {
    if (this.mode === 'read') return '跟读练习：听标准发音后大声跟读，系统识别后给出匹配率（不支持识别则自评）。';
    if (this.mode === 'dialogue') return '情景对话：选一个场景，看中文提示用英文回答，再对照参考答案自评。';
    return '发音对比：逐句听标准音并跟读，支持识别时给出词级对比，逐句练到准确。';
  },

  _renderContent() {
    const el = document.getElementById('speakContent');
    if (!el) return;
    if (this.mode === 'read') this._renderRead(el);
    else if (this.mode === 'dialogue') this._renderDialogue(el);
    else if (this.mode === 'compare') this._renderCompare(el);
  },

  /* ===== 工具 ===== */
  _getLevel(level) {
    return (this.data && this.data.levels || []).find(l => l.level === level) || null;
  },
  _levelExists(level) { return !!this._getLevel(level); },

  _calcStats() {
    const p = EM.progress.get();
    const completed = (p.modules.speaking && p.modules.speaking.completed) || [];
    return {
      done: completed.length,
      score: (p.modules.speaking && p.modules.speaking.score) || 0,
      pct: Math.min(100, completed.length * 5) // 每完成一次+5%，封顶
    };
  },

  _refreshStats() {
    const stats = this._calcStats();
    const c = this._container;
    if (!c) return;
    const fill = c.querySelector('.progress-fill');
    if (fill) fill.style.width = stats.pct + '%';
    const d = c.querySelector('[data-stat="done"]');
    if (d) d.textContent = stats.done;
    const s = c.querySelector('[data-stat="score"]');
    if (s) s.textContent = stats.score;
  },

  /* ===== 构建句子池（跟读/对比共用） ===== */
  _buildPool() {
    const lvl = this._getLevel(this.activeLevel);
    const pool = [];
    if (lvl && lvl.items) {
      lvl.items.forEach(it => {
        (it.lines || []).forEach(ln => {
          pool.push({ en: ln.en, cn: ln.cn, source: it.title });
        });
      });
    }
    // 追加词汇例句（若加载成功）
    if (this.vocab && this.vocab.levels) {
      const vlvl = this.vocab.levels.find(l => l.level === this.activeLevel);
      if (vlvl && vlvl.words) {
        vlvl.words.forEach(w => {
          if (w.example) pool.push({ en: w.example, cn: w.exampleCn || '', source: '词汇·' + w.word });
        });
      }
    }
    return pool;
  },

  /* 发音（单句，带 onEnd） */
  _speak(text, onEnd) {
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

  /* ===== 语音识别：单次识别 ===== */
  _startRec(onResult, onEnd) {
    if (!this._recSupported) { if (onEnd) onEnd(); return; }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SR();
    rec.lang = 'en-US';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.continuous = false;
    this._recognizing = true;
    this._updateRecIndicator(true);
    rec.onresult = (e) => {
      const transcript = e.results[0][0].transcript;
      onResult && onResult(transcript);
    };
    rec.onerror = () => {
      this._recognizing = false;
      this._updateRecIndicator(false);
      if (onEnd) onEnd();
    };
    rec.onend = () => {
      this._recognizing = false;
      this._updateRecIndicator(false);
      if (onEnd) onEnd();
    };
    try { rec.start(); }
    catch (e) {
      // 可能已启动或权限问题
      this._recognizing = false;
      this._updateRecIndicator(false);
      if (onEnd) onEnd();
    }
  },

  _stopRec() {
    // SpeechRecognition 实例为局部，这里仅更新状态；实际识别会自然结束
    this._recognizing = false;
    this._updateRecIndicator(false);
  },

  _updateRecIndicator(on) {
    document.querySelectorAll('.rec-indicator.on-live').forEach(n => {
      n.classList.toggle('on', !!on);
    });
  },

  /* ===== 单词匹配率（忽略大小写与标点） ===== */
  _tokenize(s) {
    return (s || '').toLowerCase().replace(/[^a-z0-9'\s]/g, ' ').split(/\s+/).filter(Boolean);
  },
  _matchRate(standard, recognized) {
    const s = this._tokenize(standard);
    const r = this._tokenize(recognized);
    if (!s.length) return { rate: 0, hit: 0, total: 0, words: [] };
    const rCount = {};
    r.forEach(w => { rCount[w] = (rCount[w] || 0) + 1; });
    let hit = 0;
    const words = s.map(w => {
      let isHit = false;
      if (rCount[w] && rCount[w] > 0) { rCount[w]--; hit++; isHit = true; }
      return { word: w, hit: isHit };
    });
    return { rate: s.length ? hit / s.length : 0, hit, total: s.length, words };
  },

  /* ================= 跟读练习 ================= */

  _renderRead(el) {
    if (!this._pool || !this._pool.length) {
      this._pool = this._buildPool();
      this._poolIdx = 0;
    }
    if (!this._pool.length) {
      el.innerHTML = '<div class="card"><p class="text-secondary">该级别暂无可跟读的句子。</p></div>';
      return;
    }
    if (this._poolIdx >= this._pool.length) this._poolIdx = 0;
    const s = this._pool[this._poolIdx];
    const pos = (this._poolIdx + 1) + ' / ' + this._pool.length;

    el.innerHTML = `
      <div class="card">
        <div class="flex justify-between align-center mb-16">
          <span class="font-sm text-secondary">位置 ${pos}</span>
          <span class="font-sm text-secondary">L${this.activeLevel}</span>
        </div>
        <div class="speak-sentence-card">
          <div class="speak-sentence-en" id="readEn">${EM.ui.esc(s.en)}</div>
          <div class="speak-sentence-cn">${EM.ui.esc(s.cn || '')}</div>
          <div class="speak-source">来源：${EM.ui.esc(s.source)}</div>
        </div>
        <div class="speak-controls">
          <button class="btn btn-primary" id="readPlay">🔊 听标准音</button>
          <button class="btn btn-primary" id="readSlow">🐢 慢速发音</button>
          ${this._recSupported
            ? '<button class="btn btn-success" id="readRec">🎙 开始跟读</button>'
            : '<span class="rec-indicator">不支持识别·请自评</span>'}
          <button class="btn btn-secondary" id="readNext">下一句 ➡️</button>
        </div>
        <div id="readResult"></div>
      </div>
    `;

    document.getElementById('readPlay').onclick = () => this._speak(s.en);
    document.getElementById('readSlow').onclick = () => this._speak(s.en); // 慢速复用，可通过设置调语速
    document.getElementById('readNext').onclick = () => {
      this._poolIdx++;
      this._renderRead(el);
    };
    const recBtn = document.getElementById('readRec');
    if (recBtn) {
      recBtn.onclick = () => {
        if (this._recognizing) return;
        recBtn.disabled = true;
        recBtn.textContent = '🎙 识别中…';
        // 先播放标准音再开始识别
        this._speak(s.en, () => {
          this._startRec(
            (transcript) => this._showReadResult(s, transcript, el),
            () => { recBtn.disabled = false; recBtn.textContent = '🎙 开始跟读'; }
          );
        });
      };
    }

    // 不支持识别则提供自评
    if (!this._recSupported) {
      const r = document.getElementById('readResult');
      r.innerHTML = this._selfEvalHtml('read');
      this._bindSelfEval(r, s, el);
    }
  },

  _showReadResult(s, transcript, el) {
    const r = document.getElementById('readResult');
    if (!r) return;
    const m = this._matchRate(s.en, transcript);
    const pct = Math.round(m.rate * 100);
    r.innerHTML = `
      <div class="speak-result">
        <div class="sr-label">你说的是：</div>
        <div class="sr-transcript">${EM.ui.esc(transcript)}</div>
        <div class="speak-match-bar"><div class="speak-match-fill" style="width:${pct}%"></div></div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;">
          <span class="font-sm text-secondary">匹配率</span>
          <span class="sr-rate">${pct}%</span>
        </div>
        <div class="speak-word-diff">
          ${m.words.map(w => `<span class="speak-word ${w.hit ? 'hit' : 'miss'}">${EM.ui.esc(w.word)}</span>`).join('')}
        </div>
        <div class="speak-self-eval">
          <button class="btn btn-success btn-sm" id="readGood">✓ 掌握了</button>
          <button class="btn btn-secondary btn-sm" id="readRetry">🔄 再读一次</button>
        </div>
      </div>
    `;
    const good = document.getElementById('readGood');
    if (good) good.onclick = () => this._recordReadSuccess(s, pct, el);
    const retry = document.getElementById('readRetry');
    if (retry) retry.onclick = () => { r.innerHTML = ''; };
  },

  _selfEvalHtml() {
    return `
      <div class="speak-result">
        <div class="sr-label">自评：听标准音后跟读，给自己打分</div>
        <div class="speak-self-eval" id="selfStars">
          <span class="speak-star" data-v="1">★</span>
          <span class="speak-star" data-v="2">★</span>
          <span class="speak-star" data-v="3">★</span>
          <span class="speak-star" data-v="4">★</span>
          <span class="speak-star" data-v="5">★</span>
        </div>
        <div class="font-sm text-secondary text-center mt-16" id="selfHint">点击星星自评（3 星及以上算掌握）</div>
      </div>
    `;
  },

  _bindSelfEval(r, s, el) {
    let chosen = 0;
    r.querySelectorAll('.speak-star').forEach(star => {
      star.onclick = () => {
        chosen = parseInt(star.dataset.v, 10);
        r.querySelectorAll('.speak-star').forEach((st, i) => st.classList.toggle('active', i < chosen));
        const hint = document.getElementById('selfHint');
        if (hint) hint.textContent = chosen >= 3 ? `自评 ${chosen} 星 · 已掌握 ✓` : `自评 ${chosen} 星 · 继续练习`;
        // 记分：自评星数 * 20 作为本句得分
        const score = chosen * 20;
        this._recordRead(s, score, chosen >= 3, el);
      };
    });
  },

  _recordReadSuccess(s, pct, el) {
    // 识别模式：匹配率 >=60% 算掌握，得分 = 匹配率
    const ok = pct >= 60;
    this._recordRead(s, pct, ok, el);
    EM.ui.toast(ok ? `匹配 ${pct}% · 已掌握 ✓` : `匹配 ${pct}% · 继续练习`);
  },

  _recordRead(s, score, ok, el) {
    EM.progress.update(d => {
      if (!d.modules.speaking) d.modules.speaking = { completed: [], score: 0 };
      if (!d.modules.speaking.completed) d.modules.speaking.completed = [];
      const key = `read_${this.activeLevel}_${s.source}`;
      if (ok && !d.modules.speaking.completed.includes(key)) {
        d.modules.speaking.completed.push(key);
      }
      d.modules.speaking.score = (d.modules.speaking.score || 0) + Math.round(score / 5);
    });
    this._refreshStats();
  },

  /* ================= 情景对话 ================= */

  _renderDialogue(el) {
    // 未选场景：显示场景列表（来自当前级别对话）
    if (!this._sceneId) {
      const lvl = this._getLevel(this.activeLevel);
      if (!lvl || !lvl.items || !lvl.items.length) {
        el.innerHTML = '<div class="card"><p class="text-secondary">该级别暂无场景。</p></div>';
        return;
      }
      el.innerHTML = `
        <div class="card">
          <div class="card-title">💬 选择情景场景（L${this.activeLevel}）</div>
          <div class="scene-grid">
            ${lvl.items.map(it => `
              <div class="scene-card" data-id="${EM.ui.esc(it.id)}">
                <div class="sc-title">${EM.ui.esc(it.title)}</div>
                <div class="sc-meta">${EM.ui.esc(it.cn || '')} · ${it.lines.length} 轮对话</div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
      el.querySelectorAll('.scene-card').forEach(c => {
        c.onclick = () => {
          this._sceneId = c.dataset.id;
          this._dialogueIdx = 0;
          this._dialogueRevealed = false;
          this._dialogueInput = '';
          this._renderContent();
        };
      });
      return;
    }

    // 已选场景：逐轮对话练习
    const item = this._sceneItem();
    if (!item) {
      el.innerHTML = '<div class="card"><p class="text-secondary">场景不存在。</p></div>';
      return;
    }
    if (this._dialogueIdx >= item.lines.length) {
      // 全部完成
      EM.progress.update(d => {
        if (!d.modules.speaking) d.modules.speaking = { completed: [], score: 0 };
        const key = `dialogue_${item.id}`;
        if (!d.modules.speaking.completed.includes(key)) d.modules.speaking.completed.push(key);
        d.modules.speaking.score = (d.modules.speaking.score || 0) + 10;
      });
      this._refreshStats();
      el.innerHTML = `
        <div class="card">
          <div class="quiz-result text-success">🎉 场景对话完成！</div>
          <div class="text-center mt-16">
            <button class="btn btn-primary" id="dlgRestart">🔄 重新练</button>
            <button class="btn btn-secondary" id="dlgBack">返回场景列表</button>
          </div>
        </div>
      `;
      document.getElementById('dlgRestart').onclick = () => {
        this._dialogueIdx = 0;
        this._dialogueRevealed = false;
        this._renderContent();
      };
      document.getElementById('dlgBack').onclick = () => {
        this._sceneId = null;
        this._renderContent();
      };
      EM.ui.toast('场景对话完成 +10');
      return;
    }

    const line = item.lines[this._dialogueIdx];
    const pos = (this._dialogueIdx + 1) + ' / ' + item.lines.length;

    el.innerHTML = `
      <div class="card">
        <div class="flex justify-between align-center mb-16">
          <button class="btn btn-secondary btn-sm" id="dlgList">⬅️ 场景列表</button>
          <span class="font-sm text-secondary">${EM.ui.esc(item.title)} · 第 ${pos} 轮</span>
        </div>
        <div class="dialogue-prompt">
          <div class="dp-label">中文提示（请用英文说出/写出 A 或 B 该说的话）</div>
          <div class="dp-cn">[${EM.ui.esc(line.speaker)}] ${EM.ui.esc(line.cn)}</div>
        </div>
        <input type="text" class="dialogue-input" id="dlgInput" placeholder="在这里输入你的英文回答..." value="${EM.ui.esc(this._dialogueInput)}" autocomplete="off">
        <div class="speak-controls">
          ${this._recSupported ? '<button class="btn btn-primary" id="dlgRec">🎙 语音输入</button>' : ''}
          <button class="btn btn-secondary" id="dlgPlay">🔊 听参考音</button>
          <button class="btn btn-success" id="dlgReveal">✓ 显示参考答案</button>
        </div>
        <div id="dlgAnswerArea"></div>
      </div>
    `;

    document.getElementById('dlgList').onclick = () => {
      this._sceneId = null;
      this._renderContent();
    };
    const input = document.getElementById('dlgInput');
    if (input) {
      input.oninput = () => { this._dialogueInput = input.value; };
      input.onkeydown = (e) => { if (e.key === 'Enter') document.getElementById('dlgReveal').click(); };
    }
    const recBtn = document.getElementById('dlgRec');
    if (recBtn) {
      recBtn.onclick = () => {
        if (this._recognizing) return;
        recBtn.disabled = true;
        recBtn.textContent = '🎙 识别中…';
        this._startRec(
          (transcript) => { if (input) { input.value = transcript; this._dialogueInput = transcript; } },
          () => { recBtn.disabled = false; recBtn.textContent = '🎙 语音输入'; }
        );
      };
    }
    document.getElementById('dlgPlay').onclick = () => this._speak(line.en);
    document.getElementById('dlgReveal').onclick = () => {
      this._dialogueRevealed = true;
      const area = document.getElementById('dlgAnswerArea');
      const userEn = (this._dialogueInput || '').trim();
      // 简单相似度：词级匹配
      const m = userEn ? this._matchRate(line.en, userEn) : null;
      const pct = m ? Math.round(m.rate * 100) : 0;
      area.innerHTML = `
        <div class="dialogue-answer">
          <div class="da-label">参考答案</div>
          <div class="da-en">${EM.ui.esc(line.en)}</div>
          ${userEn ? `<div class="font-sm text-secondary mt-16" style="margin-top:10px;">你的回答：${EM.ui.esc(userEn)} <span class="text-accent">(${pct}% 相似)</span></div>` : ''}
        </div>
        <div class="speak-self-eval">
          <button class="btn btn-success btn-sm" id="dlgGood">✓ 我答对了，下一轮</button>
          <button class="btn btn-secondary btn-sm" id="dlgRetry">🔄 再试一次</button>
        </div>
      `;
      document.getElementById('dlgGood').onclick = () => {
        this._dialogueIdx++;
        this._dialogueRevealed = false;
        this._dialogueInput = '';
        this._renderContent();
      };
      document.getElementById('dlgRetry').onclick = () => {
        this._dialogueRevealed = false;
        this._renderContent();
      };
    };
  },

  _sceneItem() {
    const lvl = this._getLevel(this.activeLevel);
    if (!lvl || !this._sceneId) return null;
    return (lvl.items || []).find(i => i.id === this._sceneId) || null;
  },

  /* ================= 发音对比 ================= */

  _renderCompare(el) {
    if (!this._pool || !this._pool.length || this._pool[0]._compare !== true) {
      this._pool = this._buildPool();
      this._poolIdx = 0;
    }
    if (!this._pool.length) {
      el.innerHTML = '<div class="card"><p class="text-secondary">该级别暂无可对比的句子。</p></div>';
      return;
    }
    if (this._poolIdx >= this._pool.length) this._poolIdx = 0;
    const s = this._pool[this._poolIdx];
    const pos = (this._poolIdx + 1) + ' / ' + this._pool.length;

    el.innerHTML = `
      <div class="card">
        <div class="flex justify-between align-center mb-16">
          <span class="font-sm text-secondary">位置 ${pos}</span>
          <span class="font-sm text-secondary">L${this.activeLevel}</span>
        </div>
        <div class="speak-sentence-card">
          <div class="speak-sentence-en" id="cmpEn">${EM.ui.esc(s.en)}</div>
          <div class="speak-sentence-cn">${EM.ui.esc(s.cn || '')}</div>
          <div class="speak-source">来源：${EM.ui.esc(s.source)}</div>
        </div>
        <div class="speak-controls">
          <button class="btn btn-primary" id="cmpPlay">🔊 听标准音</button>
          ${this._recSupported
            ? '<button class="btn btn-success" id="cmpRec">🎙 跟读并对比</button>'
            : '<span class="rec-indicator">不支持识别·请自评</span>'}
          <button class="btn btn-secondary" id="cmpNext">下一句 ➡️</button>
        </div>
        <div id="cmpResult"></div>
      </div>
    `;

    document.getElementById('cmpPlay').onclick = () => this._speak(s.en);
    document.getElementById('cmpNext').onclick = () => {
      this._poolIdx++;
      this._renderCompare(el);
    };
    const recBtn = document.getElementById('cmpRec');
    if (recBtn) {
      recBtn.onclick = () => {
        if (this._recognizing) return;
        recBtn.disabled = true;
        recBtn.textContent = '🎙 识别中…';
        this._speak(s.en, () => {
          this._startRec(
            (transcript) => this._showCompareResult(s, transcript, el),
            () => { recBtn.disabled = false; recBtn.textContent = '🎙 跟读并对比'; }
          );
        });
      };
    }
    if (!this._recSupported) {
      const r = document.getElementById('cmpResult');
      r.innerHTML = this._selfEvalHtml();
      this._bindSelfEval(r, s, el);
    }
  },

  _showCompareResult(s, transcript, el) {
    const r = document.getElementById('cmpResult');
    if (!r) return;
    const m = this._matchRate(s.en, transcript);
    const pct = Math.round(m.rate * 100);
    r.innerHTML = `
      <div class="speak-result">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
          <div>
            <div class="sr-label">标准</div>
            <div class="sr-transcript">${EM.ui.esc(s.en)}</div>
          </div>
          <div style="text-align:right;">
            <div class="sr-label">你的发音</div>
            <div class="sr-transcript">${EM.ui.esc(transcript)}</div>
          </div>
        </div>
        <div class="speak-match-bar"><div class="speak-match-fill" style="width:${pct}%"></div></div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;">
          <span class="font-sm text-secondary">词级匹配</span>
          <span class="sr-rate">${pct}%</span>
        </div>
        <div class="speak-word-diff">
          ${m.words.map(w => `<span class="speak-word ${w.hit ? 'hit' : 'miss'}">${EM.ui.esc(w.word)}</span>`).join('')}
        </div>
        <div class="speak-self-eval">
          <button class="btn btn-success btn-sm" id="cmpGood">✓ 掌握，下一句</button>
          <button class="btn btn-secondary btn-sm" id="cmpRetry">🔄 再读一次</button>
        </div>
      </div>
    `;
    document.getElementById('cmpGood').onclick = () => {
      this._recordRead(s, pct, pct >= 60, el);
      this._poolIdx++;
      this._renderCompare(el);
    };
    document.getElementById('cmpRetry').onclick = () => { r.innerHTML = ''; };
  }
};

/* 注册模块：路由 navigate('speaking') 时调用 EM.modules.speaking.render(container) */
EM.registerModule('speaking', EM.speaking);
