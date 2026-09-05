/* ===== RAG 智能问答模块 (检索增强生成) =====
 * 本地知识库优先：从 data/knowledge.json 检索最相关的问答对，按关键词重叠度排序
 * 可选 AI 模式：检查 settings 中是否配置 aiApiKey，有则调用 OpenAI 兼容接口；无则纯本地
 * 聊天界面：用户输入→系统回答，回答中可点击英文触发 TTS 发音
 * 快捷问题：常见问题一键提问
 * 统计：每次提问累计 progress.modules.rag.queryCount
 * 兼容 iOS Safari（所有 TTS 由用户点击触发，不自动播放）
 */
window.EM = window.EM || {};

EM.rag = {
  data: null,           // knowledge.json 数据缓存(精选 QA)
  vocab: null,          // vocabulary.json (20000 高频词)
  enhanced: null,       // vocabulary_enhanced.json (L1-L3 增强字段)
  grammar: null,        // grammar.json + grammar_extra.json 合并(550 条)
  _container: null,     // 当前渲染容器
  config: null,         // AI 设置缓存 {aiApiUrl, aiApiKey, aiModel}
  useAI: false,         // 是否启用 AI 模式
  messages: [],         // 聊天历史 [{role:'user'|'bot', text}]
  thinking: false,      // AI 正在生成中

  /* ===== 停用词集合（用于分词过滤） ===== */
  _stopwords: new Set([
    '的','了','是','在','我','你','他','她','它','们','和','与','或','也','都','就','那','这',
    '怎么','什么','为什么','哪里','哪个','哪些','如何','吗','呢','吧','啊','呀','哦','哈',
    'a','an','the','is','are','was','were','do','does','did','to','of','in','on','at','for','and','or','but','how','what','why'
  ]),

  /* ===== 入口：由路由调用 ===== */
  async render(container) {
    this._container = container;
    this._injectStyles();
    container.innerHTML = '<div class="loading">加载知识库中...</div>';

    // 异步加载数据（EM.data 带缓存）
    // 知识库 + 20000 词汇 + 550 语法 全部纳入 RAG 检索源
    if (!this.data) {
      this.data = await EM.data.load('knowledge');
    }
    if (!this.vocab) this.vocab = await EM.data.load('vocabulary');
    if (!this.enhanced) this.enhanced = await EM.data.load('vocabulary_enhanced');
    if (!this.grammar) {
      // 合并 grammar.json + grammar_extra.json = 550 条
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
    if (!this.data || !this.data.qa) {
      container.innerHTML = '<div class="card"><p>知识库加载失败，请刷新重试。</p></div>';
      return;
    }

    // 读取 AI 配置（从 settings）
    this.reloadConfig();

    // 首次进入显示欢迎语
    if (this.messages.length === 0) {
      this.messages.push({
        role: 'bot',
        text: '你好!我是英语学习助手 🤖 (已加载 20000 高频词 + 550 语法),可以问我:\n'
              + '• 单词: 直接输入英文(如 "apple") 或"单词 xxx" → 返回音标/词性/中文/例句/搭配/记忆方法\n'
              + '• 语法: 直接问 "be动词"、"定语从句"、"虚拟语气" → 返回精讲+例句\n'
              + '• 翻译: 问 "苹果用英语怎么说" → 返回英文表达\n'
              + '• 拼读/词汇/学习方法: 查 knowledge.json 精选 QA\n'
              + '回答中蓝色下划线的英文可点击 🔊 听发音。'
              + (this.useAI ? '\n\n✨ 当前为 AI 模式(本地未匹配时自动回退到 AI)' : '\n\n📚 当前为本地知识库模式(设置中可配置 AI 增强)')
      });
    }

    this._renderShell();
  },

  /* ===== 注入本模块专用样式 ===== */
  _injectStyles() {
    if (document.getElementById('rag-styles')) return;
    const style = document.createElement('style');
    style.id = 'rag-styles';
    style.textContent = `
      .rag-layout { display:flex; flex-direction:column; gap:12px; }
      .rag-toolbar { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
      .rag-mode-badge {
        display:inline-flex; align-items:center; gap:4px;
        padding:4px 10px; border-radius:12px; font-size:12px; font-weight:600;
        background:var(--accent-bg); color:var(--accent);
      }
      .rag-mode-badge.ai { background:rgba(124,92,252,0.15); color:#a98bff; }
      .rag-mode-badge.local { background:rgba(76,175,136,0.15); color:var(--success); }
      .rag-quick-row { display:flex; gap:8px; flex-wrap:wrap; }
      .rag-quick-btn {
        padding:6px 12px; border-radius:16px; font-size:13px;
        background:var(--bg-card); border:1px solid var(--border);
        color:var(--text-secondary); cursor:pointer; transition:var(--transition);
      }
      .rag-quick-btn:hover { border-color:var(--accent); color:var(--accent); background:var(--accent-bg); }
      .rag-chat-box {
        background:var(--bg-card); border:1px solid var(--border);
        border-radius:var(--radius); padding:16px; height:48vh; min-height:340px;
        overflow-y:auto; display:flex; flex-direction:column; gap:14px;
      }
      .rag-msg { display:flex; flex-direction:column; max-width:88%; }
      .rag-msg.user { align-self:flex-end; align-items:flex-end; }
      .rag-msg.bot { align-self:flex-start; }
      .rag-msg-role {
        font-size:11px; color:var(--text-muted); margin-bottom:4px; padding:0 4px;
      }
      .rag-msg-bubble {
        padding:10px 14px; border-radius:14px; font-size:14px; line-height:1.7;
        word-break:break-word; white-space:pre-wrap;
      }
      .rag-msg.user .rag-msg-bubble {
        background:linear-gradient(135deg, var(--accent), #7c5cfc);
        color:#fff; border-bottom-right-radius:4px;
      }
      .rag-msg.bot .rag-msg-bubble {
        background:var(--bg-hover); color:var(--text-primary);
        border:1px solid var(--border); border-bottom-left-radius:4px;
      }
      .rag-msg.bot .rag-msg-bubble .rag-cite {
        display:block; margin-top:8px; padding-top:6px;
        border-top:1px dashed var(--border); font-size:12px; color:var(--text-muted);
      }
      .rag-speak-word {
        display:inline; color:var(--accent); cursor:pointer;
        border-bottom:1px dashed var(--accent); padding:0 1px;
      }
      .rag-speak-word:hover { background:var(--accent-bg); }
      .rag-input-row { display:flex; gap:8px; align-items:flex-end; }
      .rag-input {
        flex:1; padding:11px 14px; background:var(--bg-card);
        border:1px solid var(--border); border-radius:var(--radius-sm);
        color:var(--text-primary); font-size:14px; font-family:inherit;
        resize:none; min-height:42px; max-height:120px; line-height:1.5;
      }
      .rag-input:focus { outline:none; border-color:var(--accent); }
      .rag-send-btn {
        padding:11px 18px; background:var(--accent); color:#fff;
        border:none; border-radius:var(--radius-sm); font-size:14px;
        font-weight:600; cursor:pointer; transition:var(--transition);
        white-space:nowrap;
      }
      .rag-send-btn:hover { opacity:0.9; }
      .rag-send-btn:disabled { opacity:0.5; cursor:not-allowed; }
      .rag-hint { font-size:13px; color:var(--text-secondary); }
      .rag-typing {
        display:inline-flex; gap:3px; align-items:center;
      }
      .rag-typing span {
        width:6px; height:6px; border-radius:50%;
        background:var(--text-muted); animation:rag-bounce 1s infinite;
      }
      .rag-typing span:nth-child(2) { animation-delay:0.15s; }
      .rag-typing span:nth-child(3) { animation-delay:0.3s; }
      @keyframes rag-bounce {
        0%,60%,100% { transform:translateY(0); opacity:0.4; }
        30% { transform:translateY(-4px); opacity:1; }
      }
    `;
    document.head.appendChild(style);
  },

  /* ===== 渲染外壳 ===== */
  _renderShell() {
    const container = this._container;
    const p = EM.progress.get();
    const queryCount = (p.modules.rag && p.modules.rag.queryCount) || 0;

    container.innerHTML = `
      <div class="card">
        <div class="flex justify-between align-center mb-16">
          <div class="card-title">🤖 智能问答</div>
          <span class="rag-mode-badge ${this.useAI ? 'ai' : 'local'}" id="ragModeBadge">
            ${this.useAI ? '✨ AI 模式' : '📚 本地知识库'}
          </span>
        </div>
        <div class="rag-hint">已回答 <b>${queryCount}</b> 个问题 · ${this.useAI ? '已接入 AI，回答更智能' : '本地知识库离线可用，配置 AI 接口后更智能'}</div>
      </div>

      <div class="rag-layout">
        <div class="card">
          <div class="rag-hint" style="margin-bottom:8px;">💡 快捷问题（点击直接提问）：</div>
          <div class="rag-quick-row" id="ragQuickRow"></div>
        </div>

        <div class="rag-chat-box" id="ragChatBox"></div>

        <div class="rag-input-row">
          <textarea class="rag-input" id="ragInput" rows="1"
                    placeholder="输入你的英语学习问题，如：be动词怎么用？/怎么背单词？"
                    enterkeyhint="send"></textarea>
          <button class="rag-send-btn" id="ragSendBtn" title="发送">发送 ➤</button>
        </div>
        <div class="rag-hint">回答中蓝色下划线的英文可点击 🔊 听发音 · 回车发送（移动端可换行）</div>
      </div>
    `;

    // 渲染快捷问题
    this._renderQuickButtons();

    // 渲染已有消息
    this._renderMessages();

    // 绑定输入与发送
    const input = document.getElementById('ragInput');
    const sendBtn = document.getElementById('ragSendBtn');
    if (input) {
      // 自适应高度
      input.oninput = () => {
        input.style.height = 'auto';
        input.style.height = Math.min(120, input.scrollHeight) + 'px';
      };
      // 回车发送（PC）+ Shift+Enter 换行
      input.onkeydown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this._submit();
        }
      };
    }
    if (sendBtn) sendBtn.onclick = () => this._submit();
  },

  /* ===== 快捷问题按钮 ===== */
  _renderQuickButtons() {
    const el = document.getElementById('ragQuickRow');
    if (!el) return;
    const quicks = [
      'apple',
      '什么是自然拼读？',
      'be动词怎么用？',
      '定语从句',
      '虚拟语气',
      '怎么背单词最有效？',
      '苹果用英语怎么说',
      '零基础怎么学英语？'
    ];
    el.innerHTML = quicks.map(q =>
      `<button class="rag-quick-btn" data-q="${EM.ui.esc(q)}">${EM.ui.esc(q)}</button>`
    ).join('');
    el.querySelectorAll('[data-q]').forEach(btn => {
      btn.onclick = () => {
        const input = document.getElementById('ragInput');
        if (input) {
          input.value = btn.dataset.q;
          this._submit();
        }
      };
    });
  },

  /* ===== 渲染消息列表 ===== */
  _renderMessages() {
    const box = document.getElementById('ragChatBox');
    if (!box) return;
    box.innerHTML = '';
    this.messages.forEach((m, i) => {
      const div = document.createElement('div');
      div.className = 'rag-msg ' + m.role;
      const role = document.createElement('div');
      role.className = 'rag-msg-role';
      role.textContent = m.role === 'user' ? '我' : '英语助手';
      const bubble = document.createElement('div');
      bubble.className = 'rag-msg-bubble';
      // bot 消息支持 HTML（包裹英文可发音）
      if (m.role === 'bot') {
        bubble.innerHTML = this._wrapEnglishForSpeech(m.text, m.cite);
      } else {
        bubble.textContent = m.text;
      }
      div.appendChild(role);
      div.appendChild(bubble);
      box.appendChild(div);
    });

    // 等待 AI 时显示打字动画
    if (this.thinking) {
      const div = document.createElement('div');
      div.className = 'rag-msg bot';
      div.innerHTML = `<div class="rag-msg-role">英语助手</div>
        <div class="rag-msg-bubble"><span class="rag-typing"><span></span><span></span><span></span></span></div>`;
      box.appendChild(div);
    }

    // 绑定发音点击
    box.querySelectorAll('.rag-speak-word').forEach(span => {
      span.onclick = () => {
        EM.tts.speak(span.dataset.text, { rate: 0.85 });
      };
    });

    // 滚动到底部
    box.scrollTop = box.scrollHeight;
  },

  /* ===== 提交问题 ===== */
  _submit() {
    const input = document.getElementById('ragInput');
    if (!input) return;
    const query = input.value.trim();
    if (!query) return;
    if (this.thinking) {
      EM.ui.toast('正在生成回答，请稍候...');
      return;
    }

    // 记录用户消息
    this.messages.push({ role: 'user', text: query });
    input.value = '';
    input.style.height = 'auto';

    // 记录查询次数
    EM.progress.update(d => {
      if (!d.modules.rag) d.modules.rag = { queryCount: 0 };
      d.modules.rag.queryCount = (d.modules.rag.queryCount || 0) + 1;
    });

    // 路由分发
    if (this.useAI) {
      this._askAI(query);
    } else {
      // 本地检索（同步即可，但保持视觉延迟感）
      const answer = this._askLocal(query);
      this.messages.push({ role: 'bot', text: answer.text, cite: answer.cite });
      this._renderMessages();
      this._refreshQueryCount();
    }
  },

  /* ===== 本地检索：分词 + 关键词重叠打分 (含词汇/语法动态知识源) ===== */
  _askLocal(query) {
    const qa = (this.data && this.data.qa) || [];

    // 用户查询的分词
    const queryTokens = this._tokenize(query);
    const queryLower = query.toLowerCase();
    const queryTrim = query.trim();

    // === 优先级 1: 单词查询 ===
    // 如果查询是纯英文单词,直接查词汇库
    if (/^[a-zA-Z]+(?:[\s-][a-zA-Z]+)?$/.test(queryTrim) && queryTrim.length >= 2) {
      const wordHit = this._searchVocab(queryTrim.toLowerCase());
      if (wordHit) return { text: wordHit.text, cite: wordHit.cite };
    }
    // 如果查询含"单词xxx"或"xxx什么意思"或"xxx怎么用",尝试提取英文单词
    const wordMatch = queryTrim.match(/(?:单词|词汇|意思|含义|怎么用|用法)\s*[:：]?\s*([a-zA-Z]+)/);
    if (wordMatch && wordMatch[1]) {
      const wordHit = this._searchVocab(wordMatch[1].toLowerCase());
      if (wordHit) return { text: wordHit.text, cite: wordHit.cite };
    }
    // 中文释义反查(用户输入"苹果用英语怎么说")
    const cnMatch = queryTrim.match(/(?:英语怎么说|英文怎么说|用英语说|英文是什么)\s*[:：]?\s*([\u4e00-\u9fa5]+)/);
    if (cnMatch && cnMatch[1]) {
      const wordHit = this._searchByMeaning(cnMatch[1]);
      if (wordHit) return { text: wordHit.text, cite: wordHit.cite };
    }

    // === 优先级 2: 语法查询 ===
    // 用户问句中含语法关键词时,优先返回语法精讲
    const grammarHit = this._searchGrammar(queryTrim, queryTokens);
    if (grammarHit) return { text: grammarHit.text, cite: grammarHit.cite };

    // === 优先级 3: knowledge.json 精选 QA ===
    if (!qa.length) {
      return { text: '本地知识库为空,请在设置中配置 AI 接口以使用智能问答。' };
    }

    // 对每条 QA 计算匹配得分
    const scored = qa.map(item => {
      let score = 0;
      const itemKeywords = item.keywords || [];
      const itemQuestion = (item.question || '').toLowerCase();
      const itemAnswer = (item.answer || '').toLowerCase();

      // 1) 关键词精确匹配（权重最高）
      queryTokens.forEach(tok => {
        itemKeywords.forEach(kw => {
          const kwLower = kw.toLowerCase();
          if (kwLower === tok) score += 5;            // 完全匹配
          else if (kwLower.includes(tok) || tok.includes(kwLower)) score += 2; // 部分匹配
        });
      });

      // 2) 问题原文匹配（权重中等）
      queryTokens.forEach(tok => {
        if (itemQuestion.includes(tok)) score += 2;
      });

      // 3) 答案原文匹配（权重低）
      queryTokens.forEach(tok => {
        if (itemAnswer.includes(tok)) score += 0.5;
      });

      // 4) 原始查询作为整体出现
      if (queryLower && itemQuestion.includes(queryLower)) score += 5;
      if (queryLower && itemAnswer.includes(queryLower)) score += 3;

      return { item, score };
    });

    // 排序：得分降序
    scored.sort((a, b) => b.score - a.score);
    const best = scored[0];
    const top = scored.filter(s => s.score > 0 && s.score >= best.score * 0.6).slice(0, 3);

    // 无匹配 → 给通用建议
    if (!best || best.score === 0) {
      return {
        text: '抱歉，本地知识库中没有找到与你的问题完全匹配的内容。\n\n'
              + '你可以试试：\n'
              + '• 改用更简单的关键词，如「be动词」「比较级」「背单词」\n'
              + '• 查看快捷问题列表中的常见问题\n'
              + '• 在 ⚙️ 设置中配置 AI 接口（如 OpenAI/DeepSeek/通义千问），获得更智能的回答\n\n'
              + '常见主题：拼读 / 词汇 / 语法 / 学习方法 / 翻译。'
      };
    }

    // 综合回答
    let text = '';
    let cite = '';
    if (top.length === 1) {
      text = top[0].item.answer;
      cite = `📚 知识库条目：${top[0].item.question}（${top[0].item.category} · L${top[0].item.level}）`;
    } else {
      // 多条匹配：综合呈现
      text = top.map((t, i) =>
        `${i + 1}. ${t.item.answer}`
      ).join('\n\n');
      cite = `📚 综合 ${top.length} 条相关知识：${top.map(t => t.item.question).join(' / ')}（${top[0].item.category}）`;
    }

    return { text, cite };
  },

  /* ===== 词汇检索:从 20000 词库中查询单词完整信息 ===== */
  _searchVocab(word) {
    if (!this.vocab || !this.vocab.levels) return null;
    const w = word.toLowerCase().trim();
    let hit = null;
    for (const lv of this.vocab.levels) {
      for (const item of (lv.words || [])) {
        if ((item.word || '').toLowerCase() === w) {
          hit = { ...item, level: lv.level, levelName: lv.name };
          break;
        }
      }
      if (hit) break;
    }
    if (!hit) return null;
    // 合并增强字段(L1-L3 有)
    const enh = (this.enhanced && this.enhanced.words && this.enhanced.words[hit.word]) || {};
    const roots = enh.roots || '(基础词,无明显词根结构)';
    const usage = enh.usage || `词性 ${hit.pos || ''}。请参考例句 ${hit.example || ''}`;
    const collocs = (enh.collocations || []).join('; ') || '(暂无)';
    const story = enh.story || `想象 "${hit.word}" 表达 "${hit.meaning}",在脑中构造一个场景反复出现它。`;
    const homo = enh.homophone || '(基于音标 ' + (hit.phonetic || '?') + ' 跟读)';
    const syns = (enh.synonyms || []).join(', ') || '(查词典)';
    const text =
      `📖 单词: ${hit.word}\n` +
      `🔤 音标: ${hit.phonetic || '(无音标)'}\n` +
      `🏷️ 词性: ${hit.pos || '?'} | 级别: L${hit.level} ${hit.levelName}\n` +
      `🇨🇳 中文: ${hit.meaning}\n` +
      `📝 例句: ${hit.example || '(无)'}\n` +
      `   译文: ${hit.exampleCn || '(无)'}\n` +
      `🌱 词根/词源: ${roots}\n` +
      `📌 词语搭配: ${collocs}\n` +
      `🧠 怎么用: ${usage}\n` +
      `🎵 谐音记忆: ${homo}\n` +
      `📖 故事串联: ${story}\n` +
      `🔁 同义词: ${syns}\n` +
      `💡 学习建议: 点击上方 🔊 朗读,跟读3遍。再尝试用 ${hit.word} 自己造一句。`;
    return { text, cite: `📚 词汇库 L${hit.level} · ${hit.word}` };
  },

  /* ===== 中文释义反查:用户问"苹果用英语怎么说" ===== */
  _searchByMeaning(cnText) {
    if (!this.vocab || !this.vocab.levels) return null;
    const cn = cnText.trim();
    let best = null;
    for (const lv of this.vocab.levels) {
      for (const item of (lv.words || [])) {
        const m = (item.meaning || '').toLowerCase();
        if (m === cn || m.startsWith(cn) || (cn.length > 1 && m.includes(cn))) {
          best = { ...item, level: lv.level, levelName: lv.name };
          if (m === cn) break;  // 精确匹配优先
        }
      }
      if (best && best.meaning === cn) break;
    }
    if (!best) return null;
    const text =
      `🇨🇳 "${cn}" 的英文表达:\n\n` +
      `📖 ${best.word} ${best.phonetic || ''}\n` +
      `🏷️ 词性: ${best.pos || ''} | 级别: L${best.level} ${best.levelName}\n` +
      `📝 例句: ${best.example || '(无)'}\n` +
      `   译文: ${best.exampleCn || '(无)'}\n` +
      `💡 多读多用,自然记住。`;
    return { text, cite: `📚 词汇反查 L${best.level} · ${best.word}` };
  },

  /* ===== 语法检索:从 550 条语法点中查找 ===== */
  _searchGrammar(query, tokens) {
    if (!this.grammar || !this.grammar.topics) return null;
    const q = query.toLowerCase();
    const scored = this.grammar.topics.map(t => {
      let score = 0;
      const title = (t.title || '').toLowerCase();
      const summary = (t.summary || '').toLowerCase();
      const detail = (t.detail || '').toLowerCase();
      // 完整查询出现
      if (q && title.includes(q)) score += 10;
      if (q && summary.includes(q)) score += 5;
      if (q && detail.includes(q)) score += 3;
      // 关键词匹配
      tokens.forEach(tok => {
        if (tok.length < 2) return;
        if (title.includes(tok)) score += 3;
        if (summary.includes(tok)) score += 2;
        if (detail.includes(tok)) score += 1;
      });
      return { t, score };
    });
    scored.sort((a, b) => b.score - a.score);
    const best = scored[0];
    if (!best || best.score < 4) return null;
    const t = best.t;
    const exs = (t.examples || []).map(e => `• ${e.en}\n  ${e.cn}`).join('\n');
    const text =
      `📖 ${t.title}\n\n` +
      `🏷️ 分类: ${t.category} | 级别: L${t.level}\n` +
      `📌 摘要: ${t.summary || ''}\n\n` +
      `📝 详解:\n${t.detail || '(无)'}\n\n` +
      (exs ? `✏️ 例句:\n${exs}\n` : '') +
      (t.tips ? `💡 口诀: ${t.tips}` : '');
    return { text, cite: `📚 语法库 · ${t.title} (L${t.level})` };
  },

  /* ===== 分词：中文按字 + 英文按词，过滤停用词 ===== */
  _tokenize(text) {
    if (!text) return [];
    const tokens = new Set();
    // 英文单词
    const enWords = text.toLowerCase().match(/[a-z]+/g) || [];
    enWords.forEach(w => {
      if (w.length > 1 && !this._stopwords.has(w)) tokens.add(w);
    });
    // 中文：按字符切（粗粒度，2-4字组合）
    const cnChunks = text.replace(/[a-zA-Z0-9\s\p{P}]/gu, '').match(/[\u4e00-\u9fa5]{2,4}/g) || [];
    cnChunks.forEach(c => tokens.add(c.toLowerCase()));
    // 中文：再按 2 字滑窗补充
    const cnChars = text.replace(/[a-zA-Z0-9\s\p{P}]/gu, '');
    for (let i = 0; i < cnChars.length - 1; i++) {
      const pair = cnChars.substr(i, 2);
      if (!this._stopwords.has(pair)) tokens.add(pair.toLowerCase());
    }
    // 中文单字（兜底，权重低）
    const singleChars = text.replace(/[a-zA-Z0-9\s\p{P}]/gu, '').split('');
    singleChars.forEach(c => {
      if (c.length && !this._stopwords.has(c)) tokens.add(c.toLowerCase());
    });
    return Array.from(tokens);
  },

  /* ===== AI 模式：调用 OpenAI 兼容接口 ===== */
  async _askAI(query) {
    this.thinking = true;
    this._renderMessages();

    const settings = this.config || {};
    // 智能补全 URL:用户可能填 https://api.agnes-ai.cn/v1 或 https://api.agnes-ai.cn/v1/chat/completions
    let apiUrl = settings.aiApiUrl || '';
    if (!apiUrl) {
      this.thinking = false;
      this._renderMessages();
      this.messages.push({ role: 'bot', text: '⚠️ 未配置 AI 接口 URL,已切换到本地知识库。请在 ⚙️ 设置中填写 API Base URL。' });
      this._renderMessages();
      return;
    }
    // 如果 URL 不以 /chat/completions 结尾,自动补全
    if (!/\/chat\/completions\/?$/.test(apiUrl)) {
      apiUrl = apiUrl.replace(/\/$/, '') + '/chat/completions';
    }
    const apiKey = settings.aiApiKey || '';
    const model = settings.aiModel || '';

    // 取本地最相关的几条作为上下文(RAG：检索增强)
    const contextQA = this._retrieveContext(query, 5);
    const contextText = contextQA.map(t =>
      `Q: ${t.item.question}\nA: ${t.item.answer}`
    ).join('\n\n');

    const systemPrompt =
      '你是一位面向"完全不懂英语的中国人"的英语学习助手。回答要求：\n' +
      '1. 使用简体中文为主，关键英文单词/句子用英文；\n' +
      '2. 解释详细，由浅入深，多用例子；\n' +
      '3. 重点针对零基础到中级学习者；\n' +
      '4. 涉及发音、拼读、词性、语法、学习方法、翻译等内容；\n' +
      '5. 简洁实用，避免冗长。\n\n' +
      '以下是本地知识库中可能相关的内容，可参考但不必照搬：\n' + (contextText || '（无相关知识）');

    try {
      if (!model) throw new Error('请先在设置中选择或输入模型名称(如 agnes-2.5-flash)');
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + apiKey
        },
        body: JSON.stringify({
          model: model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: query }
          ],
          temperature: 0.7,
          max_tokens: 800
        })
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error('HTTP ' + res.status + (errText ? (': ' + errText.slice(0, 200)) : ''));
      }
      const data = await res.json();
      const answer = (data && data.choices && data.choices[0]
                      && data.choices[0].message && data.choices[0].message.content) || '';
      if (!answer) throw new Error('AI 返回为空');

      this.messages.push({ role: 'bot', text: answer, cite: '✨ AI 生成（' + model + '）' });
    } catch (e) {
      // 失败则回退到本地回答
      const fallback = this._askLocal(query);
      this.messages.push({
        role: 'bot',
        text: '⚠️ AI 接口调用失败：' + (e.message || '未知错误') + '\n\n已为你切换到本地知识库回答：\n\n' + fallback.text,
        cite: fallback.cite || '📚 本地知识库（AI 失败回退）'
      });
    } finally {
      this.thinking = false;
      this._renderMessages();
      this._refreshQueryCount();
    }
  },

  /* ===== 检索上下文（供 AI 模式使用，简化版 _askLocal） ===== */
  _retrieveContext(query, topN) {
    const qa = (this.data && this.data.qa) || [];
    const tokens = this._tokenize(query);
    const scored = qa.map(item => {
      let score = 0;
      const kws = item.keywords || [];
      tokens.forEach(tok => {
        kws.forEach(kw => {
          const kwL = kw.toLowerCase();
          if (kwL === tok) score += 5;
          else if (kwL.includes(tok) || tok.includes(kwL)) score += 2;
        });
        if ((item.question || '').toLowerCase().includes(tok)) score += 1;
      });
      return { item, score };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored.filter(s => s.score > 0).slice(0, topN);
  },

  /* ===== 把英文单词/句子包裹成可点击的发音 span ===== */
  _wrapEnglishForSpeech(text, cite) {
    if (!text) return '';
    // 先转义整个文本
    let safe = EM.ui.esc(text);
    // 匹配：① 英文单词序列（含空格 1-5 词）；② 单独的英文单词；③ 含 ' 的缩写
    // 包裹成 <span class="rag-speak-word" data-text="原文">原文</span>
    // 注意：safe 中的引号已被转义为 &quot; 等，这里只匹配 ASCII 字母
    safe = safe.replace(/([A-Za-z][A-Za-z'\-]*(?:\s+[A-Za-z][A-Za-z'\-]*){0,4})/g, (match) => {
      // 排除过短或全是符号
      if (match.length < 2) return match;
      // 用 &quot; 防止属性注入（因为 EM.ui.esc 会把 " 转 &quot;，所以 data-text 内容已安全）
      return '<span class="rag-speak-word" data-text="' + match + '">🔊 ' + match + '</span>';
    });
    if (cite) {
      safe += '<span class="rag-cite">' + EM.ui.esc(cite) + '</span>';
    }
    return safe;
  },

  /* ===== 重新读取 AI 配置 ===== */
  reloadConfig() {
    const s = EM.progress.getSettings();
    this.config = {
      aiApiUrl: s.aiApiUrl || '',
      aiApiKey: s.aiApiKey || '',
      aiModel: s.aiModel || 'gpt-4o-mini'
    };
    // 同时配置 URL 和 Key 才视为启用 AI
    this.useAI = !!(this.config.aiApiUrl && this.config.aiApiKey);
    // 若容器已渲染，刷新模式徽章
    const badge = document.getElementById('ragModeBadge');
    if (badge) {
      badge.className = 'rag-mode-badge ' + (this.useAI ? 'ai' : 'local');
      badge.textContent = this.useAI ? '✨ AI 模式' : '📚 本地知识库';
    }
    return this.useAI;
  },

  /* ===== 局部刷新查询次数 ===== */
  _refreshQueryCount() {
    const c = this._container;
    if (!c) return;
    const p = EM.progress.get();
    const count = (p.modules.rag && p.modules.rag.queryCount) || 0;
    const hint = c.querySelector('.rag-hint');
    if (hint && hint.querySelector('b')) {
      hint.innerHTML = '已回答 <b>' + count + '</b> 个问题 · ' + (this.useAI ? '已接入 AI，回答更智能' : '本地知识库离线可用，配置 AI 接口后更智能');
    }
  }
};

/* 注册模块：路由 navigate('rag') 时调用 EM.modules.rag.render(container) */
EM.registerModule('rag', EM.rag);
