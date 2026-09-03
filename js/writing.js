/* ===== 写作训练模块 (Writing) =====
 * 三种模式循序渐进：
 *   1) 造句练习：从 vocabulary.json 例句生成题目，给中文 → 用户输入英文 → 词级相似度对比
 *   2) 短文写作：给题目 → 用户写作文 → 提交后看范文
 *   3) 自由写作：自由输入 → 可 TTS 朗读自己的文章
 * 批改：本地检查（拼写/基本语法），如配置了 AI（EM.progress.getSettings().aiApiKey）则调用 AI 批改
 * 完成存入 progress.modules.writing.completed
 * 兼容 iOS Safari：所有 TTS 由用户点击触发
 * 数据：EM.data.load('vocabulary') → data/vocabulary.json（提取 example/exampleCn 作为造句题）
 */
window.EM = window.EM || {};

EM.writing = {
  data: null,              // 从 data/vocabulary.json 加载的词汇数据
  _container: null,        // 当前渲染容器
  mode: 'sentence',        // 'sentence' 造句 | 'essay' 短文 | 'free' 自由
  activeLevel: 1,          // 当前级别 1-5
  // 造句练习状态
  _sentencePool: [],       // 当前级别的造句题目池
  _sentenceIdx: 0,         // 当前题目索引
  // 短文写作状态
  _essayIdx: 0,            // 当前范文索引
  // 内置短文题目与范文（分级，循序渐进）
  essayTopics: [
    {
      id: 'e1',
      level: 1,
      title: 'Introduce Your Family',
      titleCn: '介绍你的家庭',
      prompt: 'Write 5-8 sentences introducing your family. Try to use words like: father, mother, sister, brother, teacher, doctor, student, happy.',
      promptCn: '写5-8句话介绍你的家庭。尝试使用：father, mother, sister, brother, teacher, doctor, student, happy 等词。',
      sample: 'I have a small family. There are four people in my family. My father is a teacher. My mother is a doctor. I have a sister. She is a student. I am a student too. We love each other. We are very happy.',
      sampleCn: '我有一个小家庭。我家有四口人。我爸爸是老师。我妈妈是医生。我有一个姐姐。她是学生。我也是学生。我们彼此相爱。我们非常幸福。'
    },
    {
      id: 'e2',
      level: 1,
      title: 'My Day',
      titleCn: '我的一天',
      prompt: 'Write 5-8 sentences about your day from morning to night. Use time words: in the morning, at noon, in the afternoon, at night.',
      promptCn: '写5-8句话描述你从早到晚的一天。使用时间词：in the morning, at noon, in the afternoon, at night。',
      sample: 'I get up at seven in the morning. I eat breakfast at half past seven. I go to school at eight. I have lunch at noon. I come home at four in the afternoon. I do my homework. I go to bed at nine at night.',
      sampleCn: '我早上七点起床。我七点半吃早饭。我八点去上学。我中午吃午饭。我下午四点回家。我做作业。我晚上九点上床睡觉。'
    },
    {
      id: 'e3',
      level: 2,
      title: 'A Trip to the Park',
      titleCn: '公园之旅',
      prompt: 'Write 8-12 sentences about a trip to a park. Describe the weather, the people, what you did, and how you felt.',
      promptCn: '写8-12句话描述一次公园之旅。描写天气、人物、你做了什么以及你的感受。',
      sample: 'Last Sunday, my family went to the park. The weather was sunny and warm. The park was full of people. Some children were flying kites. My parents sat on the grass and talked. I rode my bicycle around the lake. At noon, we had a picnic under a big tree. After lunch, we took many photos. We left the park at four in the afternoon. We were tired but very happy.',
      sampleCn: '上周日，我们一家去了公园。天气晴朗温暖。公园里到处是人。一些孩子在放风筝。父母坐在草地上聊天。我绕着湖骑自行车。中午，我们在大树下野餐。午饭后，我们拍了很多照片。下午四点我们离开公园。我们很累但很开心。'
    },
    {
      id: 'e4',
      level: 2,
      title: 'My Best Friend',
      titleCn: '我最好的朋友',
      prompt: 'Write 8-12 sentences about your best friend. Describe their appearance, personality, hobbies, and why you are friends.',
      promptCn: '写8-12句话描述你最好的朋友。描写其外貌、性格、爱好，以及你们为何成为朋友。',
      sample: 'My best friend is Tom. He is tall and strong. He has short black hair and big eyes. He is kind and helpful. He likes sports very much. He plays football every day. He is also good at math. He often helps me with my math. We have known each other for five years. We always play together after school. I hope we will be friends forever.',
      sampleCn: '我最好的朋友是汤姆。他又高又壮。他有黑色短发和大眼睛。他善良又乐于助人。他非常喜欢运动。他每天踢足球。他也擅长数学。他经常帮我学数学。我们认识五年了。放学后我们总是一起玩。我希望我们永远是朋友。'
    },
    {
      id: 'e5',
      level: 3,
      title: 'The Importance of Education',
      titleCn: '教育的重要性',
      prompt: 'Write 10-15 sentences about why education is important. Consider: knowledge, jobs, society, and lifelong learning.',
      promptCn: '写10-15句话论述教育为何重要。考虑：知识、工作、社会以及终身学习。',
      sample: 'Education is one of the most important things in our lives. It helps us learn knowledge and skills. It also helps us become better people. Without education, our society cannot develop. Schools teach us reading, writing, math and many other subjects. Education gives us the power to change our lives. A person with a good education can find a better job. Moreover, education helps reduce poverty and crime. However, education does not only happen in school. We can learn from books, from the internet, and from the people around us. Learning should never stop. Education is a lifelong journey.',
      sampleCn: '教育是我们生活中最重要的事情之一。它帮助我们学习知识和技能。它也帮助我们成为更好的人。没有教育，社会无法发展。学校教我们阅读、写作、数学和许多其他科目。教育赋予我们改变生活的力量。受过良好教育的人能找到更好的工作。此外，教育有助于减少贫困和犯罪。然而，教育不仅发生在学校。我们可以从书本、互联网和周围的人身上学习。学习永远不应停止。教育是一段终身的旅程。'
    },
    {
      id: 'e6',
      level: 3,
      title: 'City Life vs Country Life',
      titleCn: '城市生活与乡村生活',
      prompt: 'Write 12-16 sentences comparing city life and country life. Discuss advantages and disadvantages of each.',
      promptCn: '写12-16句话比较城市生活与乡村生活。讨论各自的优缺点。',
      sample: 'Many people move from the country to the city every year. They want better jobs and schools. But is city life really better? Cities have many chances. There are more jobs, shops, hospitals and schools. But city life is busy and noisy. The air is often dirty. Traffic is heavy. Houses are expensive. In the country, life is slower and quieter. The air is fresh and the food is healthy. People know their neighbors. But country life also has problems. There are fewer jobs and fewer schools. In short, there is no perfect place. The best choice depends on what a person needs. Both ways of life can be happy.',
      sampleCn: '每年许多人从乡下搬到城市。他们想要更好的工作和学校。但城市生活真的更好吗？城市充满机会。工作、商店、医院和学校更多。但城市生活繁忙嘈杂。空气经常很脏。交通拥挤。房子昂贵。在乡村，生活更慢更安静。空气清新，食物健康。人们认识邻居。但乡村生活也有问题。工作和学校更少。简而言之，没有完美的地方。最好的选择取决于个人需求。两种生活方式都可以幸福。'
    }
  ],

  /* ===== 入口：由路由调用 ===== */
  async render(container) {
    this._container = container;
    this._injectStyles();
    container.innerHTML = '<div class="loading">加载写作数据中...</div>';

    // 加载词汇数据（用于造句题目）
    if (!this.data) {
      this.data = await EM.data.load('vocabulary');
    }

    // 从进度恢复级别（默认用户当前级别，至少 L1）
    const p = EM.progress.get();
    this.activeLevel = Math.max(1, Math.min(5, p.level || 1));

    // 准备造句题池
    this._buildSentencePool();

    this._renderShell();
  },

  /* ===== 注入本模块专用样式 ===== */
  _injectStyles() {
    if (document.getElementById('writing-styles')) return;
    const style = document.createElement('style');
    style.id = 'writing-styles';
    style.textContent = `
      .write-mode-bar { display:flex; gap:8px; margin-bottom:12px; flex-wrap:wrap; }
      .write-hint { font-size:13px; color:var(--text-secondary); margin-top:8px; }
      .write-textarea {
        width:100%; min-height:160px; padding:12px; background:var(--bg-card);
        border:1px solid var(--border); border-radius:var(--radius-sm);
        color:var(--text-primary); font-size:15px; line-height:1.7;
        font-family:inherit; resize:vertical; box-sizing:border-box;
      }
      .write-textarea:focus { outline:none; border-color:var(--accent); }
      .write-input {
        width:100%; padding:10px 12px; background:var(--bg-card);
        border:1px solid var(--border); border-radius:var(--radius-sm);
        color:var(--text-primary); font-size:15px; box-sizing:border-box;
      }
      .write-input:focus { outline:none; border-color:var(--accent); }
      .sentence-prompt {
        font-size:18px; font-weight:600; padding:14px 16px;
        background:var(--accent-bg); border-left:3px solid var(--accent);
        border-radius:var(--radius-sm); margin:12px 0;
      }
      .sentence-prompt .sp-label { font-size:13px; color:var(--accent); margin-bottom:4px; display:block; }
      .similarity-bar {
        height:8px; background:var(--bg-hover); border-radius:4px; overflow:hidden;
        margin:8px 0;
      }
      .similarity-fill { height:100%; background:var(--accent); transition:width 0.4s; }
      .diff-row {
        font-size:14px; padding:6px 0; border-bottom:1px dashed var(--border);
      }
      .diff-word { display:inline-block; padding:1px 6px; margin:0 2px; border-radius:3px; }
      .diff-word.match { background:rgba(76,175,136,0.18); color:var(--success); }
      .diff-word.miss { background:rgba(240,80,80,0.18); color:var(--danger); text-decoration:line-through; }
      .diff-word.extra { background:rgba(240,160,64,0.18); color:var(--warning); }
      .diff-word.ref { background:rgba(240,160,64,0.10); color:var(--text-secondary); }
      .essay-prompt {
        padding:12px 16px; background:var(--bg-hover); border-radius:var(--radius-sm);
        margin:10px 0; font-size:14px; line-height:1.7; color:var(--text-primary);
      }
      .essay-sample {
        padding:14px 16px; background:var(--bg-card); border:1px solid var(--border);
        border-left:3px solid var(--success); border-radius:var(--radius-sm);
        margin:12px 0; font-size:15px; line-height:1.85; color:var(--text-primary);
      }
      .essay-sample .es-title { font-weight:700; color:var(--success); margin-bottom:8px; }
      .essay-sample .es-cn { font-size:14px; color:var(--text-secondary); margin-top:10px; padding-top:10px; border-top:1px dashed var(--border); }
      .grade-box {
        padding:14px 16px; background:var(--bg-card); border:1px solid var(--border);
        border-left:3px solid var(--accent); border-radius:var(--radius-sm);
        margin:12px 0; font-size:14px; line-height:1.7;
      }
      .grade-box .gb-title { font-weight:700; color:var(--accent); margin-bottom:8px; }
      .grade-box .gb-item { padding:4px 0; }
      .grade-box .gb-issue { color:var(--danger); }
      .grade-box .gb-ok { color:var(--success); }
      .ai-feedback { white-space:pre-wrap; word-wrap:break-word; }
      .write-toolbar { display:flex; gap:8px; flex-wrap:wrap; margin:10px 0; }
      .essay-topic-item {
        padding:10px 14px; border:1px solid var(--border); border-radius:var(--radius-sm);
        background:var(--bg-card); margin-bottom:8px; cursor:pointer; transition:var(--transition);
      }
      .essay-topic-item:hover { border-color:var(--accent); background:var(--bg-hover); }
      .essay-topic-item .eti-title { font-weight:600; font-size:15px; }
      .essay-topic-item .eti-cn { font-size:13px; color:var(--text-secondary); margin-top:2px; }
      .essay-topic-item .eti-level { font-size:11px; color:var(--accent); margin-top:4px; }
    `;
    document.head.appendChild(style);
  },

  /* ===== 渲染外壳 ===== */
  _renderShell() {
    const container = this._container;
    const stats = this._calcStats();
    const p = EM.progress.get();

    container.innerHTML = `
      <div class="card">
        <div class="card-title">✍️ 写作训练 · 造句 · 短文 · 自由写作</div>
        <div class="progress-bar"><div class="progress-fill" style="width:${stats.pct}%"></div></div>
        <div class="font-sm text-secondary mt-16" style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;">
          <span>已完成 <b data-stat="done">${stats.doneCount}</b> 篇 · 当前级别 <b>L${this.activeLevel}</b></span>
          <span class="read-score">累计得分 <b data-stat="score">${stats.score}</b></span>
        </div>
      </div>

      <div class="card">
        <div class="write-mode-bar">
          <button class="btn ${this.mode === 'sentence' ? 'btn-primary' : 'btn-secondary'}" data-mode="sentence">📝 造句练习</button>
          <button class="btn ${this.mode === 'essay' ? 'btn-primary' : 'btn-secondary'}" data-mode="essay">📄 短文写作</button>
          <button class="btn ${this.mode === 'free' ? 'btn-primary' : 'btn-secondary'}" data-mode="free">🎨 自由写作</button>
        </div>
        ${this.mode !== 'free' ? `
          <div class="level-selector">
            ${EM.LEVELS.slice(1).map(lv => `
              <button class="level-btn ${lv.id === this.activeLevel ? 'active' : ''}" data-level="${lv.id}">L${lv.id} · ${lv.cn}</button>
            `).join('')}
          </div>
          <div class="write-hint">💡 选择级别：L1 简单句 → L5 复杂表达。造句题从词汇例句生成，循序渐进。</div>
        ` : `
          <div class="write-hint">💡 自由写作不限主题，写完可朗读自己的文章，并用本地检查或 AI 批改。</div>
        `}
      </div>

      <div id="writeContent"></div>
    `;

    // 模式切换
    container.querySelectorAll('[data-mode]').forEach(b => {
      b.onclick = () => {
        this.mode = b.dataset.mode;
        if (this.mode === 'sentence') this._buildSentencePool();
        this._renderShell();
      };
    });

    // 级别切换
    container.querySelectorAll('[data-level]').forEach(b => {
      b.onclick = () => {
        this.activeLevel = parseInt(b.dataset.level, 10);
        if (this.mode === 'sentence') {
          this._sentenceIdx = 0;
          this._buildSentencePool();
        }
        this._renderShell();
      };
    });

    this._renderContent();
  },

  /* ===== 内容区分发 ===== */
  _renderContent() {
    const el = document.getElementById('writeContent');
    if (!el) return;
    if (this.mode === 'sentence') this._renderSentence(el);
    else if (this.mode === 'essay') this._renderEssay(el);
    else if (this.mode === 'free') this._renderFree(el);
  },

  /* ===== 统计 ===== */
  _calcStats() {
    const p = EM.progress.get();
    const completed = (p.modules.writing && p.modules.writing.completed) || [];
    return {
      doneCount: completed.length,
      pct: Math.min(100, completed.length * 5),
      score: (p.modules.writing && p.modules.writing.score) || 0
    };
  },

  _refreshStats() {
    const stats = this._calcStats();
    const c = this._container;
    if (!c) return;
    const fill = c.querySelector('.progress-fill');
    if (fill) fill.style.width = stats.pct + '%';
    const d = c.querySelector('[data-stat="done"]');
    if (d) d.textContent = stats.doneCount;
    const s = c.querySelector('[data-stat="score"]');
    if (s) s.textContent = stats.score;
  },

  /* ================= 造句练习 ================= */

  /* 从词汇数据构建造句题池：使用 example（英文例句）和 exampleCn（中文） */
  _buildSentencePool() {
    this._sentencePool = [];
    if (!this.data || !this.data.levels) return;
    const lvl = this.data.levels.find(l => l.level === this.activeLevel);
    if (!lvl || !lvl.words) return;
    // 优先选择较长、有完整意义的例句
    lvl.words.forEach(w => {
      if (w.example && w.exampleCn && w.example.length > 8) {
        this._sentencePool.push({
          word: w.word,
          meaning: w.meaning,
          en: w.example,
          cn: w.exampleCn
        });
      }
    });
    // 如果该级别题数不足，从相邻级别补
    if (this._sentencePool.length < 5) {
      this.data.levels.forEach(l => {
        if (l.level === this.activeLevel) return;
        (l.words || []).forEach(w => {
          if (w.example && w.exampleCn && w.example.length > 8) {
            this._sentencePool.push({
              word: w.word, meaning: w.meaning, en: w.example, cn: w.exampleCn
            });
          }
        });
      });
    }
    this._sentenceIdx = 0;
  },

  _renderSentence(el) {
    if (!this._sentencePool.length) {
      el.innerHTML = '<div class="card"><p class="text-secondary">该级别暂无造句题目。请尝试其他级别。</p></div>';
      return;
    }
    if (this._sentenceIdx >= this._sentencePool.length) this._sentenceIdx = 0;
    const item = this._sentencePool[this._sentenceIdx];
    const pos = (this._sentenceIdx + 1) + ' / ' + this._sentencePool.length;
    const p = EM.progress.get();
    const completed = (p.modules.writing && p.modules.writing.completed) || [];
    const doneKey = 'sentence_' + this.activeLevel + '_' + this._sentenceIdx;
    const done = completed.includes(doneKey);

    el.innerHTML = `
      <div class="card">
        <div class="flex justify-between align-center mb-16" style="flex-wrap:wrap;gap:8px;">
          <span class="font-sm text-secondary">题目 ${pos} · 单词：${EM.ui.esc(item.word)} (${EM.ui.esc(item.meaning)})</span>
          <span class="font-sm text-secondary">${done ? '✓ 已完成' : ''}</span>
        </div>
        <div class="sentence-prompt">
          <span class="sp-label">💬 请将下面的中文翻译成英文：</span>
          ${EM.ui.esc(item.cn)}
        </div>
        <input type="text" class="write-input" id="sentenceInput"
               placeholder="在这里输入英文句子..." autocomplete="off" autocapitalize="off" spellcheck="false">
        <div class="write-toolbar">
          <button class="btn btn-primary" id="sentenceSubmit">📝 提交对比</button>
          <button class="btn btn-secondary" id="sentenceSpeak">🔊 朗读我的句子</button>
          <button class="btn btn-secondary" id="sentenceRef">👁 查看参考答案</button>
          <button class="btn btn-success" id="sentenceNext">下一题 ➡️</button>
        </div>
        <div id="sentenceResult"></div>
      </div>
    `;

    const input = document.getElementById('sentenceInput');
    document.getElementById('sentenceSubmit').onclick = () => this._checkSentence(item, doneKey);
    document.getElementById('sentenceSpeak').onclick = () => {
      const v = input.value.trim();
      if (!v) { EM.ui.toast('请先输入句子'); return; }
      EM.tts.speak(v, { rate: 0.85 });
    };
    document.getElementById('sentenceRef').onclick = () => {
      const r = document.getElementById('sentenceResult');
      r.innerHTML = `
        <div class="essay-sample">
          <div class="es-title">📖 参考答案</div>
          ${EM.ui.esc(item.en)}
          <div class="es-cn">${EM.ui.esc(item.cn)}</div>
        </div>
      `;
    };
    document.getElementById('sentenceNext').onclick = () => {
      this._sentenceIdx = (this._sentenceIdx + 1) % this._sentencePool.length;
      this._renderContent();
    };
    input.onkeydown = (e) => { if (e.key === 'Enter') this._checkSentence(item, doneKey); };
  },

  /* 词级相似度对比 */
  _checkSentence(item, doneKey) {
    const input = document.getElementById('sentenceInput');
    const result = document.getElementById('sentenceResult');
    if (!input || !result) return;
    const userText = input.value.trim();
    if (!userText) { EM.ui.toast('请先输入句子'); return; }

    // 词级对比：分词、转小写、去标点
    const tokenize = (s) => (s.toLowerCase().match(/[a-z']+/g) || []);
    const userWords = tokenize(userText);
    const refWords = tokenize(item.en);

    if (!userWords.length || !refWords.length) {
      result.innerHTML = '<div class="write-hint" style="color:var(--danger);">无法对比，请输入有效的英文句子。</div>';
      return;
    }

    // 计算相似度：参考句子中被用户覆盖的词比例（去重）
    const refSet = new Set(refWords);
    const userSet = new Set(userWords);
    let matched = 0;
    refSet.forEach(w => { if (userSet.has(w)) matched++; });
    const similarity = Math.round(matched / refSet.size * 100);

    // 词级 diff 展示：以用户句子为主，标注 match/extra；并列出参考缺失词
    const userDiffHtml = userWords.map(w =>
      refSet.has(w)
        ? `<span class="diff-word match">${EM.ui.esc(w)}</span>`
        : `<span class="diff-word extra">${EM.ui.esc(w)}</span>`
    ).join(' ');
    const missing = refWords.filter(w => !userSet.has(w));
    const missingHtml = missing.length
      ? `<div class="write-hint">未使用的参考词：<b>${missing.map(w => EM.ui.esc(w)).join(', ')}</b></div>`
      : '';

    // 大小写与标点检查
    const checks = [];
    const firstChar = userText.trim().charAt(0);
    if (firstChar && firstChar === firstChar.toLowerCase() && /[a-z]/.test(firstChar)) {
      checks.push('句子首字母应大写');
    }
    if (!/[.!?]$/.test(userText.trim())) {
      checks.push('句末应有标点（. ! ?）');
    }
    if (/\s{2,}/.test(userText)) {
      checks.push('有多余空格');
    }

    const pass = similarity >= 70;
    result.innerHTML = `
      <div class="grade-box">
        <div class="gb-title">📊 词级相似度对比</div>
        <div class="similarity-bar"><div class="similarity-fill" style="width:${similarity}%"></div></div>
        <div class="write-hint">相似度：<b style="color:${pass ? 'var(--success)' : 'var(--warning)'};">${similarity}%</b> ${pass ? '✓ 通过' : '⚠️ 继续努力'}</div>
        <div class="diff-row" style="margin-top:10px;">
          <div class="write-hint">你的句子（绿色=匹配，橙色=多余）：</div>
          ${userDiffHtml}
        </div>
        <div class="diff-row">
          <div class="write-hint">参考答案：</div>
          ${refWords.map(w =>
            userSet.has(w)
              ? `<span class="diff-word match">${EM.ui.esc(w)}</span>`
              : `<span class="diff-word ref">${EM.ui.esc(w)}</span>`
          ).join(' ')}
        </div>
        ${missingHtml}
        ${checks.length ? `
          <div style="margin-top:10px;">
            <div class="write-hint">基本检查：</div>
            ${checks.map(c => `<div class="gb-issue">⚠️ ${EM.ui.esc(c)}</div>`).join('')}
          </div>
        ` : '<div class="gb-ok" style="margin-top:10px;">✓ 大小写与标点检查通过</div>'}
      </div>
    `;

    // 通过则记完成 + 得分
    if (pass) {
      EM.progress.update(d => {
        if (!d.modules.writing) d.modules.writing = { completed: [], score: 0 };
        if (!d.modules.writing.completed.includes(doneKey)) {
          d.modules.writing.completed.push(doneKey);
          d.modules.writing.score = (d.modules.writing.score || 0) + Math.round(similarity / 10);
        }
      });
      this._refreshStats();
      EM.ui.toast('造句通过！已记录');
      // 学生模型 + XP
      EM.student.record('writing', Math.min(100, Math.round(similarity / 2)), 1);
      EM.student.record('naturalness', Math.min(100, Math.round(similarity / 2)), 1);
      EM.achieve.addXP(EM.achieve.XP.write, '造句');
      EM.achieve.check();
      EM.recordDailyActivity('writing', 1);
      // 完成造句后自动检查路径推进(满足阈值时进入下一课)
      if (EM.path && typeof EM.path.advanceToNext === 'function') {
        setTimeout(() => EM.path.advanceToNext(), 1200);
      }
    } else {
      EM.progress.addWeakness('writing', 'sentence_' + item.word);
      EM.errors.add('writing', 'sentence_' + item.word);
      EM.ui.toast('相似度较低，已记入弱项');
    }
  },

  /* ================= 短文写作 ================= */

  _renderEssay(el) {
    // 当前级别的题目，没有则用第一个
    const topics = this.essayTopics.filter(t => t.level === this.activeLevel);
    if (!topics.length) {
      el.innerHTML = `
        <div class="card">
          <p class="text-secondary">该级别暂无短文题目。请选择其他级别，或前往自由写作。</p>
        </div>
      `;
      return;
    }
    if (this._essayIdx >= topics.length) this._essayIdx = 0;
    const topic = topics[this._essayIdx];
    const pos = (this._essayIdx + 1) + ' / ' + topics.length;
    const p = EM.progress.get();
    const completed = (p.modules.writing && p.modules.writing.completed) || [];
    const doneKey = 'essay_' + topic.id;
    const done = completed.includes(doneKey);

    el.innerHTML = `
      <div class="card">
        <div class="flex justify-between align-center mb-16" style="flex-wrap:wrap;gap:8px;">
          <span class="font-sm text-secondary">题目 ${pos} · L${this.activeLevel} · ${done ? '✓ 已完成' : '未完成'}</span>
        </div>
        <div class="card-title" style="margin-bottom:8px;">${EM.ui.esc(topic.title)}</div>
        <div class="font-sm text-secondary mb-16">${EM.ui.esc(topic.titleCn)}</div>
        <div class="essay-prompt">
          <b>📝 写作要求：</b><br>${EM.ui.esc(topic.prompt)}
          <div class="write-hint" style="margin-top:8px;">${EM.ui.esc(topic.promptCn)}</div>
        </div>
        <textarea class="write-textarea" id="essayArea" placeholder="在这里写你的英文短文..."></textarea>
        <div class="write-toolbar">
          <button class="btn btn-primary" id="essayGrade">📝 本地批改</button>
          <button class="btn btn-secondary" id="essaySpeak">🔊 朗读我的文章</button>
          <button class="btn btn-success" id="essaySample">📖 查看范文</button>
          <button class="btn btn-secondary" id="essayNext">下一篇 ➡️</button>
        </div>
        <div id="essayResult"></div>
      </div>
    `;

    const area = document.getElementById('essayArea');
    document.getElementById('essayGrade').onclick = () => this._gradeEssay(topic, doneKey);
    document.getElementById('essaySpeak').onclick = () => {
      const v = area.value.trim();
      if (!v) { EM.ui.toast('请先写作'); return; }
      EM.tts.speak(v, { rate: 0.9 });
    };
    document.getElementById('essaySample').onclick = () => {
      const r = document.getElementById('essayResult');
      r.innerHTML = `
        <div class="essay-sample">
          <div class="es-title">📖 范文</div>
          ${EM.ui.esc(topic.sample)}
          <div class="es-cn">${EM.ui.esc(topic.sampleCn)}</div>
        </div>
      `;
    };
    document.getElementById('essayNext').onclick = () => {
      this._essayIdx = (this._essayIdx + 1) % topics.length;
      this._renderContent();
    };
  },

  /* 短文本地批改 + 可选 AI 批改 */
  async _gradeEssay(topic, doneKey) {
    const area = document.getElementById('essayArea');
    const result = document.getElementById('essayResult');
    if (!area || !result) return;
    const text = area.value.trim();
    if (!text) { EM.ui.toast('请先写作'); return; }

    // 本地检查
    const local = this._localCheck(text, topic.prompt);

    // 检查 AI 配置
    const settings = EM.progress.getSettings();
    const hasAI = settings.aiApiKey && settings.aiApiUrl;

    result.innerHTML = `
      <div class="grade-box" id="gradeBox">
        <div class="gb-title">📊 本地批改结果</div>
        ${local.html}
      </div>
      ${hasAI ? '<div class="grade-box" id="aiGradeBox"><div class="gb-title">🤖 AI 批改中...</div></div>' : `
        <div class="write-hint">💡 提示：在「设置」中配置 AI 接口可获得更详细的批改建议。</div>
      `}
    `;

    // 通过本地检查即记完成（字数 >= 50% 提示要求）
    const wordCount = (text.match(/[a-zA-Z']+/g) || []).length;
    if (wordCount >= 30) {
      EM.progress.update(d => {
        if (!d.modules.writing) d.modules.writing = { completed: [], score: 0 };
        if (!d.modules.writing.completed.includes(doneKey)) {
          d.modules.writing.completed.push(doneKey);
          d.modules.writing.score = (d.modules.writing.score || 0) + Math.min(20, Math.floor(wordCount / 5));
        }
      });
      this._refreshStats();
      EM.ui.toast('短文已提交，已记录完成');
      // 学生模型 + XP
      EM.student.record('writing', Math.min(90, 40 + Math.floor(wordCount / 10)), 2);
      EM.achieve.addXP(EM.achieve.XP.write, '短文写作');
      EM.achieve.check();
      EM.recordDailyActivity('writing', 1);
    }

    // 调用 AI 批改
    if (hasAI) {
      try {
        const aiFeedback = await this._aiGrade(text, topic);
        const box = document.getElementById('aiGradeBox');
        if (box) {
          box.innerHTML = `
            <div class="gb-title">🤖 AI 批改建议</div>
            <div class="ai-feedback">${aiFeedback}</div>
          `;
        }
      } catch (e) {
        const box = document.getElementById('aiGradeBox');
        if (box) {
          box.innerHTML = `<div class="gb-title">🤖 AI 批改</div><div class="gb-issue">AI 批改失败：${EM.ui.esc(e.message || '网络错误')}</div>`;
        }
      }
    }
  },

  /* ================= 自由写作 ================= */

  _renderFree(el) {
    el.innerHTML = `
      <div class="card">
        <div class="card-title">🎨 自由写作</div>
        <div class="write-hint">不限主题，自由发挥。写完后可朗读自己的文章，并用本地检查或 AI 批改。</div>
        <textarea class="write-textarea" id="freeArea" placeholder="在这里自由写作英文..." style="min-height:240px;"></textarea>
        <div class="write-toolbar">
          <button class="btn btn-primary" id="freeGrade">📝 本地批改</button>
          <button class="btn btn-secondary" id="freeSpeak">🔊 朗读我的文章</button>
          <button class="btn btn-success" id="freeSave">💾 保存并记录</button>
          <button class="btn btn-secondary" id="freeClear">🗑️ 清空</button>
        </div>
        <div id="freeResult"></div>
      </div>
    `;

    const area = document.getElementById('freeArea');
    // 恢复上次内容
    const last = (typeof localStorage !== 'undefined') ? localStorage.getItem('em_writing_free') : '';
    if (last) area.value = last;
    area.oninput = () => {
      try { localStorage.setItem('em_writing_free', area.value); } catch (e) {}
    };

    document.getElementById('freeGrade').onclick = () => this._gradeFree();
    document.getElementById('freeSpeak').onclick = () => {
      const v = area.value.trim();
      if (!v) { EM.ui.toast('请先写作'); return; }
      EM.tts.speak(v, { rate: 0.9 });
    };
    document.getElementById('freeSave').onclick = () => {
      const v = area.value.trim();
      if (!v || v.length < 20) { EM.ui.toast('请至少写 20 个字符再保存'); return; }
      const wordCount = (v.match(/[a-zA-Z']+/g) || []).length;
      EM.progress.update(d => {
        if (!d.modules.writing) d.modules.writing = { completed: [], score: 0 };
        const key = 'free_' + Date.now();
        d.modules.writing.completed.push(key);
        d.modules.writing.score = (d.modules.writing.score || 0) + Math.min(15, Math.floor(wordCount / 10));
      });
      this._refreshStats();
      EM.ui.toast('已保存并记录完成');
      // 学生模型 + XP
      EM.student.record('writing', Math.min(90, 30 + Math.floor(wordCount / 5)), 2);
      EM.achieve.addXP(EM.achieve.XP.write, '自由写作');
      EM.achieve.check();
      EM.recordDailyActivity('writing', 1);
    };
    document.getElementById('freeClear').onclick = () => {
      if (confirm('确定清空当前内容？')) {
        area.value = '';
        try { localStorage.removeItem('em_writing_free'); } catch (e) {}
        document.getElementById('freeResult').innerHTML = '';
      }
    };
  },

  async _gradeFree() {
    const area = document.getElementById('freeArea');
    const result = document.getElementById('freeResult');
    if (!area || !result) return;
    const text = area.value.trim();
    if (!text) { EM.ui.toast('请先写作'); return; }

    const local = this._localCheck(text, '');
    const settings = EM.progress.getSettings();
    const hasAI = settings.aiApiKey && settings.aiApiUrl;

    result.innerHTML = `
      <div class="grade-box">
        <div class="gb-title">📊 本地批改结果</div>
        ${local.html}
      </div>
      ${hasAI ? '<div class="grade-box" id="aiGradeBox"><div class="gb-title">🤖 AI 批改中...</div></div>' : `
        <div class="write-hint">💡 配置 AI 接口可获得更详细的批改建议（设置 → AI 接口）。</div>
      `}
    `;

    if (hasAI) {
      try {
        const aiFeedback = await this._aiGrade(text, null);
        const box = document.getElementById('aiGradeBox');
        if (box) {
          box.innerHTML = `
            <div class="gb-title">🤖 AI 批改建议</div>
            <div class="ai-feedback">${aiFeedback}</div>
          `;
        }
      } catch (e) {
        const box = document.getElementById('aiGradeBox');
        if (box) {
          box.innerHTML = `<div class="gb-title">🤖 AI 批改</div><div class="gb-issue">AI 批改失败：${EM.ui.esc(e.message || '网络错误')}</div>`;
        }
      }
    }
  },

  /* ===== 本地检查（拼写/基本语法） ===== */
  _localCheck(text, prompt) {
    const issues = [];
    const okList = [];
    // 字数统计
    const words = (text.match(/[a-zA-Z']+/g) || []);
    const wordCount = words.length;
    // 句子统计
    const sentences = (text.match(/[^.!?]+[.!?]+/g) || []).filter(s => s.trim().length > 0);
    const sentenceCount = sentences.length || 1;
    // 平均句长
    const avgLen = Math.round(wordCount / sentenceCount);

    // 检查每个句子首字母是否大写
    sentences.forEach((s, i) => {
      const trim = s.trim();
      const first = trim.charAt(0);
      if (first && /[a-z]/.test(first)) {
        issues.push(`第 ${i + 1} 句首字母未大写`);
      }
    });
    // 检查句末标点
    if (text.trim() && !/[.!?]["')\]]*$/.test(text.trim())) {
      issues.push('文章末尾缺少结束标点（. ! ?）');
    }
    // 检查多余空格
    if (/\s{2,}/.test(text)) {
      issues.push('存在多余空格（连续两个或以上）');
    }
    // 检查 a/an 基本用法
    const anErrors = text.match(/\sa\s+[aeiouAEIOU]\w*/g);
    if (anErrors && anErrors.length) {
      issues.push(`"a" 后跟元音开头的词，可能应为 "an"（${anErrors.length} 处）`);
    }
    const aErrors = text.match(/\san\s+[^aeiouAEIOU\w]*[bcdfghjklmnpqrstvwxyzBCDFGHJKLMNPQRSTVWXYZ]\w*/g);
    if (aErrors && aErrors.length) {
      issues.push(`"an" 后跟辅音开头的词，可能应为 "a"（${aErrors.length} 处）`);
    }
    // 检查 I 是否大写
    const lowercaseI = text.match(/\si\s/g);
    if (lowercaseI && lowercaseI.length) {
      issues.push(`独立使用的 "i" 应大写为 "I"（${lowercaseI.length} 处）`);
    }
    // 重复词检查
    const dupMatch = text.match(/\b(\w+)\s+\1\b/gi);
    if (dupMatch && dupMatch.length) {
      issues.push(`存在重复词：${dupMatch.slice(0, 3).map(s => EM.ui.esc(s)).join('、')}`);
    }

    // 统计正常项
    if (!issues.length) okList.push('✓ 大小写、标点、a/an 用法检查通过');
    if (wordCount >= 30) okList.push(`✓ 字数充足（${wordCount} 词）`);
    else issues.push(`字数偏少（${wordCount} 词），建议多写一些`);
    if (avgLen >= 5 && avgLen <= 25) okList.push(`✓ 句子长度适中（平均 ${avgLen} 词/句）`);
    else if (avgLen > 25) issues.push(`句子较长（平均 ${avgLen} 词），可考虑拆分`);

    const html = `
      <div class="gb-item"><b>字数：</b>${wordCount} 词 · ${sentenceCount} 句 · 平均 ${avgLen} 词/句</div>
      ${okList.length ? `<div class="gb-ok">${okList.map(s => `<div>${s}</div>`).join('')}</div>` : ''}
      ${issues.length ? `
        <div style="margin-top:8px;"><b>建议改进：</b></div>
        ${issues.map(s => `<div class="gb-issue">⚠️ ${EM.ui.esc(s)}</div>`).join('')}
      ` : ''}
    `;
    return { html, wordCount, sentenceCount, issues };
  },

  /* ===== AI 批改（调用配置的 AI 接口） ===== */
  async _aiGrade(text, topic) {
    const settings = EM.progress.getSettings();
    if (!settings.aiApiKey || !settings.aiApiUrl) {
      throw new Error('未配置 AI 接口');
    }
    const prompt = topic
      ? `You are an English writing teacher. Please grade and give feedback on the following essay. The topic is "${topic.title}" (${topic.titleCn}). Prompt: ${topic.prompt}\n\nStudent's essay:\n${text}\n\nPlease provide: 1) overall score (0-100), 2) grammar/spelling issues with corrections, 3) suggestions for improvement, 4) a short encouraging comment. Respond in Chinese.`
      : `You are an English writing teacher. Please grade and give feedback on the following free writing.\n\nText:\n${text}\n\nPlease provide: 1) overall score (0-100), 2) grammar/spelling issues with corrections, 3) suggestions for improvement, 4) a short encouraging comment. Respond in Chinese.`;

    const body = {
      model: settings.aiModel || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are a helpful English writing teacher for Chinese learners.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.5,
      max_tokens: 800
    };

    const res = await fetch(settings.aiApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${settings.aiApiKey}`
      },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status} ${errText.slice(0, 100)}`);
    }
    const data = await res.json();
    // 兼容 OpenAI / 多数兼容接口
    const content = data && data.choices && data.choices[0] && data.choices[0].message
      ? data.choices[0].message.content
      : (data && data.content) || 'AI 未返回有效内容';
    // 转义后保留换行
    return EM.ui.esc(content).replace(/\n/g, '<br>');
  }
};

/* 注册模块：路由 navigate('writing') 时调用 EM.modules.writing.render(container) */
EM.registerModule('writing', EM.writing);
