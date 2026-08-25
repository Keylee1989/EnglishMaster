/* ===== 查询中心模块 (Dictionary) =====
 * 直接搜索单词/语法/主题词族,不必通过问答机器人
 * 功能:
 *   1) 单词搜索(英文/中文模糊匹配,显示完整词条)
 *   2) 单词详情卡:音标/词性/中文/例句/搭配/记忆方法/同主题词
 *   3) 语法搜索(按标题/分类/级别)
 *   4) 语法详情卡(点击朗读/查看精讲)
 *   5) 主题词族(星期/月份/颜色/家庭等同类汇总记忆)
 * 数据:vocabulary.json + grammar.json + word_themes.json
 */
window.EM = window.EM || {};

EM.dictionary = {
  vocab: null,
  grammar: null,
  themes: null,
  enhanced: null,    // L1-L3 增强字段(roots/synonyms/usage/collocations/story/etymology/homophone)
  _container: null,
  tab: 'words',  // 'words' | 'grammar' | 'themes'
  _searchIdx: null,  // 单词索引(用于快速搜索)

  async render(container) {
    this._container = container;
    this._injectStyles();
    container.innerHTML = '<div class="loading">加载查询数据中...</div>';

    // 加载数据(带缓存) — 语法合并 550 条 (grammar + grammar_extra)
    if (!this.vocab) this.vocab = await EM.data.load('vocabulary');
    if (!this.grammar) {
      // 复用 grammar 模块的合并逻辑
      if (EM.grammar && EM.grammar._loadMerged) {
        this.grammar = await EM.grammar._loadMerged();
      } else {
        const base = await EM.data.load('grammar');
        const extra = await EM.data.load('grammar_extra');
        const catMap = { 'tense':'tenses', 'clause':'clauses' };
        const norm = c => catMap[c] || c;
        const seen = new Set(); const topics = [];
        (base && base.topics || []).forEach(t => { if (!seen.has(t.id)) { seen.add(t.id); topics.push(t); } });
        (extra && extra.topics || []).forEach(t => {
          if (!seen.has(t.id)) { seen.add(t.id); topics.push(Object.assign({}, t, { category: norm(t.category) })); }
        });
        const cats = (base && base.categories || []).slice();
        const seenCat = new Set(cats.map(c => c.id));
        (extra && extra.categories || []).forEach(c => {
          const nid = norm(c.id);
          if (!seenCat.has(nid)) { seenCat.add(nid); cats.push(Object.assign({}, c, { id: nid })); }
        });
        this.grammar = base ? { categories: cats, topics, version: 2 } : null;
      }
    }
    if (!this.themes) this.themes = await EM.data.load('word_themes');
    if (!this.enhanced) this.enhanced = await EM.data.load('vocabulary_enhanced');

    if (!this.vocab || !this.grammar) {
      container.innerHTML = '<div class="card"><p>查询数据加载失败,请刷新重试。</p></div>';
      return;
    }

    // 建立单词索引(一次性,加速搜索)
    if (!this._searchIdx) this._buildIndex();

    this._renderShell();
  },

  _injectStyles() {
    if (document.getElementById('dict-styles')) return;
    const style = document.createElement('style');
    style.id = 'dict-styles';
    style.textContent = `
      .dict-tabs { display:flex; gap:8px; margin-bottom:16px; flex-wrap:wrap; }
      .dict-search-box {
        width:100%; padding:12px 16px; font-size:16px; border:2px solid var(--accent);
        border-radius:var(--radius); background:var(--bg-card); color:var(--text-primary);
        margin-bottom:12px; box-sizing:border-box;
      }
      .dict-search-box:focus { outline:none; box-shadow:0 0 0 3px var(--accent-bg); }
      .word-card {
        background:var(--bg-card); border:1px solid var(--border); border-radius:var(--radius);
        padding:16px; margin-bottom:12px; transition:var(--transition);
      }
      .word-card:hover { border-color:var(--accent); }
      .word-head {
        display:flex; align-items:center; gap:12px; flex-wrap:wrap; margin-bottom:8px;
      }
      .word-spelling {
        font-size:24px; font-weight:700; color:var(--accent); cursor:pointer;
      }
      .word-spelling:hover { text-decoration:underline; }
      .word-phonetic { font-family:Georgia,serif; color:var(--text-secondary); font-size:15px; }
      .word-pos {
        font-size:13px; padding:2px 10px; border-radius:10px;
        background:var(--accent-bg); color:var(--accent); font-weight:600;
      }
      .word-meaning { font-size:16px; margin:6px 0; }
      .word-example {
        font-size:14px; color:var(--text-secondary); padding:8px 12px;
        background:var(--bg-secondary); border-left:3px solid var(--accent);
        border-radius:4px; margin:8px 0; font-style:italic;
      }
      .word-example-cn { font-size:13px; color:var(--text-muted); margin-top:4px; font-style:normal; }
      .word-section { margin-top:12px; }
      .word-section-title {
        font-size:13px; font-weight:700; color:var(--warning); margin-bottom:6px;
      }
      .word-memory-list { display:grid; grid-template-columns:1fr; gap:6px; }
      .word-memory-item {
        font-size:13px; padding:6px 10px; background:var(--bg-secondary);
        border-radius:4px; border-left:3px solid var(--success);
      }
      .word-memory-item .mm-label {
        font-weight:700; color:var(--success); margin-right:6px;
      }
      .word-collocations {
        display:flex; gap:6px; flex-wrap:wrap; margin-top:4px;
      }
      .collocation-tag {
        font-size:12px; padding:3px 8px; background:var(--accent-bg);
        color:var(--accent); border-radius:4px; cursor:pointer;
      }
      .theme-grid {
        display:grid; grid-template-columns:repeat(auto-fill,minmax(200px,1fr));
        gap:10px;
      }
      .theme-card {
        background:var(--bg-card); border:1px solid var(--border); border-radius:var(--radius);
        padding:14px; cursor:pointer; transition:var(--transition);
      }
      .theme-card:hover { border-color:var(--accent); transform:translateY(-2px); }
      .theme-card-title { font-size:15px; font-weight:600; margin-bottom:4px; }
      .theme-card-meta { font-size:12px; color:var(--text-secondary); }
      .grammar-card {
        background:var(--bg-card); border:1px solid var(--border); border-radius:var(--radius);
        padding:14px; margin-bottom:10px; cursor:pointer;
      }
      .grammar-card:hover { border-color:var(--accent); }
      .grammar-card-title { font-size:15px; font-weight:600; color:var(--accent); }
      .grammar-card-summary { font-size:13px; color:var(--text-secondary); margin-top:4px; }
      .grammar-detail {
        background:var(--bg-card); border:2px solid var(--accent); border-radius:var(--radius);
        padding:18px; margin-top:12px;
      }
      .grammar-detail-body {
        font-size:14px; line-height:1.8; white-space:pre-wrap; margin-top:10px;
      }
      .back-btn {
        background:none; border:none; color:var(--accent); cursor:pointer;
        font-size:14px; margin-bottom:12px; padding:4px 8px;
      }
      .back-btn:hover { text-decoration:underline; }
      .theme-detail-word {
        display:inline-block; padding:6px 14px; margin:4px;
        background:var(--bg-secondary); border-radius:16px;
        cursor:pointer; font-size:14px;
      }
      .theme-detail-word:hover { background:var(--accent-bg); color:var(--accent); }
    `;
    document.head.appendChild(style);
  },

  // 构建单词索引(word -> {level, item})
  _buildIndex() {
    this._searchIdx = [];
    const levels = this.vocab.levels || [];
    levels.forEach(lv => {
      (lv.words || []).forEach(w => {
        this._searchIdx.push({ level: lv.level, ...w });
      });
    });
  },

  _renderShell() {
    const c = this._container;
    c.innerHTML = `
      <div class="dict-tabs">
        <button class="level-btn ${this.tab==='words'?'active':''}" data-tab="words">🔤 单词查询</button>
        <button class="level-btn ${this.tab==='grammar'?'active':''}" data-tab="grammar">📖 语法查询</button>
        <button class="level-btn ${this.tab==='themes'?'active':''}" data-tab="themes">🗂️ 主题词族</button>
      </div>
      <div id="dictContent"></div>
    `;
    c.querySelectorAll('[data-tab]').forEach(b => {
      b.onclick = () => { this.tab = b.dataset.tab; this._renderShell(); };
    });
    if (this.tab === 'words') this._renderWordsTab();
    else if (this.tab === 'grammar') this._renderGrammarTab();
    else this._renderThemesTab();
  },

  // ===== 单词查询 =====
  _renderWordsTab() {
    const el = document.getElementById('dictContent');
    el.innerHTML = `
      <input type="text" class="dict-search-box" id="wordSearchInput"
             placeholder="输入英文单词或中文释义(如: apple 或 苹果)" autocomplete="off">
      <div id="wordResults">
        <p class="text-secondary font-sm" style="padding:12px;">输入要查询的单词,会显示完整词条(音标/词性/中文/例句/记忆方法/同主题词)。</p>
      </div>
    `;
    const input = document.getElementById('wordSearchInput');
    input.focus();
    let timer = null;
    input.oninput = () => {
      clearTimeout(timer);
      timer = setTimeout(() => this._searchWords(input.value.trim()), 200);
    };
  },

  _searchWords(q) {
    const el = document.getElementById('wordResults');
    if (!q) {
      el.innerHTML = '<p class="text-secondary font-sm" style="padding:12px;">输入要查询的单词...</p>';
      return;
    }
    const ql = q.toLowerCase();
    const results = [];
    for (const w of this._searchIdx) {
      const word = (w.word || '').toLowerCase();
      const meaning = w.meaning || '';
      if (word.includes(ql) || meaning.includes(q)) {
        results.push(w);
        if (results.length >= 30) break;
      }
    }
    if (!results.length) {
      el.innerHTML = `<p class="text-secondary font-sm" style="padding:12px;">未找到包含"${q}"的单词。</p>`;
      return;
    }
    el.innerHTML = results.map(w => this._renderWordCard(w)).join('');
    // 绑定点击发音
    el.querySelectorAll('[data-word-speak]').forEach(b => {
      b.onclick = () => EM.tts.speak(b.dataset.wordSpeak);
    });
    // 绑定同类词
    el.querySelectorAll('[data-theme-link]').forEach(b => {
      b.onclick = () => { this.tab = 'themes'; this._renderShell(); setTimeout(() => this._showThemeDetail(b.dataset.themeLink), 100); };
    });
  },

  _renderWordCard(w) {
    // 合并增强数据(L1-L3 词有)
    const enhanced = (this.enhanced && this.enhanced.words && this.enhanced.words[w.word]) || {};

    // 查找该词所属的所有主题
    const wordThemes = (this.themes && this.themes.themes || [])
      .filter(t => (t.words || []).some(tw => tw.toLowerCase() === (w.word || '').toLowerCase()))
      .map(t => `<span class="collocation-tag" data-theme-link="${t.id}">${t.icon||'📌'} ${t.name}</span>`)
      .join('');

    // 实时生成多种记忆方法(优先用 enhanced,无则实时生成)
    const memoryItems = [];

    // 🧠 联想记忆
    const assoc = w.association || enhanced.association;
    if (assoc && assoc.length > 5 && !assoc.includes('联想：替代名词')) {
      memoryItems.push({ label: '🧠 联想记忆', text: assoc });
    } else {
      // 实时生成基于词+意思的联想
      memoryItems.push({ label: '🧠 联想记忆', text: `看到 "${w.word}" → 联想到 "${w.meaning}"。想象一个场景:用 ${w.word} 表达 ${w.meaning},加深印象。` });
    }

    // 🌱 词根记忆
    const roots = enhanced.roots || this._genRoots(w.word);
    if (roots) {
      memoryItems.push({ label: '🌱 词根记忆', text: roots });
    }

    // 🎵 谐音记忆
    const homophone = enhanced.homophone || this._genHomophone(w.word, w.phonetic);
    if (homophone && !homophone.includes('该词本身')) {
      memoryItems.push({ label: '🎵 谐音记忆', text: `"${w.word}" 读音近中文 "${homophone}" → 关联 "${w.meaning}"` });
    }

    // 🔤 自然拼读
    if (w.phonetic) {
      memoryItems.push({ label: '🔤 自然拼读', text: `音标 ${w.phonetic}。注意元音长短与重音,跟读3遍,记住字母组合的发音规律。` });
    }

    // 📖 故事串联
    const story = enhanced.story || this._genStory(w.word, w.meaning);
    if (story) {
      memoryItems.push({ label: '📖 故事串联', text: story });
    }

    // 🔁 对比记忆(同义词/反义词)
    let synsRaw = enhanced.synonyms || [];
    let antsRaw = enhanced.antonyms || w.antonyms || [];
    // 无增强字段时,实时生成常见同/反义提示(基于词性)
    if (!synsRaw.length && !antsRaw.length) {
      const gen = this._genSynAnt(w);
      synsRaw = gen.syns;
      antsRaw = gen.ants;
    }
    // 过滤掉占位符
    const syns = synsRaw.filter(s => s && !s.includes('类似') && !s.includes('similar') && s.length > 1).slice(0, 5);
    const ants = (Array.isArray(antsRaw) ? antsRaw : [antsRaw]).filter(s => s && !s.includes('opposite') && s.length > 1).slice(0, 5);
    if (syns.length) {
      memoryItems.push({ label: '🔁 同义词对比', text: `同义/近义: ${syns.join(', ')} (查词典核实准确含义)` });
    }
    if (ants.length) {
      memoryItems.push({ label: '⚔️ 反义词对比', text: `反义: ${ants.join(', ')} (查词典核实准确含义)` });
    }

    // 📜 词源
    const etym = enhanced.etymology || this._genEtymology(w.word);
    if (etym) {
      memoryItems.push({ label: '📜 词源', text: etym });
    }

    // 词语搭配(优先用 enhanced,无则实时生成)
    let collocations = '';
    const enhCollocs = enhanced.collocations || [];
    if (enhCollocs.length) {
      collocations = enhCollocs.slice(0, 5).map(c => `<span class="collocation-tag" data-word-speak="${c.replace(/[^a-zA-Z\s]/g,'').trim()}" title="点击朗读">${c}</span>`).join('');
    } else {
      collocations = this._genCollocations(w);
    }

    // 怎么使用(用法)
    const usage = enhanced.usage || this._genUsage(w);

    return `
      <div class="word-card">
        <div class="word-head">
          <span class="word-spelling" data-word-speak="${w.word}" title="点击发音">${w.word}</span>
          <span class="word-phonetic">${w.phonetic || '(无音标)'}</span>
          <span class="word-pos">${w.pos || ''}</span>
          <span class="font-sm text-secondary">L${w.level}</span>
        </div>
        <div class="word-meaning"><b>中文:</b> ${w.meaning || '(无)'}</div>
        ${w.example ? `
          <div class="word-example">
            <span data-word-speak="${w.example}" style="cursor:pointer;">🔊</span> ${w.example}
            ${w.exampleCn ? `<div class="word-example-cn">${w.exampleCn}</div>` : ''}
          </div>` : ''}
        ${usage ? `
          <div class="word-section">
            <div class="word-section-title">📝 怎么使用</div>
            <div style="font-size:13px; line-height:1.7;">${usage}</div>
          </div>` : ''}
        ${collocations ? `
          <div class="word-section">
            <div class="word-section-title">📌 词语搭配(常用组合,点击朗读)</div>
            <div class="word-collocations">${collocations}</div>
          </div>` : ''}
        ${memoryItems.length ? `
          <div class="word-section">
            <div class="word-section-title">🧠 多种记忆方法</div>
            <div class="word-memory-list">
              ${memoryItems.map(m => `<div class="word-memory-item"><span class="mm-label">${m.label}</span>${m.text}</div>`).join('')}
            </div>
          </div>` : ''}
        ${wordThemes ? `
          <div class="word-section">
            <div class="word-section-title">🗂️ 同类词族(点击查看更多)</div>
            <div class="word-collocations">${wordThemes}</div>
          </div>` : ''}
      </div>
    `;
  },

  // 实时生成词根说明(基于后缀/前缀)
  _genRoots(word) {
    if (!word) return '';
    const w = word.toLowerCase();
    if (w.endsWith('tion') || w.endsWith('sion')) return '名词后缀 -tion/-sion,表"动作/状态/过程",源自拉丁语。';
    if (w.endsWith('ment')) return '名词后缀 -ment,表"行为/结果/状态"。';
    if (w.endsWith('able') || w.endsWith('ible')) return '形容词后缀 -able/-ible,表"可..的/能..的"。';
    if (w.endsWith('ful')) return '形容词后缀 -ful,表"充满..的/有..特性的"。';
    if (w.endsWith('less')) return '形容词后缀 -less,表"无..的/不..的"。';
    if (w.endsWith('ly')) return '副词后缀 -ly,表"..地",多由形容词加 ly 变来。';
    if (w.endsWith('ness')) return '名词后缀 -ness,表"状态/性质",由形容词变来。';
    if (w.endsWith('er') || w.endsWith('or')) return '名词后缀 -er/-or,表"做..的人/物"。';
    if (w.endsWith('ing')) return '现在分词后缀 -ing,可作形容词/名词。';
    if (w.endsWith('ed')) return '过去分词后缀 -ed,表"已完成/被..的"。';
    if (w.endsWith('ize') || w.endsWith('ise')) return '动词后缀 -ize/-ise,表"使..化"。';
    if (w.endsWith('y')) return '形容词后缀 -y,表"有..特性的"。';
    if (w.startsWith('un') || w.startsWith('in') || w.startsWith('dis')) return '否定前缀 un-/in-/dis-,表"不/相反"。';
    if (w.startsWith('re')) return '前缀 re-,表"再/重新"。';
    if (w.startsWith('pre')) return '前缀 pre-,表"在..之前"。';
    if (w.startsWith('over')) return '前缀 over-,表"过度/在上"。';
    if (w.startsWith('under')) return '前缀 under-,表"在..下/不足"。';
    return '基础词,无明显词根结构(英语最古老日耳曼词层)。';
  },

  // 实时生成谐音(基于音标)
  _genHomophone(word, phonetic) {
    if (!phonetic) {
      // 没音标时,用词首字母+元音粗略生成
      return '';
    }
    // 已有硬编码映射的优先用
    const hints = {
      'apple': '阿婆', 'banana': '把那拿', 'orange': '哦润之',
      'family': '伐木里', 'mother': '妈的', 'father': '罚着',
      'brother': '不热热', 'sister': '西斯脱', 'friend': '夫润德',
      'water': '窝特', 'bread': '不软德', 'school': '死酷',
      'teacher': '踢切儿', 'student': '死丢等', 'book': '不克',
      'read': '瑞德', 'write': '如爱特', 'listen': '里森',
      'speak': '死必克', 'good': '顾德', 'morning': '摸宁',
      'hello': '哈喽', 'thank': '三克', 'sorry': '索瑞',
      'love': '拉夫', 'happy': '海皮', 'sad': '撒德'
    };
    if (hints[word.toLowerCase()]) return hints[word.toLowerCase()];

    // 基于音标的近似映射
    let py = phonetic.replace(/[\/\[\]]/g, '');
    const map = {
      'æ': '啊', 'e': '诶', 'i': '伊', 'i:': '衣', 'aɪ': '爱',
      'əʊ': '欧', 'oʊ': '欧', 'u:': '乌', 'ʊ': '乌', 'ɔ:': '哦',
      'ɒ': '哦', 'ɑ:': '阿', 'ʌ': '阿', 'ə': '额', 'ŋ': '恩',
      'θ': '丝', 'ð': '得', 'ʃ': '嘘', 'ʒ': '热', 'tʃ': '吃', 'dʒ': '之'
    };
    let out = '';
    for (let i = 0; i < py.length; i++) {
      const c = py[i];
      // 优先匹配2字符
      const two = py.substr(i, 2);
      if (map[two]) { out += map[two]; i++; }
      else if (map[c]) out += map[c];
      else if (/[a-z]/i.test(c)) out += c;
    }
    return out.substring(0, 8);
  },

  // 实时生成故事串联
  _genStory(word, meaning) {
    if (!word || !meaning) return '';
    // 基于词+意思的迷你故事模板
    return `想象一个场景:小明在街上看到"${meaning}",他对朋友说"This is ${word}!"朋友记下了。第二天他用 ${word} 造句:"The ${word} is interesting."从今天起,每次看到"${meaning}",脑子里就蹦出 ${word}。`;
  },

  // 实时生成词源
  _genEtymology(word) {
    if (!word) return '';
    return this._genRoots(word);  // 复用词根识别逻辑
  },

  // 实时生成同/反义词(基于词性+前缀/后缀,粗粒度提示)
  _genSynAnt(w) {
    const pos = w.pos || '';
    const word = (w.word || '').toLowerCase();
    const syns = [];
    const ants = [];
    // 基于否定前缀派生反义词
    if (word.startsWith('un') || word.startsWith('in') || word.startsWith('dis') || word.startsWith('non')) {
      // 已是否定形式,反义是去掉前缀
      const base = word.replace(/^(un|in|dis|non)/, '');
      if (base.length > 2) ants.push(base);
    } else if (pos.includes('adj.')) {
      // 形容词:派生反义
      ants.push('un' + word, 'in' + word);
    } else if (pos.includes('v.')) {
      // 动词:派生反义
      ants.push('un' + word);
    }
    // 常见动词反义对(粗粒度提示)
    const antPairs = {
      'go':'come','come':'go','up':'down','down':'up','left':'right','right':'left',
      'big':'small','small':'big','good':'bad','bad':'good','hot':'cold','cold':'hot',
      'long':'short','short':'long','old':'new','new':'old','old':'young','young':'old',
      'open':'close','close':'open','buy':'sell','sell':'buy','love':'hate','hate':'love',
      'fast':'slow','slow':'fast','high':'low','low':'high','full':'empty','empty':'full',
      'start':'stop','stop':'start','begin':'end','end':'begin','win':'lose','lose':'win',
      'yes':'no','no':'yes','true':'false','false':'true','same':'different','different':'same',
      'easy':'hard','hard':'easy','soft':'hard','hard':'soft','rich':'poor','poor':'rich',
      'safe':'dangerous','first':'last','last':'first','early':'late','late':'early',
      'increase':'decrease','decrease':'increase','remember':'forget','forget':'remember',
      'live':'die','die':'live','rise':'fall','fall':'rise','push':'pull','pull':'push',
      'give':'take','take':'give','borrow':'lend','lend':'borrow','arrive':'leave','leave':'arrive'
    };
    if (antPairs[word]) ants.push(antPairs[word]);
    // 同义粗提示
    const synHints = {
      'big':'large, huge','small':'little, tiny','fast':'quick, rapid','happy':'glad, joyful',
      'sad':'unhappy, sorrowful','begin':'start, commence','end':'finish, conclude',
      'smart':'clever, intelligent','beautiful':'pretty, lovely','important':'significant, vital'
    };
    if (synHints[word]) {
      synHints[word].split(',').forEach(s => syns.push(s.trim()));
    }
    return { syns, ants };
  },

  // 实时生成用法说明(基于词性)
  _genUsage(w) {
    const pos = w.pos || '';
    const word = w.word || '';
    if (pos.includes('n.')) {
      return `名词用法:可数时加 -s/-es 表复数;可作主语(I want ${word}.)或宾语(I have ${word}.);可加冠词(a/an/the ${word})、形容词修饰(nice ${word})、所有格(${word}'s)。`;
    }
    if (pos.includes('v.')) {
      return `动词用法:作谓语,需注意时态(现在 ${word}s / 过去 ${word}ed 或不规则);可接宾语;否定用 don't/doesn't/didn't + ${word};疑问用 Do/Does/Did + 主语 + ${word}。`;
    }
    if (pos.includes('adj.')) {
      return `形容词用法:修饰名词(a ${word} person);作表语(She is ${word}.);比较级加 -er/more ${word},最高级加 -est/most ${word};可被 very/quite 修饰。`;
    }
    if (pos.includes('adv.')) {
      return `副词用法:修饰动词(work ${word});修饰形容词(very ${word});位置灵活(句首/句中/句末);部分可加 -ly 转换。`;
    }
    if (pos.includes('prep.')) {
      return `介词用法:接名词/代词/动名词作宾语(${word} me / ${word} the table);构成介词短语作状语/定语/表语;不单独作句子成分。`;
    }
    if (pos.includes('pron.')) {
      return `代词用法:代替名词作主语/宾语/表语;有格的变化(主格/宾格/所有格);不与冠词连用;指代上文出现的人或物。`;
    }
    if (pos.includes('conj.')) {
      return `连词用法:连接词、短语或从句;表逻辑关系(并列/转折/因果/选择等);不单独作句子成分。`;
    }
    if (pos.includes('num.')) return '数词用法:作主语/宾语/定语,表数量或顺序。';
    if (pos.includes('art.')) return '冠词用法:a/an 表泛指,the 表特指。';
    if (pos.includes('int.')) return '感叹词用法:表情感或反应,独立成分。';
    return '参见例句中的实际用法。';
  },

  // 根据词性生成常用搭配
  _genCollocations(w) {
    const pos = w.pos || '';
    const word = w.word || '';
    if (!word) return '';
    const tags = [];
    if (pos.includes('n.')) {
      tags.push('a/the ' + word);
      tags.push(word + ' + is/are');
      tags.push('my/your/his/her ' + word);
    }
    if (pos.includes('v.')) {
      tags.push('to ' + word);
      tags.push(word + ' something');
      tags.push('often/usually ' + word);
    }
    if (pos.includes('adj.')) {
      tags.push('very ' + word);
      tags.push(word + ' + 名词');
      tags.push('look/feel ' + word);
    }
    if (pos.includes('adv.')) {
      tags.push(word + ' + 动词');
      tags.push('动词 + ' + word);
    }
    if (pos.includes('prep.')) {
      tags.push(word + ' + 名词/代词');
    }
    return tags.map(t => `<span class="collocation-tag" data-word-speak="${t.replace(/[^a-zA-Z\s]/g,'').trim()}" title="点击朗读">${t}</span>`).join('');
  },

  // 谐音提示(简单版,基于发音近似)
  _homophoneHint(word, phonetic) {
    // 简单映射常见高频词的谐音
    const hints = {
      'apple': '阿婆', 'banana': '把那拿', 'orange': '哦润之',
      'family': '伐木里', 'mother': '妈的', 'father': '罚着',
      'brother': '不热热', 'sister': '西斯脱', 'friend': '夫润德',
      'water': '窝特', 'bread': '不软德', 'school': '死酷',
      'teacher': '踢切儿', 'student': '死丢等', 'book': '不克',
      'read': '瑞德', 'write': '如爱特', 'listen': '里森',
      'speak': '死必克', 'good': '顾德', 'morning': '摸宁',
      'hello': '哈喽', 'thank': '三克', 'sorry': '索瑞',
      'love': '拉夫', 'happy': '海皮', 'sad': '撒德'
    };
    if (hints[word.toLowerCase()]) return hints[word.toLowerCase()];
    // 默认提示
    return word;
  },

  // ===== 语法查询 =====
  _renderGrammarTab() {
    const el = document.getElementById('dictContent');
    const categories = this.grammar.categories || [];
    const topics = this.grammar.topics || [];
    el.innerHTML = `
      <input type="text" class="dict-search-box" id="grammarSearchInput"
             placeholder="输入语法关键词(如: 时态/从句/be动词)" autocomplete="off">
      <div class="font-sm text-secondary" style="padding:8px 0;">
        📚 共 ${topics.length} 个语法点,${categories.length} 个分类
      </div>
      <div id="grammarResults"></div>
    `;
    const input = document.getElementById('grammarSearchInput');
    let timer = null;
    const search = (q) => {
      const rEl = document.getElementById('grammarResults');
      if (!q) {
        // 默认按分类显示
        rEl.innerHTML = categories.map(cat => `
          <div class="card mb-16">
            <div class="card-title">${cat.icon||'📖'} ${cat.name} <span class="font-sm text-secondary">(L${cat.level})</span></div>
            <div class="grid grid-2">
              ${topics.filter(t => t.category === cat.id).map(t => `
                <div class="grammar-card" data-grammar-id="${t.id}">
                  <div class="grammar-card-title">${t.title}</div>
                  <div class="grammar-card-summary">${t.summary || ''}</div>
                </div>
              `).join('')}
            </div>
          </div>
        `).join('');
      } else {
        const ql = q.toLowerCase();
        const matched = topics.filter(t =>
          (t.title || '').toLowerCase().includes(ql) ||
          (t.summary || '').toLowerCase().includes(ql) ||
          (t.detail || '').toLowerCase().includes(ql)
        );
        rEl.innerHTML = matched.length ? matched.map(t => `
          <div class="grammar-card" data-grammar-id="${t.id}">
            <div class="grammar-card-title">${t.title}</div>
            <div class="grammar-card-summary">${t.summary || ''}</div>
          </div>
        `).join('') : `<p class="text-secondary font-sm" style="padding:12px;">未找到匹配的语法点。</p>`;
      }
      // 绑定点击查看详情
      rEl.querySelectorAll('[data-grammar-id]').forEach(c => {
        c.onclick = () => this._showGrammarDetail(c.dataset.grammarId);
      });
    };
    input.oninput = () => {
      clearTimeout(timer);
      timer = setTimeout(() => search(input.value.trim()), 200);
    };
    search('');
  },

  _showGrammarDetail(id) {
    const t = (this.grammar.topics || []).find(x => x.id === id);
    if (!t) return;
    const el = document.getElementById('dictContent');
    el.innerHTML = `
      <button class="back-btn" id="grammarBack">← 返回列表</button>
      <div class="grammar-detail">
        <h2 style="color:var(--accent);">${t.title}</h2>
        <div class="font-sm text-secondary">分类: ${t.category} | 级别: L${t.level}</div>
        ${t.summary ? `<p style="margin-top:8px;"><b>摘要:</b> ${t.summary}</p>` : ''}
        <div class="grammar-detail-body">${(t.detail || '(无详细内容)').replace(/\n/g, '<br>')}</div>
        ${t.examples && t.examples.length ? `
          <div class="word-section">
            <div class="word-section-title">📝 例句(点击朗读)</div>
            ${t.examples.map(ex => `
              <div class="word-example">
                <span data-word-speak="${ex.en||''}" style="cursor:pointer;">🔊</span> ${ex.en||''}
                ${ex.cn ? `<div class="word-example-cn">${ex.cn}</div>` : ''}
              </div>
            `).join('')}
          </div>
        ` : ''}
      </div>
    `;
    document.getElementById('grammarBack').onclick = () => this._renderGrammarTab();
    el.querySelectorAll('[data-word-speak]').forEach(b => {
      b.onclick = () => EM.tts.speak(b.dataset.wordSpeak);
    });
  },

  // ===== 主题词族 =====
  _renderThemesTab() {
    if (!this.themes || !this.themes.themes) {
      document.getElementById('dictContent').innerHTML = '<p class="text-secondary">主题词族数据未加载</p>';
      return;
    }
    const el = document.getElementById('dictContent');
    el.innerHTML = `
      <div class="font-sm text-secondary" style="padding:8px 0;">
        🗂️ 同类词汇总记忆:把同类单词放一起记,效率提升3倍。点击任一主题查看完整词表。
      </div>
      <div class="theme-grid" id="themesGrid">
        ${this.themes.themes.map(t => `
          <div class="theme-card" data-theme-detail="${t.id}">
            <div class="theme-card-title">${t.icon||'📌'} ${t.name}</div>
            <div class="theme-card-meta">L${t.level||1} · ${t.words.length} 个词</div>
          </div>
        `).join('')}
      </div>
    `;
    el.querySelectorAll('[data-theme-detail]').forEach(c => {
      c.onclick = () => this._showThemeDetail(c.dataset.themeDetail);
    });
  },

  _showThemeDetail(id) {
    const t = (this.themes.themes || []).find(x => x.id === id);
    if (!t) return;
    const el = document.getElementById('dictContent');
    el.innerHTML = `
      <button class="back-btn" id="themeBack">← 返回主题列表</button>
      <div class="card">
        <div class="card-title">${t.icon||'📌'} ${t.name} <span class="font-sm text-secondary">(L${t.level||1})</span></div>
        <p class="font-sm text-secondary mb-16">点击任一单词查看完整词条,或点击下方"全部朗读"听全部。</p>
        <button class="btn btn-primary mb-16" id="themePlayAll">🔊 全部朗读</button>
        <div id="themeWords">
          ${t.words.map(w => `<span class="theme-detail-word" data-word-detail="${w}">${w}</span>`).join('')}
        </div>
      </div>
    `;
    document.getElementById('themeBack').onclick = () => this._renderThemesTab();
    document.getElementById('themePlayAll').onclick = () => {
      EM.tts.speakSequence(t.words);
    };
    el.querySelectorAll('[data-word-detail]').forEach(s => {
      s.onclick = () => {
        // 切换到单词查询tab并搜索这个词
        this.tab = 'words';
        this._renderShell();
        const input = document.getElementById('wordSearchInput');
        if (input) {
          input.value = s.dataset.wordDetail;
          this._searchWords(s.dataset.wordDetail);
        }
      };
    });
  }
};

// 注册到路由
EM.registerModule('dictionary', EM.dictionary);
