/* ===== Error Bank 错误银行 =====
 * 系统记录用户犯过的每一个错误 (不止"答错"本身):
 *   - category : 所属技能 (phonics/vocabulary/grammar/listening/speaking/reading/writing/pronunciation)
 *   - item     : 错误对象 (单词 / 语法点id / 拼读项 / 句子)
 *   - count    : 犯错次数 (频次)
 *   - firstSeen / lastSeen : 首次与最近犯错时间
 *   - resolved : 是否已纠正 (用户在针对性训练中答对多次后自动标记)
 *   - correctStreak : 连续答对次数 (>=2 视为已纠正)
 *
 * 用途:
 *   1. 自适应: 高频错误优先进入每日复习与测试
 *   2. 错题强化: 生成针对性训练
 *   3. 进度页展示: 最常犯的错误
 *
 * 存储: progress.errors = { schemaVersion:1, items: { "vocabulary:word": {...} } }
 * 兼容: 旧的 progress.weaknesses 列表在首次使用时自动并入。
 */
window.EM = window.EM || {};

EM.errors = {
  CATEGORY_LABEL: {
    phonics: '🔤 拼读', vocabulary: '📚 词汇', grammar: '📖 语法',
    listening: '👂 听力', speaking: '🗣️ 口语', reading: '📰 阅读',
    writing: '✍️ 写作', pronunciation: '🔤 发音', test: '🎯 测试'
  },

  key(category, item) { return category + ':' + item; },

  _get() {
    const p = EM.progress.get();
    if (!p.errors || !p.errors.items) p.errors = { schemaVersion: 1, items: {} };
    return p.errors;
  },

  _save(p) {
    p.updatedAt = Date.now();
    EM.progress.save(p);
  },

  // 记录一次错误 (兼容旧 addWeakness: 同时写入 weaknesses 列表)
  add(category, item, context) {
    const p = EM.progress.get();
    if (!p.errors || !p.errors.items) p.errors = { schemaVersion: 1, items: {} };
    const k = this.key(category, item);
    const now = Date.now();
    if (!p.errors.items[k]) {
      p.errors.items[k] = {
        category, item, context: context || '',
        count: 0, firstSeen: now, lastSeen: now,
        resolved: false, correctStreak: 0, wrongStreak: 0
      };
    }
    const e = p.errors.items[k];
    e.count++;
    e.lastSeen = now;
    e.wrongStreak = (e.wrongStreak || 0) + 1;
    e.correctStreak = 0;
    if (e.wrongStreak >= 3) e.resolved = false;
    if (e.count > 100) { e.count = 100; }

    // 兼容旧弱点列表 (模块还在用 addWeakness)
    if (!p.weaknesses[category]) p.weaknesses[category] = [];
    if (!p.weaknesses[category].includes(item)) {
      p.weaknesses[category].push(item);
      if (p.weaknesses[category].length > 100) p.weaknesses[category].shift();
    }

    this._save(p);
    return e;
  },

  // 记录一次答对 (用于错题纠正判定)
  correct(category, item) {
    const p = EM.progress.get();
    const k = this.key(category, item);
    const e = p.errors && p.errors.items && p.errors.items[k];
    if (!e) return;
    e.correctStreak = (e.correctStreak || 0) + 1;
    e.wrongStreak = 0;
    if (e.correctStreak >= 2) {
      e.resolved = true;
      // 从旧弱点列表移除
      if (p.weaknesses[category]) {
        p.weaknesses[category] = p.weaknesses[category].filter(w => w !== item);
      }
    }
    this._save(p);
  },

  // 全部错误 (按严重度排序: 频次×近因)
  all() {
    const items = this._get().items;
    const now = Date.now();
    const list = Object.values(items).map(e => {
      const daysSince = Math.max(0, (now - e.lastSeen) / 86400000);
      // 严重度: count 为主, 越近期权重越高
      const severity = Math.round(e.count * (1 + Math.max(0, 3 - daysSince) * 0.3) * 10) / 10;
      return { ...e, key: this.key(e.category, e.item), severity };
    });
    list.sort((a, b) => b.severity - a.severity);
    return list;
  },

  // 未解决的错误 (训练队列)
  unresolved(limit) {
    const list = this.all().filter(e => !e.resolved);
    return typeof limit === 'number' ? list.slice(0, limit) : list;
  },

  byCategory() {
    const out = {};
    for (const e of this.all()) {
      if (!out[e.category]) out[e.category] = 0;
      out[e.category]++;
    }
    return out;
  },

  stats() {
    const all = this.all();
    const unresolved = all.filter(e => !e.resolved);
    const totalWrongs = all.reduce((a, e) => a + e.count, 0);
    const cats = this.byCategory();
    const topCat = Object.entries(cats).sort((a, b) => b[1] - a[1])[0];
    return {
      total: all.length,
      unresolved: unresolved.length,
      resolved: all.length - unresolved.length,
      totalWrongs,
      topCategory: topCat ? topCat[0] : null,
      topCategoryLabel: topCat ? (this.CATEGORY_LABEL[topCat[0]] || topCat[0]) : null
    };
  },

  // 迁移旧的 weaknesses 到错误银行 (幂等)
  migrateLegacy() {
    const p = EM.progress.get();
    const wk = p.weaknesses || {};
    for (const cat of Object.keys(wk)) {
      for (const item of wk[cat] || []) {
        if (!p.errors || !p.errors.items) p.errors = { schemaVersion: 1, items: {} };
        const k = this.key(cat, item);
        if (!p.errors.items[k]) {
          p.errors.items[k] = {
            category: cat, item, context: '',
            count: 1, firstSeen: Date.now(), lastSeen: Date.now(),
            resolved: false, correctStreak: 0, wrongStreak: 1
          };
        }
      }
    }
    EM.progress.save(p);
  },

  clearResolved() {
    const p = EM.progress.get();
    if (!p.errors || !p.errors.items) return;
    for (const k in p.errors.items) {
      if (p.errors.items[k].resolved) delete p.errors.items[k];
    }
    EM.progress.save(p);
  }
};