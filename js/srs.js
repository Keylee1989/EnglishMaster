/* ===== SRS 间隔重复引擎 (Spaced Repetition, SM-2 变体) =====
 * 替代旧的固定"艾宾浩斯"时间表, 每个词独立调度:
 *   - ease (难度系数): 2.5 起步, 上限 3.0, 下限 1.3
 *   - interval (间隔天数): 学习步(10分钟) → 1天 → 随 ease 指数增长
 *   - reps / lapses: 成功复习次数与遗忘次数
 *   - dueAt: 下次到期时间; 到期词进入每日复习队列
 *
 * 评分等级 (Anki 风格):
 *   0 = 忘记 (重新学习, interval 重置为 1 天, ease -0.2, lapse+1)
 *   1 = 困难 (interval × 1.2, ease -0.15)
 *   2 = 认识 (interval × ease)
 *   3 = 简单 (interval × ease × 1.3, ease +0.05)
 *
 * 存储: progress.modules.vocabulary.srs = { cards: { [word]: card }, updatedAt }
 * 数据量: 每卡 ~150 字节, 一万词仅 ~1.5MB, localStorage 可承受;
 * 未来可平滑迁移到 IndexedDB (schema 已带版本号)。
 */
window.EM = window.EM || {};

EM.srs = {
  KEY: 'englishMaster_srs', // 独立 localStorage key (与进度分离, 避免互相拖累)

  MIN_EASE: 1.3,
  MAX_EASE: 3.0,
  INIT_EASE: 2.5,
  LEARNING_STEPS_MIN: [10, 1440],      // 分钟: 10分钟后 + 1天后 进入复习态
  INTERVAL_CAP_DAYS: 180,               // 最长间隔, 避免无限膨胀

  /* ===== 数据访问 ===== */
  _data: null,
  _dirty: false,

  load() {
    if (this._data) return this._data;
    try {
      const raw = localStorage.getItem(this.KEY);
      this._data = raw ? JSON.parse(raw) : { schemaVersion: 1, cards: {} };
    } catch (e) {
      console.error('SRS 读取失败:', e);
      this._data = { schemaVersion: 1, cards: {} };
    }
    if (!this._data.cards) this._data.cards = {};
    return this._data;
  },

  save() {
    this._data.updatedAt = Date.now();
    try {
      localStorage.setItem(this.KEY, JSON.stringify(this._data));
      this._dirty = false;
    } catch (e) {
      console.error('SRS 保存失败(容量可能已满):', e);
    }
  },

  _commit() {
    this._dirty = true;
    // 微任务批量写, 避免频繁序列化
    if (!this._saveTimer) {
      this._saveTimer = setTimeout(() => {
        this._saveTimer = null;
        this.save();
      }, 300);
    }
  },

  /* ===== 卡片操作 ===== */
  getCard(word) {
    return this.load().cards[word] || null;
  },

  // 新词首次学习(进入学习队列)
  add(word) {
    const cards = this.load().cards;
    if (cards[word]) return cards[word];
    const card = {
      word,
      ease: this.INIT_EASE,
      interval: 0,
      reps: 0,
      lapses: 0,
      step: 0,           // 学习步索引 (0=10min, 1=1day, 之后进入间隔)
      dueAt: Date.now(), // 立即可学
      lastReviewAt: 0,
      lastGrade: null,
      history: []
    };
    cards[word] = card;
    this._commit();
    return card;
  },

  // 核心: 一次复习打分 (grade 0-3); 无卡时自动建卡
  review(word, grade) {
    let card = this.getCard(word);
    if (!card) card = this.add(word);
    const now = Date.now();
    const dayMs = 86400000;

    if (card.step < this.LEARNING_STEPS_MIN.length) {
      // —— 学习态 (未离开学习队列) ——
      if (grade >= 2) {
        card.step++;
        if (card.step >= this.LEARNING_STEPS_MIN.length) {
          // 毕业进入间隔: 首间隔 1 天
          card.interval = 1;
          card.reps = 1;
        } else {
          card.interval = 0;
        }
      } else {
        card.step = 0; // 学习态答错: 从头再来
        card.lapses++;
        if (card.step === 0) card.interval = 0;
      }
      card.dueAt = card.step < this.LEARNING_STEPS_MIN.length
        ? now + this.LEARNING_STEPS_MIN[card.step] * 60000
        : now + card.interval * dayMs;
    } else {
      // —— 复习态 ——
      if (grade === 0) {
        // 遗忘: 回到学习队列, 重新走学习步
        card.lapses++;
        card.ease = Math.max(this.MIN_EASE, card.ease - 0.2);
        card.step = 0;
        card.interval = 0;
        card.dueAt = now + this.LEARNING_STEPS_MIN[0] * 60000;
      } else if (grade === 1) {
        card.interval = Math.max(1, Math.round(card.interval * 1.2));
        card.ease = Math.max(this.MIN_EASE, card.ease - 0.15);
        card.dueAt = now + card.interval * dayMs;
      } else if (grade === 2) {
        card.interval = Math.min(this.INTERVAL_CAP_DAYS, Math.round(card.interval * card.ease));
        card.dueAt = now + card.interval * dayMs;
      } else {
        card.interval = Math.min(this.INTERVAL_CAP_DAYS, Math.round(card.interval * card.ease * 1.3));
        card.ease = Math.min(this.MAX_EASE, card.ease + 0.05);
        card.dueAt = now + card.interval * dayMs;
      }
      card.reps++;
    }

    card.lastReviewAt = now;
    card.lastGrade = grade;
    card.history.push({ at: now, grade });
    if (card.history.length > 30) card.history.shift();
    this._commit();
    return card;
  },

  // 到期词 (今天应复习的)
  dueWords(limit) {
    const now = Date.now();
    const cards = this.load().cards;
    const due = [];
    for (const w in cards) {
      const c = cards[w];
      if (c.dueAt <= now) due.push(c);
    }
    // 最久没复习的优先
    due.sort((a, b) => a.dueAt - b.dueAt);
    return typeof limit === 'number' ? due.slice(0, limit) : due;
  },

  // 今天内也会到期的 (提前量)
  dueSoonWords(hours = 24) {
    const now = Date.now();
    const cards = this.load().cards;
    const out = [];
    for (const w in cards) {
      const c = cards[w];
      if (c.dueAt > now && c.dueAt <= now + hours * 3600000) out.push(c);
    }
    return out;
  },

  // 即将到学习队列的新词 (按学习顺序: 学过的词会出现在这里吗? 不, 新词用 add 手动入队)
  // 统计
  stats() {
    const cards = this.load().cards;
    const now = Date.now();
    let total = 0, learning = 0, review = 0, due = 0, mature = 0, lapsed = 0;
    for (const w in cards) {
      const c = cards[w];
      total++;
      if (c.step < this.LEARNING_STEPS_MIN.length) learning++;
      else review++;
      if (c.dueAt <= now) due++;
      if (c.reps >= 3 && c.interval >= 21) mature++;
      if (c.lapses > 0) lapsed++;
    }
    return { total, learning, review, due, mature, lapsed, dueSoon: this.dueSoonWords(24).length };
  },

  // 从词汇学习中同步: 已学词自动建立 SRS 卡 (无卡才建, 不覆盖已有状态)
  ensureCards(words) {
    const cards = this.load().cards;
    let added = 0;
    for (const w of words) {
      if (!cards[w]) {
        cards[w] = {
          word: w, ease: this.INIT_EASE, interval: 0, reps: 0, lapses: 0,
          step: 0, dueAt: Date.now(), lastReviewAt: 0, lastGrade: null, history: []
        };
        added++;
      }
    }
    if (added) this._commit();
    return added;
  },

  // 查找某个词 (供词汇卡显示复习状态)
  statusText(word) {
    const c = this.getCard(word);
    if (!c) return '未学习';
    if (c.step < this.LEARNING_STEPS_MIN.length) return '学习中';
    if (c.dueAt <= Date.now()) return '待复习';
    const days = Math.ceil((c.dueAt - Date.now()) / 86400000);
    return `${days}天后复习`;
  },

  // 删除某个词的卡片 (取消已学时使用)
  remove(word) {
    const cards = this.load().cards;
    if (cards[word]) {
      delete cards[word];
      this._commit();
    }
  },

  // 迁移: 旧"艾宾浩斯"review 数据 → SRS 卡 (保留已学状态)
  migrateLegacy(learnedWords) {
    const cards = this.load().cards;
    let added = 0;
    for (const w of learnedWords || []) {
      if (!cards[w]) {
        cards[w] = {
          word: w, ease: this.INIT_EASE, interval: 0, reps: 0, lapses: 0,
          step: 0, dueAt: Date.now(), lastReviewAt: 0, lastGrade: null, history: []
        };
        added++;
      }
    }
    if (added) this._commit();
    return added;
  },

  reset() {
    try { localStorage.removeItem(this.KEY); } catch (e) {}
    this._data = null;
  }
};