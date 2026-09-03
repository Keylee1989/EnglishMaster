/* ===== XP / 成就系统 =====
 * XP 只奖励真实学习行为 (学词/复习/测验/听说读写/连续天数), 不奖励无意义点击。
 * 等级 = floor(XP / 500) + 1, 每级一个徽章里程碑。
 *
 * 成就 (badge) 全部由真实进度数据触发:
 *   学词: 1 / 100 / 500 / 1000 / 3000
 *   拼读: 掌握全部字母+元音+辅音组合
 *   语法: 10 / 50 个语法点
 *   听力/阅读: 完成 10 篇
 *   口语/写作: 完成 10 / 20 次
 *   连续学习: 7 / 30 / 100 天
 *   复习: 完成 50 / 200 / 500 次 SRS 复习
 *   测试: 完成 10 次测试
 *   毕业: 通过 C2 毕业测试
 */
window.EM = window.EM || {};

EM.achieve = {
  // XP 定价 (单位: 次)
  XP: {
    learnWord: 2,      // 学习一个新词
    reviewWord: 1,     // 完成一次 SRS 复习 (按质量加成)
    quizCorrect: 3,    // 测验答对
    quizComplete: 10,  // 完成一次测验/测试
    listen: 15,        // 完成一段听力
    speak: 10,         // 完成一次口语练习
    read: 15,          // 完成一篇阅读
    write: 20,         // 完成一篇写作
    phonics: 2,        // 掌握一个拼读项
    grammar: 5,        // 掌握一个语法点
    test: 15,          // 完成一次自适应测试
    streakDay: 5,      // 每日打卡
    firstStudy: 20     // 首次开始学习
  },

  BADGES: [
    { id: 'first_step',      name: '第一步',         icon: '🚀', desc: '开始学习英语', cond: p => (p.modules.vocabulary.learned || []).length + (p.modules.phonics.mastered || []).length > 0 },
    { id: 'words_1',         name: '初识词汇',       icon: '📚', desc: '学会第 1 个单词', cond: p => (p.modules.vocabulary.learned || []).length >= 1 },
    { id: 'words_100',       name: '词汇新秀',       icon: '📖', desc: '学会 100 个单词', cond: p => (p.modules.vocabulary.learned || []).length >= 100 },
    { id: 'words_500',       name: '词汇达人',       icon: '🎓', desc: '学会 500 个单词', cond: p => (p.modules.vocabulary.learned || []).length >= 500 },
    { id: 'words_1000',      name: '千词勇士',       icon: '⚔️', desc: '学会 1000 个单词', cond: p => (p.modules.vocabulary.learned || []).length >= 1000 },
    { id: 'words_3000',      name: '词汇大师',       icon: '🏆', desc: '学会 3000 个单词', cond: p => (p.modules.vocabulary.learned || []).length >= 3000 },
    { id: 'phonics_full',    name: '拼读毕业',       icon: '🔤', desc: '掌握全部字母与拼读规则', cond: p => (p.modules.phonics.mastered || []).length >= 50 },
    { id: 'grammar_10',      name: '语法入门',       icon: '🧩', desc: '掌握 10 个语法点', cond: p => (p.modules.grammar.mastered || []).length >= 10 },
    { id: 'grammar_50',      name: '语法通',         icon: '🧠', desc: '掌握 50 个语法点', cond: p => (p.modules.grammar.mastered || []).length >= 50 },
    { id: 'listen_10',       name: '听力进阶',       icon: '👂', desc: '完成 10 段听力训练', cond: p => (p.modules.listening.completed || []).length >= 10 },
    { id: 'read_10',         name: '阅读进阶',       icon: '📰', desc: '完成 10 篇阅读理解', cond: p => (p.modules.reading.completed || []).length >= 10 },
    { id: 'speak_10',        name: '开口说',         icon: '🗣️', desc: '完成 10 次口语练习', cond: p => (p.modules.speaking.completed || []).length >= 10 },
    { id: 'write_10',        name: '动笔写',         icon: '✍️', desc: '完成 10 篇写作训练', cond: p => (p.modules.writing.completed || []).length >= 10 },
    { id: 'streak_7',        name: '坚持一周',       icon: '🔥', desc: '连续学习 7 天', cond: p => (p.streak || 0) >= 7 },
    { id: 'streak_30',       name: '坚持一月',       icon: '💪', desc: '连续学习 30 天', cond: p => (p.streak || 0) >= 30 },
    { id: 'streak_100',      name: '百日磨一剑',     icon: '🗡️', desc: '连续学习 100 天', cond: p => (p.streak || 0) >= 100 },
    { id: 'test_10',         name: '考场老手',       icon: '🎯', desc: '完成 10 次测试', cond: p => (p.modules.test.history || []).length >= 10 },
    { id: 'graduate',        name: '毕业',           icon: '🎓', desc: '通过 C2 毕业测试', cond: p => !!(p.graduation && p.graduation.passed) }
  ],

  level(xp) { return Math.floor((xp || 0) / 500) + 1; },

  // 加 XP (返回 {xp, level, leveledUp})
  addXP(amount, reason) {
    const p = EM.progress.get();
    const before = this.level(p.xp);
    p.xp = (p.xp || 0) + amount;
    const after = this.level(p.xp);
    if (!p.xpLog) p.xpLog = [];
    p.xpLog.push({ at: Date.now(), amount, reason: reason || '学习' });
    if (p.xpLog.length > 200) p.xpLog.shift();
    EM.progress.save(p);
    return { xp: p.xp, level: after, leveledUp: after > before };
  },

  // 检查所有徽章, 解锁新成就 (返回新解锁列表)
  check() {
    const p = EM.progress.get();
    const earned = p.achievements || [];
    const earnedSet = new Set(earned.map(a => a.id));
    const unlocked = [];
    for (const b of this.BADGES) {
      if (!earnedSet.has(b.id) && b.cond(p)) {
        earned.push({ id: b.id, name: b.name, icon: b.icon, desc: b.desc, at: Date.now() });
        unlocked.push(b);
      }
    }
    if (unlocked.length) {
      p.achievements = earned;
      // 每个徽章 +50 XP
      const bonus = unlocked.length * 50;
      p.xp = (p.xp || 0) + bonus;
      EM.progress.save(p);
    }
    return unlocked;
  },

  earned() {
    const p = EM.progress.get();
    return (p.achievements || []).slice().sort((a, b) => a.at - b.at);
  },

  earnedIds() {
    return new Set(this.earned().map(a => a.id));
  },

  // 进度页展示用: 全部徽章 + 是否已解锁
  allWithState() {
    const ids = this.earnedIds();
    const earned = this.earned();
    return this.BADGES.map(b => {
      const e = earned.find(x => x.id === b.id);
      return { ...b, unlocked: ids.has(b.id), at: e ? e.at : null };
    });
  }
};