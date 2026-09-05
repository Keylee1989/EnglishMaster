/* ===== 发音中心 (Sounds) =====
 * 一站式「音标 / 读音 / 拼读」查询与训练页面:
 *   1) 音标表     —— 全部英语音素,每个音可独立点击听示范(最接近的拼读文本)+ 中文口型提示 + 真实例词
 *   2) 查单词读音 —— 输入单词/中文,返回词条(音标/词性/意思/例句)可整读/慢读,并标出该词里你学过的拼读组合
 *   3) 查拼读规律 —— 字母/辅音/元音/组合/MagicE/R控制元音 全可查,字形、每个音、每个例词分开点击发音
 *   4) AI 发音问答 —— 配置 AI 后由 AI 讲解(发音/重音/连读/易混音);未配置或失败自动用本地知识库
 *   5) 练一练     —— 听音选词 / 形→音 / 音→形 三类题,答对写学生模型 pronunciation,答错进错误银行(可错题强化)
 * 数据:phonics.json(全部发音组合,已校验) + vocabulary.json(查单词,懒加载)
 * 说明:Web Speech API 无法直接朗读 IPA,音标示范沿用自然拼读模块的"最接近拼读文本"方案(与拼读课听感一致)。
 */
window.EM = window.EM || {};

EM.sounds = {
  data: null,           // phonics.json
  _patterns: null,      // 规范化后的拼读规律列表
  _phonemes: null,      // 音素清单(含例词来源)
  _clusters: null,      // 辅音连缀清单
  vocab: null,
  _wordIdx: null,
  _resData: null,     // phonics_resources.json
  _container: null,
  tab: 'phonemes',      // phonemes | word | pattern | ai | practice | results
  _aiMsgs: [],          // AI 问答历史
  _practice: null,      // 练习会话状态
  _lookupWord: '',

  // 与自然拼读模块一致的音标朗读映射(IPA 无法被 TTS 直读,用最接近的拼读示范)
  _IPA_TALK: {
    '/eɪ/': { t: 'ay' }, '/iː/': { t: 'ee' }, '/aɪ/': { t: 'eye' }, '/oʊ/': { t: 'oh' },
    '/uː/': { t: 'oo' }, '/juː/': { t: 'you' }, '/aʊ/': { t: 'ow' }, '/ɔɪ/': { t: 'oy' },
    '/ɔː/': { t: 'aw' }, '/ɑːr/': { t: 'ar' }, '/ɜːr/': { t: 'er' }, '/ər/': { t: 'er' },
    '/ɔːr/': { t: 'or' }, '/ɛər/': { t: 'air' }, '/ɪər/': { t: 'ear' },
    '/æ/': { t: 'aa', cn: '/æ/：嘴巴向两侧拉开、短促,介于“啊”和“诶”之间(apple/cat 里的 a)' },
    '/ɛ/': { t: 'eh', cn: '/ɛ/：短促的“诶”,嘴半开(bed/egg 里的 e)' },
    '/ɪ/': { t: 'ih', cn: '/ɪ/：短促的“衣”,不拉长(sit/pig 里的 i)' },
    '/ɑː/': { t: 'ah', cn: '/ɑː/：嘴张大像“啊”拉长(美式 hot/dog 里的 o)' },
    '/ʌ/': { t: 'uh', cn: '/ʌ/：短促的“啊”,腹部用力(cup/sun 里的 u)' },
    '/ʊ/': { t: 'uhh', cn: '/ʊ/：短“乌”,嘴唇微圆、比 /uː/ 短(book 里的 oo)' },
    '/b/': { t: 'buh' }, '/k/': { t: 'kuh' }, '/d/': { t: 'duh' }, '/f/': { t: 'fuh' },
    '/g/': { t: 'guh' }, '/h/': { t: 'huh' }, '/dʒ/': { t: 'juh' }, '/l/': { t: 'luh' },
    '/m/': { t: 'muh' }, '/n/': { t: 'nuh' },
    '/ŋ/': { t: 'uhng', cn: '/ŋ/：软腭鼻音,像“嗯”从鼻腔发出(sing/ring 的结尾音)' },
    '/p/': { t: 'puh' }, '/r/': { t: 'ruh' }, '/s/': { t: 'suh' }, '/t/': { t: 'tuh' },
    '/v/': { t: 'vuh' }, '/w/': { t: 'wuh' }, '/j/': { t: 'yuh' }, '/z/': { t: 'zuh' },
    '/ʃ/': { t: 'shh', cn: '/ʃ/：嘘声,舌尖靠近上颚送气(she/ship)' },
    '/tʃ/': { t: 'chuh' },
    '/θ/': { t: 'thh', cn: '/θ/：舌尖轻咬、只吐气不震动声带(think/three)' },
    '/ð/': { t: 'the', cn: '/ð/：舌尖轻咬、声带震动出声(this)' },
    '/ks/': { t: 'kuhss', cn: '/ks/：/k/+/s/ 快速连读(six/fox 的结尾)' },
    '/kw/': { t: 'kwuh', cn: '/kw/：/k/+/w/ 连读(queen)' },
    '/bl/': { t: 'bluh' }, '/kl/': { t: 'kluh' }, '/fl/': { t: 'fluh' }, '/gl/': { t: 'gluh' },
    '/pl/': { t: 'pluh' }, '/sl/': { t: 'sluh' }, '/br/': { t: 'bruh' }, '/kr/': { t: 'kruh' },
    '/dr/': { t: 'druh' }, '/fr/': { t: 'fruh' }, '/gr/': { t: 'gruh' }, '/tr/': { t: 'truh' },
    '/str/': { t: 'struh' }, '/sp/': { t: 'spuh' }, '/st/': { t: 'stuh' }, '/sk/': { t: 'skuh' },
    '/sm/': { t: 'smuh' }, '/sn/': { t: 'snuh' }, '/sw/': { t: 'swuh' }
  },
  // 字母名(防止 TTS 把单字母读成不定冠词)
  _LETTER_NAMES: {
    A:'Ayy', B:'Bee', C:'See', D:'Dee', E:'Ee', F:'Ef', G:'Gee',
    H:'Aich', I:'Ai', J:'Jay', K:'Kay', L:'El', M:'Em', N:'En',
    O:'Oh', P:'Pee', Q:'Cue', R:'Ar', S:'Es', T:'Tee',
    U:'You', V:'Vee', W:'Double-You', X:'Ecks', Y:'Why', Z:'Zee'
  },
  _letterName(letter) {
    return this._LETTER_NAMES[(letter || '').toUpperCase()] || (letter || '').toUpperCase();
  },
  // 元音字母长短音(用于 vowels / magicE 卡)
  _VOWEL_LONG: { a: '/eɪ/', e: '/iː/', i: '/aɪ/', o: '/oʊ/', u: '/juː/' },
  _VOWEL_SHORT: { a: '/æ/', e: '/ɛ/', i: '/ɪ/', o: '/ɑː/', u: '/ʌ/' },
  // 音素分类(用于音标表分组)
  _PHON_CAT: {
    '/æ/':'shortV', '/ɛ/':'shortV', '/ɪ/':'shortV', '/ʌ/':'shortV', '/ʊ/':'shortV', '/ɑː/':'longV', '/ə/':'shortV',
    '/iː/':'longV', '/uː/':'longV', '/ɔː/':'longV',
    '/eɪ/':'diph', '/aɪ/':'diph', '/oʊ/':'diph', '/aʊ/':'diph', '/ɔɪ/':'diph',
    '/ɑːr/':'rV', '/ɜːr/':'rV', '/ər/':'rV', '/ɔːr/':'rV', '/ɛər/':'rV', '/ɪər/':'rV',
    '/p/':'plo', '/b/':'plo', '/t/':'plo', '/d/':'plo', '/k/':'plo', '/g/':'plo',
    '/f/':'fric', '/v/':'fric', '/θ/':'fric', '/ð/':'fric', '/s/':'fric', '/z/':'fric',
    '/ʃ/':'fric', '/h/':'fric',
    '/tʃ/':'aff', '/dʒ/':'aff',
    '/m/':'nas', '/n/':'nas', '/ŋ/':'nas',
    '/l/':'glide', '/r/':'glide', '/w/':'glide', '/j/':'glide',
    '/ks/':'letterSp', '/kw/':'letterSp'
  },
  _CAT_LABEL: {
    shortV: { n: '单元音(短)', d: '短促、干脆,嘴巴放松,不拉长' },
    longV: { n: '单元音(长)', d: '音拉长、肌肉较紧(美式 o 短音 /ɑː/ 也归此类)' },
    diph: { n: '双元音', d: '两个音滑过去的“滑动音”,口型有变化' },
    rV: { n: '卷舌元音 (r 元音)', d: '元音后接卷舌 r,舌尖向后卷' },
    plo: { n: '爆破音', d: '气流在嘴里憋住后“爆”出来' },
    fric: { n: '摩擦音', d: '气流从缝隙挤出,产生摩擦' },
    aff: { n: '破擦音', d: '先爆破再摩擦,一口气完成' },
    nas: { n: '鼻音', d: '气流从鼻腔出来' },
    glide: { n: '流音 / 半元音', d: '介于元音与辅音之间,滑向后面的元音' },
    letterSp: { n: '字母特殊组合音', d: 'x 读 /ks/,q 通常读 /kw/ 的组合音' }
  },

  /* ================= 生命周期 ================= */
  async render(container) {
    this._container = container;
    if (this.tab === 'results') this.tab = 'phonemes';  // 从“查询结果”返回时回到音标表
    this._injectStyles();
    if (!this.data) {
      container.innerHTML = '<div class="loading">加载发音数据中...</div>';
      this.data = await EM.data.load('phonics');
      if (this.data) this._buildIndexes();
    }
    if (!this.data) {
      container.innerHTML = '<div class="card"><p>发音数据加载失败,请刷新重试。</p></div>';
      return;
    }
    this._renderShell();
  },

  _injectStyles() {
    if (document.getElementById('sd-styles')) return;
    const style = document.createElement('style');
    style.id = 'sd-styles';
    style.textContent = `
      .sd-tabs { display:flex; gap:6px; margin:12px 0 16px; flex-wrap:wrap; }
      .sd-tabs .level-btn { padding:8px 12px; }
      .sd-box { width:100%; padding:12px 16px; font-size:16px; border:2px solid var(--accent);
        border-radius:var(--radius); background:var(--bg-card); color:var(--text-primary);
        margin-bottom:10px; box-sizing:border-box; }
      .sd-box:focus { outline:none; box-shadow:0 0 0 3px var(--accent-bg); }
      .sd-chip { display:inline-flex; align-items:center; gap:4px; padding:6px 12px; margin:3px;
        border-radius:16px; background:var(--accent-bg); color:var(--accent); font-weight:600;
        cursor:pointer; font-size:14px; border:1px solid transparent; user-select:none; }
      .sd-chip:active { transform:scale(0.96); }
      .sd-chip.ipa { background:var(--bg-secondary); color:var(--text-primary); font-family:Georgia,serif; }
      .sd-chip.dim { opacity:0.55; cursor:default; }
      .sd-hint { font-size:12px; color:var(--success); margin-top:4px; min-height:16px; }
      .sd-group { margin-bottom:14px; }
      .sd-group-title { font-size:13px; font-weight:700; color:var(--text-secondary); margin:10px 2px 4px; }
      .sd-phoneme-row { display:flex; flex-wrap:wrap; align-items:center; gap:8px; padding:10px 12px;
        background:var(--bg-card); border:1px solid var(--border); border-radius:var(--radius); margin-bottom:8px; }
      .sd-phoneme-main { width:88px; text-align:center; flex-shrink:0; }
      .sd-phoneme-sym { font-size:26px; font-family:Georgia,serif; cursor:pointer; color:var(--accent); }
      .sd-word-pill { font-size:14px; cursor:pointer; padding:2px 4px; border-radius:6px; }
      .sd-word-pill:hover { background:var(--accent-bg); }
      .sd-pattern-card { background:var(--bg-card); border:1px solid var(--border); border-radius:var(--radius);
        padding:14px; margin-bottom:10px; }
      .sd-wordcard { background:var(--bg-card); border:1px solid var(--border); border-radius:var(--radius);
        padding:14px; margin-bottom:12px; }
      .sd-play-row { display:flex; gap:8px; flex-wrap:wrap; margin-top:8px; }
      .sd-btn { border:none; border-radius:12px; padding:8px 14px; font-size:14px; cursor:pointer;
        background:var(--accent-bg); color:var(--accent); font-weight:600; }
      .sd-btn.slow { background:var(--bg-secondary); color:var(--text-secondary); }
      .sd-pattern-head { display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin-bottom:8px; }
      .sd-combo { font-size:22px; font-weight:700; color:var(--accent); cursor:pointer; }
      .sd-tag { font-size:11px; padding:2px 8px; border-radius:8px; background:var(--bg-secondary); color:var(--text-muted); }
      .sd-chat { background:var(--bg-card); border:1px solid var(--border); border-radius:var(--radius);
        padding:12px; margin-bottom:10px; max-height:340px; overflow-y:auto; }
      .sd-msg { margin-bottom:8px; font-size:14px; line-height:1.7; }
      .sd-msg .who { font-weight:700; font-size:12px; }
      .sd-msg.bot { background:var(--bg-secondary); border-radius:10px; padding:8px 10px; white-space:pre-wrap; word-break:break-word; }
      .sd-msg.user { text-align:right; }
      .sd-msg.user span { background:var(--accent-bg); color:var(--accent); padding:6px 10px; border-radius:10px; display:inline-block; }
      .sd-ai-row { display:flex; gap:6px; margin-top:6px; }
      .sd-ai-row input { flex:1; }
      .sd-suggest { display:flex; flex-wrap:wrap; gap:6px; margin-bottom:10px; }
      .sd-suggest button { font-size:12px; padding:6px 10px; border-radius:14px; border:1px solid var(--border);
        background:none; color:var(--text-secondary); cursor:pointer; }
      .sd-suggest button:hover { border-color:var(--accent); color:var(--accent); }
      .sd-quiz-q { font-size:16px; font-weight:600; margin:8px 0; line-height:1.6; }
      .sd-opt { display:block; width:100%; text-align:left; padding:12px 14px; margin:6px 0; font-size:15px;
        border:1px solid var(--border); border-radius:12px; background:var(--bg-card); color:var(--text-primary); cursor:pointer; }
      .sd-opt:not(:disabled):active { transform:scale(0.99); }
      .sd-opt.correct { border-color:var(--success); background:rgba(76,175,136,0.15); }
      .sd-opt.wrong { border-color:#e74c3c; background:rgba(231,76,60,0.10); }
      .sd-note { font-size:12px; color:var(--text-muted); }
      .sd-hl { color:var(--accent); font-weight:600; }
    `;
    document.head.appendChild(style);
  },

  /* ================= 索引构建(phonics.json → patterns / phonemes) ================= */
  _buildIndexes() {
    const d = this.data;
    const P = [];
    const phMap = {};   // ipa -> {ipa, cat, words:Set(text), hints:[]}
    const addPh = (ipa, w, hint) => {
      if (!ipa || !this._PHON_CAT[ipa]) return;   // 只收标准音素
      if (!phMap[ipa]) phMap[ipa] = { ipa, cat: this._PHON_CAT[ipa], words: new Set(), hints: [] };
      if (w) phMap[ipa].words.add(w);
      if (hint) phMap[ipa].hints.push(hint);
    };

    // 1) 字母 A-Z (字母名 + 代表词)
    (d.letters || []).forEach(o => {
      const up = String(o.letter || '').toUpperCase();
      P.push({
        id: 'letters:' + up, group: '字母 A-Z', groupKey: 'letters', combo: up,
        sounds: [{ ipa: o.sound, label: '字母名' }],
        words: [{ w: o.word, cn: o.cn }], cn: '字母名读音'
      });
      addPh(o.sound, up, '字母名');
    });
    // 2) 辅音字母音
    (d.consonants || []).forEach(o => {
      P.push({
        id: 'consonants:' + o.combo, group: '辅音字母音', groupKey: 'consonants', combo: o.combo,
        sounds: [{ ipa: o.sound }], words: (o.words || []).map(w => ({ w })),
        cn: o.cn || ''
      });
      addPh(o.sound, (o.words || [])[0]);
      (o.words || []).forEach(w => addPh(o.sound, w));
    });
    // 3) 五个元音字母(短音+长音)
    (d.vowels || []).forEach(o => {
      const up = String(o.combo || '').toUpperCase();
      P.push({
        id: 'vowels:' + up, group: '元音字母 a e i o u', groupKey: 'vowels', combo: up,
        sounds: [
          { ipa: o.short, label: '短音' }, { ipa: o.long, label: '长音' }
        ],
        words: [{ w: o.shortEg, ipa: o.short, note: '短音' }, { w: o.longEg, ipa: o.long, note: '长音' }],
        cn: '短音 vs 长音对比'
      });
      addPh(o.short, o.shortEg, '元音 ' + up + ' 短音');
      addPh(o.long, o.longEg, '元音 ' + up + ' 长音');
    });
    // 4) 辅音组合(含双音 th/wh 等)
    const ipaFor = (rec, w) =>
      (rec.wordSounds && rec.wordSounds[w]) ||
      (rec.sounds && rec.sounds.length === 1 ? rec.sounds[0] :
        (rec.sounds && rec.sounds.length > 1 ? null : rec.sound));
    (d.blends || []).forEach(o => {
      const sounds = (o.sounds && o.sounds.length) ? o.sounds.map(ipa => ({ ipa })) : [{ ipa: o.sound }];
      const words = (o.words || []).map(w => ({ w, ipa: ipaFor(o, w) }));
      P.push({
        id: 'blends:' + o.combo, group: '辅音组合', groupKey: 'blends', combo: o.combo,
        sounds, words, cn: o.cn || '', dual: !!(o.sounds && o.sounds.length > 1)
      });
      words.forEach(x => { if (x.ipa) addPh(x.ipa, x.w); });
    });
    // 5) Magic E (a_e → /eɪ/)
    (d.magicE || []).forEach(o => {
      const letter = (String(o.short || '')[0] || '').toLowerCase();
      const longIpa = this._VOWEL_LONG[letter];
      if (!longIpa) return;
      P.push({
        id: 'magicE:' + o.short, group: 'Magic E (不发音 e)', groupKey: 'magicE',
        combo: letter + '_e', sounds: [{ ipa: longIpa, label: 'Magic E 长音' }],
        words: [
          { w: o.short, ipa: this._VOWEL_SHORT[letter], note: '无 e' },
          { w: o.long, ipa: longIpa, note: '加 e' }
        ], cn: o.cn || (o.short + ' → ' + o.long)
      });
      addPh(longIpa, o.long, letter + '_e');
      addPh(this._VOWEL_SHORT[letter], o.short);
    });
    // 6) 元音组合 (含双音 oo/ow 等)
    (d.vowelTeams || []).forEach(o => {
      const sounds = (o.sounds && o.sounds.length) ? o.sounds.map(ipa => ({ ipa })) : [{ ipa: o.sound }];
      const words = (o.words || []).map(w => ({ w, ipa: ipaFor(o, w) }));
      P.push({
        id: 'vowelTeams:' + o.combo, group: '元音字母组合', groupKey: 'vowelTeams', combo: o.combo,
        sounds, words, cn: o.cn || '', dual: !!(o.sounds && o.sounds.length > 1)
      });
      words.forEach(x => { if (x.ipa) addPh(x.ipa, x.w); });
    });
    // 7) R 控制元音
    (d.rControlled || []).forEach(o => {
      const sounds = (o.sounds && o.sounds.length) ? o.sounds.map(ipa => ({ ipa })) : [{ ipa: o.sound }];
      const words = (o.words || []).map(w => ({ w, ipa: ipaFor(o, w) }));
      P.push({
        id: 'rControlled:' + o.combo, group: 'R 控制元音', groupKey: 'rControlled', combo: o.combo,
        sounds, words, cn: o.cn || '', dual: !!(o.sounds && o.sounds.length > 1)
      });
      words.forEach(x => { if (x.ipa) addPh(x.ipa, x.w); });
    });

    // 合并同 combo 重复记录(如 er 两组例词)
    const byCombo = {};
    P.forEach(r => { (byCombo[r.combo] = byCombo[r.combo] || []).push(r); });
    const merged = [];
    Object.keys(byCombo).forEach(k => {
      const rs = byCombo[k];
      if (rs.length === 1) { merged.push(rs[0]); return; }
      const base = rs[0];
      const seenW = new Set(); const words = [];
      const seenI = new Set(); const sounds = [];
      rs.forEach(r => {
        (r.words || []).forEach(x => {
          const key = String(x.w).toLowerCase();
          if (!seenW.has(key)) { seenW.add(key); words.push(x); }
        });
        (r.sounds || []).forEach(s => { if (!seenI.has(s.ipa)) { seenI.add(s.ipa); sounds.push(s); } });
      });
      merged.push({ ...base, words, sounds });
    });
    this._patterns = merged;

    // 音素清单(把同一音素跨记录的例词收拢)
    const single = {};
    Object.keys(phMap).forEach(ipa => {
      const cat = this._PHON_CAT[ipa];
      if (!cat) return;
      single[ipa] = phMap[ipa];
    });
    // 排序:按首次出现顺序稳定展示
    const order = [];
    this._patterns.forEach(r => {
      (r.sounds || []).forEach(s => { if (!order.includes(s.ipa)) order.push(s.ipa); });
      (r.words || []).forEach(x => { if (x.ipa && !order.includes(x.ipa)) order.push(x.ipa); });
    });
    this._phonemes = order.filter(ipa => single[ipa]).map(ipa => ({
      ipa, cat: single[ipa].cat,
      words: Array.from(single[ipa].words),
      hints: single[ipa].hints.slice(0, 3)
    }));
  },

  /* 显示层音标规范化:按美式规范统一(ɒ→ɑː 等),与拼读课一致 */
  _normPh(ph) {
    if (!ph) return '';
    return String(ph)
      .replace(/ɒ/g, 'ɑː').replace(/ә/g, 'ə')
      .replace(/i:/g, 'iː').replace(/u:/g, 'uː').replace(/ɔ:/g, 'ɔː')
      .replace(/ɑ:/g, 'ɑː').replace(/ɜ:/g, 'ɜː');
  },
  _talk(ipa) { const m = this._IPA_TALK[ipa]; return m ? m.t || '' : ''; },
  _cnHint(ipa) { const m = this._IPA_TALK[ipa]; return m ? m.cn || '' : ''; },

  /* ================= 页面骨架 ================= */
  _renderShell() {
    const c = this._container;
    c.innerHTML = `
      <div class="card" style="margin-bottom:6px;">
        <div style="font-size:20px; font-weight:700;">🎙️ 发音中心</div>
        <div class="font-sm text-secondary" style="margin-top:4px; line-height:1.7;">
          一站式查询 <b>音标 / 读音 / 拼读</b>:每个音、每个例词都<b>单独点击发音</b>;不会读的词直接问 AI。
          音标示范无法由浏览器直接朗读,点击后播放"最接近的拼读示范"(与自然拼读课一致)。
        </div>
      </div>
      <div style="display:flex; gap:6px;">
        <input class="sd-box" id="sdQuick" placeholder="🔎 快速查询:输入单词(though)、拼读组合(th / ai / oo)或音标(/θ/)" autocomplete="off" style="margin:0; flex:1;">
        <button class="btn btn-primary" id="sdQuickBtn" style="white-space:nowrap;">查询</button>
      </div>
      <div class="sd-tabs">
        <button class="level-btn ${this.tab === 'phonemes' ? 'active' : ''}" data-tab="phonemes">🔤 音标表</button>
        <button class="level-btn ${this.tab === 'word' ? 'active' : ''}" data-tab="word">🔎 查单词读音</button>
        <button class="level-btn ${this.tab === 'pattern' ? 'active' : ''}" data-tab="pattern">🧩 查拼读规律</button>
        <button class="level-btn ${this.tab === 'ai' ? 'active' : ''}" data-tab="ai">🤖 问 AI 发音</button>
        <button class="level-btn ${this.tab === 'practice' ? 'active' : ''}" data-tab="practice">🎯 练一练</button>
        <button class="level-btn ${this.tab === 'resources' ? 'active' : ''}" data-tab="resources">📚 拼读资源库</button>
      </div>
      <div id="sdContent"></div>
    `;
    c.querySelectorAll('[data-tab]').forEach(b => {
      b.onclick = () => { this.tab = b.dataset.tab; this._renderShell(); };
    });
    const q = document.getElementById('sdQuick');
    const runQ = () => { const v = q.value.trim(); if (v) this._quickSearch(v); };
    q.onkeydown = e => { if (e.key === 'Enter') runQ(); };
    document.getElementById('sdQuickBtn').onclick = runQ;

    const content = document.getElementById('sdContent');
    if (this.tab === 'phonemes') this._renderPhonemes(content);
    else if (this.tab === 'word') this._renderWordTab(content);
    else if (this.tab === 'pattern') this._renderPatternTab(content);
    else if (this.tab === 'ai') this._renderAiTab(content);
    else if (this.tab === 'resources') this._renderResourcesTab(content);
    else this._renderPracticeTab(content);
  },

  /* ================= 拼读资源库(美国 + 国内,由浅到深) ================= */
  async _renderResourcesTab(el) {
    el.innerHTML = '<div class="loading">加载资源库...</div>';
    if (!this._resData) this._resData = await EM.data.load('phonics_resources');
    const data = this._resData;
    if (!data || !data.items || !data.items.length) {
      el.innerHTML = '<div class="card"><p>资源数据加载失败,请刷新重试。</p></div>';
      return;
    }
    const levels = data.levels || [];
    const FEE = { free: '免费', paid: '付费', 'free-trial': '免费试用' };

    const head = `
      <div class="card" style="border-left:4px solid var(--accent); margin-bottom:12px;">
        <div class="card-title" style="margin:0;">🗺️ 由浅到深:拼读学习路线</div>
        <div class="font-sm" style="line-height:1.9; margin-top:6px;">
          <b>① 字母与字母音</b> → <b>② 短元音 CVC/辅音组合</b> → <b>③ 元音组合/Magic E/双音节</b> → <b>④ 音节重音/词缀</b> → <b>⑤ 拼读→自主阅读</b>
        </div>
        <div class="sd-note" style="margin-top:8px; line-height:1.7;">
          下方资源按这条路线由浅到深排列,任意挑选 1-2 个配合使用即可。
          已去除全部付费项(仅免费/免费试用);优先排列<b>国内可用与 B 站可看</b>的资源(B站可看的标 🅱️)。
          本 App 内「自然拼读」课覆盖路线 ①-③,「发音中心」可全程查询/练习且离线可用——外部资源只是补充,不是必需。
        </div>
      </div>
    `;

    // 排序:国内优先 → 国内外通用 → 美国(部分需科学上网);每级内 B站可看优先
    const SRC_ORDER = { bili: 0, cn: 1, global: 2 };
    const tracks = [
      { key: 'cn', title: '🇨🇳 国内资源(中文讲解)·优先', hint: '对国内最友好,B站可看资源已置顶;中文讲解' },
      { key: 'both', title: '🌏 国内外通用(分级阅读/动画/有声书)', hint: '中英环境都能用' },
      { key: 'us', title: '🇺🇸 美国/英语母语资源', hint: '原汁原味、发音地道;需科学上网的已标注 B 站替代' }
    ];
    const byTrack = k => data.items.filter(i => i.track === k)
      .sort((a, b) => (a.level - b.level)
        || ((SRC_ORDER[a.src] ?? 1) - (SRC_ORDER[b.src] ?? 1))
        || String(a.id).localeCompare(String(b.id)));

    let html = head;
    tracks.forEach(t => {
      const list = byTrack(t.key);
      if (!list.length) return;
      html += `<div class="card" style="border-left:4px solid var(--accent); margin-bottom:10px;">
        <div class="card-title" style="margin:0;">${t.title} <span class="font-sm text-secondary">(${list.length} 个)</span></div>
        <div class="font-sm text-secondary" style="margin-top:4px;">${t.hint}</div>
      </div>`;
      for (let lv = 1; lv <= 5; lv++) {
        const lvItems = list.filter(i => i.level === lv);
        if (!lvItems.length) continue;
        html += `<div class="sd-group"><div class="sd-group-title">${levels[lv - 1] || ('L' + lv)}</div>
          ${lvItems.map(i => this._resCardHtml(i, FEE)).join('')}
        </div>`;
      }
    });
    el.innerHTML = html;
  },

  _resCardHtml(i, FEE) {
    const fee = FEE[i.fee] || i.fee || '';
    const link = i.url
      ? `<a class="sd-btn" href="${EM.ui.esc(i.url)}" target="_blank" rel="noopener noreferrer">🔗 打开官网</a>`
      : `<span class="sd-tag">找资源:${EM.ui.esc(i.search || i.name)}</span>`;
    const biliBadge = i.src === 'bili' ? '<span class="sd-tag" style="background:rgba(0,161,214,0.15); color:#00a1d6;">🅱️ B站可看</span>' : '';
    const lvDots = '●'.repeat(i.level) + '○'.repeat(Math.max(0, 5 - i.level));
    return `<div class="card" style="padding:12px; margin-bottom:8px;">
      <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
        <b style="font-size:15px;">${EM.ui.esc(i.name)}</b>
        ${biliBadge}
        <span class="sd-tag">${EM.ui.esc(i.type || '')}</span>
        <span class="sd-tag" style="color:${i.fee === 'free' ? 'var(--success)' : 'var(--text-muted)'};">${fee}</span>
      </div>
      <div class="font-sm text-secondary" style="margin-top:6px; line-height:1.7;">${EM.ui.esc(i.desc || '')}</div>
      ${i.note ? `<div class="sd-note" style="margin-top:4px;">📌 ${EM.ui.esc(i.note)}</div>` : ''}
      <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-top:8px;">
        ${link}
        <span class="sd-tag" title="难度级别">${lvDots} L${i.level}</span>
      </div>
    </div>`;
  },

  /* 快速查询:综合 单词卡 + 拼读规律 + 音素,一次展示 */
  _quickSearch(q) {
    this._showResults(this._container, q);
  },

  _showResults(container, q) {
    this.tab = 'results';
    const c = container;
    c.innerHTML = `
      <div class="card" style="margin-bottom:6px;">
        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
          <button class="btn btn-secondary" id="sdBack">← 返回</button>
          <div style="font-size:17px; font-weight:700;">🔎 「${EM.ui.esc(q)}」查询结果</div>
        </div>
        <div style="display:flex; gap:6px; margin-top:10px;">
          <input class="sd-box" id="sdQuick" placeholder="🔎 快速查询:单词 / 拼读组合 / 音标" autocomplete="off" style="margin:0; flex:1;" value="${EM.ui.esc(q)}">
          <button class="btn btn-primary" id="sdQuickBtn" style="white-space:nowrap;">查询</button>
        </div>
      </div>
      <div id="sdContent"></div>
    `;
    c.querySelector('#sdBack').onclick = () => { this.tab = 'phonemes'; this.render(document.getElementById('content')); };
    const inp = c.querySelector('#sdQuick');
    inp.onkeydown = e => { if (e.key === 'Enter') this._showResults(c, inp.value.trim()); };
    c.querySelector('#sdQuickBtn').onclick = () => this._showResults(c, inp.value.trim());
    this._renderAllResults(document.getElementById('sdContent'), q);
  },

  async _renderAllResults(el, q) {
    const ql = q.toLowerCase();
    const html = [];
    // 1) 音素
    const phon = this._phonemes.find(p => p.ipa === '/' + ql.replace(/[^a-zɑæɛɪʊʌɜɔəːθðʃʒŋ]/ig, '') + '/')
      || this._phonemes.find(p => p.ipa.replace(/[\/:]/g, '') === ql.replace(/[\/:]/g, '').trim());
    if (phon) {
      html.push(`<div class="card" style="border-left:4px solid var(--accent);">
        <div class="card-title">音素 ${phon.ipa} (${this._CAT_LABEL[phon.cat] ? this._CAT_LABEL[phon.cat].n : ''})</div>
        ${this._phonemeBody(phon)}
      </div>`);
    }
    // 2) 单词(懒加载词汇)
    const words = await this._findWords(ql);
    if (words.exact) {
      html.push(`<div class="card" style="border-left:4px solid var(--success);">
        <div class="card-title">单词查询结果 (L${words.exact.level})</div>
        ${this._wordCardHtml(words.exact)}
      </div>`);
    } else if (words.fuzzy.length) {
      html.push(`<div class="card"><div class="card-title">相近单词(${words.fuzzy.length})</div>
        ${words.fuzzy.map(w => `<div style="padding:6px 0; border-bottom:1px solid var(--border);">${this._wordChipHtml(w)}</div>`).join('')}
      </div>`);
    }
    // 3) 拼读规律
    const pats = this._findPatterns(ql);
    if (pats.length) {
      html.push(`<div class="card"><div class="card-title">拼读规律 (${pats.length} 条匹配)</div>
        ${pats.map(p => this._patternCardHtml(p)).join('')}
      </div>`);
    }
    if (!phon && !words.exact && !words.fuzzy.length && !pats.length) {
      html.push(`<div class="card"><p>没有找到「${EM.ui.esc(q)}」的直接结果。试试:完整单词(though)、拼读组合(th)、或音标(/θ/)。</p>
        <button class="btn btn-secondary" onclick="EM.router.navigate('sounds')">← 返回</button></div>`);
    }
    el.innerHTML = html.join('');
    this._bindSpeech(el);
  },

  /* 单个音素区块(音标表 / 查询结果共用) */
  _phonemeBody(ph) {
    const talk = this._talk(ph.ipa);
    const words = (ph.words || []).slice(0, 4);
    return `
      <div style="display:flex; flex-wrap:wrap; align-items:center; gap:8px;">
        <span class="sd-chip ipa" data-say-ipa="${ph.ipa}" style="font-size:20px; padding:8px 14px;">${ph.ipa} ${talk ? '🔊' : ''}</span>
        <span class="font-sm text-secondary">示范:${talk ? '"' + talk + '"' : '(组合音,听例词)'}</span>
      </div>
      <div class="sd-hint" data-hint="${ph.ipa}"></div>
      ${words.length ? `<div class="sd-group-title">例词(点击单独发音)</div>
        <div>${words.map(w => this._wordChipFrom(w)).join('')}</div>` : ''}
    `;
  },
  /* 例词块:无论词库是否已加载都能发音;已加载则附上规范音标 */
  _wordChipFrom(word) {
    const v = this._findVocabEntry(word);
    const ipa = v ? this._normPh(v.phonetic || '') : '';
    return `<span class="sd-chip" data-say-word="${EM.ui.esc(String(word))}" style="font-size:16px;">${EM.ui.esc(String(word))}${ipa ? `<span class="sd-note" style="color:var(--text-muted);"> ${ipa}</span>` : ''}</span>`;
  },
  _wordChipHtml(v) {
    if (!v) return '';
    return `<span class="sd-chip" data-say-word="${EM.ui.esc(String(v.word))}" style="font-size:16px;">${EM.ui.esc(String(v.word))}
      <span class="sd-note" style="color:var(--text-muted);">${this._normPh(v.phonetic || '')}</span></span>`;
  },
  _findVocabEntry(word) {
    // 懒加载词库并索引
    if (!this.vocab) return null;
    if (!this._wordIdx) this._buildWordIdx();
    const hit = this._wordIdx.find(x => x.w === String(word).toLowerCase());
    return hit ? hit.ref : null;
  },

  /* ================= 音标表 ================= */
  _renderPhonemes(el) {
    const cats = ['shortV', 'longV', 'diph', 'rV', 'plo', 'fric', 'aff', 'nas', 'glide', 'letterSp'];
    el.innerHTML = `
      <div class="font-sm text-secondary mb-16">共收录本课程全部 <b>${this._phonemes.length}</b> 个音素。点击音标听示范(含中文口型提示),点击例词单独发音。此表 = 自然拼读课所有读音的"总目录"。</div>
      <input type="text" class="sd-box" id="phonFilter" placeholder="筛选音素,如输入 θ 或 th 或 think">
      <div id="phonList"></div>
    `;
    const draw = (f) => {
      const list = document.getElementById('phonList');
      const fq = (f || '').toLowerCase().trim();
      const shown = this._phonemes.filter(p => {
        if (!fq) return true;
        return p.ipa.includes('/' + fq) || p.ipa.replace(/\W/g, '').includes(fq.replace(/\W/g, '')) ||
          (p.words || []).some(w => String(w).toLowerCase().includes(fq));
      });
      if (!shown.length) { list.innerHTML = '<p class="text-secondary font-sm">无匹配音素。</p>'; return; }
      list.innerHTML = cats.map(cat => {
        const items = shown.filter(p => p.cat === cat);
        if (!items.length) return '';
        const lab = this._CAT_LABEL[cat];
        return `<div class="sd-group">
          <div class="sd-group-title">${lab.n} <span class="sd-note">— ${lab.d}</span></div>
          ${items.map(p => `<div class="sd-phoneme-row">
            <div class="sd-phoneme-main"><span class="sd-phoneme-sym" data-say-ipa="${p.ipa}">${p.ipa}</span></div>
            <div style="flex:1; min-width:150px;">
              <div class="sd-hint" data-hint="${p.ipa}"></div>
              <div style="margin-top:4px;">${(p.words || []).slice(0, 4).map(w => this._wordChipFrom(w)).join('')}</div>
            </div>
          </div>`).join('')}
        </div>`;
      }).join('');
      this._bindSpeech(list);
    };
    const inp = document.getElementById('phonFilter');
    let timer = null;
    inp.oninput = () => { clearTimeout(timer); timer = setTimeout(() => draw(inp.value), 150); };
    draw('');
  },

  /* ================= 查单词读音 ================= */
  _renderWordTab(el) {
    el.innerHTML = `
      <input type="text" class="sd-box" id="wdInput" placeholder="输入英文单词或中文,如: though / 尽管" autocomplete="off">
      <div class="sd-note" style="margin-bottom:10px;">返回词条音标(已按美式规范显示 ɒ→ɑː 等)、朗读/慢速、例句,并标出词里你学过的拼读组合。音标不是 IPA 标准记号的词也能点喇叭听正确读音。</div>
      <div id="wdResult"><p class="text-secondary font-sm" style="padding:8px 0;">输入要查的单词...</p></div>
    `;
    const inp = document.getElementById('wdInput');
    let timer = null;
    inp.oninput = () => {
      clearTimeout(timer);
      timer = setTimeout(() => this._searchWordTab(inp.value.trim()), 180);
    };
    inp.focus();
  },

  async _searchWordTab(q) {
    const el = document.getElementById('wdResult');
    if (!q) { el.innerHTML = '<p class="text-secondary font-sm">输入要查的单词...</p>'; return; }
    const found = await this._findWords(q.toLowerCase());
    if (!found.exact && !found.fuzzy.length) {
      // 也许用户输的是拼读组合?
      const pats = this._findPatterns(q.toLowerCase());
      if (pats.length) {
        el.innerHTML = `<div class="card"><div class="card-title">「${EM.ui.esc(q)}」不是单词,但匹配到拼读规律:</div>${pats.map(p => this._patternCardHtml(p)).join('')}</div>`;
        this._bindSpeech(el);
        return;
      }
      el.innerHTML = `<p class="text-secondary font-sm">没有找到「${EM.ui.esc(q)}」。检查拼写,或去 <button class="btn btn-secondary btn-sm" onclick="EM.router.navigate('rag')">🤖 智能问答</button> 提问。</p>`;
      return;
    }
    const html = [];
    if (found.exact) html.push(this._wordCardHtml(found.exact, true));
    if (found.fuzzy.length) {
      html.push(`<div class="card"><div class="card-title">相近词(点击发音)</div>
        ${found.fuzzy.slice(0, 10).map(w => this._wordChipHtml(w)).join('')}</div>`);
    }
    el.innerHTML = html.join('');
    this._bindSpeech(el);
  },

  _buildWordIdx() {
    this._wordIdx = [];
    (this.vocab.levels || []).forEach(lv => {
      (lv.words || []).forEach(w => {
        this._wordIdx.push({ w: String(w.word || '').toLowerCase(), lv: lv.level, ref: w });
      });
    });
  },
  async _ensureVocab() {
    if (!this.vocab) {
      this.vocab = await EM.data.load('vocabulary');
      if (this.vocab) this._buildWordIdx();
    }
    return this.vocab;
  },
  async _findWords(q) {
    await this._ensureVocab();
    if (!this.vocab) return { exact: null, fuzzy: [] };
    const exact = this._wordIdx.find(x => x.w === q) ||
      this._wordIdx.find(x => x.w === q.replace(/'s$/, ''));
    if (exact) return { exact: { ...exact.ref, level: exact.lv }, fuzzy: [] };
    const fuzzy = [];
    for (const x of this._wordIdx) {
      if (x.w.includes(q) || String(x.ref.meaning || '').includes(q)) {
        fuzzy.push({ ...x.ref, level: x.lv });
        if (fuzzy.length >= 10) break;
      }
    }
    return { exact: null, fuzzy };
  },

  _wordCardHtml(w, wide) {
    const ph = this._normPh(w.phonetic || '');
    const containPats = this._patterns
      .filter(p => String(p.combo).toLowerCase().length >= 2 && String(w.word).toLowerCase().includes(String(p.combo).toLowerCase()))
      .slice(0, 5);
    return `
      <div class="sd-wordcard" style="border:2px solid var(--accent);">
        <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
          <span class="sd-combo" data-say-word="${w.word}">${w.word} 🔊</span>
          <span class="sd-tag" style="font-family:Georgia,serif; font-size:15px;">${ph || '(音标缺失,点击喇叭听发音)'}</span>
          <span class="sd-tag">${w.pos || ''}</span>
          <span class="sd-tag">L${w.level || ''}</span>
        </div>
        <div style="margin:6px 0;"><b>中文:</b> ${w.meaning || '(无)'}</div>
        ${w.example ? `<div style="font-size:14px; color:var(--text-secondary); padding:8px 12px; background:var(--bg-secondary); border-left:3px solid var(--accent); border-radius:4px;">
          <span data-say-word="${w.example}" style="cursor:pointer;">🔊</span> ${w.example}
          ${w.exampleCn ? `<div class="sd-note" style="margin-top:4px;">${w.exampleCn}</div>` : ''}
        </div>` : ''}
        <div class="sd-play-row">
          <button class="sd-btn" data-say-word="${w.word}">🔊 常速朗读</button>
          <button class="sd-btn slow" data-say-slow="${w.word}">🐢 慢速听音</button>
          ${w.example ? `<button class="sd-btn slow" data-say-word="${w.example}">📖 读例句</button>` : ''}
        </div>
        ${containPats.length ? `
          <div style="margin-top:10px;">
            <div class="sd-note">🔗 这个词里包含你学过的拼读组合(点击查看该组合的发音规律;⚠️ 组合在不同词中可能发不同音,最终以整体音标/听音为准):</div>
            <div>${containPats.map(p => `<span class="sd-chip" data-pattern="${p.groupKey}:${p.combo}" style="background:var(--bg-secondary); color:var(--text-secondary);">${p.combo}</span>`).join('')}</div>
          </div>` : ''}
        <div class="sd-note" style="margin-top:8px;">💡 音标无法读时:点上方喇叭直接听真人 TTS 读音,并对比下方拼读组合示范。</div>
      </div>
    `;
  },

  /* ================= 查拼读规律 ================= */
  _renderPatternTab(el) {
    const groups = ['letters', 'consonants', 'vowels', 'blends', 'magicE', 'vowelTeams', 'rControlled'];
    const gLabel = {
      letters: '字母 A-Z', consonants: '辅音字母音', vowels: '元音字母(短/长音)',
      blends: '辅音组合', magicE: 'Magic E', vowelTeams: '元音字母组合', rControlled: 'R 控制元音'
    };
    el.innerHTML = `
      <input type="text" class="sd-box" id="ptInput" placeholder="查拼读规律:输入 th / ai / er / oo / a_e 等(也支持例词,如 rain)" autocomplete="off">
      <div class="font-sm text-secondary mb-16">拼读 = 看见字母组合→知道发音。共 ${this._patterns.length} 条规律,每条:字形、每个音、每个例词都可<b>分开点击发音</b>。</div>
      <div id="ptList"></div>
    `;
    const draw = (f) => {
      const list = document.getElementById('ptList');
      const fq = (f || '').toLowerCase().trim();
      let shown = this._patterns;
      if (fq) {
        shown = shown.filter(p =>
          String(p.combo).toLowerCase().includes(fq) || fq.includes(String(p.combo).toLowerCase().replace('_e', '')) ||
          (p.words || []).some(x => String(x.w).toLowerCase().includes(fq))
        );
        if (!shown.length) {
          const single = this._patterns.filter(p => p.combo.length === 1 && p.combo.toLowerCase() === fq);
          shown = single;
        }
      }
      if (!shown.length) { list.innerHTML = '<p class="text-secondary font-sm">没有匹配的拼读规律。试试: th / ai / oo / er / a_e</p>'; return; }
      if (!fq) {
        list.innerHTML = groups.map(g => {
          const items = shown.filter(p => p.groupKey === g);
          if (!items.length) return '';
          return `<div class="sd-group"><div class="sd-group-title">${gLabel[g]} (${items.length})</div>
            ${items.map(p => this._patternCardHtml(p, true)).join('')}</div>`;
        }).join('');
      } else {
        list.innerHTML = shown.map(p => this._patternCardHtml(p)).join('');
      }
      this._bindSpeech(list);
    };
    const inp = document.getElementById('ptInput');
    let timer = null;
    inp.oninput = () => { clearTimeout(timer); timer = setTimeout(() => draw(inp.value), 150); };
    draw('');
  },

  _findPatterns(q) {
    const ql = String(q || '').toLowerCase().trim();
    if (!ql) return [];
    const direct = this._patterns.filter(p =>
      String(p.combo).toLowerCase().includes(ql) ||
      (ql.length >= 2 && ql.includes(String(p.combo).toLowerCase())) ||
      (p.words || []).some(x => String(x.w).toLowerCase().startsWith(ql))
    );
    if (direct.length) return direct;
    return [];
  },

  /* 拼读规律卡:字形 / 每个音 / 每个例词 独立点击 */
  _patternCardHtml(p, compact) {
    const soundChips = (p.sounds || []).map(s => `
      <span class="sd-chip ipa" data-say-ipa="${s.ipa}">${s.ipa} ${s.label ? `<span class="sd-note">${s.label}</span>` : ''}</span>
    `).join('');
    const comboTitle = p.combo;
    const wordChips = (p.words || []).map(x => {
      const note = x.note ? ` · ${x.note}` : (x.ipa && p.dual ? ` [${x.ipa}]` : '');
      const spText = p.groupKey === 'letters' ? String(x.w) : String(x.w);
      return `<span class="sd-chip" data-say-word="${spText}" style="font-size:16px;">${spText}<span class="sd-note" style="color:var(--text-muted);">${note}</span></span>`;
    }).join('');
    const groupChip = `<span class="sd-tag">${p.group}</span>`;
    const dualNote = p.dual ? '<div class="sd-note" style="margin-top:4px;">⚠️ 该组合有两种读音,请听每个例词区分</div>' : '';
    return `
      <div class="sd-pattern-card" style="${compact ? '' : 'border:1px solid var(--accent);'}">
        <div class="sd-pattern-head">
          <span class="sd-combo" data-say-pattern="${p.combo}" title="点字形:听发音示范">${comboTitle} 🔊</span>
          ${groupChip}
          <span class="font-sm text-secondary">点字形→听音;点音标→音示范;点例词→读词</span>
        </div>
        <div>${soundChips || '<span class="sd-note">(该组合为不发音字母,例:kn 的 k 不发音)</span>'}</div>
        ${this._cnHint((p.sounds || [])[0] ? (p.sounds[0].ipa) : '') ? '' : ''}
        <div class="sd-hint" data-hint="${(p.sounds || [])[0] ? p.sounds[0].ipa : ''}"></div>
        ${wordChips ? `<div style="margin-top:6px;">${wordChips}</div>` : ''}
        ${dualNote}
        ${p.cn ? `<div class="sd-note" style="margin-top:6px;">📌 ${p.cn}</div>` : ''}
      </div>
    `;
  },

  /* ================= 事件绑定(统一处理所有发音区) ================= */
  _bindSpeech(root) {
    if (!root) return;
    root.querySelectorAll('[data-say-ipa]').forEach(b => {
      b.onclick = () => {
        const ipa = b.dataset.sayIpa;
        const t = this._talk(ipa);
        if (t) EM.tts.speak(t, { rate: 0.9 });
        const hint = b.closest('.sd-pattern-card, .sd-phoneme-row, .card, .sd-group');
        if (hint) {
          const box = hint.querySelector('.sd-hint[data-hint]');
          if (box) {
            box.textContent = this._cnHint(ipa) || '';
            box.classList.add('show');
            clearTimeout(box._t);
            box._t = setTimeout(() => { box.textContent = ''; }, 3000);
          }
        }
      };
    });
    root.querySelectorAll('[data-say-pattern]').forEach(b => {
      b.onclick = () => {
        const combo = b.dataset.sayPattern;
        const p = this._patterns.find(x => String(x.combo).toLowerCase() === String(combo).toLowerCase());
        if (!p) { EM.tts.speak(combo); return; }
        const seq = [];
        (p.sounds || []).forEach(s => { const t = this._talk(s.ipa); if (t) seq.push(t); });
        // 字形本身:字母发字母名,组合发其读音示范
        if (p.groupKey === 'letters') { EM.tts.speak(this._letterName(combo)); return; }
        if (seq.length) EM.tts.speakSequence(seq, { rate: 0.9 });
        else { const w = (p.words || [])[0]; if (w) EM.tts.speak(w.w); }
      };
    });
    root.querySelectorAll('[data-say-word]').forEach(b => {
      b.onclick = () => EM.tts.speak(b.dataset.sayWord);
    });
    root.querySelectorAll('[data-say-slow]').forEach(b => {
      b.onclick = () => EM.tts.speak(b.dataset.saySlow, { rate: 0.55 });
    });
    root.querySelectorAll('[data-pattern]').forEach(b => {
      b.onclick = () => {
        const [gk, combo] = b.dataset.pattern.split(':');
        this.tab = 'pattern';
        this._renderShell();
        const inp = document.getElementById('ptInput');
        if (inp) { inp.value = combo; inp.dispatchEvent(new Event('input')); }
      };
    });
  },

  /* ================= AI 发音问答 ================= */
  _renderAiTab(el) {
    const useAI = this._aiEnabled();
    el.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
        <div class="card-title" style="margin:0;">🤖 问 AI 发音 (${useAI ? '✨ AI 模式' : '📚 本地知识库'})</div>
        <span class="sd-tag">${useAI ? '已接入 AI' : '未配置 AI,用本地知识库回答'}</span>
      </div>
      <div class="font-sm text-secondary mb-16">问任何发音问题:某个词怎么读、th/oo 什么时候发哪个音、重音在哪、连读怎么练… 没配 AI 也能答(本地库覆盖全部拼读规律 + 55k 词音标)。</div>
      <div class="sd-chat" id="aiChat"></div>
      <div class="sd-suggest" id="aiSuggest"></div>
      <div class="sd-ai-row">
        <input class="sd-box" id="aiInput" placeholder="输入你的发音问题,如: though 怎么读? 回车发送" autocomplete="off" style="margin:0;">
        <button class="btn btn-primary" id="aiSend">发送</button>
      </div>
    `;
    const SUGG = [
      'though 怎么读?', 'th 什么时候读 /ð/ 不读 /θ/?', 'oo 什么时候读短音 /ʊ/?',
      '英语的单词重音怎么找?', 'r 在词尾要卷舌吗?', '怎么练连读和弱读?'
    ];
    document.getElementById('aiSuggest').innerHTML = SUGG.map(s =>
      `<button data-sug="${EM.ui.esc(s)}">${s}</button>`).join('');
    el.querySelectorAll('[data-sug]').forEach(b => {
      b.onclick = () => this._sendAi(b.dataset.sug, el);
    });
    const inp = document.getElementById('aiInput');
    inp.onkeydown = e => { if (e.key === 'Enter') this._sendAi(inp.value.trim(), el); };
    document.getElementById('aiSend').onclick = () => this._sendAi(inp.value.trim(), el);
    this._drawAiChat();
  },

  _aiEnabled() {
    const s = EM.progress.getSettings();
    return !!(s.aiApiUrl && s.aiApiKey && s.aiModel);
  },

  _drawAiChat() {
    const el = document.getElementById('aiChat');
    if (!el) return;
    if (!this._aiMsgs.length) {
      el.innerHTML = '<div class="sd-msg bot"><span class="who">🤖 你好!</span> 我是发音老师。你可以问我:某个单词怎么读、某个字母组合发什么音、重音/连读/易混音等问题。示例:「though 怎么读?」</div>';
      return;
    }
    el.innerHTML = this._aiMsgs.map(m => m.role === 'user'
      ? `<div class="sd-msg user"><span>${EM.ui.esc(m.text)}</span></div>`
      : `<div class="sd-msg bot"><span class="who">🤖 ${m.cite || ''}</span>\n${this._linkWords(m.text)}</div>`).join('');
    el.scrollTop = el.scrollHeight;
  },

  /* 答案里的英文词包成可点击朗读 */
  _linkWords(text) {
    const safe = EM.ui.esc(text);
    return safe.replace(/([A-Za-z][A-Za-z'\-]*)/g, (m) =>
      m.length >= 2 ? `<span style="cursor:pointer; border-bottom:1px dashed var(--accent);" data-ai-word="${m}">${m}</span>` : m
    );
  },

  _bindAiWords(el) {
    const root = el || this._container;
    root.querySelectorAll('[data-ai-word]').forEach(b => {
      b.onclick = () => EM.tts.speak(b.dataset.aiWord);
    });
  },

  async _sendAi(text, el) {
    if (!text) return;
    this._aiMsgs.push({ role: 'user', text });
    const inp = document.getElementById('aiInput');
    if (inp) inp.value = '';
    this._drawAiChat();

    // 1) AI 模式优先
    if (this._aiEnabled()) {
      const ok = await this._askProvider(text);
      if (ok) return;
    }
    // 2) 本地知识库
    const ans = await this._localAnswer(text);
    this._aiMsgs.push({ role: 'bot', text: ans.text, cite: '📚 本地知识库' });
    this._drawAiChat();
    this._bindAiWords(el);
  },

  async _askProvider(q) {
    const s = EM.progress.getSettings();
    let apiUrl = s.aiApiUrl || '';
    if (!/\/chat\/completions\/?$/.test(apiUrl)) apiUrl = apiUrl.replace(/\/$/, '') + '/chat/completions';
    // 本地上下文
    const ctx = await this._localAnswer(q, true);
    const systemPrompt =
      '你是一位面向"完全不懂英语的中国成年人"的美式发音与自然拼读老师。要求：\n' +
      '1. 用简体中文回答,英文单词保留英文;\n' +
      '2. 讲清发音:音标、口型、易错点,必要时给出接近的中文音提示(注明只是近似);\n' +
      '3. 涉及拼读规律时说明"哪个字母组合常发这个音"和例外(如 th 清浊、oo 长短、不发音字母);\n' +
      '4. 例词短句示范,简洁实用,避免长篇大论;\n' +
      '5. 若无法确定某个词的读音,请如实说明,不要编造音标。\n\n' +
      '以下是本地知识库已核实的相关数据(可引用,勿与它矛盾):\n' + ctx.text.slice(0, 1200);
    try {
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (s.aiApiKey || '') },
        body: JSON.stringify({
          model: s.aiModel,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: q }
          ],
          temperature: 0.6,
          max_tokens: 700
        })
      });
      if (!res.ok) return false;
      const data = await res.json();
      const answer = data && data.choices && data.choices[0] && data.choices[0].message
        ? data.choices[0].message.content : '';
      if (!answer) return false;
      this._aiMsgs.push({ role: 'bot', text: answer, cite: '✨ AI 生成(' + s.aiModel + ')' });
      this._drawAiChat();
      this._bindAiWords();
      const p = EM.progress.get();
      if (!p.modules.rag) p.modules.rag = {};
      p.modules.rag.queryCount = (p.modules.rag.queryCount || 0) + 1;
      EM.progress.save(p);
      return true;
    } catch (e) {
      return false;
    }
  },

  /* 本地知识库回答:词 → 拼读组合 → 技巧库 → 兜底 */
  async _localAnswer(q, brief) {
    const ql = String(q || '').toLowerCase();
    const lines = [];
    // A) 直接问词
    const wordMatch = ql.match(/[a-z][a-z'\-]{1,}/g);
    if (wordMatch) {
      await this._ensureVocab();
      for (const tok of wordMatch.slice(0, 2)) {
        const found = this._findVocabEntry(tok);
        if (found) {
          const ph = this._normPh(found.phonetic || '');
          lines.push(`【${found.word}】${ph || '(数据无音标,点词试听)'} ${found.pos || ''} ${found.meaning || ''}`);
          if (found.example) lines.push(`例句: ${found.example} ${found.exampleCn ? '(' + found.exampleCn + ')' : ''}`);
          // 组合提示(不承诺词内发音,仅提示已学组合)
          const pats = this._patterns.filter(p => String(p.combo).length >= 2 &&
            String(found.word).toLowerCase().includes(String(p.combo).toLowerCase())).slice(0, 3);
          if (pats.length) {
            lines.push('词中含有的拼读组合: ' + pats.map(p => `${p.combo}(${(p.sounds || []).map(s => s.ipa).join('/')})`).join('、') +
              ' — ⚠️ 组合音只是参考,该词发音以整体音标为准,最稳的方式是点击上面的词直接听。');
          }
        }
      }
    }
    // B) 拼读组合问题
    const comboQ = ql.match(/(?:组合|拼写)?\s*(th|wh|oo|ow|ai|ay|ee|ea|ie|ue|ui|oi|oy|au|aw|ar|er|ir|ur|or|kn|wr|mb|a_e|e_e|i_e|o_e|u_e|sh|ch|ph)\b/);
    if (comboQ) {
      const comb = comboQ[1];
      const rec = this._patterns.find(p => String(p.combo).toLowerCase() === comb.toLowerCase());
      if (rec) {
        const snds = (rec.sounds || []).map(s => s.ipa);
        lines.push(`【${rec.combo}】${rec.group}${rec.cn ? ' — ' + rec.cn : ''}`);
        lines.push(`读音: ${snds.join(' 或 ')}${(rec.words || []).length ? '。例词: ' + rec.words.map(x => x.w + (x.ipa ? '[' + x.ipa + ']' : '')).join('、') : ''}`);
        if (rec.dual) {
          lines.push('💡 这个组合有多个读音,规律:请对照每个例词上标的音标逐个听、逐个记(点击例词可发音)。');
        } else if (rec.groupKey === 'magicE') {
          lines.push('💡 Magic E 规律:元音 + 辅音 + 不发音的 e → 元音发长音(字母音)。如 ' + rec.combo + ' 发 ' + snds.join('') + '。');
        }
      }
    }
    // C) 技巧关键词
    const TIPS = [
      { k: ['卷舌', ' r ', '儿化'], a: '美式英语里,字母 r 在元音后要"卷舌"(舌尖向后卷,如 car /kɑːr/、her /hɜːr/)。英式不卷。汉语普通话没有这个动作,需要专门练:先发 /ɑː/,边发边把舌尖往后卷。' },
      { k: ['重音', 'stress'], a: '多音节词通常只有一个主重音,其余弱读。找重音:① 两音节名词重音多在前(TA-ble),动词多在后(re-CORD);② 词尾 -tion/-sion 重音在其前一个音节(e-du-CA-tion);③ 不确定时点词听 TTS,注意哪个音节"更长更响"。' },
      { k: ['连读'], a: '连读:前一个词以辅音结尾、后一个以元音开头时拼着读,如 "not at all" → "no-ta-tall"。练法:先听原句→跟读→录音对比,每天 5 句,重点听 TTS 的自然停顿。' },
      { k: ['弱读'], a: '弱读:功能词(a/the/of/and/to/for)在句子里通常读得很轻很含糊,如 "a cup of tea" 的 of 常读成 /ə/。听懂真实英语的关键之一就是习惯弱读。' },
      { k: ['th'], a: 'th 两个音:清音 /θ/(think/three/thanks,只吐气不振动)与浊音 /ð/(this/that/they,声带振动)。练习:舌尖轻咬上下齿之间,清音吹气,浊音加声。中文没有这两个音,用 /s/ /z/ 替代是最大口音问题。' },
      { k: ['清辅音', '浊辅音'], a: '清辅音只送气不振动声带(b/p、d/t、g/k、v/f、z/s、ð/θ),浊辅音声带振动。区分方法:手摸喉结,发浊音(zzz)会振,发清音(sss)不振。' },
      { k: ['长元音', '短元音'], a: '长短元音不只是长度:长元音/iː uː ɑː/ 肌肉紧、舌位高;短元音/ɪ ʊ ʌ ɛ æ/ 放松。例:ship(短/ɪ/) vs sheep(长/iː/)。' },
      { k: ['音标'], a: '英语音标 ≈ 汉语拼音的角色:看到就能发对。本页「🔤 音标表」收录全部音素,每个都能点开听示范 + 中文口型提示。' },
      { k: ['拼读', '自然拼读'], a: '自然拼读 = 看见字母组合直接读。核心是"组合 → 音"的映射(如 ai→/eɪ/、sh→/ʃ/),本页「🧩 查拼读规律」可查全部,「🎯 练一练」可刷题。' },
      { k: ['怎么练', '方法'], a: '发音建议"三步练":① 听:点词/音标先听 3 遍;② 模:跟读 TTS,录下自己对比;③ 用:放进句子朗读。每天 10 分钟胜过每周 2 小时。' }
    ];
    for (const tip of TIPS) {
      if (tip.k.some(k => ql.includes(k))) { lines.push(tip.a); }
    }
    // D) 兜底
    if (!lines.length) {
      lines.push('这个问题本地库暂没有直接答案。你可以:① 问我一个具体的词(如 "though 怎么读?");② 问我一个组合(如 "th 什么时候读 /ð/?");③ 或先点上面词卡听发音、看音标,再回来问更具体的问题。');
    }
    const text = lines.join('\n');
    if (brief) return { text };
    // 追加"词可点读"说明
    return { text: text + '\n\n(回答中的英文词可点击朗读;也可在「🔎 查单词读音」输入任何词听发音)' };
  },

  /* ================= 练一练 ================= */
  _renderPracticeTab(el) {
    const cfg = this._practice && this._practice.setup ? this._practice : { setup: false };
    if (cfg.setup) { this._practiceRound(el); return; }
    const total = this._practiceCount();
    el.innerHTML = `
      <div class="card">
        <div class="card-title">🎯 发音练习</div>
        <p class="font-sm text-secondary mb-16">三类题轮流出:① 听单词→选你听到的词;② 看组合+例词→选它发的音(练 th/oo/ow 双音辨析);③ 听音/看规律→选拼写组合。答对加 XP 并计入"发音"能力分;答错自动进错误银行,可到「🎯 自适应测试 → 错题强化」再练。</p>
        <div class="grid grid-2" style="max-width:480px;">
          <div class="card" style="padding:14px; cursor:pointer;" onclick="EM.sounds.startPractice(6)">
            <div style="font-size:26px;">⚡</div><div class="font-sm" style="font-weight:700;">快速 6 题</div>
          </div>
          <div class="card" style="padding:14px; cursor:pointer;" onclick="EM.sounds.startPractice(10)">
            <div style="font-size:26px;">🎯</div><div class="font-sm" style="font-weight:700;">标准 10 题</div>
          </div>
          <div class="card" style="padding:14px; cursor:pointer;" onclick="EM.sounds.startPractice(15)">
            <div style="font-size:26px;">💪</div><div class="font-sm" style="font-weight:700;">强化 15 题</div>
          </div>
        </div>
        <div class="sd-note mt-16">(随强度设置自动调整默认题量 ${total};手机请开声音)</div>
      </div>
    `;
  },
  _practiceCount() {
    try { const m = EM.planner.intensity().mult; if (m >= 1.8) return 15; if (m >= 1.4) return 12; if (m <= 0.6) return 6; } catch (e) {}
    return 10;
  },

  startPractice(n) {
    this._practice = {
      setup: true, total: n, idx: 0, correct: 0,
      questions: this._makeQuestions(n),
      answered: false, done: false
    };
    this._renderPracticeTab(document.getElementById('sdContent'));
  },

  /* 生成题目池 */
  _makeQuestions(n) {
    const items = [];  // 含 word+ipa+combo 的可考条目
    this._patterns.forEach(p => {
      (p.words || []).forEach(x => {
        if (!x.w) return;
        items.push({
          w: x.w, ipa: x.ipa || (p.sounds && p.sounds[0] && p.sounds[0].ipa) || '',
          combo: p.combo, groupKey: p.groupKey,
          errorKey: this._errorKey(p), sounds: (p.sounds || []).map(s => s.ipa),
          dual: p.dual
        });
      });
    });
    if (items.length < 8) return [];
    const qs = [];
    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
    const types = ['listen', 'inword', 'spelling'];
    let t = 0, attempts = 0;
    while (qs.length < n && attempts < n * 20) {
      attempts++;
      const type = types[t % 3];
      t++;
      let q = null;
      if (type === 'listen') q = this._qListenWord(items, pick);
      else if (type === 'inword') q = this._qInWord(items, pick);
      else q = this._qSpelling(items, pick);
      if (q) qs.push(q);
    }
    return qs;
  },
  _errorKey(p) {
    const map = {
      letters: 'letter', consonants: null, vowels: 'vowel', blends: 'blend',
      magicE: 'magice', vowelTeams: 'vowelteam', rControlled: 'rctrl'
    };
    const kind = map[p.groupKey];
    if (!kind) return null;
    return kind + ':' + p.combo;
  },
  _qListenWord(items, pick) {
    const target = pick(items);
    const pool = items.filter(x => x.w !== target.w);
    const dists = [];
    while (dists.length < 3 && pool.length) {
      const d = pick(pool);
      if (!dists.includes(d)) dists.push(d);
    }
    const opts = [target].concat(dists);
    // 打乱
    for (let i = opts.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [opts[i], opts[j]] = [opts[j], opts[i]]; }
    return {
      type: 'listen',
      prompt: '🔊 听单词,选出你听到的(可重听)',
      speak: target.w,
      options: opts.map(x => ({ text: x.w, word: x })),
      answer: target.w,
      explain: `${target.w} 读 /${target.ipa.replace(/^\/|\/$/g, '') || '听示范'}/ 例词。`,
      errorKey: target.groupKey === 'letters' ? null : this._errorKeySafe(target),
      errItem: target.w
    };
  },
  _errorKeySafe(it) {
    // letters 类词条错误记 listening 不记 phonics(避免错题强化无法解析)
    const map = {
      consonants: null, letters: null,
      blends: 'blend', vowelTeams: 'vowelteam', rControlled: 'rctrl',
      vowels: 'vowel', magicE: 'magice'
    };
    const kind = map[it.groupKey];
    return kind ? kind + ':' + it.combo : null;
  },
  _qInWord(items, pick) {
    // 组合+例词 → 该组合在这词里发哪个音
    const candidates = items.filter(x => x.groupKey !== 'letters' && x.ipa);
    if (!candidates.length) return null;
    const target = pick(candidates);
    const recSounds = target.sounds && target.sounds.length ? target.sounds : [target.ipa];
    const options = [];
    const addOpt = (ipa) => { if (!options.some(o => o.ipa === ipa)) options.push({ ipa, text: ipa }); };
    recSounds.forEach(addOpt);
    // 不足 3 个补同类音
    const cat = this._PHON_CAT[target.ipa];
    const sameCat = (this._phonemes || []).filter(ph => ph.cat === cat && !options.some(o => o.ipa === ph.ipa)).slice(0, 3 - options.length + 1);
    sameCat.forEach(ph => addOpt(ph.ipa));
    if (options.length < 2) return null;
    for (let i = options.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [options[i], options[j]] = [options[j], options[i]]; }
    const correct = target.ipa || recSounds[0];
    const label = target.combo.length <= 2 ? '组合' : '拼写';
    return {
      type: 'inword',
      prompt: `在 "${target.w}" 中,${label}「${target.combo}」发哪个音?`,
      speak: target.w,
      options: options.map(o => ({ text: o.ipa, ipa: o.ipa })),
      optionSpeak: options.map(o => o.ipa),
      answer: correct,
      explain: `"${target.w}" 里 ${target.combo} 发 ${correct}。点击上方音标可反复听示范。`,
      errItem: (this._errorKeySafe(target)) || target.combo,
      errIsPhonics: !!this._errorKeySafe(target)
    };
  },
  _qSpelling(items, pick) {
    // 听音/看音 → 选拼写组合
    const candidates = items.filter(x => x.groupKey !== 'letters' && x.combo && x.combo.length >= 2 && x.ipa && this._talk(x.ipa));
    if (candidates.length < 4) return null;
    const target = pick(candidates);
    const sameSound = candidates.filter(x => x.ipa === target.ipa && x.combo !== target.combo);
    const pool = candidates.filter(x => x.combo !== target.combo);
    const opts = [target];
    if (sameSound.length) opts.push(pick(sameSound));
    while (opts.length < 4 && pool.length) {
      const d = pick(pool);
      if (!opts.includes(d)) opts.push(d);
    }
    for (let i = opts.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [opts[i], opts[j]] = [opts[j], opts[i]]; }
    return {
      type: 'spelling',
      prompt: `哪个拼写组合通常发 ${target.ipa} 的音?`,
      speak: target.ipa,
      options: opts.map(x => ({ text: x.combo, word: x })),
      answer: target.combo,
      explain: `${target.ipa} 的常见拼写包括 ${target.combo}${sameSound.length ? '、' + sameSound[0].combo : ''}(如 ${target.w})。注:同一拼写在不同词里也可能有别的音。`,
      errItem: this._errorKeySafe(target) || target.combo,
      errIsPhonics: !!this._errorKeySafe(target)
    };
  },

  _practiceRound(el) {
    const pr = this._practice;
    if (!pr || !pr.questions.length) {
      el.innerHTML = '<div class="card"><p>题库生成失败,请重试。</p></div>';
      return;
    }
    const total = pr.questions.length;
    if (pr.done || pr.idx >= total) { this._practiceResult(el, total); return; }
    const q = pr.questions[pr.idx];
    const progress = `<div class="font-sm text-secondary mb-16">第 ${pr.idx + 1} / ${total} 题 · 已答对 ${pr.correct} 题</div>`;
    const optHtml = (q.options || []).map((o, i) => {
      let cls = 'sd-opt';
      let disabled = '';
      const isCorrect = (q.type === 'spelling' ? o.text === q.answer : (q.type === 'inword' ? o.ipa === q.answer : o.text === q.answer));
      if (pr.answered) {
        disabled = 'disabled';
        if (isCorrect) cls += ' correct';
        else if (pr.chosen === i) cls += ' wrong';
      }
      return `<button class="${cls}" data-opt="${i}" ${disabled}>${EM.ui.esc(o.text)}${pr.answered && isCorrect ? ' ✓' : (pr.answered && pr.chosen === i && !isCorrect ? ' ✗' : '')}</button>`;
    }).join('');
    const optSpeak = (q.optionSpeak || []).length ? `<div style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:6px;">
      <span class="sd-note" style="line-height:26px;">先听每个音的示范:</span>
      ${q.optionSpeak.map(ipa => `<span class="sd-chip ipa" data-replay="${ipa}" style="padding:4px 10px;">🔊 ${ipa}</span>`).join('')}
    </div>` : '';
    const explain = pr.answered ? `<div class="card" style="border-left:4px solid ${pr.lastCorrect ? 'var(--success)' : '#e74c3c'}; margin-top:8px; padding:10px 14px;">
      <div style="font-size:14px; line-height:1.7;">${pr.lastCorrect ? '✅ 答对了!' : '❌ 正确答案已标绿。'} ${EM.ui.esc(q.explain)}</div>
      ${q.speak ? '<button class="sd-btn" style="margin-top:6px;" data-replay="' + EM.ui.esc(q.speak) + '">🔊 重听</button>' : ''}
      <button class="btn btn-primary" style="margin-top:6px; margin-left:6px;" id="sdNext">${pr.idx + 1 >= total ? '查看成绩 →' : '下一题 →'}</button>
    </div>` : '';
    el.innerHTML = `
      <div class="card">
        ${progress}
        <div class="sd-quiz-q">${EM.ui.esc(q.prompt)}</div>
        <div class="sd-ai-row" style="margin:4px 0 10px;">
          ${q.speak ? `<button class="btn btn-secondary" data-replay="${EM.ui.esc(q.speak)}">🔊 播放</button>` : ''}
          <span class="sd-note" style="line-height:32px;">题音标/单词来自已校验的拼读数据</span>
        </div>
        ${optSpeak}
        ${optHtml}
        ${explain}
      </div>
    `;
    const root = el;
    root.querySelectorAll('[data-replay]').forEach(b => {
      b.onclick = () => {
        const t = b.dataset.replay;
        const isIpa = /^\/.+\/$/.test(t);
        if (isIpa) { const talk = this._talk(t); if (talk) EM.tts.speak(talk, { rate: 0.9 }); }
        else EM.tts.speak(t, { rate: 0.9 });
      };
    });
    if (!pr.answered) {
      root.querySelectorAll('[data-opt]').forEach(b => {
        b.onclick = () => this._answerPractice(parseInt(b.dataset.opt, 10), el);
      });
    } else {
      const nx = document.getElementById('sdNext');
      if (nx) nx.onclick = () => {
        if (pr.idx + 1 >= total) { pr.done = true; }
        else { pr.idx++; }
        pr.answered = false;
        pr.chosen = null;
        this._practiceRound(el);
      };
    }
  },

  _answerPractice(choiceIdx, el) {
    const pr = this._practice;
    const q = pr.questions[pr.idx];
    if (pr.answered) return;
    pr.answered = true;
    pr.chosen = choiceIdx;
    const chosenOpt = q.options[choiceIdx];
    const chosen = q.type === 'spelling' ? chosenOpt.text
      : (q.type === 'inword' ? chosenOpt.ipa : chosenOpt.text);
    const correct = chosen === q.answer;
    pr.lastCorrect = correct;
    if (correct) {
      pr.correct++;
      EM.student.record('pronunciation', 88, 1);
      EM.achieve.addXP(EM.achieve.XP.quizCorrect, '发音练习答对');
      EM.achieve.check();
    } else {
      EM.student.record('pronunciation', 30, 1);
      EM.student.record('listening', 40, 0.5);
      // 进错误银行(phonics 键格式与错题强化兼容)
      if (q.type === 'listen') {
        EM.errors.add('listening', q.errItem || q.answer, '发音练习-听音选词');
      } else if (q.errIsPhonics) {
        EM.errors.add('phonics', q.errItem, '发音练习-' + q.answer);
      } else if (q.errItem) {
        EM.errors.add('pronunciation', q.errItem, '发音练习');
      }
    }
    this._practiceRound(el);
  },

  _practiceResult(el, total) {
    const pr = this._practice;
    const tn = total || pr.questions.length;
    const acc = tn ? Math.round(pr.correct / tn * 100) : 0;
    EM.student.record('pronunciation', acc, 2);
    EM.student.record('listening', acc, 0.5);
    EM.achieve.addXP(EM.achieve.XP.quizComplete, '完成发音练习');
    EM.achieve.check();
    EM.recordDailyActivity('pronunciation', 1);
    const emoji = acc >= 90 ? '🏆' : (acc >= 70 ? '👍' : '💪');
    el.innerHTML = `
      <div class="card" style="text-align:center; padding:24px;">
        <div style="font-size:52px;">${emoji}</div>
        <div style="font-size:24px; font-weight:700; margin:8px 0;">${acc}%</div>
        <div class="font-sm text-secondary mb-16">答对 ${pr.correct} / ${tn} 题 · 已计入「发音」能力分</div>
        <div style="display:flex; gap:8px; justify-content:center; flex-wrap:wrap;">
          <button class="btn btn-primary" onclick="EM.sounds.startPractice(${tn})">🔁 再练一组</button>
          <button class="btn btn-secondary" onclick="EM.sounds.tab='practice'; EM.sounds._practice=null; EM.sounds.render(document.getElementById('content'))">🎯 换题量</button>
        </div>
        ${acc < 70 ? '<div class="sd-note mt-16">建议:先去「🔤 音标表」把薄弱音标点开听示范(含口型提示),再回来练。</div>' : ''}
      </div>
    `;
  }
};

// 注册到路由(始终解锁,供随时查询)
EM.registerModule('sounds', EM.sounds);
