/* ===== 自适应测试模块 (Adaptive Test) =====
 * 测试类型：拼读 / 词汇 / 语法 / 综合
 * 自适应算法：根据用户当前级别和弱项动态选题
 *   - 起始难度 = max(progress.level, progress.modules.test.currentLevel)
 *   - 答对 → 难度 +1（封顶 5）
 *   - 答错 → 难度 -1（封底 0） + 记入 progress.weaknesses
 *   - 综合测试按类型轮换，混合抽取
 * 题型：选择题为主，拼写题为辅
 * 计时：开始测试即启动，结束停止
 * 数据源：EM.data.load('phonics'/'vocabulary'/'grammar')
 * 兼容 iOS Safari（所有 TTS 由用户点击触发，不自动播放）
 */
window.EM = window.EM || {};

EM.test = {
  phonicsData: null,    // phonics.json
  vocabData: null,       // vocabulary.json
  grammarData: null,     // grammar.json
  _container: null,      // 当前渲染容器
  mode: 'menu',          // 'menu' | 'testing' | 'result'
  testType: 'mixed',     // 'phonics' | 'vocabulary' | 'grammar' | 'mixed'
  totalQuestions: 10,     // 每次测试题数
  questions: [],          // 生成的题目列表
  qIdx: 0,                // 当前题号
  difficulty: 1,          // 当前自适应难度 0-5
  startLevel: 0,          // 起始难度
  correct: 0,             // 答对数
  wrongList: [],          // 错题（含 weakness 标签）
  startTime: 0,           // 起始时间戳
  timerId: null,          // 计时器句柄
  answered: false,        // 当前题已作答

  /* ===== 入口：由路由调用 ===== */
  async render(container) {
    this._container = container;
    this._injectStyles();
    container.innerHTML = '<div class="loading">加载测试题库中...</div>';

    // 并行加载数据（带缓存，已加载则直接返回）
    const [ph, vo, gr] = await Promise.all([
      EM.data.load('phonics'),
      EM.data.load('vocabulary'),
      EM.data.load('grammar')
    ]);
    this.phonicsData = ph;
    this.vocabData = vo;
    this.grammarData = gr;

    if (!this.phonicsData || !this.vocabData || !this.grammarData) {
      container.innerHTML = '<div class="card"><p>题库数据加载失败，请刷新重试。</p></div>';
      return;
    }

    // 默认进入菜单
    this.mode = 'menu';
    this._renderMenu();
  },

  /* ===== 注入本模块专用样式 ===== */
  _injectStyles() {
    if (document.getElementById('test-styles')) return;
    const style = document.createElement('style');
    style.id = 'test-styles';
    style.textContent = `
      .test-type-grid { display:grid; grid-template-columns:repeat(2,1fr); gap:12px; }
      @media (max-width:560px) { .test-type-grid { grid-template-columns:1fr; } }
      .test-type-card {
        padding:18px 16px; border:1px solid var(--border); border-radius:var(--radius);
        background:var(--bg-card); cursor:pointer; transition:var(--transition);
        display:flex; flex-direction:column; gap:6px;
      }
      .test-type-card:hover { border-color:var(--accent); background:var(--bg-hover); transform:translateY(-2px); }
      .test-type-card .ttc-icon { font-size:28px; }
      .test-type-card .ttc-name { font-size:16px; font-weight:700; }
      .test-type-card .ttc-desc { font-size:13px; color:var(--text-secondary); }
      .test-type-card .ttc-tag {
        font-size:11px; color:var(--accent); margin-top:4px;
        padding:2px 8px; background:var(--accent-bg); border-radius:8px; align-self:flex-start;
      }
      .test-head {
        display:flex; justify-content:space-between; align-items:center; gap:8px;
        margin-bottom:12px; flex-wrap:wrap;
      }
      .test-progress-text { font-size:14px; color:var(--text-secondary); }
      .test-difficulty {
        font-size:12px; padding:4px 10px; border-radius:12px; font-weight:600;
        background:var(--accent-bg); color:var(--accent);
      }
      .test-timer {
        font-size:13px; padding:4px 10px; border-radius:8px;
        background:var(--bg-card); border:1px solid var(--border); color:var(--text-primary);
        font-variant-numeric:tabular-nums;
      }
      .test-question {
        font-size:18px; font-weight:600; margin:16px 0; line-height:1.6;
      }
      .test-options { display:flex; flex-direction:column; gap:10px; margin-bottom:14px; }
      .test-option {
        padding:14px 16px; border:1px solid var(--border); border-radius:var(--radius-sm);
        background:var(--bg-card); cursor:pointer; transition:var(--transition);
        font-size:15px; text-align:left; color:var(--text-primary); font-family:inherit;
      }
      .test-option:hover { border-color:var(--accent); background:var(--bg-hover); }
      .test-option:disabled { cursor:not-allowed; }
      .test-option.correct { border-color:var(--success); background:rgba(76,175,136,0.15); color:var(--success); font-weight:600; }
      .test-option.wrong { border-color:var(--danger); background:rgba(232,90,90,0.15); color:var(--danger); }
      .test-spell-input {
        flex:1; padding:12px 14px; background:var(--bg-card);
        border:1px solid var(--border); border-radius:var(--radius-sm);
        color:var(--text-primary); font-size:16px; font-family:inherit;
      }
      .test-spell-input:focus { outline:none; border-color:var(--accent); }
      .test-spell-input.correct { border-color:var(--success); background:rgba(76,175,136,0.15); }
      .test-spell-input.wrong { border-color:var(--danger); background:rgba(232,90,90,0.15); }
      .test-feedback { padding:12px 14px; border-radius:var(--radius-sm); margin-bottom:12px; font-size:14px; line-height:1.6; }
      .test-feedback.ok { background:rgba(76,175,136,0.12); border-left:3px solid var(--success); color:var(--success); }
      .test-feedback.no { background:rgba(232,90,90,0.12); border-left:3px solid var(--danger); color:var(--danger); }
      .test-result { text-align:center; padding:20px 10px; }
      .test-result .big-score {
        font-size:48px; font-weight:700; color:var(--accent); margin:10px 0;
      }
      .test-result .big-emoji { font-size:48px; }
      .test-result-rows { margin-top:16px; }
      .test-result-row {
        display:flex; justify-content:space-between; padding:10px 0;
        border-bottom:1px dashed var(--border); font-size:14px;
      }
      .test-result-row:last-child { border-bottom:none; }
      .test-weakness-list { display:flex; flex-wrap:wrap; gap:6px; margin-top:8px; }
      .test-weak-tag {
        font-size:12px; padding:3px 10px; border-radius:10px;
        background:rgba(240,160,64,0.15); color:var(--warning);
      }
    `;
    document.head.appendChild(style);
  },

  /* ================= 菜单 ================= */

  _renderMenu() {
    this.mode = 'menu';
    const container = this._container;
    const p = EM.progress.get();
    const history = (p.modules.test && p.modules.test.history) || [];
    const last = history[history.length - 1];
    const weakCount = Object.values(p.weaknesses).reduce((s, a) => s + a.length, 0);
    const curLevel = (p.modules.test && p.modules.test.currentLevel) || p.level;

    const lv = EM.LEVELS[curLevel] || EM.LEVELS[0];
    const grad = p.graduation || { passed:false, date:null, scores:{} };
    const gradDone = grad.scores && Object.keys(grad.scores).length;

    container.innerHTML = `
      <div class="card">
        <div class="card-title">🎯 自适应测试 · 根据你的水平动态调节难度</div>
        <div class="grid grid-3 mt-16">
          <div class="stat-card">
            <div class="stat-value">L${curLevel}</div>
            <div class="stat-label">当前难度</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${history.length}</div>
            <div class="stat-label">已完成测试</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${weakCount}</div>
            <div class="stat-label">弱项待巩固</div>
          </div>
        </div>
        <div class="font-sm text-secondary mt-16">
          ${last ? `📅 上次测试：${last.type} · 正确率 ${(last.accuracy * 100).toFixed(0)}% · ${last.correct}/${last.total} · 建议级别 L${last.endLevel}`
                 : '🎯 还没有测试记录，先来一次摸底吧！'}
        </div>
      </div>

      <div class="card">
        <div class="card-title">选择测试类型</div>
        <div class="test-type-grid mt-16" id="testTypeGrid">
          <div class="test-type-card" data-type="phonics">
            <div class="ttc-icon">🔤</div>
            <div class="ttc-name">拼读测试</div>
            <div class="ttc-desc">字母发音 / CVC / 字母组合 / Magic E</div>
            <span class="ttc-tag">L0+ · 适合零基础</span>
          </div>
          <div class="test-type-card" data-type="vocabulary">
            <div class="ttc-icon">📚</div>
            <div class="ttc-name">词汇测试</div>
            <div class="ttc-desc">英汉互译 / 词义选择 / 拼写</div>
            <span class="ttc-tag">L1+ · 适合入门以上</span>
          </div>
          <div class="test-type-card" data-type="grammar">
            <div class="ttc-icon">📖</div>
            <div class="ttc-name">语法测试</div>
            <div class="ttc-desc">时态 / 从句 / 被动 / 虚拟等</div>
            <span class="ttc-tag">L1+ · 适合入门以上</span>
          </div>
          <div class="test-type-card" data-type="mixed">
            <div class="ttc-icon">🏆</div>
            <div class="ttc-name">综合测试</div>
            <div class="ttc-desc">拼读 + 词汇 + 语法混合</div>
            <span class="ttc-tag">L0+ · 全面摸底</span>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-title">🎓 毕业测试 · 冲击 C2 母语水平</div>
        <div class="font-sm text-secondary" style="line-height:1.7; margin-bottom:12px;">
          终极考核，全面检测 <b>听 / 说 / 读 / 写 / 词汇 / 语法</b> 6 个维度，<b>全部通过</b>才算正式毕业达到 C2 母语水平。
        </div>
        ${grad.passed ? `
          <div class="card" style="background:rgba(76,175,136,0.12); border:1px solid var(--success); padding:10px 12px;">
            <div style="color:var(--success); font-weight:600;">🎉 已通过毕业测试</div>
            <div class="font-sm text-secondary" style="margin-top:4px;">毕业日期：${grad.date ? new Date(grad.date).toLocaleDateString('zh-CN') : '未知'}</div>
          </div>
          <div class="flex gap-8 flex-wrap mt-16" style="margin-top:12px;">
            <button class="btn btn-secondary" id="gradStartBtn">🔄 重新挑战毕业测试</button>
            <button class="btn btn-secondary" id="gradViewBtn">📊 查看上次成绩</button>
          </div>
        ` : `
          <div class="font-sm" style="margin-bottom:10px; padding:8px 12px; background:var(--accent-bg); border-radius:8px;">
            当前级别：<b>L${curLevel} · ${lv.cn}</b>
            ${curLevel >= 4
              ? '<span class="text-success" style="margin-left:8px;">✓ 满足毕业测试条件</span>'
              : '<span class="text-danger" style="margin-left:8px;">✗ 需达到 L4 高级</span>'}
          </div>
          <button class="btn btn-primary" id="gradStartBtn">🚀 进入毕业测试</button>
          ${gradDone ? '<button class="btn btn-secondary" id="gradViewBtn" style="margin-left:8px;">📊 查看上次成绩</button>' : ''}
        `}
      </div>

      <div class="card">
        <div class="card-title">📋 自适应说明</div>
        <div class="font-sm text-secondary" style="line-height:1.8;">
          • 起始难度根据你的当前级别自动设置<br>
          • 答对一题 → 下一题难度 +1（封顶 L5）<br>
          • 答错一题 → 下一题难度 -1（封底 L0），并自动记入弱项<br>
          • 弱项会在「学习进度」页显示，下次测试优先抽取弱项相关题型<br>
          • 每次测试共 ${this.totalQuestions} 题，含选择题与拼写题
        </div>
      </div>
    `;

    // 绑定类型卡点击
    container.querySelectorAll('[data-type]').forEach(card => {
      card.onclick = () => this._startTest(card.dataset.type);
    });
    // 毕业测试按钮
    const gradBtn = document.getElementById('gradStartBtn');
    if (gradBtn) gradBtn.onclick = () => this._startGraduation();
    const gradViewBtn = document.getElementById('gradViewBtn');
    if (gradViewBtn) gradViewBtn.onclick = () => this._renderGradResult(grad.scores, grad.passed);
  },

  /* ================= 开始测试 ================= */

  _startTest(type) {
    this.testType = type;
    this.qIdx = 0;
    this.correct = 0;
    this.wrongList = [];
    this.answered = false;

    // 起始难度：综合进度中的测试级别 + 用户主级别取大
    const p = EM.progress.get();
    const testLvl = (p.modules.test && p.modules.test.currentLevel) || 0;
    this.startLevel = Math.max(testLvl, p.level || 0);
    this.difficulty = this.startLevel;

    // 生成题目列表
    this.questions = this._generateQuestions(type, this.difficulty);
    if (!this.questions.length) {
      EM.ui.toast('该类型暂无可用题目');
      return;
    }

    // 计时开始
    this.startTime = Date.now();
    this._startTimer();

    // 进入测试视图
    this.mode = 'testing';
    this._renderQuestion();
  },

  /* ===== 生成题目列表（按类型与初始难度） ===== */
  _generateQuestions(type, initLevel) {
    const list = [];
    let diff = initLevel;
    const types = type === 'mixed' ? ['phonics', 'vocabulary', 'grammar'] : [type];

    for (let i = 0; i < this.totalQuestions; i++) {
      // 综合模式按顺序轮换类型
      const t = type === 'mixed' ? types[i % 3] : type;
      const q = this._pickQuestion(t, diff);
      if (q) {
        list.push(q);
      } else {
        // 该难度无题，回退到该类型任意题
        const fb = this._pickQuestion(t, null);
        if (fb) list.push(fb);
      }
      // 预生成下一题难度（模拟自适应，正式作答时再调整）
      // 这里只是占位，真实难度调整在 _answer 中执行
    }
    return list;
  },

  /* ===== 按类型和难度抽题 ===== */
  _pickQuestion(type, level) {
    if (type === 'phonics') return this._pickPhonics(level);
    if (type === 'vocabulary') return this._pickVocab(level);
    if (type === 'grammar') return this._pickGrammar(level);
    return null;
  },

  /* ----- 拼读题生成 ----- */
  _pickPhonics(level) {
    const data = this.phonicsData;
    if (!data) return null;
    // 按级别选择题型素材
    // L0-1: letters/cvc；L2: blends/magicE/vowels；L3+: vowelTeams/rControlled
    const pools = [];
    if (level <= 1) {
      pools.push({ kind: 'letter_sound', items: data.letters || [] });
      pools.push({ kind: 'cvc_split', items: data.cvc || [] });
    }
    if (level >= 1 && level <= 3) {
      pools.push({ kind: 'blend_sound', items: data.blends || [] });
      pools.push({ kind: 'vowel_sound', items: data.vowels || [] });
      pools.push({ kind: 'magic_e', items: data.magicE || [] });
    }
    if (level >= 3) {
      pools.push({ kind: 'vowel_team', items: data.vowelTeams || [] });
      pools.push({ kind: 'r_controlled', items: data.rControlled || [] });
    }
    // 全级别兜底
    if (!pools.length) pools.push({ kind: 'letter_sound', items: data.letters || [] });

    // 优先从弱项中抽
    const p = EM.progress.get();
    const weakSet = new Set((p.weaknesses.phonics || []).map(s => s));
    let pool = pools[Math.floor(Math.random() * pools.length)];
    let item = null;
    // 弱项池中找匹配
    for (const pl of pools) {
      const wMatch = pl.items.filter(it => {
        const key = this._phonicsKey(pl.kind, it);
        return weakSet.has(key);
      });
      if (wMatch.length && Math.random() < 0.6) {
        pool = pl;
        item = wMatch[Math.floor(Math.random() * wMatch.length)];
        break;
      }
    }
    if (!item) item = pool.items[Math.floor(Math.random() * pool.items.length)];
    if (!item) return null;

    return this._buildPhonicsQ(pool.kind, item, level);
  },

  _phonicsKey(kind, item) {
    if (kind === 'letter_sound') return 'letter:' + (item.letter || '');
    if (kind === 'cvc_split') return 'cvc:' + (item.word || '');
    if (kind === 'blend_sound') return 'blend:' + (item.combo || '');
    if (kind === 'vowel_sound') return 'vowel:' + (item.combo || '');
    if (kind === 'magic_e') return 'magice:' + (item.short || '');
    if (kind === 'vowel_team') return 'vowelteam:' + (item.combo || '');
    if (kind === 'r_controlled') return 'rctrl:' + (item.combo || '');
    return '';
  },

  _buildPhonicsQ(kind, item, level) {
    // 1) 字母发音：选择题
    if (kind === 'letter_sound') {
      const sound = item.sound || '';
      const distractors = this._randomDistractors(
        (this.phonicsData.letters || []).map(l => l.sound),
        sound, 3
      );
      const options = this._shuffle([sound].concat(distractors));
      return {
        type: 'mc',
        category: 'phonics',
        level: level,
        prompt: `字母「${item.letter}」的发音是？`,
        options: options,
        answer: sound,
        speakText: item.letter,
        weakness: this._phonicsKey(kind, item),
        explain: `字母 ${item.letter} 发音为 ${sound}。例词：${item.word}（${item.cn}）。`
      };
    }
    // 2) CVC 拼写：拼写题
    if (kind === 'cvc_split') {
      return {
        type: 'spell',
        category: 'phonics',
        level: level,
        prompt: `请拼写下列单词（含义：${item.cn}）\n音标：${item.sound}\n拆分：${item.split}`,
        answer: item.word,
        speakText: item.word,
        weakness: this._phonicsKey(kind, item),
        explain: `正确拼写：${item.word}（${item.cn}）。`
      };
    }
    // 3) 辅音组合/元音组合：发音选择题
    if (kind === 'blend_sound' || kind === 'vowel_team' || kind === 'r_controlled') {
      const sound = item.sound || '';
      const pool = kind === 'blend_sound' ? (this.phonicsData.blends || [])
                  : kind === 'vowel_team' ? (this.phonicsData.vowelTeams || [])
                  : (this.phonicsData.rControlled || []);
      const distractors = this._randomDistractors(pool.map(p => p.sound), sound, 3);
      const options = this._shuffle([sound].concat(distractors));
      const label = kind === 'blend_sound' ? '辅音组合' : kind === 'vowel_team' ? '元音组合' : 'R控制元音';
      return {
        type: 'mc',
        category: 'phonics',
        level: level,
        prompt: `${label}「${item.combo}」的发音是？`,
        options: options,
        answer: sound,
        speakText: (item.words || [])[0] || item.combo,
        weakness: this._phonicsKey(kind, item),
        explain: `${label} ${item.combo} 发音为 ${sound}。例词：${(item.words || []).slice(0,3).join(' / ')}。`
      };
    }
    // 4) 元音字母：短/长音选择题
    if (kind === 'vowel_sound') {
      const shortS = item.short || '';
      const longS = item.long || '';
      const distractors = this._randomDistractors(
        (this.phonicsData.vowels || []).flatMap(v => [v.short, v.long]).filter(Boolean),
        shortS, 2
      );
      const options = this._shuffle([shortS, longS].concat(distractors));
      return {
        type: 'mc',
        category: 'phonics',
        level: level,
        prompt: `字母「${item.combo}」的<b>短音</b>是？`,
        options: options,
        answer: shortS,
        speakText: item.shortEg,
        weakness: this._phonicsKey(kind, item),
        explain: `字母 ${item.combo}：短音 ${shortS}（例：${item.shortEg}），长音 ${longS}（例：${item.longEg}）。`
      };
    }
    // 5) Magic E：选择正确变形
    if (kind === 'magic_e') {
      const options = this._shuffle([item.short, item.long, item.long + 'e', item.short + 'e']);
      return {
        type: 'mc',
        category: 'phonics',
        level: level,
        prompt: `「${item.short}」加 Magic E 后变成？`,
        options: options,
        answer: item.long,
        speakText: item.long,
        weakness: this._phonicsKey(kind, item),
        explain: `Magic E 规则：${item.short} + e = ${item.long}（${item.cn}）。e 不发音，让前面元音发长音。`
      };
    }
    return null;
  },

  /* ----- 词汇题生成 ----- */
  _pickVocab(level) {
    const data = this.vocabData;
    if (!data || !data.levels) return null;
    // EM 级别 0-5 → vocab.json levels 1-5（max(1, level)）
    const targetVocabLvl = Math.max(1, Math.min(5, level || 1));
    // 从目标级 ±1 收集词池
    const pool = [];
    [targetVocabLvl - 1, targetVocabLvl, targetVocabLvl + 1].forEach(lvl => {
      const found = (data.levels || []).find(l => l.level === lvl);
      if (found && found.words) pool.push(...found.words.map(w => ({ w, vl: lvl })));
    });
    if (!pool.length) return null;

    // 优先抽弱项
    const p = EM.progress.get();
    const weakSet = new Set(p.weaknesses.vocabulary || []);
    let pick = null;
    const weakPool = pool.filter(it => weakSet.has(it.w.word));
    if (weakPool.length && Math.random() < 0.6) {
      pick = weakPool[Math.floor(Math.random() * weakPool.length)];
    } else {
      pick = pool[Math.floor(Math.random() * pool.length)];
    }
    if (!pick) return null;
    const w = pick.w;

    // 随机题型：英→中 / 中→英 / 拼写
    const r = Math.random();
    if (r < 0.4) {
      // 英→中
      const distractors = this._randomDistractors(
        pool.map(it => it.w.meaning), w.meaning, 3
      );
      const options = this._shuffle([w.meaning].concat(distractors));
      return {
        type: 'mc',
        category: 'vocabulary',
        level: level,
        prompt: `英文「${w.word}」是什么意思？`,
        options: options,
        answer: w.meaning,
        speakText: w.word,
        weakness: w.word,
        explain: `${w.word} (${w.phonetic}) ${w.pos}：${w.meaning}。例：${w.example}`
      };
    } else if (r < 0.8) {
      // 中→英
      const distractors = this._randomDistractors(
        pool.map(it => it.w.word), w.word, 3
      );
      const options = this._shuffle([w.word].concat(distractors));
      return {
        type: 'mc',
        category: 'vocabulary',
        level: level,
        prompt: `中文「${w.meaning}」用英语怎么说？`,
        options: options,
        answer: w.word,
        speakText: w.word,
        weakness: w.word,
        explain: `${w.meaning} → ${w.word} (${w.phonetic})。例：${w.example}`
      };
    } else {
      // 拼写
      return {
        type: 'spell',
        category: 'vocabulary',
        level: level,
        prompt: `请拼写下列单词（${w.pos} ${w.meaning}）\n音标：${w.phonetic}`,
        answer: w.word,
        speakText: w.word,
        weakness: w.word,
        explain: `正确拼写：${w.word}（${w.meaning}）。例：${w.example}`
      };
    }
  },

  /* ----- 语法题生成（直接复用 grammar.json 的 quiz） ----- */
  _pickGrammar(level) {
    const data = this.grammarData;
    if (!data || !data.topics) return null;
    // 按级别过滤（grammar.json 的 level 是 1-4）
    const maxGrammarLvl = Math.max(1, Math.min(4, (level || 1)));
    const candidates = data.topics.filter(t => (t.level || 1) <= maxGrammarLvl && t.quiz && t.quiz.length);
    if (!candidates.length) return null;

    // 优先抽弱项
    const p = EM.progress.get();
    const weakSet = new Set(p.weaknesses.grammar || []);
    let topic = null;
    const weakTopics = candidates.filter(t => weakSet.has(t.id));
    if (weakTopics.length && Math.random() < 0.6) {
      topic = weakTopics[Math.floor(Math.random() * weakTopics.length)];
    } else {
      topic = candidates[Math.floor(Math.random() * candidates.length)];
    }
    if (!topic || !topic.quiz || !topic.quiz.length) return null;

    const q = topic.quiz[Math.floor(Math.random() * topic.quiz.length)];
    return {
      type: 'mc',
      category: 'grammar',
      level: level,
      prompt: q.q,
      options: q.options.slice(),
      answer: q.options[q.answer],
      answerIdx: q.answer,
      speakText: q.q.replace(/___/g, q.options[q.answer]),
      weakness: topic.id,
      topicTitle: topic.title,
      explain: `【${topic.title}】正确答案：${q.options[q.answer]}。${topic.summary || ''}`
    };
  },

  /* ================= 测试中：渲染题目 ================= */

  _renderQuestion() {
    const container = this._container;
    if (this.qIdx >= this.questions.length) {
      this._finish();
      return;
    }
    const q = this.questions[this.qIdx];
    this.answered = false;

    const catName = { phonics: '🔤 拼读', vocabulary: '📚 词汇', grammar: '📖 语法' }[q.category] || q.category;
    const lv = EM.LEVELS[this.difficulty] || EM.LEVELS[0];

    container.innerHTML = `
      <div class="card">
        <div class="test-head">
          <div>
            <div class="test-progress-text">
              ${catName} · 第 <b>${this.qIdx + 1}</b> / ${this.questions.length} 题
            </div>
          </div>
          <div class="test-difficulty" id="testDiff">难度 L${this.difficulty} · ${lv.cn}</div>
          <div class="test-timer" id="testTimer">00:00</div>
        </div>

        <div class="test-question">${q.prompt}</div>

        ${q.type === 'mc' ? `
          <div class="test-options" id="testOptions">
            ${q.options.map((opt, i) =>
              `<button class="test-option" data-i="${i}">${EM.ui.esc(opt)}</button>`
            ).join('')}
          </div>
        ` : `
          <div class="flex gap-8" id="testSpellRow">
            <input type="text" class="test-spell-input" id="testSpellInput"
                   placeholder="输入英文单词..." autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"
                   enterkeyhint="done">
            <button class="btn btn-primary" id="testSpellSubmit">提交</button>
          </div>
          ${q.speakText ? `<div class="font-sm text-secondary mt-16">
            <button class="btn btn-secondary btn-sm" id="testSpeakBtn">🔊 听发音</button>
          </div>` : ''}
        `}

        <div id="testFeedback"></div>
        <div class="flex gap-8" id="testNextWrap" style="display:none; margin-top:8px;">
          <button class="btn btn-primary" id="testNextBtn">
            ${this.qIdx + 1 >= this.questions.length ? '查看结果' : '下一题'} →
          </button>
        </div>
      </div>
    `;

    // 绑定答题事件
    if (q.type === 'mc') {
      container.querySelectorAll('[data-i]').forEach(btn => {
        btn.onclick = () => this._answerMC(parseInt(btn.dataset.i, 10));
      });
    } else {
      const input = document.getElementById('testSpellInput');
      const submit = document.getElementById('testSpellSubmit');
      if (input) {
        // 自动聚焦（iOS 需用户点击触发键盘，这里仍尝试 focus）
        setTimeout(() => { try { input.focus(); } catch (e) {} }, 100);
        input.onkeydown = (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            this._answerSpell(input.value);
          }
        };
      }
      if (submit) submit.onclick = () => this._answerSpell(input.value);
      const speakBtn = document.getElementById('testSpeakBtn');
      if (speakBtn && q.speakText) {
        speakBtn.onclick = () => EM.tts.speak(q.speakText, { rate: 0.8 });
      }
    }
  },

  /* ===== 选择题作答 ===== */
  _answerMC(idx) {
    if (this.answered) return;
    this.answered = true;
    const q = this.questions[this.qIdx];
    const chosen = q.options[idx];
    const correct = chosen === q.answer;
    const opts = document.querySelectorAll('[data-i]');
    opts.forEach((b, i) => {
      b.disabled = true;
      if (q.options[i] === q.answer) b.classList.add('correct');
      else if (i === idx) b.classList.add('wrong');
    });
    this._afterAnswer(correct, q);
  },

  /* ===== 拼写题作答 ===== */
  _answerSpell(value) {
    if (this.answered) return;
    this.answered = true;
    const q = this.questions[this.qIdx];
    const userAns = (value || '').trim().toLowerCase();
    const correctAns = (q.answer || '').toLowerCase();
    const correct = userAns === correctAns;
    const input = document.getElementById('testSpellInput');
    if (input) {
      input.disabled = true;
      input.classList.add(correct ? 'correct' : 'wrong');
    }
    const submit = document.getElementById('testSpellSubmit');
    if (submit) submit.disabled = true;
    this._afterAnswer(correct, q);
  },

  /* ===== 作答后处理：统计 + 调整难度 + 记录弱项 ===== */
  _afterAnswer(correct, q) {
    const fb = document.getElementById('testFeedback');
    if (fb) {
      fb.className = 'test-feedback ' + (correct ? 'ok' : 'no');
      if (correct) {
        fb.innerHTML = `✓ 答对了！${q.explain ? '<br>' + EM.ui.esc(q.explain) : ''}`;
      } else {
        fb.innerHTML = `✗ 答错了。正确答案：<b>${EM.ui.esc(q.answer)}</b>${q.explain ? '<br>' + EM.ui.esc(q.explain) : ''}`;
      }
    }
    // 听正确答案发音（仅 TTS 已开启时，由用户在 topbar 开关）
    // 这里不自动播放（iOS 兼容）

    if (correct) {
      this.correct++;
      // 难度上升（封顶 5）
      if (this.difficulty < 5) this.difficulty++;
      // 该题对应的弱项视为已掌握，从弱项列表移除
      if (q.weakness) {
        EM.progress.removeWeakness(q.category, q.weakness);
      }
    } else {
      // 难度下降（封底 0）
      if (this.difficulty > 0) this.difficulty--;
      // 记入弱项
      if (q.weakness) {
        EM.progress.addWeakness(q.category, q.weakness);
        this.wrongList.push({
          category: q.category,
          weakness: q.weakness,
          prompt: q.prompt,
          answer: q.answer
        });
      }
    }

    // 为下一题在该难度补充一道题（如果原列表中没有，则即时生成）
    // 此处实现：题目数固定 = this.totalQuestions，自适应难度仅影响后续抽题
    // 我们在 qIdx+1 < questions.length 时，重新生成下一题以应用新难度
    if (this.qIdx + 1 < this.questions.length) {
      const nextType = this.testType === 'mixed'
        ? ['phonics', 'vocabulary', 'grammar'][(this.qIdx + 1) % 3]
        : this.testType;
      const newQ = this._pickQuestion(nextType, this.difficulty);
      if (newQ) this.questions[this.qIdx + 1] = newQ;
    }

    // 显示下一题按钮
    const nextWrap = document.getElementById('testNextWrap');
    if (nextWrap) nextWrap.style.display = 'flex';
    const nextBtn = document.getElementById('testNextBtn');
    if (nextBtn) {
      nextBtn.onclick = () => {
        this.qIdx++;
        this._renderQuestion();
      };
    }
  },

  /* ================= 计时器 ================= */

  _startTimer() {
    this._stopTimer();
    this.timerId = setInterval(() => this._updateTimer(), 1000);
  },
  _stopTimer() {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  },
  _updateTimer() {
    const el = document.getElementById('testTimer');
    if (!el) return;
    const sec = Math.floor((Date.now() - this.startTime) / 1000);
    el.textContent = this._formatTime(sec);
  },
  _formatTime(sec) {
    const m = Math.floor(sec / 60).toString().padStart(2, '0');
    const s = (sec % 60).toString().padStart(2, '0');
    return m + ':' + s;
  },

  /* ================= 结果 ================= */

  _finish() {
    this._stopTimer();
    this.mode = 'result';
    const total = this.questions.length;
    const correct = this.correct;
    const accuracy = total ? correct / total : 0;
    const elapsedSec = Math.floor((Date.now() - this.startTime) / 1000);
    const startLevel = this.startLevel;
    const endLevel = this.difficulty;

    // 建议级别调整
    let adjust = 0;
    let recommendation = '';
    if (accuracy >= 0.8 && endLevel >= startLevel) {
      adjust = 1;
      recommendation = `表现优秀，建议提升级别至 L${Math.min(5, startLevel + 1)}。`;
    } else if (accuracy < 0.5 && endLevel < startLevel) {
      adjust = -1;
      recommendation = `难度偏大，建议降低级别至 L${Math.max(0, startLevel - 1)} 巩固基础。`;
    } else if (accuracy >= 0.6) {
      recommendation = `保持当前级别 L${startLevel}，继续努力巩固弱项。`;
    } else {
      recommendation = `建议保持当前级别 L${startLevel}，重点攻克下方弱项。`;
    }

    // 写入测试历史 + 更新测试级别
    const record = {
      type: this.testType,
      total: total,
      correct: correct,
      accuracy: accuracy,
      time: elapsedSec,
      startLevel: startLevel,
      endLevel: endLevel,
      date: new Date().toISOString(),
      weaknesses: this.wrongList.map(w => w.category + ':' + w.weakness)
    };
    EM.progress.update(d => {
      if (!d.modules.test) d.modules.test = { history: [], currentLevel: 0 };
      if (!d.modules.test.history) d.modules.test.history = [];
      d.modules.test.history.push(record);
      // 保留最近 50 次
      if (d.modules.test.history.length > 50) d.modules.test.history = d.modules.test.history.slice(-50);
      // 更新 currentLevel：以本次自适应结束的难度为准，但不要轻易超过用户主级别太多
      d.modules.test.currentLevel = endLevel;
    });

    this._renderResult(record, recommendation);
  },

  _renderResult(record, recommendation) {
    const container = this._container;
    const accuracy = Math.round(record.accuracy * 100);
    const emoji = accuracy >= 80 ? '🎉' : accuracy >= 60 ? '💪' : accuracy >= 40 ? '📚' : '🔄';
    const timeStr = this._formatTime(record.time);

    // 按类型分组弱项
    const weakByCat = { phonics: [], vocabulary: [], grammar: [] };
    this.wrongList.forEach(w => {
      if (weakByCat[w.category]) weakByCat[w.category].push(w);
    });

    container.innerHTML = `
      <div class="card">
        <div class="test-result">
          <div class="big-emoji">${emoji}</div>
          <div class="big-score">${record.correct} / ${record.total}</div>
          <div style="font-size:16px; font-weight:600;">正确率 ${accuracy}%</div>
          <div class="font-sm text-secondary mt-16">用时 ${timeStr} · ${this._typeName(this.testType)}</div>
        </div>

        <div class="test-result-rows">
          <div class="test-result-row">
            <span>起始难度</span><span>L${record.startLevel}</span>
          </div>
          <div class="test-result-row">
            <span>结束难度</span><span>L${record.endLevel}</span>
          </div>
          <div class="test-result-row">
            <span>答对</span><span class="text-success">${record.correct} 题</span>
          </div>
          <div class="test-result-row">
            <span>答错</span><span class="text-danger">${record.total - record.correct} 题</span>
          </div>
          <div class="test-result-row">
            <span>本次新增弱项</span><span>${this.wrongList.length} 项</span>
          </div>
        </div>

        <div class="card" style="background:var(--accent-bg); margin-top:16px; border:none;">
          <div class="font-sm"><b>📌 建议：</b>${recommendation}</div>
        </div>

        ${this.wrongList.length ? `
          <div class="card-title mt-16" style="margin-top:18px;">⚠️ 错题与弱项（自动记入进度）</div>
          ${Object.entries(weakByCat).map(([cat, items]) => items.length ? `
            <div style="margin-top:10px;">
              <div class="font-sm text-secondary">${this._typeName(cat)}</div>
              <div class="test-weakness-list">
                ${items.map(w => `<span class="test-weak-tag">${EM.ui.esc(w.weakness)}</span>`).join('')}
              </div>
            </div>
          ` : '').join('')}
        ` : '<div class="font-sm text-success mt-16" style="margin-top:16px;">✓ 本次无新增弱项，太棒了！</div>'}
      </div>

      <div class="flex gap-8 flex-wrap" style="margin-top:14px;">
        <button class="btn btn-primary" id="trAgain">🔄 再测一次</button>
        <button class="btn btn-secondary" id="trOther">🎯 换种类型</button>
        <button class="btn btn-secondary" id="trHome">← 返回菜单</button>
      </div>
    `;

    document.getElementById('trAgain').onclick = () => this._startTest(this.testType);
    document.getElementById('trOther').onclick = () => this._renderMenu();
    document.getElementById('trHome').onclick = () => this._renderMenu();
  },

  /* ================= 工具方法 ================= */

  _typeName(t) {
    return { phonics: '🔤 拼读测试', vocabulary: '📚 词汇测试', grammar: '📖 语法测试', mixed: '🏆 综合测试' }[t] || t;
  },

  // 从池中随机选 n 个干扰项（排除正确答案）
  _randomDistractors(pool, correct, n) {
    const filtered = (pool || []).filter(x => x && x !== correct);
    // 去重
    const uniq = Array.from(new Set(filtered));
    return this._shuffle(uniq).slice(0, n);
  },

  // 数组随机洗牌
  _shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = a[i]; a[i] = a[j]; a[j] = tmp;
    }
    return a;
  },

  /* ================= 毕业测试 ================= */

  // 毕业测试 6 项标准
  GRAD_STANDARDS: [
    { key:'listening',  name:'听力理解', icon:'👂', target:'L5级对话/新闻', threshold:0.90, cn:'答对≥90%' },
    { key:'speaking',   name:'口语交流', icon:'🗣️', target:'60分钟AI口语对话', threshold:0.60, cn:'5题开放问答·相似度≥60%' },
    { key:'reading',    name:'阅读理解', icon:'📰', target:'L5级文章', threshold:0.90, cn:'答对≥90%' },
    { key:'writing',    name:'写作', icon:'✍️', target:'200字英文短文', threshold:0.70, cn:'本地检查·综合≥70%' },
    { key:'vocabulary', name:'词汇量', icon:'📚', target:'随机抽取', threshold:0.85, cn:'答对≥85%' },
    { key:'grammar',    name:'语法', icon:'📖', target:'C1-C2级语法', threshold:0.85, cn:'答对≥85%' }
  ],

  // 毕业测试状态
  gradState: null,

  // 启动毕业测试
  async _startGraduation() {
    const p = EM.progress.get();
    if ((p.level || 0) < 4) {
      EM.ui.toast('需达到 L4 高级才能开始毕业测试');
      return;
    }
    this._container.innerHTML = '<div class="loading">加载毕业测试题库...</div>';
    const [arts, convs] = await Promise.all([
      EM.data.load('articles'),
      EM.data.load('conversations')
    ]);
    if (!arts || !convs) {
      this._container.innerHTML = '<div class="card"><p>题库加载失败，请刷新重试。</p></div>';
      return;
    }
    this.gradState = {
      step: 0, scores: {}, articles: arts, conversations: convs,
      startTime: Date.now(), timerId: null
    };
    this.mode = 'graduation';
    this._renderGradStep();
  },

  // 毕业测试步骤头部 HTML
  _gradHeaderHtml() {
    const step = this.gradState.step;
    const std = this.GRAD_STANDARDS[step];
    const scores = this.gradState.scores;
    return `
      <div class="card">
        <div class="test-head">
          <div class="test-progress-text">🎓 毕业测试 · 第 <b>${step + 1}</b> / ${this.GRAD_STANDARDS.length} 项</div>
          <div class="test-difficulty">${std.icon} ${std.name}</div>
          <div class="test-timer" id="gradTimer">00:00</div>
        </div>
        <div class="font-sm text-secondary" style="margin-bottom:8px;">
          通过标准：<b>${std.cn}</b> · 目标：${std.target}
        </div>
        <div class="progress-bar"><div class="progress-fill" style="width:${(step / this.GRAD_STANDARDS.length) * 100}%"></div></div>
        ${Object.keys(scores).length ? `
          <div class="font-sm" style="margin-top:10px;">
            <b>已完成：</b>
            ${Object.entries(scores).map(([k, v]) => {
              const s = this.GRAD_STANDARDS.find(x => x.key === k);
              const pass = v.passed;
              return `<span class="test-weak-tag" style="background:${pass ? 'rgba(76,175,136,0.15)' : 'rgba(232,90,90,0.15)'}; color:${pass ? 'var(--success)' : 'var(--danger)'};">${s ? s.icon : ''} ${s ? s.name : k} ${pass ? '✓' : '✗'}</span>`;
            }).join(' ')}
          </div>
        ` : ''}
      </div>
      <div id="gradQArea"></div>
    `;
  },

  // 设置题目区域内容
  _setQArea(html) {
    const area = document.getElementById('gradQArea');
    if (area) area.innerHTML = html;
  },

  // 渲染当前毕业测试步骤
  _renderGradStep() {
    const step = this.gradState.step;
    if (step >= this.GRAD_STANDARDS.length) {
      this._finishGraduation();
      return;
    }
    const std = this.GRAD_STANDARDS[step];
    if (this.gradState.timerId) {
      clearInterval(this.gradState.timerId);
      this.gradState.timerId = null;
    }
    this.gradState.startTime = Date.now();
    this._container.innerHTML = this._gradHeaderHtml();
    this.gradState.timerId = setInterval(() => {
      const el = document.getElementById('gradTimer');
      if (el) {
        const sec = Math.floor((Date.now() - this.gradState.startTime) / 1000);
        el.textContent = this._formatTime(sec);
      }
    }, 1000);
    const renderFn = {
      listening: '_gradListening',
      speaking: '_gradSpeaking',
      reading: '_gradReading',
      writing: '_gradWriting',
      vocabulary: '_gradVocabulary',
      grammar: '_gradGrammar'
    }[std.key];
    if (renderFn && this[renderFn]) this[renderFn]();
  },

  // ----- 1) 听力理解 -----
  _gradListening() {
    const levels = (this.gradState.conversations.levels || []);
    let conv = null;
    const l5 = levels.find(l => l.level === 5);
    if (l5 && l5.items && l5.items.length) {
      conv = l5.items[Math.floor(Math.random() * l5.items.length)];
    } else {
      for (let i = levels.length - 1; i >= 0; i--) {
        if (levels[i].items && levels[i].items.length) {
          const pool = levels[i].items;
          conv = pool[Math.floor(Math.random() * pool.length)];
          break;
        }
      }
    }
    if (!conv) {
      this._setQArea('<div class="card"><p>未找到听力素材。</p></div>');
      return;
    }
    this.gradState.curItem = conv;
    this.gradState.curQIdx = 0;
    this.gradState.curCorrect = 0;
    this.gradState.curQuestions = (conv.quiz || []).slice(0, 5).map(q => ({
      q: q.q, options: q.options.slice(), answerIdx: q.answer, answerValue: q.options[q.answer]
    }));
    this.gradState.curTotal = this.gradState.curQuestions.length;
    this._renderListeningQ();
  },

  _renderListeningQ() {
    const state = this.gradState;
    const qIdx = state.curQIdx;
    const q = state.curQuestions[qIdx];
    const conv = state.curItem;
    const playAllText = (conv.lines || []).map(l => l.en).join(' ');
    const linesHtml = (conv.lines || []).map(l =>
      `<div class="font-sm" style="padding:4px 0;"><b>${l.speaker}:</b> ${EM.ui.esc(l.en)} <span class="text-secondary">(${EM.ui.esc(l.cn)})</span></div>`
    ).join('');

    this._setQArea(`
      <div class="card">
        <div class="test-head">
          <div class="test-progress-text">👂 听力 · 第 <b>${qIdx + 1}</b> / ${state.curTotal} 题</div>
          <div class="test-difficulty">目标：答对≥90%</div>
        </div>
        <div style="padding:10px 12px; background:var(--accent-bg); border-radius:8px; margin-bottom:12px;">
          <div class="font-sm text-secondary" style="margin-bottom:8px;">🔊 点击播放对话（共 ${conv.lines.length} 句）：</div>
          <div class="flex gap-8 flex-wrap">
            <button class="btn btn-primary" id="gradPlayAll">🔊 播放整段</button>
            <button class="btn btn-secondary" id="gradPlaySlow">🐢 慢速播放</button>
            <button class="btn btn-secondary" id="gradPlayLine">🎵 逐句播放</button>
          </div>
          <details style="margin-top:8px;">
            <summary class="font-sm text-secondary">📝 查看对话原文</summary>
            <div style="margin-top:8px;">${linesHtml}</div>
          </details>
        </div>
        <div class="test-question">${q.q}</div>
        <div class="test-options" id="gradOptions">
          ${q.options.map((opt, i) => `<button class="test-option" data-i="${i}">${EM.ui.esc(opt)}</button>`).join('')}
        </div>
        <div id="gradFeedback"></div>
        <div class="flex gap-8" id="gradNextWrap" style="display:none; margin-top:8px;">
          <button class="btn btn-primary" id="gradNextBtn">${qIdx + 1 >= state.curTotal ? '查看听力成绩' : '下一题'} →</button>
        </div>
      </div>
    `);

    document.getElementById('gradPlayAll').onclick = () => EM.tts.speak(playAllText, { rate: 1.0 });
    document.getElementById('gradPlaySlow').onclick = () => EM.tts.speak(playAllText, { rate: 0.7 });
    document.getElementById('gradPlayLine').onclick = async () => {
      for (const l of (conv.lines || [])) {
        EM.tts.speak(l.en, { rate: 0.85 });
        await new Promise(r => setTimeout(r, Math.max(1500, l.en.length * 80)));
      }
    };
    document.querySelectorAll('#gradOptions [data-i]').forEach(btn => {
      btn.onclick = () => this._answerGradMC(parseInt(btn.dataset.i, 10), 'listening');
    });
  },

  // ----- 通用选择题作答（听力/阅读/词汇/语法统一使用 answerIdx）-----
  _answerGradMC(idx, key) {
    const state = this.gradState;
    const q = state.curQuestions[state.curQIdx];
    const correctIdx = q.answerIdx;
    const correct = idx === correctIdx;
    document.querySelectorAll('#gradOptions [data-i]').forEach((b, i) => {
      b.disabled = true;
      if (i === correctIdx) b.classList.add('correct');
      else if (i === idx) b.classList.add('wrong');
    });
    const fb = document.getElementById('gradFeedback');
    fb.className = 'test-feedback ' + (correct ? 'ok' : 'no');
    fb.innerHTML = correct ? '✓ 答对了！' : '✗ 答错了。正确答案：<b>' + EM.ui.esc(q.answerValue) + '</b>';
    if (correct) state.curCorrect++;
    document.getElementById('gradNextWrap').style.display = 'flex';
    document.getElementById('gradNextBtn').onclick = () => {
      state.curQIdx++;
      if (state.curQIdx >= state.curTotal) {
        const accuracy = state.curCorrect / state.curTotal;
        const std = this.GRAD_STANDARDS.find(s => s.key === key);
        state.scores[key] = { passed: accuracy >= std.threshold, accuracy: accuracy, correct: state.curCorrect, total: state.curTotal };
        state.step++;
        this._renderStepSummary(key, accuracy, std);
      } else {
        const renderFn = { listening: '_renderListeningQ', reading: '_renderReadingQ', vocabulary: '_renderVocabQ', grammar: '_renderGrammarQ' }[key];
        if (renderFn) this[renderFn]();
      }
    };
  },

  // ----- 2) 口语交流 -----
  _gradSpeaking() {
    const questions = [
      { q: 'Please introduce yourself in 3-4 sentences.', model: 'My name is Li Ming. I am 25 years old. I am from China. I work as a software engineer in Beijing.' },
      { q: 'Describe a city you would like to visit and explain why.', model: 'I would like to visit London because it is a famous city with rich history. There are many museums and landmarks like Big Ben. The culture is diverse and interesting.' },
      { q: 'What is your favorite hobby? Why do you enjoy it?', model: 'My favorite hobby is reading books. I enjoy it because it helps me learn new things and relax. Reading also improves my vocabulary and imagination.' },
      { q: 'Discuss the impact of technology on modern life.', model: 'Technology has greatly changed modern life. It makes communication faster and easier. However, it also brings problems like less face-to-face interaction and screen addiction.' },
      { q: 'What are your plans for the next five years?', model: 'In the next five years, I plan to improve my English proficiency. I also want to advance in my career and learn new professional skills. Traveling abroad is also one of my goals.' }
    ];
    this.gradState.curQuestions = questions;
    this.gradState.curQIdx = 0;
    this.gradState.curScores = [];
    this._renderSpeakingQ();
  },

  _renderSpeakingQ() {
    const state = this.gradState;
    const qIdx = state.curQIdx;
    const q = state.curQuestions[qIdx];
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

    this._setQArea(`
      <div class="card">
        <div class="test-head">
          <div class="test-progress-text">🗣️ 口语 · 第 <b>${qIdx + 1}</b> / ${state.curQuestions.length} 题</div>
          <div class="test-difficulty">目标：相似度≥60%</div>
        </div>
        <div class="test-question">${q.q}</div>
        <div class="font-sm text-secondary" style="margin-bottom:10px;">
          请用英语回答（建议 30-60 秒）。${SR ? '可点击"开始录音"使用语音输入，也可直接键入。' : '当前浏览器不支持语音识别，请键入答案。'}
        </div>
        <textarea id="gradSpeakInput" rows="6" placeholder="Type or speak your answer in English..."
          style="width:100%; padding:12px 14px; background:var(--bg-card); border:1px solid var(--border); border-radius:var(--radius-sm); color:var(--text-primary); font-size:15px; font-family:inherit; resize:vertical;"></textarea>
        <div class="flex gap-8 flex-wrap" style="margin-top:12px;">
          ${SR ? '<button class="btn btn-secondary" id="gradSpeakRecord">🎤 开始录音</button>' : ''}
          <button class="btn btn-primary" id="gradSpeakSubmit">提交答案</button>
          <button class="btn btn-secondary" id="gradSpeakSkip">跳过此题</button>
        </div>
        <details style="margin-top:10px;" class="font-sm text-secondary">
          <summary>📌 参考答案（仅作对比基准）</summary>
          <div style="margin-top:8px; padding:8px; background:var(--bg-card); border-radius:6px;">${EM.ui.esc(q.model)}</div>
        </details>
        <div id="gradFeedback"></div>
        <div class="flex gap-8" id="gradNextWrap" style="display:none; margin-top:8px;">
          <button class="btn btn-primary" id="gradNextBtn">${qIdx + 1 >= state.curQuestions.length ? '查看口语成绩' : '下一题'} →</button>
        </div>
      </div>
    `);

    if (SR) {
      const btn = document.getElementById('gradSpeakRecord');
      let recording = false;
      let recognition = null;
      btn.onclick = () => {
        const input = document.getElementById('gradSpeakInput');
        if (!recording) {
          recognition = new SR();
          recognition.lang = 'en-US';
          recognition.continuous = true;
          recognition.interimResults = true;
          let finalText = input.value;
          recognition.onresult = (e) => {
            let interim = '';
            for (let i = e.resultIndex; i < e.results.length; i++) {
              if (e.results[i].isFinal) finalText += ' ' + e.results[i][0].transcript;
              else interim += e.results[i][0].transcript;
            }
            input.value = (finalText + ' ' + interim).trim();
          };
          recognition.onerror = (e) => {
            EM.ui.toast('录音失败: ' + e.error);
            btn.textContent = '🎤 开始录音';
            recording = false;
          };
          recognition.onend = () => {
            btn.textContent = '🎤 开始录音';
            recording = false;
          };
          recognition.start();
          btn.textContent = '⏹️ 停止录音';
          recording = true;
          EM.ui.toast('开始录音，请用英语回答...');
        } else {
          if (recognition) recognition.stop();
          btn.textContent = '🎤 开始录音';
          recording = false;
        }
      };
    }

    document.getElementById('gradSpeakSubmit').onclick = () => {
      const input = document.getElementById('gradSpeakInput');
      const ans = (input.value || '').trim();
      if (!ans) {
        EM.ui.toast('请输入或说出答案');
        return;
      }
      const sim = this._calcSimilarity(ans, q.model);
      state.curScores.push({ q: q.q, answer: ans, similarity: sim });
      const fb = document.getElementById('gradFeedback');
      fb.className = 'test-feedback ' + (sim >= 0.6 ? 'ok' : 'no');
      fb.innerHTML = `📊 与参考答案的相似度：<b>${Math.round(sim * 100)}%</b> ${sim >= 0.6 ? '✓ 达标' : '✗ 低于阈值'}`;
      input.disabled = true;
      document.getElementById('gradSpeakSubmit').disabled = true;
      const recBtn = document.getElementById('gradSpeakRecord');
      if (recBtn) recBtn.disabled = true;
      document.getElementById('gradNextWrap').style.display = 'flex';
      document.getElementById('gradNextBtn').onclick = () => {
        state.curQIdx++;
        if (state.curQIdx >= state.curQuestions.length) {
          const avgSim = state.curScores.reduce((s, x) => s + x.similarity, 0) / state.curScores.length;
          state.scores.speaking = { passed: avgSim >= 0.6, accuracy: avgSim, detail: state.curScores };
          state.step++;
          this._renderStepSummary('speaking', avgSim, this.GRAD_STANDARDS[1]);
        } else {
          this._renderSpeakingQ();
        }
      };
    };

    document.getElementById('gradSpeakSkip').onclick = () => {
      state.curScores.push({ q: q.q, answer: '', similarity: 0 });
      state.curQIdx++;
      if (state.curQIdx >= state.curQuestions.length) {
        const avgSim = state.curScores.reduce((s, x) => s + x.similarity, 0) / state.curScores.length;
        state.scores.speaking = { passed: avgSim >= 0.6, accuracy: avgSim, detail: state.curScores };
        state.step++;
        this._renderStepSummary('speaking', avgSim, this.GRAD_STANDARDS[1]);
      } else {
        this._renderSpeakingQ();
      }
    };
  },

  // 相似度计算
  _calcSimilarity(userText, modelText) {
    const stop = new Set(['the','a','an','is','are','was','were','be','been','being','to','of','and','or','but','in','on','at','by','for','with','about','as','it','this','that','these','those','i','you','he','she','we','they','my','your','his','her','our','their','me','him','us','them','do','does','did','have','has','had','will','would','can','could','should','may','might','must','shall','not','no','yes','very','too','so','just','also','only','than','then','from','into','out','up','down','over','under','again','more','most','some','any','all','each','every','other','such']);
    const tokenize = s => (s.toLowerCase().match(/[a-z']+/g) || []).filter(w => w.length > 1 && !stop.has(w));
    const userTokens = tokenize(userText);
    const modelTokens = tokenize(modelText);
    if (!modelTokens.length) return 0;
    const userSet = new Set(userTokens);
    const modelSet = new Set(modelTokens);
    let intersection = 0;
    modelSet.forEach(w => { if (userSet.has(w)) intersection++; });
    const union = userSet.size + modelSet.size - intersection;
    const jaccard = union ? intersection / union : 0;
    const coverage = intersection / modelSet.size;
    const score = coverage * 0.7 + jaccard * 0.3;
    const userWordCount = userText.split(/\s+/).filter(w => w).length;
    let penalty = 1.0;
    if (userWordCount < 5) penalty = 0.2;
    else if (userWordCount < 10) penalty = 0.5;
    else if (userWordCount < 20) penalty = 0.8;
    return Math.min(1, score * penalty);
  },

  // ----- 3) 阅读理解 -----
  _gradReading() {
    const levels = (this.gradState.articles.levels || []);
    let art = null;
    const l5 = levels.find(l => l.level === 5);
    if (l5 && l5.articles && l5.articles.length) {
      art = l5.articles[Math.floor(Math.random() * l5.articles.length)];
    } else {
      for (let i = levels.length - 1; i >= 0; i--) {
        if (levels[i].articles && levels[i].articles.length) {
          const pool = levels[i].articles;
          art = pool[Math.floor(Math.random() * pool.length)];
          break;
        }
      }
    }
    if (!art) {
      this._setQArea('<div class="card"><p>未找到阅读素材。</p></div>');
      return;
    }
    this.gradState.curItem = art;
    this.gradState.curQIdx = 0;
    this.gradState.curCorrect = 0;
    const all = [].concat(art.quiz || [], art.comprehension || []);
    this.gradState.curQuestions = all.slice(0, 5).map(q => ({
      q: q.q, options: q.options.slice(), answerIdx: q.answer, answerValue: q.options[q.answer]
    }));
    this.gradState.curTotal = this.gradState.curQuestions.length;
    this._renderReadingQ();
  },

  _renderReadingQ() {
    const state = this.gradState;
    const qIdx = state.curQIdx;
    const q = state.curQuestions[qIdx];
    const art = state.curItem;

    this._setQArea(`
      <div class="card">
        <div class="test-head">
          <div class="test-progress-text">📰 阅读 · 第 <b>${qIdx + 1}</b> / ${state.curTotal} 题</div>
          <div class="test-difficulty">目标：答对≥90%</div>
        </div>
        <details style="margin-bottom:12px;">
          <summary><b>📖 ${art.titleCn || art.title}</b> <span class="font-sm text-secondary">(${art.wordCount || 0} 词)</span></summary>
          <div style="margin-top:8px; padding:10px 12px; background:var(--bg-card); border-radius:8px; line-height:1.7; max-height:300px; overflow-y:auto;">${EM.ui.esc(art.text)}</div>
          ${art.textCn ? `<div class="font-sm text-secondary" style="margin-top:8px;">${EM.ui.esc(art.textCn)}</div>` : ''}
        </details>
        <div class="test-question">${q.q}</div>
        <div class="test-options" id="gradOptions">
          ${q.options.map((opt, i) => `<button class="test-option" data-i="${i}">${EM.ui.esc(opt)}</button>`).join('')}
        </div>
        <div id="gradFeedback"></div>
        <div class="flex gap-8" id="gradNextWrap" style="display:none; margin-top:8px;">
          <button class="btn btn-primary" id="gradNextBtn">${qIdx + 1 >= state.curTotal ? '查看阅读成绩' : '下一题'} →</button>
        </div>
      </div>
    `);
    document.querySelectorAll('#gradOptions [data-i]').forEach(btn => {
      btn.onclick = () => this._answerGradMC(parseInt(btn.dataset.i, 10), 'reading');
    });
  },

  // ----- 4) 写作 -----
  _gradWriting() {
    const topics = [
      'The impact of technology on education (科技对教育的影响)',
      'The advantages and disadvantages of studying abroad (出国留学的利与弊)',
      'How to maintain a healthy work-life balance in modern society (如何在现代社会保持工作与生活的平衡)'
    ];
    const topic = topics[Math.floor(Math.random() * topics.length)];
    this.gradState.curTopic = topic;

    this._setQArea(`
      <div class="card">
        <div class="test-head">
          <div class="test-progress-text">✍️ 写作 · 200 字英文短文</div>
          <div class="test-difficulty">目标：≥200词 + 综合≥70%</div>
        </div>
        <div class="test-question">📝 写作题目：<br><b>${topic}</b></div>
        <div class="font-sm text-secondary" style="margin-bottom:10px;">
          请撰写不少于 <b>200 个英文单词</b>的短文，结构清晰（建议含引言、正文、结论）。
        </div>
        <textarea id="gradWriteInput" rows="14" placeholder="Write your essay here..."
          style="width:100%; padding:12px 14px; background:var(--bg-card); border:1px solid var(--border); border-radius:var(--radius-sm); color:var(--text-primary); font-size:15px; font-family:inherit; line-height:1.6; resize:vertical;"></textarea>
        <div class="flex gap-8 flex-wrap" style="margin-top:12px; align-items:center;">
          <button class="btn btn-primary" id="gradWriteSubmit">提交批改</button>
          <span class="font-sm text-secondary" id="gradWriteCount">字数：0</span>
        </div>
        <div id="gradFeedback"></div>
        <div class="flex gap-8" id="gradNextWrap" style="display:none; margin-top:8px;">
          <button class="btn btn-primary" id="gradNextBtn">查看写作成绩 →</button>
        </div>
      </div>
    `);
    const ta = document.getElementById('gradWriteInput');
    const counter = document.getElementById('gradWriteCount');
    ta.oninput = () => {
      const words = (ta.value.match(/\b\w+\b/g) || []).length;
      counter.textContent = '字数：' + words;
    };
    document.getElementById('gradWriteSubmit').onclick = () => {
      const essay = (ta.value || '').trim();
      const result = this._checkWriting(essay);
      const fb = document.getElementById('gradFeedback');
      fb.className = 'test-feedback ' + (result.passed ? 'ok' : 'no');
      fb.innerHTML = '<b>📝 写作评估结果</b><br>' +
        '✅ 词数：<b>' + result.wordCount + '</b> ' + (result.wordCount >= 200 ? '✓' : '✗ (需≥200)') + '<br>' +
        '✅ 句子数：<b>' + result.sentenceCount + '</b><br>' +
        '✅ 词汇丰富度：<b>' + result.lexicalDiversity + '</b>（不同词/总词数）<br>' +
        '✅ 平均句长：<b>' + result.avgSentenceLen + '</b> 词/句<br>' +
        (result.issues.length ? '⚠️ 问题：' + result.issues.join('；') : '✓ 未发现明显问题') + '<br>' +
        '<b>综合得分：' + Math.round(result.score * 100) + '%</b> ' + (result.passed ? '✓ 通过' : '✗ 未通过');
      ta.disabled = true;
      document.getElementById('gradWriteSubmit').disabled = true;
      this.gradState.scores.writing = { passed: result.passed, accuracy: result.score, detail: result };
      this.gradState.step++;
      document.getElementById('gradNextWrap').style.display = 'flex';
      document.getElementById('gradNextBtn').onclick = () => this._renderStepSummary('writing', result.score, this.GRAD_STANDARDS[3]);
    };
  },

  // 写作本地检查
  _checkWriting(text) {
    const words = (text.match(/\b\w+\b/g) || []);
    const wordCount = words.length;
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const sentenceCount = sentences.length;
    const lowerWords = words.map(w => w.toLowerCase());
    const uniqueWords = new Set(lowerWords).size;
    const lexicalDiversity = wordCount ? uniqueWords / wordCount : 0;
    const avgSentenceLen = sentenceCount ? wordCount / sentenceCount : 0;
    const issues = [];
    if (wordCount < 200) issues.push('词数不足（' + wordCount + '/200）');
    if (sentenceCount < 3) issues.push('句子数过少（建议≥3）');
    if (lexicalDiversity < 0.4) issues.push('词汇重复较多（建议多变化）');
    if (avgSentenceLen < 8) issues.push('句子过短');
    if (avgSentenceLen > 30) issues.push('句子过长，建议拆分');
    if (text && text[0] !== text[0].toUpperCase()) issues.push('开头未大写');
    if (text && !/[.!?]$/.test(text.trim())) issues.push('结尾缺少句号');

    let score = 0;
    if (wordCount >= 200) score += 0.3; else score += (wordCount / 200) * 0.3;
    if (sentenceCount >= 3) score += 0.2; else score += (sentenceCount / 3) * 0.2;
    if (lexicalDiversity >= 0.5) score += 0.2; else score += (lexicalDiversity / 0.5) * 0.2;
    if (avgSentenceLen >= 8 && avgSentenceLen <= 25) score += 0.15; else score += 0.05;
    if (issues.length === 0) score += 0.15; else score += Math.max(0, 0.15 - issues.length * 0.03);
    score = Math.min(1, score);
    const passed = score >= 0.7 && wordCount >= 200;
    return {
      wordCount, sentenceCount, lexicalDiversity: lexicalDiversity.toFixed(2),
      avgSentenceLen: avgSentenceLen.toFixed(1), issues, score, passed
    };
  },

  // ----- 5) 词汇量 -----
  _gradVocabulary() {
    const allWords = [];
    (this.vocabData.levels || []).forEach(lv => {
      (lv.words || []).forEach(w => allWords.push({ w, vl: lv.level }));
    });
    if (!allWords.length) {
      this._setQArea('<div class="card"><p>词汇题库为空。</p></div>');
      return;
    }
    const shuffled = this._shuffle(allWords).slice(0, 20);
    this.gradState.curQuestions = shuffled.map(({ w }) => {
      const r = Math.random();
      if (r < 0.4) {
        const distractors = this._randomDistractors(allWords.map(x => x.w.word), w.word, 3);
        const options = this._shuffle([w.word].concat(distractors));
        return { q: '中文「' + w.meaning + '」用英语怎么说？', options: options, answerIdx: options.indexOf(w.word), answerValue: w.word };
      } else if (r < 0.8) {
        const distractors = this._randomDistractors(allWords.map(x => x.w.meaning), w.meaning, 3);
        const options = this._shuffle([w.meaning].concat(distractors));
        return { q: '英文「' + w.word + '」是什么意思？', options: options, answerIdx: options.indexOf(w.meaning), answerValue: w.meaning };
      } else {
        const swaps = [w.word, w.word + 'e', w.word.replace(/^(.)(.+)/, '$2$1'), w.word + 's'];
        const uniq = Array.from(new Set(swaps)).filter(x => x !== w.word);
        const options = this._shuffle([w.word].concat(uniq.slice(0, 3)));
        return { q: '下列哪个是「' + w.meaning + '」的正确拼写？', options: options, answerIdx: options.indexOf(w.word), answerValue: w.word };
      }
    });
    this.gradState.curQIdx = 0;
    this.gradState.curCorrect = 0;
    this.gradState.curTotal = this.gradState.curQuestions.length;
    this._renderVocabQ();
  },

  _renderVocabQ() {
    const state = this.gradState;
    const qIdx = state.curQIdx;
    const q = state.curQuestions[qIdx];
    this._setQArea(`
      <div class="card">
        <div class="test-head">
          <div class="test-progress-text">📚 词汇 · 第 <b>${qIdx + 1}</b> / ${state.curTotal} 题</div>
          <div class="test-difficulty">目标：答对≥85%</div>
        </div>
        <div class="test-question">${q.q}</div>
        <div class="test-options" id="gradOptions">
          ${q.options.map((opt, i) => `<button class="test-option" data-i="${i}">${EM.ui.esc(opt)}</button>`).join('')}
        </div>
        <div id="gradFeedback"></div>
        <div class="flex gap-8" id="gradNextWrap" style="display:none; margin-top:8px;">
          <button class="btn btn-primary" id="gradNextBtn">${qIdx + 1 >= state.curTotal ? '查看词汇成绩' : '下一题'} →</button>
        </div>
      </div>
    `);
    document.querySelectorAll('#gradOptions [data-i]').forEach(btn => {
      btn.onclick = () => this._answerGradMC(parseInt(btn.dataset.i, 10), 'vocabulary');
    });
  },

  // ----- 6) 语法（C1-C2 级）-----
  _gradGrammar() {
    let topics = (this.grammarData.topics || []).filter(t => (t.level || 1) >= 4 && t.quiz && t.quiz.length);
    if (!topics.length) {
      topics = (this.grammarData.topics || []).filter(t => (t.level || 1) >= 3 && t.quiz && t.quiz.length);
    }
    if (!topics.length) {
      this._setQArea('<div class="card"><p>未找到高级语法题。</p></div>');
      return;
    }
    const allQ = [];
    topics.forEach(t => (t.quiz || []).forEach(qq => allQ.push({ qq, topic: t })));
    this.gradState.curQuestions = this._shuffle(allQ).slice(0, 20).map(({ qq, topic }) => ({
      q: '【' + topic.title + '】' + qq.q,
      options: qq.options.slice(),
      answerIdx: qq.answer,
      answerValue: qq.options[qq.answer]
    }));
    this.gradState.curQIdx = 0;
    this.gradState.curCorrect = 0;
    this.gradState.curTotal = this.gradState.curQuestions.length;
    this._renderGrammarQ();
  },

  _renderGrammarQ() {
    const state = this.gradState;
    const qIdx = state.curQIdx;
    const q = state.curQuestions[qIdx];
    this._setQArea(`
      <div class="card">
        <div class="test-head">
          <div class="test-progress-text">📖 语法 · 第 <b>${qIdx + 1}</b> / ${state.curTotal} 题</div>
          <div class="test-difficulty">目标：答对≥85%</div>
        </div>
        <div class="test-question">${q.q}</div>
        <div class="test-options" id="gradOptions">
          ${q.options.map((opt, i) => `<button class="test-option" data-i="${i}">${EM.ui.esc(opt)}</button>`).join('')}
        </div>
        <div id="gradFeedback"></div>
        <div class="flex gap-8" id="gradNextWrap" style="display:none; margin-top:8px;">
          <button class="btn btn-primary" id="gradNextBtn">${qIdx + 1 >= state.curTotal ? '查看语法成绩' : '下一题'} →</button>
        </div>
      </div>
    `);
    document.querySelectorAll('#gradOptions [data-i]').forEach(btn => {
      btn.onclick = () => this._answerGradMC(parseInt(btn.dataset.i, 10), 'grammar');
    });
  },

  // ----- 单项小结 -----
  _renderStepSummary(key, accuracy, std) {
    if (this.gradState.timerId) {
      clearInterval(this.gradState.timerId);
      this.gradState.timerId = null;
    }
    const pass = accuracy >= std.threshold;
    const acc = Math.round(accuracy * 100);
    this._container.innerHTML = `
      <div class="card">
        <div class="test-result">
          <div class="big-emoji">${pass ? '✅' : '❌'}</div>
          <div class="big-score">${acc}%</div>
          <div style="font-size:16px; font-weight:600;">${std.name} · ${pass ? '通过' : '未通过'}</div>
          <div class="font-sm text-secondary" style="margin-top:8px;">通过标准：${std.cn}</div>
        </div>
        ${pass ? '' : `
          <div class="card" style="background:rgba(232,90,90,0.10); border:1px solid var(--danger); margin-top:12px;">
            <div class="font-sm"><b>📌 复习建议：</b>${this._gradReviewTip(key)}</div>
          </div>
        `}
        <div class="flex gap-8" style="margin-top:16px;">
          <button class="btn btn-primary" id="gradContinue">继续下一项 →</button>
        </div>
      </div>
    `;
    document.getElementById('gradContinue').onclick = () => this._renderGradStep();
  },

  // ----- 完成所有 6 项 -----
  _finishGraduation() {
    if (this.gradState.timerId) {
      clearInterval(this.gradState.timerId);
      this.gradState.timerId = null;
    }
    const scores = this.gradState.scores;
    const allPassed = this.GRAD_STANDARDS.every(s => scores[s.key] && scores[s.key].passed);
    const passedCount = this.GRAD_STANDARDS.filter(s => scores[s.key] && scores[s.key].passed).length;
    EM.progress.update(d => {
      if (!d.graduation) d.graduation = { passed:false, date:null, scores:{} };
      d.graduation.scores = scores;
      if (allPassed) {
        d.graduation.passed = true;
        d.graduation.date = new Date().toISOString();
      }
    });
    this._renderGradResult(scores, allPassed, passedCount);
  },

  // ----- 最终结果 -----
  _renderGradResult(scores, allPassed, passedCount) {
    const container = this._container;
    const total = this.GRAD_STANDARDS.length;
    if (passedCount === undefined) {
      passedCount = this.GRAD_STANDARDS.filter(s => scores[s.key] && scores[s.key].passed).length;
    }
    const rowsHtml = this.GRAD_STANDARDS.map(s => {
      const sc = scores[s.key];
      const pass = sc && sc.passed;
      const acc = sc ? Math.round((sc.accuracy || 0) * 100) : 0;
      return '<div class="test-result-row"><span>' + s.icon + ' ' + s.name + '</span><span class="' + (pass ? 'text-success' : 'text-danger') + '">' + (sc ? (pass ? '✓ 通过' : '✗ 未通过') + ' · ' + acc + '%' : '未测试') + '</span></div>';
    }).join('');
    const reviewHtml = this.GRAD_STANDARDS.filter(s => !scores[s.key] || !scores[s.key].passed).map(s =>
      '<li>' + s.icon + ' ' + s.name + '：' + this._gradReviewTip(s.key) + '</li>'
    ).join('');
    container.innerHTML = `
      <div class="card">
        <div class="test-result">
          <div class="big-emoji">${allPassed ? '🎓' : (passedCount >= 4 ? '💪' : '📚')}</div>
          <div class="big-score">${passedCount} / ${total}</div>
          <div style="font-size:16px; font-weight:600;">${allPassed ? '🎉 恭喜达到 C2 母语水平！' : '继续努力，再接再厉'}</div>
          <div class="font-sm text-secondary" style="margin-top:8px;">
            ${allPassed ? '你的英语水平已正式达到 C2 毕业标准。' : '还有 ' + (total - passedCount) + ' 项未通过，请参考下方建议复习。'}
          </div>
        </div>
        <div class="test-result-rows">${rowsHtml}</div>
        ${allPassed ? `
          <div class="card" style="background:rgba(76,175,136,0.12); border:1px solid var(--success); margin-top:16px;">
            <div style="color:var(--success); font-weight:600;">🎓 已正式毕业！</div>
            <div class="font-sm text-secondary" style="margin-top:4px;">毕业日期：${new Date().toLocaleDateString('zh-CN')}</div>
          </div>
        ` : `
          <div class="card-title" style="margin-top:18px;">📌 复习建议</div>
          <ul class="font-sm text-secondary" style="line-height:1.7; padding-left:18px;">${reviewHtml}</ul>
        `}
      </div>
      <div class="flex gap-8 flex-wrap" style="margin-top:14px;">
        <button class="btn btn-primary" id="gradRetry">🔄 重新测试</button>
        <button class="btn btn-secondary" id="gradHome">← 返回菜单</button>
      </div>
    `;
    document.getElementById('gradRetry').onclick = () => this._startGraduation();
    document.getElementById('gradHome').onclick = () => this._renderMenu();
  },

  // ----- 毕业测试复习建议 -----
  _gradReviewTip(key) {
    const tips = {
      listening: '多听 BBC/CNN/NPR 新闻，每日 30 分钟；反复听 L5 级对话，注意连读与弱读。',
      speaking: '每天跟读 1 段英文音频并录音回放；尝试用英语描述图片或主题；可与 AI 进行自由对话练习。',
      reading: '精读《经济学人》《纽约时报》等高级文章；练习快速抓主旨与作者态度；积累学术词汇。',
      writing: '每周写 2 篇 200 字议论文；注重结构（intro/body/conclusion）；多使用连接词与高级句式；可让 AI 批改。',
      vocabulary: '系统背诵 GRE/雅思/托福词汇；使用词根词缀法记忆；每周测试一次大词库。',
      grammar: '重点复习倒装、虚拟语气、独立主格、非谓语动词、复杂从句等 C1-C2 语法点。'
    };
    return tips[key] || '请针对性复习相关内容。';
  }
};

/* 注册模块：路由 navigate('test') 时调用 EM.modules.test.render(container) */
EM.registerModule('test', EM.test);
