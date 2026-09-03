/* ===== 自然拼读模块 (Phonics) =====
 * 循序渐进学习路径：字母 → 元音长短 → 辅音组合 → CVC拼读 → Magic E → 元音组合 → R控制音
 * 学习模式：字形 / 音标(IPA) / 每个例词 全部【分开独立点击】发音，互不干扰，绝不一键连读
 *   - 点字母或字母组合  → 听字形代表的读音
 *   - 点音标小胶囊      → 听该音发音要点(IPA 无法被 TTS 完美朗读,用最接近的拼读示范 + 中文口型提示)
 *   - 点任意一个例词    → 只读那一个词
 *   - CVC 卡片可逐个点字母音，再点“连起来读”体验拼读过程
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
        line-height:1; padding:0; z-index:2;
      }
      .phonics-mark:hover { border-color: var(--success); color: var(--success); }
      .phonics-sub   { font-size:16px; color: var(--text-secondary); margin-top:0; line-height:1.2; }

      /* —— 独立发音区 —— */
      .ph-listen { touch-action: manipulation; cursor:pointer; user-select:none; -webkit-user-select:none; }
      .ph-listen:active { transform: scale(0.94); }
      .ph-sym {
        display:flex; align-items:center; justify-content:center; gap:4px; width:100%;
        text-align:center; font-size:30px; font-weight:800; line-height:1.15;
        background:none; border:none; color:inherit; padding:4px 6px 0; cursor:pointer;
      }
      .ph-sym .ph-ic { font-size:11px; opacity:.5; transform:translateY(1px); }
      .ph-zone { display:flex; flex-wrap:wrap; gap:5px; margin-top:7px; justify-content:center; }
      .ph-chip, .ph-word, .ph-split {
        display:inline-flex; align-items:center; gap:3px; font-size:13px; line-height:1;
        padding:5px 9px; border-radius:999px; background:var(--bg-secondary,#fff);
        border:1px solid var(--border,#ddd); color:var(--text,#222);
      }
      .ph-chip { border-color:var(--accent); color:var(--accent); font-size:12.5px; }
      .ph-chip .ph-ic { font-size:10px; opacity:.7; }
      .ph-word { font-size:13.5px; padding:6px 10px; }
      .ph-word .ph-ic { font-size:10px; opacity:.6; }
      .ph-word .ph-wipa { font-style:normal; font-size:10px; opacity:.75; color:var(--accent); margin-left:2px; }
      .ph-split { font-size:17px; font-weight:700; padding:4px 11px; border-color:var(--accent); color:var(--accent); }
      .ph-actions { display:flex; flex-wrap:wrap; gap:6px; margin-top:7px; justify-content:center; }
      .ph-blend, .ph-pair {
        font-size:12px; padding:5px 10px; border-radius:999px; border:1px dashed var(--accent);
        color:var(--accent); background:transparent; cursor:pointer; line-height:1.2;
      }
      .ph-blend:active, .ph-pair:active { transform:scale(0.95); }
      .ph-hint { min-height:0; font-size:11px; color:var(--accent); margin-top:5px; text-align:center;
        opacity:0; transition:opacity .18s; line-height:1.3; }
      .ph-hint.show { opacity:1; }
      .phonics-symbol { font-size:34px; font-weight:700; line-height:1.1; }
      .phonics-eg   { font-size:12px; color: var(--text-secondary); margin-top:4px; }
      .phonics-sound { font-size:13px; color: var(--accent); margin-top:4px; font-family: Georgia, serif; }
      .phonics-cn { font-size:11px; color: var(--text-secondary); margin-top:5px; text-align:center; line-height:1.35; }
      .group-header { width:100%; font-size:14px; font-weight:600; color: var(--text-secondary); margin:10px 0 4px; padding-left:4px; }
      .quiz-question { font-size:18px; font-weight:600; margin-bottom:14px; }
      .quiz-meta { font-size:13px; color: var(--text-secondary); margin-bottom:12px; }
      .quiz-replay { margin-bottom:14px; }
      .quiz-prompt-word { font-size:34px; font-weight:700; text-align:center; margin:8px 0 16px; color: var(--accent); }
      .phonics-hint { font-size:13px; color: var(--text-secondary); margin-top:8px; }
      .phonics-emoji-row { font-size:20px; margin-top:4px; }
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
        <div class="phonics-hint">💡 发音全部【分开点】：「字形/字母组合」读整体、「音标」读发音要点、「每个例词」单独朗读。点右上角 ○ 标记"已掌握"。</div>
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

  /* ==================== IPA 音标朗读辅助 ====================
   * Web Speech API 只能朗读“词/字母名”，无法直接朗读音标符号。
   * 这里为每个音标提供“最接近的拼读示范文本”：
   *   - 元音/双元音用其自然拼写读出(如 /eɪ/→"ay"、/iː/→"ee")
   *   - 辅音用“辅音+弱读 ə”的声母读法(如 /b/→"buh")，这是中文母语者学英语辅音的标准方式，
   *     注意发音时把末尾的 ə 去掉即是纯辅音
   *   - 中文 cn 提示在点击后短暂显示，帮助掌握口型
   */
  _IPA_TALK: {
    // 元音/双元音
    '/eɪ/': { t: 'ay' }, '/iː/': { t: 'ee' }, '/aɪ/': { t: 'eye' }, '/oʊ/': { t: 'oh' },
    '/uː/': { t: 'oo' }, '/juː/': { t: 'you' }, '/aʊ/': { t: 'ow' }, '/ɔɪ/': { t: 'oy' },
    '/ɔː/': { t: 'aw' },
    '/ɑːr/': { t: 'ar' }, '/ɜːr/': { t: 'er' }, '/ər/': { t: 'er' }, '/ɔːr/': { t: 'or' },
    '/ɛər/': { t: 'air' }, '/ɪər/': { t: 'ear' },
    // 短元音（口型提示）
    '/æ/': { t: 'aa', cn: '/æ/：嘴巴向两侧拉开、短促，介于“啊”和“诶”之间（apple/cat 里的 a）' },
    '/ɛ/': { t: 'eh', cn: '/ɛ/：短促的“诶”，嘴半开（bed/egg 里的 e）' },
    '/ɪ/': { t: 'ih', cn: '/ɪ/：短促的“衣”，不拉长（sit/pig 里的 i）' },
    '/ɑː/': { t: 'ah', cn: '/ɑː/：嘴张大像“啊”拉长（美式 hot/dog 里的 o）' },
    '/ʌ/': { t: 'uh', cn: '/ʌ/：短促的“啊”，腹部用力（cup/sun 里的 u）' },
    '/ʊ/': { t: 'uhh', cn: '/ʊ/：短“乌”，嘴唇微圆、比 /uː/ 短（book 里的 oo）' },
    // 辅音（声母读法）
    '/b/': { t: 'buh' }, '/k/': { t: 'kuh' }, '/d/': { t: 'duh' }, '/f/': { t: 'fuh' },
    '/g/': { t: 'guh' }, '/h/': { t: 'huh' }, '/dʒ/': { t: 'juh' }, '/l/': { t: 'luh' },
    '/m/': { t: 'muh' }, '/n/': { t: 'nuh' },
    '/ŋ/': { t: 'uhng', cn: '/ŋ/：软腭鼻音，像“嗯”从鼻腔发出（sing/ring 的结尾音）' },
    '/p/': { t: 'puh' }, '/r/': { t: 'ruh' }, '/s/': { t: 'suh' }, '/t/': { t: 'tuh' },
    '/v/': { t: 'vuh' }, '/w/': { t: 'wuh' }, '/j/': { t: 'yuh' }, '/z/': { t: 'zuh' },
    '/ʃ/': { t: 'shh', cn: '/ʃ/：嘘声，舌尖靠近上颚送气（she/ship）' },
    '/tʃ/': { t: 'chuh' },
    '/θ/': { t: 'thh', cn: '/θ/：舌尖轻咬、只吐气不震动声带（think/three）' },
    '/ð/': { t: 'the', cn: '/ð/：舌尖轻咬、声带震动出声（this）' },
    '/ks/': { t: 'kuhss', cn: '/ks/：/k/+/s/ 快速连读（six/fox 的结尾）' },
    '/kw/': { t: 'kwuh', cn: '/kw/：/k/+/w/ 连读（queen）' },
    // 辅音连缀
    '/bl/': { t: 'bluh' }, '/kl/': { t: 'kluh' }, '/fl/': { t: 'fluh' }, '/gl/': { t: 'gluh' },
    '/pl/': { t: 'pluh' }, '/sl/': { t: 'sluh' }, '/br/': { t: 'bruh' }, '/kr/': { t: 'kruh' },
    '/dr/': { t: 'druh' }, '/fr/': { t: 'fruh' }, '/gr/': { t: 'gruh' }, '/tr/': { t: 'truh' },
    '/str/': { t: 'struh' }, '/sp/': { t: 'spuh' }, '/st/': { t: 'stuh' }, '/sk/': { t: 'skuh' },
    '/sm/': { t: 'smuh' }, '/sn/': { t: 'snuh' }, '/sw/': { t: 'swuh' }
  },

  /* 音标 → 拼读文本 */
  _talk(ipa) {
    const m = this._IPA_TALK[ipa];
    return m ? (m.t || '') : '';
  },
  /* 音标 → 中文口型提示 */
  _cn(ipa) {
    const m = this._IPA_TALK[ipa];
    return m ? (m.cn || '') : '';
  },

  /* CVC 逐字母拼读：字母 → 该字母在短元音 CVC 里的读音示范 */
  _LETTER_SOUND: {
    a: 'aa', b: 'buh', c: 'kuh', d: 'duh', e: 'eh', f: 'fuh', g: 'guh', h: 'huh',
    i: 'ih', j: 'juh', k: 'kuh', l: 'luh', m: 'muh', n: 'nuh', o: 'ah', p: 'puh',
    q: 'kwuh', r: 'ruh', s: 'suh', t: 'tuh', u: 'uh', v: 'vuh', w: 'wuh',
    x: 'kuhss', y: 'yuh', z: 'zuh'
  },
  _letterSound(ch) {
    return this._LETTER_SOUND[(ch || '').toLowerCase()] || (ch || '').toLowerCase();
  },

  /* 朗读一个音标（找不到示范时返回 false，由调用方回退） */
  _speakIpa(ipa, rate) {
    const t = this._talk(ipa);
    if (!t) return false;
    EM.tts.speak(t, { rate: rate || 0.9 });
    return true;
  },

  /* 字母名发音映射:用单词形式拼写字母名,避免 Web Speech API 把单字母读成不定冠词
   * 例: A→"Ayy", B→"Bee", C→"See", D→"Dee", E→"Ee", F→"Ef", G→"Gee", H→"Aich", ...
   * 这样 TTS 读到的就是纯字母名 /eɪ/ /biː/ /siː/ /diː/ /iː/ 等,无任何前缀
   */
  _letterName(letter) {
    const map = {
      'A':'Ayy','B':'Bee','C':'See','D':'Dee','E':'Ee','F':'Ef','G':'Gee',
      'H':'Aich','I':'Ai','J':'Jay','K':'Kay','L':'El','M':'Em','N':'En',
      'O':'Oh','P':'Pee','Q':'Cue','R':'Ar','S':'Es','T':'Tee',
      'U':'You','V':'Vee','W':'Double-You','X':'Ecks','Y':'Why','Z':'Zee'
    };
    return map[(letter || '').toUpperCase()] || (letter || '').toUpperCase();
  },

  /* ===== 把不同分类的数据统一成卡片项数组 =====
   * 学习模式用：
   *   zones[]   音标发音区 [{ipa, text?, label?}] —— 一个卡片可有多个音(如 th=/θ/ 和 /ð/)
   *   symbolTts 字形按钮点击后朗读的文本
   *   words[]   例词(每个词独立可点)
   *   wordIpas  {词: 该词含有的目标音标} —— 显示在例词胶囊下方
   *   splitLetters[]  CVC 逐字母
   * 测验模式用：quizType / quizAnswer / optionsPool / speakText(朗读文本,单个词或字母名)
   */
  _getItems(tabKey) {
    const d = this.data;
    if (!d) return [];
    const items = [];
    switch (tabKey) {
      case 'letters':
        // 字母卡片：字形=字母；音标区=字母名读音(/eɪ/...)；例词=1个代表词
        (d.letters || []).forEach(o => {
          const up = o.letter.toUpperCase();
          const name = this._letterName(up);
          items.push({
            id: 'letters:' + up,
            group: '',
            symbol: up,
            subSymbol: o.letter.toLowerCase(),
            sound: o.sound,
            words: [o.word],
            wordIpas: {},
            emoji: o.emoji,
            cn: o.cn,
            zones: [{ ipa: o.sound, text: name }],
            symbolTts: name,
            speakText: name,                       // 测验:直接读字母名
            quizType: 'letter',
            quizAnswer: up,
            optionsPool: (d.letters || []).map(x => x.letter.toUpperCase())
          });
        });
        break;
      case 'vowels':
        // 元音卡片：字形=字母(读字母名)；音标区=短音 + 长音两个独立音；例词=短/长各一个
        (d.vowels || []).forEach(o => {
          const up = (o.combo || '').toUpperCase();
          const name = this._letterName(up);
          items.push({
            id: 'vowels:' + up,
            group: '',
            symbol: up,
            subSymbol: o.combo,
            sound: '短 ' + o.short + '  长 ' + o.long,
            words: [o.shortEg, o.longEg],
            wordIpas: { [o.shortEg]: o.short, [o.longEg]: o.long },
            cn: '',
            zones: [
              { ipa: o.short, label: '短音', text: this._talk(o.short) || undefined },
              { ipa: o.long,  label: '长音', text: name }
            ],
            symbolTts: name,
            speakText: name,
            quizType: 'letter',
            quizAnswer: up,
            optionsPool: (d.vowels || []).map(x => (x.combo || '').toUpperCase())
          });
        });
        break;
      case 'consonants':
        // 辅音分类 = 单辅音 + 双字母/辅音组合：可能有多个读音(如 th: /θ/或/ð/)，每个读音独立成胶囊
        (d.consonants || []).forEach(o => {
          items.push(this._soundItem('consonants:' + o.combo, '单辅音', o, (d.consonants || []).map(x => x.combo)));
        });
        (d.blends || []).forEach(o => {
          items.push(this._soundItem('blends:' + o.combo, '辅音组合', o,
            (d.consonants || []).concat(d.blends || []).map(x => x.combo)));
        });
        break;
      case 'blends':
        // 辅音组合(备用入口，与 consonants 分类共用同一份数据)
        (d.blends || []).forEach(o => {
          items.push(this._soundItem('blends:' + o.combo, '', o,
            (d.consonants || []).concat(d.blends || []).map(x => x.combo)));
        });
        break;
      case 'cvc':
        // CVC：字形区=逐字母音(c-a-t 每个字母可点)；音标区=整词音标；例词=整词
        (d.cvc || []).forEach(o => {
          items.push({
            id: 'cvc:' + o.word,
            group: '',
            symbol: o.word,
            sound: o.sound,
            split: o.split,
            splitLetters: (o.split || o.word).split('-'),
            words: [o.word],
            wordIpas: {},
            cn: o.cn,
            zones: [{ ipa: o.sound }],            // 点击→慢速读整词
            symbolTts: o.word,
            speakText: o.word,
            quizType: 'split'
          });
        });
        break;
      case 'magicE':
        // Magic E：两个字都独立可点 + “对比读”按钮
        (d.magicE || []).forEach(o => {
          items.push({
            id: 'magicE:' + o.short,
            group: '',
            symbol: o.short + ' → ' + o.long,
            sound: '',
            words: [o.short, o.long],
            wordIpas: {},
            cn: o.cn,
            zones: [],
            symbolTts: '',
            speakText: o.long,
            quizType: 'magic'
          });
        });
        break;
      case 'vowelTeams':
        (d.vowelTeams || []).forEach(o => {
          items.push(this._soundItem('vowelTeams:' + o.combo, '', o, (d.vowelTeams || []).map(x => x.combo)));
        });
        break;
      case 'rControlled':
        (d.rControlled || []).forEach(o => {
          items.push(this._soundItem('rControlled:' + o.combo, '', o, (d.rControlled || []).map(x => x.combo)));
        });
        break;
    }
    return items;
  },

  /* 通用“字形+音标+例词”卡片项：单音或多个音(oo/th/ow...)通用 */
  _soundItem(id, group, o, optionsPool) {
    const ipas = (o.sounds && o.sounds.length) ? o.sounds : [o.sound];
    const zones = ipas.map(ipa => ({ ipa, text: this._talk(ipa) || undefined }));
    return {
      id,
      group,
      symbol: o.combo,
      sound: o.sound,
      words: (o.words || []).slice(),
      wordIpas: o.wordSounds || {},
      cn: o.cn || '',
      zones,
      symbolTts: zones[0] ? (zones[0].text || undefined) : '',
      speakText: (o.words && o.words[0]) || o.combo,   // 测验只读一个例词,不连读
      quizType: 'sound',
      quizAnswer: o.combo,
      optionsPool: optionsPool || []
    };
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

  /* ===== 学习模式：渲染卡片网格 =====
   * 每个卡片上所有发声元素都是独立的小按钮：
   *   [字形按钮] / [音标胶囊...] / [例词胶囊...] / [逐字母(CVC)] / [对比读(MagicE)]
   * 卡片本身不再有任何“整卡连读”，杜绝一点全出
   */
  _renderLearn(el) {
    const items = this._getItems(this.activeTab);
    if (!items.length) {
      el.innerHTML = '<div class="card"><p class="text-secondary">暂无数据。</p></div>';
      return;
    }
    const p = EM.progress.get();
    const mastered = new Set(p.modules.phonics.mastered || []);
    const isLetterTab = (this.activeTab === 'letters' || this.activeTab === 'vowels');

    let html = '<div class="card"><div class="phonics-grid">';
    let lastGroup = '__none__';
    items.forEach(it => {
      if (it.group && it.group !== lastGroup) {
        html += `<div class="group-header">${EM.ui.esc(it.group)}</div>`;
        lastGroup = it.group;
      }
      const isM = mastered.has(it.id);
      const isCvc = this.activeTab === 'cvc';
      const isMagic = this.activeTab === 'magicE';

      /* ---- 字形按钮：字母/元音读字母名；组合读其读音 ---- */
      let symbolHtml = '';
      if (isCvc) {
        // CVC:逐字母音按钮
        const splits = it.splitLetters.map(ch =>
          `<button class="ph-split ph-listen" data-tts="${EM.ui.esc(this._letterSound(ch))}" data-tip="${EM.ui.esc(ch + ' 的读音')}">${EM.ui.esc(ch)}</button>`).join('');
        symbolHtml = `<div class="ph-zone">${splits}</div>`;
      } else if (isMagic) {
        // Magic E: 两个词并排展示(各自在例词区可点),这里放规则文字
        symbolHtml = `<div class="phonics-symbol" style="font-size:20px;">${EM.ui.esc(it.symbol)}</div>`;
      } else {
        const tts = it.symbolTts || '';
        symbolHtml = `<button class="ph-sym ph-listen" data-tts="${EM.ui.esc(tts)}" data-tip="${EM.ui.esc(isLetterTab ? '字母名' : '字形读音')}">${EM.ui.esc(it.symbol)}<i class="ph-ic">🔊</i></button>`;
      }
      const subHtml = (it.subSymbol && !isCvc) ? `<div class="phonics-sub">${EM.ui.esc(it.subSymbol)}</div>` : '';

      /* ---- 音标胶囊区：每个音独立 ---- */
      let zoneHtml = '';
      if (it.zones && it.zones.length) {
        const chips = it.zones.map(z => {
          const rate = this._talk(z.ipa) ? '1' : '0.55';  // 无示范文本(整词音标)时慢速读例词
          const label = z.label ? EM.ui.esc(z.label) + ' ' : '';
          return `<button class="ph-chip ph-listen" data-tts="${EM.ui.esc(z.text || '')}" data-ipa="${EM.ui.esc(z.ipa)}" data-rate="${rate}" data-word="${EM.ui.esc(isCvc ? (it.words[0] || '') : '')}" data-cn="${EM.ui.esc(this._cn(z.ipa))}" data-tip="音标读音">🔊 ${label}${EM.ui.esc(z.ipa)}</button>`;
        }).join('');
        zoneHtml = `<div class="ph-zone">${chips}</div>`;
      }

      /* ---- 例词区：每个词独立可点 ---- */
      let wordHtml = '';
      if (it.words && it.words.length) {
        const wchips = it.words.map(w => {
          const ipaMini = it.wordIpas && it.wordIpas[w];
          const extra = it.emoji && isLetterTab ? ' ' + it.emoji : '';
          const mark = (it.wordIpas && Object.keys(it.wordIpas).length) ? `<i class="ph-wipa">${EM.ui.esc(ipaMini || '')}</i>` : '';
          return `<button class="ph-word ph-listen" data-tts="${EM.ui.esc(w)}" data-tip="例词 ${EM.ui.esc(w)}">🔊 ${EM.ui.esc(w)}${extra}${mark}</button>`;
        }).join('');
        const caption = isCvc ? '整词(先点上面字母，再把它们连起来)' : '例词(逐个点，只读单个词)';
        wordHtml = `<div class="ph-zone" style="margin-top:6px;"><span style="font-size:10px;color:var(--text-secondary);opacity:.8;width:100%;">${isMagic ? '两个词逐个听，体会 Magic E 的威力' : caption}</span>${wchips}</div>`;
      }

      /* ---- 附加按钮 ---- */
      let actionHtml = '';
      if (isCvc) {
        actionHtml = `<div class="ph-actions"><button class="ph-blend" data-seq="${it.splitLetters.map(ch => this._letterSound(ch)).join(',')}" data-word="${EM.ui.esc(it.words[0])}">🔊 连起来读 ${EM.ui.esc((it.splitLetters || []).join('-'))}</button></div>`;
      } else if (isMagic) {
        actionHtml = `<div class="ph-actions"><button class="ph-pair" data-seq="${EM.ui.esc(it.words[0])},${EM.ui.esc(it.words[1])}">🔊 对比读 (${EM.ui.esc(it.words[0])} → ${EM.ui.esc(it.words[1])})</button></div>`;
      }

      html += `
        <div class="phonics-cell ${isM ? 'mastered' : ''}" data-id="${EM.ui.esc(it.id)}">
          <button class="phonics-mark" data-mark="${EM.ui.esc(it.id)}" title="标记已掌握">${isM ? '✓' : '○'}</button>
          ${symbolHtml}${subHtml}
          ${zoneHtml}
          ${wordHtml}
          ${actionHtml}
          ${it.cn ? `<div class="phonics-cn">${EM.ui.esc(it.cn)}</div>` : ''}
          <div class="ph-hint"></div>
        </div>`;
    });
    html += '</div></div>';
    el.innerHTML = html;

    // 所有发声元素统一绑定：点谁只读谁
    el.querySelectorAll('.ph-listen').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        this._onSpeakClick(btn);
      };
    });

    // Magic E / CVC 的序列按钮
    el.querySelectorAll('.ph-blend').forEach(btn => {
      btn.onclick = () => {
        const parts = btn.dataset.seq.split(',');
        const word = btn.dataset.word;
        EM.tts.speakSequence(parts, { rate: 0.9 });
        const cell = btn.closest('.phonics-cell');
        if (cell) this._showHint(cell, '拼读示范：' + parts.map(p => '“' + p + '”').join(' · ') + (word ? ' → ' + word : ''));
        // 读完字母音后自动读整词(speakSequence 每个音约 1 秒)
        setTimeout(() => { if (word) EM.tts.speak(word); }, parts.length * 1000 + 250);
      };
    });
    el.querySelectorAll('.ph-pair').forEach(btn => {
      btn.onclick = () => {
        const [a, b] = btn.dataset.seq.split(',');
        EM.tts.speakSequence([a, b], { rate: 0.9 });
        const cell = btn.closest('.phonics-cell');
        if (cell) this._showHint(cell, '对比读：' + a + ' → ' + b + '（末尾多了不发音的 e，元音变长音）');
      };
    });

    // 标记已掌握
    el.querySelectorAll('[data-mark]').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        this._toggleMastered(btn.dataset.mark);
      };
    });
  },

  /* 点击发音元素：只播放该元素对应的声音，并显示口型提示 */
  _onSpeakClick(btn) {
    const cell = btn.closest('.phonics-cell');
    const tip = btn.dataset.tip;
    const tts = btn.dataset.tts || '';
    const ipa = btn.dataset.ipa || '';
    const word = btn.dataset.word || '';
    const rate = parseFloat(btn.dataset.rate || '1');
    const cn = btn.dataset.cn || '';

    if (tts) {
      EM.tts.speak(tts, { rate: rate || 1 });
      // 中文口型提示
      const hint = cn || (ipa ? '🔊 ' + ipa + (tip ? ' · ' + tip : '') : (tip || ''));
      if (cell) this._showHint(cell, hint);
    } else if (ipa && word) {
      // 整词音标(如 /kæt/)：慢速读例词帮助辨音
      EM.tts.speak(word, { rate: 0.55 });
      if (cell) this._showHint(cell, '🔊 ' + ipa + '（慢速读 ' + word + '，听清每个音）');
    } else if (tip) {
      EM.tts.speak(tip, { rate: rate || 1 });
      if (cell) this._showHint(cell, tip);
    }
  },

  /* 短暂显示一行口型/读法提示(2.6 秒后淡出) */
  _showHint(cell, text) {
    const box = cell.querySelector('.ph-hint');
    if (!box) return;
    box.textContent = text || '';
    box.classList.add('show');
    clearTimeout(box._t);
    box._t = setTimeout(() => box.classList.remove('show'), 2600);
  },

  /* ===== 标记/取消"已掌握"，写入进度，并局部刷新 =====
   * 关键：每次新增掌握后自动调 EM.path.advanceToNext() 推进路径
   */
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
      EM.errors.correct('phonics', id);
      EM.achieve.addXP(EM.achieve.XP.phonics, '拼读掌握');
      EM.achieve.check();
      EM.student.record('pronunciation', 60 + Math.min(40, (p.modules.phonics.mastered || []).length), 1);
      EM.recordDailyActivity('phonics', 1);
      EM.ui.toast('已标记掌握 ✓ +2 XP');
      // 自动尝试推进路径
      this._autoAdvancePath();
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

  /* ===== 测验答对一题后自动把对应卡片标记为已掌握 ===== */
  _markMasteredSilent(id) {
    const p = EM.progress.get();
    if ((p.modules.phonics.mastered || []).includes(id)) return false; // 已存在
    EM.progress.update(d => {
      if (!d.modules.phonics.mastered) d.modules.phonics.mastered = [];
      if (!d.modules.phonics.mastered.includes(id)) {
        d.modules.phonics.mastered.push(id);
      }
    });
    EM.progress.removeWeakness('phonics', id);
    EM.errors.correct('phonics', id);
    EM.achieve.addXP(EM.achieve.XP.phonics, '拼读测验答对');
    EM.achieve.check();
    this._refreshStats();
    return true; // 新增
  },

  /* ===== 自动推进路径：若当前步骤达标则完成本步并提示 =====
   * 用 setTimeout 确保不阻塞 UI；多次调用安全(内部有幂等检查)
   */
  _autoAdvancePath() {
    setTimeout(async () => {
      try {
        const before = EM.progress.get().pathStep || 0;
        const step = EM.path.currentStep();
        if (!step) return;
        // 仅当当前步骤属于 phonics 模块才推进，避免越权
        if (step.module !== 'phonics') return;
        if (!EM.path.isCurrentStepDone()) return;
        // 推进到下一个未完成步骤
        const after = await EM.path.advanceToNext();
        if (after > before) {
          // 推进了
          EM.ui.toast(`🎉 第 ${step.step + 1} 课目标达成！自动进入第 ${after + 1} 课`, 4000);
          // 顶部 banner 也更新(若在模块内)
          const banner = document.querySelector('.lesson-banner');
          if (banner) {
            const ns = EM.path.currentStep();
            if (ns) {
              banner.querySelector('.lesson-banner-title').innerHTML =
                `📍 当前课程:第 ${ns.index + 1} 课 · ${ns.title}`;
            }
          }
        }
      } catch (e) { console.warn('autoAdvancePath err', e); }
    }, 300);
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

  /* 生成一题：依据每张卡片的 quizType 派题 */
  _nextQuiz() {
    const items = this._getItems(this.activeTab);
    if (!items.length) { this.quizState = null; return; }

    // 优先抽尚未掌握的题(否则容易一直答重复)
    const p = EM.progress.get();
    const mastered = new Set(p.modules.phonics.mastered || []);
    const todoItems = items.filter(i => !mastered.has(i.id));
    const pool = todoItems.length ? todoItems : items;
    const target = pool[Math.floor(Math.random() * pool.length)];
    const type = target.quizType || 'listen';

    let question, options, answer, speakText, showWord;

    if (type === 'letter') {
      // 听字母名/元音名 → 选字母
      answer = target.quizAnswer || target.symbol.split(' ')[0]; // 大写字母
      speakText = target.speakText;
      showWord = null;
      const distractors = this._sample(
        (target.optionsPool || items.map(i => i.quizAnswer || i.symbol.split(' ')[0]))
          .filter(s => s !== answer), 3);
      options = this._shuffle([answer].concat(distractors));
      question = '🔊 听字母名,选出你听到的字母(可点听发音重复听)';
    } else if (type === 'sound') {
      // 听单个例词发音 → 选出正确的字母组合
      const correctCombo = target.symbol;
      answer = correctCombo;
      speakText = target.speakText; // 只读第一个例词
      showWord = null;
      const distractors = this._sample(
        (target.optionsPool || items.map(i => i.symbol))
          .filter(s => s !== correctCombo), 3);
      options = this._shuffle([correctCombo].concat(distractors));
      question = '🔊 听例词发音，选出包含的字母组合';
    } else if (type === 'split') {
      answer = target.split;
      speakText = target.words[0];
      showWord = target.words[0];
      const others = items.filter(i => i !== target && i.split && i.split !== target.split).map(i => i.split);
      const distractors = this._sample(this._unique(others), 3);
      options = this._shuffle([target.split].concat(distractors));
      question = '选出下面单词的正确音节拆分';
    } else if (type === 'magic') {
      answer = target.words[1]; // 长词
      speakText = target.words[1];
      showWord = target.words[0];
      const pool2 = items.filter(i => i !== target).map(i => i.words[1]);
      const distractors = this._sample(this._unique(pool2), 3);
      options = this._shuffle([target.words[1]].concat(distractors));
      question = '把短词加上 Magic E，会变成哪个词？';
    } else {
      // 听音选词(默认)
      const correctWord = target.words[Math.floor(Math.random() * target.words.length)];
      answer = correctWord;
      speakText = correctWord;
      showWord = null;
      const all = items.filter(i => i !== target).reduce((arr, i) => arr.concat(i.words), []);
      const uniq = this._unique(all).filter(w => w !== correctWord);
      const distractors = this._sample(uniq, 3);
      options = this._shuffle([correctWord].concat(distractors));
      question = '🔊 听发音，选出你听到的单词';
    }

    this.quizState = {
      type, target, answer, options,
      question, speakText, showWord, answered: false
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
        <button class="btn btn-primary quiz-replay" id="quizReplay">🔊 ${
          q.type === 'letter' ? '再听字母名' :
          (q.type === 'sound' ? '再听例词发音' :
          (q.type === 'listen' ? '再听一次' : '听发音'))
        }</button>
        <div class="quiz-options">
          ${q.options.map(opt => `<button class="quiz-option" data-opt="${EM.ui.esc(opt)}">${EM.ui.esc(opt)}</button>`).join('')}
        </div>
        <div class="mt-16">
          <button class="btn btn-secondary" id="quizNext">⏭️ 下一题</button>
          <span class="phonics-hint">提示：可重复点"听发音"再选答案。</span>
        </div>
      </div>`;

    // 听力题自动播放一次（letter/sound/listen 都是听音题）
    // iOS 需用户手势链：由点击切到测验或点击下一题触发
    if (q.type === 'letter' || q.type === 'sound' || q.type === 'listen') {
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
      // 关键：把答对的卡片自动标记为已掌握(若未标记)
      const newly = this._markMasteredSilent(q.target.id);
      // 同步更新学习模式卡片的视觉
      const cell = document.querySelector('.phonics-cell[data-id="' + q.target.id + '"]');
      if (cell) {
        cell.classList.add('mastered');
        const mk = cell.querySelector('[data-mark]');
        if (mk) mk.textContent = '✓';
      }
      EM.ui.toast(newly ? '答对了 ✓ 已自动标记掌握' : '答对了 ✓ +1');
      // 触发路径推进检查
      this._autoAdvancePath();
    } else {
      // 记入弱项 + 错误银行
      EM.progress.addWeakness('phonics', q.target.id);
      EM.errors.add('phonics', q.target.id);
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
