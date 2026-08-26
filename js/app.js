/* ===== 核心应用框架 (路由/状态/UI/数据/路径控制) ===== */
window.EM = window.EM || {};

// ===== 级别系统 (L0-L5 对应 CEFR Pre-A1 到 C2,每级细分3小阶段) =====
EM.LEVELS = [
  { id: 0, code: 'Pre-A1', name: '零基础', cn: '零基础', target: '字母/音标/拼读', hours: 0, words: 0,
    substages: ['L0.1 学字母', 'L0.2 学拼读规则', 'L0.3 拼读毕业测试'] },
  { id: 1, code: 'A1', name: '入门', cn: '生存英语', target: '1000-2000词', hours: 100, words: 1500,
    substages: ['L1.1 词汇积累', 'L1.2 基础语法', 'L1.3 听读入门'] },
  { id: 2, code: 'A2', name: '初级', cn: '日常交流', target: '3000词', hours: 200, words: 3000,
    substages: ['L2.1 时态精通', 'L2.2 听读强化', 'L2.3 说写训练'] },
  { id: 3, code: 'B1', name: '中级', cn: '工作学习', target: '5000词', hours: 400, words: 5000,
    substages: ['L3.1 从句掌握', 'L3.2 听读进阶', 'L3.3 说写提升'] },
  { id: 4, code: 'C1', name: '高级', cn: '流利表达', target: '8000词', hours: 700, words: 8000,
    substages: ['L4.1 虚拟语气', 'L4.2 长篇阅读', 'L4.3 流利写作'] },
  { id: 5, code: 'C2', name: '精通', cn: '母语水平', target: '16000+词', hours: 1200, words: 16000,
    substages: ['L5.1 大量阅读', 'L5.2 听力训练', 'L5.3 毕业测试'] }
];

// 由 pathStep(0-45) 推算当前级别
EM.levelFromStep = (pathStep) => {
  if (pathStep <= 6) return 0;
  if (pathStep <= 15) return 1;
  if (pathStep <= 23) return 2;
  if (pathStep <= 31) return 3;
  if (pathStep <= 39) return 4;
  return 5;
};

// 由 pathStep 推算当前小阶段(每级3小阶段)
EM.substageFromStep = (pathStep) => {
  const lv = EM.levelFromStep(pathStep);
  const localStep = pathStep - (lv === 0 ? 0 : (lv * 8 + (lv === 1 ? -1 : 0)));
  // 简化映射:把每级8步平均分3段
  const subIdx = localStep < 3 ? 0 : (localStep < 6 ? 1 : 2);
  const subs = EM.LEVELS[lv].substages;
  return { subIdx, subName: subs[subIdx], allSubs: subs, level: lv };
};

/* ===== 今日学习计划拆分 =====
 * 基于当前步骤,智能拆分成 5-7 天的每日小任务,用户直接跟着点
 * 返回: { dayCount, tasks:[{day, title, target, module, submodule, done:bool}] }
 */
EM.dailyPlan = (step) => {
  if (!step) return { dayCount: 0, tasks: [] };
  const p = EM.progress.get();
  const tasks = [];
  const mod = step.module;
  const target = step.target || '';

  if (mod === 'phonics') {
    // 拼读:按数量拆分,每天5-6个字母/规则
    const tabKey = step.submodule || 'letters';
    let total = 26, perDay = 6;
    if (tabKey === 'vowels') { total = 5; perDay = 5; }
    else if (tabKey === 'consonants') { total = 5; perDay = 3; }
    else if (tabKey === 'cvc') { total = 20; perDay = 4; }
    else if (tabKey === 'magicE') { total = 8; perDay = 2; }
    else if (tabKey === 'vowelTeams') { total = 8; perDay = 2; }
    else if (tabKey === 'rControlled') { total = 5; perDay = 3; }
    const days = Math.max(1, Math.ceil(total / perDay));
    for (let i = 0; i < days; i++) {
      const start = i * perDay + 1;
      const end = Math.min((i + 1) * perDay, total);
      tasks.push({
        day: i + 1,
        title: `第${i+1}天:学第 ${start}-${end} 个${tabKey === 'letters' ? '字母' : '拼读项'}`,
        target: `${start}-${end}`,
        module: 'phonics',
        submodule: tabKey,
        done: false
      });
    }
  } else if (mod === 'vocabulary') {
    // 词汇:从目标数50/100/200等拆分,每天10词
    const m = target.match(/(\d+)/);
    const targetCount = m ? parseInt(m[1], 10) : 50;
    const perDay = 10;
    const days = Math.max(1, Math.ceil(targetCount / perDay));
    const learned = (p.modules.vocabulary.learned || []).length;
    for (let i = 0; i < days; i++) {
      const start = i * perDay + 1;
      const end = Math.min((i + 1) * perDay, targetCount);
      const dayLearned = Math.max(0, Math.min(perDay, learned - i * perDay));
      tasks.push({
        day: i + 1,
        title: `第${i+1}天:学第 ${start}-${end} 个词(已学${dayLearned}/${perDay})`,
        target: `${start}-${end}`,
        module: 'vocabulary',
        submodule: 'L' + EM.levelFromStep(p.pathStep || 0),
        done: dayLearned >= perDay
      });
    }
  } else if (mod === 'grammar') {
    // 语法:1个语法点1天搞定,附讲解+练习
    tasks.push({
      day: 1,
      title: `今日:学习${target} + 完成练习`,
      target: target,
      module: 'grammar',
      submodule: step.submodule,
      done: (p.modules.grammar.mastered || []).includes(step.submodule)
    });
  } else if (mod === 'listening' || mod === 'reading' || mod === 'speaking' || mod === 'writing') {
    // 听/读/说/写:每天1篇/1次,共3天
    for (let i = 0; i < 3; i++) {
      tasks.push({
        day: i + 1,
        title: `第${i+1}天:完成1篇${mod === 'listening' ? '听力' : (mod === 'reading' ? '阅读' : (mod === 'speaking' ? '口语' : '写作'))}`,
        target: '1篇',
        module: mod,
        submodule: step.submodule,
        done: (p.modules[mod].completed || []).length > i
      });
    }
  } else if (mod === 'test') {
    tasks.push({
      day: 1,
      title: `今日:完成${target}`,
      target: target,
      module: 'test',
      submodule: step.submodule,
      done: false
    });
  } else {
    tasks.push({
      day: 1,
      title: `今日:${step.title}`,
      target: target,
      module: mod,
      submodule: step.submodule,
      done: false
    });
  }

  return { dayCount: tasks.length, tasks };
};

// ===== UI 工具 =====
EM.ui = {
  toast(msg, duration = 2500) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), duration);
  },

  modal(html, opts = {}) {
    const overlay = document.getElementById('toastOverlay');
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-header"><h2>${opts.title || ''}</h2><button class="modal-close" data-close>✕</button></div>
      <div class="modal-body">${html}</div>
    `;
    overlay.innerHTML = '';
    overlay.appendChild(modal);
    overlay.classList.add('show');
    modal.querySelector('[data-close]').onclick = () => overlay.classList.remove('show');
    overlay.onclick = e => { if (e.target === overlay) overlay.classList.remove('show'); };
    return modal;
  },

  closeModal() {
    document.getElementById('toastOverlay').classList.remove('show');
  },

  esc(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }
};

// ===== 数据加载 =====
EM.data = {
  cache: {},
  async load(name) {
    if (this.cache[name]) return this.cache[name];
    try {
      const res = await fetch(`data/${name}.json`);
      if (!res.ok) throw new Error(`加载 ${name} 失败(HTTP ${res.status})`);
      const data = await res.json();
      this.cache[name] = data;
      return data;
    } catch (e) {
      console.error(e);
      // 友好诊断:是否用了 file:// 协议直接打开
      if (location.protocol === 'file:') {
        EM.ui.toast('⚠️ 不能直接双击打开index.html!请用 http://localhost:8000 访问', 5000);
      } else {
        EM.ui.toast(`数据加载失败: ${name} - ${e.message}`, 4000);
      }
      return null;
    }
  }
};

// ===== 强制引导式学习路径管理器 =====
EM.path = {
  _data: null,
  _cachedProgress: null,

  // 加载学习路径数据(带缓存)
  async load() {
    if (this._data) return this._data;
    const data = await EM.data.load('learning_path');
    this._data = data || { path: [] };
    return this._data;
  },

  // 获取所有步骤
  all() {
    return (this._data && this._data.path) || [];
  },

  // 当前应执行的步骤(基于progress.pathStep)
  currentStep() {
    const p = EM.progress.get();
    const all = this.all();
    if (!all.length) return null;
    const idx = Math.min(p.pathStep || 0, all.length - 1);
    return { ...all[idx], index: idx };
  },

  // 当前步骤是否已完成(自动判断)
  isCurrentStepDone() {
    const p = EM.progress.get();
    const step = this.currentStep();
    if (!step) return false;
    return this._isStepDone(step, p);
  },

  // 内部: 判定 completed id 是否属于某级别(支持 l1_1/a1_1/L1_1/A1_1 各种命名)
  //   例: _lvlMatch('l1_3', 1) → true  ; _lvlMatch('a2_1', 2) → true ; _lvlMatch('l1_3', 2) → false
  _lvlMatch(id, level) {
    const m = String(id).match(/^[a-zA-Z](\d+)[_:]/);
    return !!(m && parseInt(m[1], 10) === level);
  },

  // 内部: 判定某步骤是否完成
  // 关键: phonics 模块的 mastered id 格式是 "<tabKey>:<symbol>"
  //      字母/元音: letters:A / vowels:A (统一大写,与 _getItems 一致)
  //      辅音组合: blends:sh / cvc:cat / magicE:cap / vowelTeams:ai / rControlled:ar
  //      listening/reading completed id 是小写 l1_1 / a1_1(必须用 _lvlMatch 判定级别)
  _isStepDone(step, p) {
    // 已在completedSteps数组中,视为完成
    if ((p.completedSteps || []).includes(step.step)) return true;

    const mastered = p.modules.phonics.mastered || [];
    const vocabLearned = (p.modules.vocabulary.learned || []).length;
    const grammarM = p.modules.grammar.mastered || [];
    const listen = p.modules.listening.completed || [];
    const reading = p.modules.reading.completed || [];
    const speaking = p.modules.speaking.completed || [];
    const writing = p.modules.writing.completed || [];

    // L0 拼读阶段(按 submodule 区分)
    switch (step.step) {
      case 0: // 26个字母: 'letters:A' ~ 'letters:Z' 共26个
        return mastered.filter(m => m.startsWith('letters:')).length >= 26;
      case 1: // 5个元音: 'vowels:A/E/I/O/U'(大写)
        return ['A','E','I','O','U'].every(v => mastered.includes('vowels:' + v));
      case 2: // 5个辅音组合 sh/ch/th/ph/wh: 'blends:X'(小写)
        return ['sh','ch','th','ph','wh'].every(c => mastered.includes('blends:' + c));
      case 3: // CVC词掌握>=10: 'cvc:X'
        return mastered.filter(m => m.startsWith('cvc:')).length >= 10;
      case 4: // Magic E 对比>=4: 'magicE:X'
        return mastered.filter(m => m.startsWith('magicE:')).length >= 4;
      case 5: // 元音组合>=3: 'vowelTeams:X'
        return mastered.filter(m => m.startsWith('vowelTeams:')).length >= 3;
      // L0 毕业测试: level >= 1
      case 6: return (p.level || 0) >= 1;
      // L1阶段: 检查词汇数 / 语法掌握 / 听力阅读完成数
      case 7: return vocabLearned >= 50;
      case 8: return vocabLearned >= 100;
      case 9: return grammarM.includes('be_verb');
      case 10: return grammarM.includes('personal_pronouns') || grammarM.some(g => g.startsWith('pronoun'));
      case 11: return listen.filter(c => this._lvlMatch(c, 1)).length >= 3;
      case 12: return reading.filter(c => this._lvlMatch(c, 1)).length >= 3;
      case 13: return vocabLearned >= 200;
      case 14: return speaking.length >= 5;
      case 15: return (p.level || 0) >= 2;
      // L2阶段
      case 16: return vocabLearned >= 2050;
      case 17: return ['present_simple','past_simple','future_will','future_be_going_to'].filter(g => grammarM.includes(g)).length >= 2;
      case 18: return listen.filter(c => this._lvlMatch(c, 2)).length >= 3;
      case 19: return reading.filter(c => this._lvlMatch(c, 2)).length >= 3;
      case 20: return vocabLearned >= 2200;
      case 21: return speaking.length >= 8;
      case 22: return writing.length >= 10;
      case 23: return (p.level || 0) >= 3;
      // L3阶段
      case 24: return vocabLearned >= 3050;
      case 25: return ['object_clause_that','subject_clause','predicative_clause','attributive_which_that','adverbial_time'].filter(g => grammarM.includes(g)).length >= 2;
      case 26: return listen.filter(c => this._lvlMatch(c, 3)).length >= 3;
      case 27: return reading.filter(c => this._lvlMatch(c, 3)).length >= 3;
      case 28: return vocabLearned >= 3300;
      case 29: return speaking.length >= 11;
      case 30: return writing.length >= 12;
      case 31: return (p.level || 0) >= 4;
      // L4阶段
      case 32: return vocabLearned >= 5050;
      case 33: return ['subjunctive_if','inversion_full','non_finite_verbs'].filter(g => grammarM.includes(g)).length >= 2;
      case 34: return reading.filter(c => this._lvlMatch(c, 4)).length >= 3;
      case 35: return listen.filter(c => this._lvlMatch(c, 4)).length >= 3;
      case 36: return vocabLearned >= 5200;
      case 37: return writing.length >= 13;
      case 38: return speaking.length >= 14;
      case 39: return (p.level || 0) >= 5;
      // L5阶段
      case 40: return vocabLearned >= 16050;
      case 41: return grammarM.length >= 80;
      case 42: return reading.filter(c => this._lvlMatch(c, 5)).length >= 3;
      case 43: return listen.filter(c => this._lvlMatch(c, 5)).length >= 3;
      case 44: return writing.length >= 15;
      case 45: return p.graduation && p.graduation.passed === true;
      default: return false;
    }
  },

  // 模块是否已解锁(基于当前步骤)
  isModuleUnlocked(moduleName) {
    const all = this.all();
    if (!all.length) return true; // 路径未加载前放行
    const p = EM.progress.get();
    const curStep = p.pathStep || 0;

    // progress/rag/dictionary/home/media 始终允许(media为辅助学习资源)
    if (['home', 'progress', 'rag', 'dictionary', 'media'].includes(moduleName)) return true;

    // 该模块在路径中是否已出现在已完成的步骤或当前步骤
    // 即: 如果用户当前或之前任何一步用到了这个模块,就算解锁
    for (let i = 0; i <= curStep && i < all.length; i++) {
      if (all[i].module === moduleName) return true;
    }
    return false;
  },

  // 跳到下一个未完成的步骤
  async advanceToNext() {
    const all = this.all();
    if (!all.length) return;
    const p = EM.progress.get();
    let cur = p.pathStep || 0;

    // 向前扫描直到找到未完成的步骤
    while (cur < all.length - 1) {
      const step = all[cur];
      if (!this._isStepDone(step, p)) break;
      // 标记完成
      if (!(p.completedSteps || []).includes(step.step)) {
        EM.progress.update(d => {
          if (!(d.completedSteps || []).includes(step.step)) {
            d.completedSteps.push(step.step);
          }
        });
      }
      cur++;
    }
    EM.progress.update(d => { d.pathStep = cur; });
    return cur;
  },

  // 用户手动标记当前步骤完成
  async completeCurrent() {
    const step = this.currentStep();
    if (!step) return;
    await EM.progress.update(d => {
      if (!(d.completedSteps || []).includes(step.step)) {
        d.completedSteps.push(step.step);
      }
      d.pathStep = Math.min(d.pathStep + 1, (this.all().length - 1));
    });
    return EM.path.currentStep();
  },

  // 重置路径(用户重置进度时调用)
  reset() {
    EM.progress.update(d => {
      d.pathStep = 0;
      d.completedSteps = [];
    });
  }
};

// ===== 路由与模块管理 =====
EM.modules = {};
EM.currentRoute = 'home';
EM.currentSubmodule = null; // 当前要进入的子模块(由路径指定)

EM.registerModule = (name, mod) => {
  EM.modules[name] = mod;
};

EM.router = {
  routes: {
    home: { title: '学习中心' },
    phonics: { title: '自然拼读' },
    vocabulary: { title: '词汇学习' },
    grammar: { title: '语法大全' },
    listening: { title: '听力训练' },
    speaking: { title: '口语练习' },
    reading: { title: '阅读理解' },
    media: { title: '音视频课' },
    writing: { title: '写作训练' },
    test: { title: '自适应测试' },
    dictionary: { title: '查询中心' },
    rag: { title: '智能问答' },
    progress: { title: '学习进度' }
  },

  // 带子模块参数的导航(用于路径跳转)
  navigateWithSubmodule(route, submodule) {
    EM.currentSubmodule = submodule || null;
    return this.navigate(route);
  },

  async navigate(route) {
    // 模块解锁检查(若路径已加载)
    if (EM.path._data && !EM.path.isModuleUnlocked(route)) {
      EM.ui.toast('🔒 该模块尚未解锁,请先完成当前步骤');
      setTimeout(() => this.navigate('home'), 800);
      return;
    }

    EM.currentRoute = route;
    document.querySelectorAll('.nav-item').forEach(el => {
      el.classList.toggle('active', el.dataset.route === route);
    });
    const info = this.routes[route] || { title: route };
    document.getElementById('pageTitle').textContent = info.title;
    document.getElementById('sidebar').classList.remove('open');

    const content = document.getElementById('content');
    content.innerHTML = '<div class="loading">加载中...</div>';

    if (route === 'home') {
      await EM.renderHome(content);
    } else if (route === 'progress') {
      EM.renderProgressPage(content);
    } else if (EM.modules[route]) {
      // 预处理:根据子模块参数预设模块状态
      const sm = EM.currentSubmodule;
      if (sm) {
        if (route === 'phonics' && EM.phonics) {
          EM.phonics.activeTab = sm;  // 自动切换到对应分类
        } else if (route === 'vocabulary' && EM.vocabulary) {
          if (EM.vocabulary.setLevel) EM.vocabulary.setLevel(sm);
          else EM.vocabulary.activeLevel = parseInt(sm.replace(/\D/g, '')) || 1;
        } else if (route === 'listening' && EM.listening) {
          EM.listening.activeLevel = parseInt(sm.replace(/\D/g, '')) || 1;
        } else if (route === 'reading' && EM.reading) {
          EM.reading.activeLevel = parseInt(sm.replace(/\D/g, '')) || 1;
        } else if (route === 'media' && EM.media) {
          EM.media.activeLevel = parseInt(sm.replace(/\D/g, '')) || 1;
        } else if (route === 'speaking' && EM.speaking) {
          if (EM.speaking.setMode) EM.speaking.setMode(sm);
        } else if (route === 'writing' && EM.writing) {
          if (EM.writing.setMode) EM.writing.setMode(sm);
        }
      }

      // 渲染模块
      EM.modules[route].render(content, sm);
      EM.currentSubmodule = null;

      // 注入本课引导横幅(在模块顶部)
      const step = EM.path.currentStep();
      if (step && step.module === route) {
        const banner = document.createElement('div');
        banner.className = 'lesson-banner';
        banner.innerHTML = `
          <div class="lesson-banner-title">📍 当前课程:第 ${step.step + 1} 课 · ${step.title}</div>
          ${step.what ? `<div class="lesson-banner-what">📖 ${step.what}</div>` : ''}
          <div class="lesson-banner-steps">📋 ${step.howto || (step.steps ? step.steps[0] : '')}</div>
          <button class="btn btn-primary lesson-banner-done" onclick="EM.markCurrentDone()">✅ 我已完成本课</button>
        `;
        content.insertBefore(banner, content.firstChild);
      }
    } else {
      content.innerHTML = '<div class="card"><p>该模块正在开发中...</p></div>';
    }

    EM.progress.updateStreak();
    EM.updateLevelBadge();
    EM.updateNavLocks();
  }
};

// ===== 级别徽章 =====
EM.updateLevelBadge = () => {
  const p = EM.progress.get();
  const lv = EM.LEVELS[p.level] || EM.LEVELS[0];
  document.getElementById('levelBadge').textContent = `L${lv.id} · ${lv.cn}`;
  document.getElementById('streakInfo').textContent = `🔥 连续 ${p.streak} 天`;
};

// ===== 侧边栏锁状态更新 =====
EM.updateNavLocks = () => {
  const all = EM.path.all();
  if (!all.length) return;
  document.querySelectorAll('.nav-item').forEach(el => {
    const route = el.dataset.route;
    if (['home', 'progress', 'rag'].includes(route)) return;
    const unlocked = EM.path.isModuleUnlocked(route);
    const label = el.querySelector('.nav-label');
    if (!label) return;
    // 移除旧锁图标
    const oldLock = label.querySelector('.lock-icon');
    if (oldLock) oldLock.remove();
    if (!unlocked) {
      const lock = document.createElement('span');
      lock.className = 'lock-icon';
      lock.textContent = ' 🔒';
      label.appendChild(lock);
      el.style.opacity = '0.4';
    } else {
      el.style.opacity = '1';
    }
  });
};

// 完成今日目标打卡
EM.checkinToday = () => {
  EM.progress.updateStreak();
  const p = EM.progress.get();
  EM.ui.toast('✅ 打卡成功！已连续学习 ' + p.streak + ' 天');
  EM.updateLevelBadge();
};

// ===== 首页: 强制引导式 =====
EM.renderHome = async (container) => {
  // 确保路径已加载
  await EM.path.load();
  // 自动推进到第一个未完成步骤
  await EM.path.advanceToNext();

  const p = EM.progress.get();
  const lv = EM.LEVELS[p.level] || EM.LEVELS[0];
  const all = EM.path.all();
  const curIdx = Math.min(p.pathStep || 0, all.length - 1);
  const step = all[curIdx];
  const totalSteps = all.length;
  const completedCount = (p.completedSteps || []).length;
  const isDone = EM.path.isCurrentStepDone();
  const grad = p.graduation || { passed: false, date: null, scores: {} };

  const vocabLearned = (p.modules.vocabulary.learned || []).length;
  const phonicsMastered = (p.modules.phonics.mastered || []).length;
  const grammarMastered = (p.modules.grammar.mastered || []).length;
  const studyHours = Math.floor(p.totalStudyTime / 3600);
  const pathProgress = ((curIdx) / (totalSteps - 1)) * 100;

  // 当前任务大卡片(零基础保姆版3段式)
  const currentCard = step ? `
    <div class="card" style="border:2px solid var(--accent); background:var(--accent-bg); padding:24px;">
      <div class="flex justify-between align-center mb-16">
        <div>
          <div class="font-sm text-secondary">第 ${curIdx + 1} 课 / 共 ${totalSteps} 课</div>
          <div style="font-size:22px; font-weight:700; margin-top:4px;">${step.title}</div>
          <div class="font-sm text-secondary" style="margin-top:6px;">
            阶段: L${step.level} · ${EM.LEVELS[step.level].cn} | 模块: ${step.module}
          </div>
        </div>
        <div style="font-size:42px;">${isDone ? '✅' : '🚀'}</div>
      </div>

      ${step.what ? `
      <div style="background:var(--card-bg); padding:14px; border-radius:var(--radius); margin:12px 0; border-left:4px solid var(--accent);">
        <div class="font-sm" style="font-weight:700; color:var(--accent);">📖 这是什么</div>
        <div style="margin-top:6px; line-height:1.7;">${step.what}</div>
      </div>` : ''}

      ${step.why ? `
      <div style="background:var(--card-bg); padding:14px; border-radius:var(--radius); margin:12px 0; border-left:4px solid var(--success);">
        <div class="font-sm" style="font-weight:700; color:var(--success);">🎯 为什么要学</div>
        <div style="margin-top:6px; line-height:1.7;">${step.why}</div>
      </div>` : ''}

      ${step.steps && step.steps.length ? `
      <div style="background:var(--card-bg); padding:14px; border-radius:var(--radius); margin:12px 0; border-left:4px solid var(--warning);">
        <div class="font-sm" style="font-weight:700; color:var(--warning);">📋 怎么做(按顺序执行)</div>
        <ol style="margin-top:8px; padding-left:24px; line-height:1.9;">
          ${step.steps.map(s => `<li style="margin-bottom:6px;">${s}</li>`).join('')}
        </ol>
      </div>` : (step.howto ? `
      <div style="background:var(--card-bg); padding:14px; border-radius:var(--radius); margin:12px 0; border-left:4px solid var(--warning);">
        <div class="font-sm" style="font-weight:700; color:var(--warning);">📋 怎么做</div>
        <div style="margin-top:6px; line-height:1.7;">${step.howto}</div>
      </div>` : '')}

      <div class="flex gap-8 flex-wrap" style="margin-top:16px;">
        ${isDone
          ? `<button class="btn btn-primary" style="font-size:18px; padding:16px 32px;" onclick="EM.goNextStep()">✅ 已完成,进入下一课 →</button>`
          : `<button class="btn btn-primary" style="font-size:18px; padding:16px 32px; background:linear-gradient(135deg, var(--accent), var(--accent-light));" onclick="EM.startCurrentStep()">🚀 今日学习(开始本课)</button>
             <button class="btn btn-secondary" onclick="EM.showDailyPlan()">📋 查看每日计划</button>
             <button class="btn btn-secondary" onclick="EM.markCurrentDone()">我已完成本课</button>`
        }
        <button class="btn btn-secondary" onclick="EM.checkinToday()">🔥 今日打卡</button>
      </div>

      ${grad.passed
        ? '<div class="font-sm text-success" style="margin-top:14px; font-size:16px;">🎓 已通过毕业测试,达到 C2 母语水平!</div>'
        : ''}
    </div>
  ` : '<div class="card"><p>路径加载中...</p></div>';

  // 今日学习计划预览(显示当日小任务)
  const dp = step ? EM.dailyPlan(step) : null;
  const todayCard = (dp && dp.tasks.length) ? `
    <div class="card" style="border-left:4px solid var(--accent);">
      <div class="flex justify-between align-center mb-16">
        <div class="card-title" style="margin:0;">📅 今日学习计划(${dp.dayCount} 天拆分)</div>
        <span class="font-sm text-secondary">本课共 ${dp.dayCount} 天 · 你只管每天点一项</span>
      </div>
      <div class="grid grid-2">
        ${dp.tasks.map(t => `
          <div class="card ${t.done ? 'mastered' : ''}" style="padding:14px; ${t.done ? 'border-color:var(--success); background:rgba(76,175,136,0.10);' : 'border:1px dashed var(--border);'}">
            <div class="flex align-center gap-8">
              <span style="font-size:22px;">${t.done ? '✅' : '▶️'}</span>
              <div style="flex:1;">
                <div class="font-sm" style="font-weight:700;">${EM.ui.esc(t.title)}</div>
                <div class="font-sm text-secondary">目标: ${EM.ui.esc(t.target)} · 模块: ${t.module}</div>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
      <div class="font-sm text-secondary mt-16">💡 提示:点击上方"今日学习(开始本课)"按钮直接开始今日任务,系统会自动按天推进。</div>
    </div>
  ` : '';

  // 学习路径地图(折叠)
  const pathMap = all.map((s, i) => {
    const done = (p.completedSteps || []).includes(s.step) || i < curIdx;
    const isCurrent = i === curIdx;
    const isLocked = i > curIdx;
    const cls = done ? 'done' : (isCurrent ? 'current' : 'locked');
    const icon = done ? '✅' : (isCurrent ? '▶️' : '🔒');
    return `
      <div class="path-step ${cls}" ${isLocked ? 'style="opacity:0.5;"' : ''}
           ${!isLocked ? `onclick="EM.jumpToStep(${i})"` : ''}>
        <span style="font-size:18px;">${icon}</span>
        <div style="flex:1;">
          <div class="font-sm" style="font-weight:${isCurrent ? '700' : '400'};">
            第${i + 1}步 · L${s.level}
          </div>
          <div>${s.title}</div>
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <!-- 顶部状态 -->
    <div class="card">
      <div class="flex align-center justify-between mb-16">
        <div>
          <div class="font-sm text-secondary">当前级别</div>
          <div style="font-size:24px; font-weight:700;">L${lv.id} · ${lv.cn} <span class="font-sm text-secondary">(${lv.code})</span></div>
        </div>
        <div style="text-align:right;">
          <div class="font-sm text-secondary">学习路径进度</div>
          <div class="font-lg">${completedCount} / ${totalSteps} 步</div>
        </div>
      </div>
      <div class="progress-bar"><div class="progress-fill" style="width:${pathProgress}%"></div></div>
      <div class="font-sm text-secondary mt-16" style="display:flex; justify-content:space-between;">
        <span>路径完成度 ${pathProgress.toFixed(0)}%</span>
        <span>🔥 连续 ${p.streak} 天 · ⏰ ${studyHours}小时</span>
      </div>
    </div>

    <!-- 4格统计 -->
    <div class="grid grid-4 mb-16">
      <div class="stat-card"><div class="stat-value">${vocabLearned}</div><div class="stat-label">已学单词</div></div>
      <div class="stat-card"><div class="stat-value">${phonicsMastered}</div><div class="stat-label">拼读掌握</div></div>
      <div class="stat-card"><div class="stat-value">${grammarMastered}</div><div class="stat-label">语法掌握</div></div>
      <div class="stat-card"><div class="stat-value">${curIdx}/${totalSteps}</div><div class="stat-label">路径步骤</div></div>
    </div>

    <!-- 当前任务大卡片 -->
    ${currentCard}

    <!-- 路径地图 -->
    <div class="card">
      <div class="card-title">🗺️ 完整学习路径 (点击未锁定的步骤可跳转)</div>
      <div class="path-map">${pathMap}</div>
    </div>

    <!-- 其他模块入口(只显示已解锁的) -->
    <div class="grid grid-3">
      ${['phonics','vocabulary','grammar','listening','speaking','reading','media','writing','test'].map(name => {
        const unlocked = EM.path.isModuleUnlocked(name);
        const titleMap = { phonics:'自然拼读', vocabulary:'词汇学习', grammar:'语法大全',
          listening:'听力训练', speaking:'口语练习', reading:'阅读理解',
          media:'音视频课', writing:'写作训练', test:'自适应测试' };
        const iconMap = { phonics:'🔤', vocabulary:'📚', grammar:'📖',
          listening:'👂', speaking:'🗣️', reading:'📰',
          media:'🎬', writing:'✍️', test:'🎯' };
        return `
          <div class="card" style="cursor:${unlocked ? 'pointer' : 'not-allowed'}; ${unlocked ? '' : 'opacity:0.4;'}"
               ${unlocked ? `onclick="EM.router.navigate('${name}')"` : 'onclick="EM.ui.toast(\'🔒 请先完成当前步骤解锁\')"'}>
            <div class="card-title">${iconMap[name]} ${titleMap[name]} ${unlocked ? '' : '🔒'}</div>
            <p class="font-sm text-secondary">${unlocked ? '点击进入' : '未解锁'}</p>
          </div>
        `;
      }).join('')}
      <div class="card" style="cursor:pointer;" onclick="EM.router.navigate('rag')">
        <div class="card-title">🤖 智能问答</div>
        <p class="font-sm text-secondary">本地知识库+AI可选</p>
      </div>
      <div class="card" style="cursor:pointer;" onclick="EM.router.navigate('dictionary')">
        <div class="card-title">🔍 查询中心</div>
        <p class="font-sm text-secondary">搜单词/查语法/主题词族</p>
      </div>
    </div>
  `;
};

// 开始当前步骤(跳转到对应模块)
EM.startCurrentStep = () => {
  const step = EM.path.currentStep();
  if (!step) return;
  EM.router.navigateWithSubmodule(step.module, step.submodule);
};

// 用户手动标记当前步骤完成
EM.markCurrentDone = async () => {
  if (!confirm('确认你已完成本步学习目标?完成将进入下一步。')) return;
  await EM.path.completeCurrent();
  EM.ui.toast('🎉 已完成本步!进入下一步');
  EM.router.navigate('home');
};

// 跳到下一步
EM.goNextStep = async () => {
  await EM.path.completeCurrent();
  EM.ui.toast('🎉 进入下一步');
  EM.router.navigate('home');
};

// 跳转到指定步骤(只允许已完成或当前步骤)
EM.jumpToStep = (idx) => {
  const p = EM.progress.get();
  if (idx > (p.pathStep || 0)) {
    EM.ui.toast('🔒 该步骤尚未解锁');
    return;
  }
  EM.progress.update(d => { d.pathStep = idx; });
  EM.router.navigate('home');
};

// 弹出每日学习计划详情
EM.showDailyPlan = () => {
  const step = EM.path.currentStep();
  if (!step) { EM.ui.toast('路径加载中,稍后再试'); return; }
  const dp = EM.dailyPlan(step);
  if (!dp.tasks.length) { EM.ui.toast('当前任务无法按天拆分'); return; }

  const doneCount = dp.tasks.filter(t => t.done).length;
  const todayIdx = dp.tasks.findIndex(t => !t.done);
  const todayTask = todayIdx >= 0 ? dp.tasks[todayIdx] : null;

  const body = `
    <div class="font-sm text-secondary mb-16">
      📅 当前课程: <b>${EM.ui.esc(step.title)}</b><br>
      本课共拆分 <b>${dp.dayCount}</b> 天,你已完成 <b>${doneCount}</b> 天
      ${todayTask ? `<br>📌 今日任务: <span style="color:var(--accent);">${EM.ui.esc(todayTask.title)}</span>` : '<br>🎉 全部完成,可点击"已完成,进入下一课"'}
    </div>
    <div class="path-map">
      ${dp.tasks.map((t, i) => `
        <div class="path-step ${t.done ? 'done' : (i === todayIdx ? 'current' : 'locked')}"
             style="cursor:pointer; ${t.done ? '' : (i === todayIdx ? '' : 'opacity:0.5;')}"
             onclick="EM.startDailyTask(${i})">
          <span style="font-size:18px;">${t.done ? '✅' : (i === todayIdx ? '▶️' : '🔒')}</span>
          <div style="flex:1;">
            <div class="font-sm" style="font-weight:${i === todayIdx ? 700 : 400};">${EM.ui.esc(t.title)}</div>
            <div class="font-sm text-secondary">目标 ${EM.ui.esc(t.target)} · 模块 ${t.module}</div>
          </div>
        </div>
      `).join('')}
    </div>
    <div class="flex gap-8 mt-16">
      ${todayTask
        ? `<button class="btn btn-primary" onclick="EM.startDailyTask(${todayIdx})">🚀 立即开始今日任务</button>`
        : `<button class="btn btn-primary" onclick="EM.goNextStep(); EM.ui.closeModal();">✅ 进入下一课</button>`}
      <button class="btn btn-secondary" data-close>关闭</button>
    </div>
  `;
  EM.ui.modal(body, { title: '📅 每日学习计划' });
};

// 跳转到指定每日任务(打开对应模块并定位到目标)
EM.startDailyTask = (dayIdx) => {
  const step = EM.path.currentStep();
  if (!step) return;
  const dp = EM.dailyPlan(step);
  if (!dp.tasks[dayIdx]) return;
  const t = dp.tasks[dayIdx];
  // 跳到对应模块
  EM.router.navigateWithSubmodule(t.module, t.submodule);
  EM.ui.closeModal();
  EM.ui.toast(`📅 ${t.title}`, 3500);
};

// ===== 进度详情页 =====
EM.renderProgressPage = (container) => {
  const p = EM.progress.get();
  const lv = EM.LEVELS[p.level] || EM.LEVELS[0];
  container.innerHTML = `
    <div class="card">
      <div class="card-title">📊 总览</div>
      <div class="grid grid-3">
        <div class="stat-card"><div class="stat-value">${p.streak}</div><div class="stat-label">连续天数</div></div>
        <div class="stat-card"><div class="stat-value">${Math.floor(p.totalStudyTime/3600)}</div><div class="stat-label">总学时</div></div>
        <div class="stat-card"><div class="stat-value">L${lv.id}</div><div class="stat-label">当前级别</div></div>
      </div>
    </div>
    <div class="card">
      <div class="card-title">🛣️ 学习路径状态</div>
      <div class="font-sm text-secondary mb-16">
        当前第 ${(p.pathStep || 0) + 1} 步 / 共 ${EM.path.all().length} 步<br>
        已完成 ${(p.completedSteps || []).length} 步
      </div>
      <button class="btn btn-secondary" onclick="EM.router.navigate('home')">回到当前任务</button>
    </div>
    <div class="card">
      <div class="card-title">📝 各模块进度</div>
      ${Object.entries({
        '自然拼读': `${(p.modules.phonics.mastered||[]).length} 项掌握`,
        '词汇': `${(p.modules.vocabulary.learned||[]).length} 词已学`,
        '语法': `${(p.modules.grammar.mastered||[]).length} 点掌握`,
        '听力': `${(p.modules.listening.completed||[]).length} 段完成`,
        '口语': `${(p.modules.speaking.completed||[]).length} 次完成`,
        '阅读': `${(p.modules.reading.completed||[]).length} 篇完成`,
        '音视频': `${(p.modules.media && p.modules.media.completed || []).length} 课完成`,
        '写作': `${(p.modules.writing.completed||[]).length} 篇完成`,
        '测试': `${(p.modules.test.history||[]).length} 次完成`
      }).map(([k,v]) => `
        <div class="flex justify-between align-center" style="padding:8px 0;border-bottom:1px solid var(--border);">
          <span>${k}</span><span class="text-secondary">${v}</span>
        </div>
      `).join('')}
    </div>
    <div class="card">
      <div class="card-title">⚠️ 弱项记录 (自适应优先复习)</div>
      ${Object.entries(p.weaknesses).map(([mod, items]) => items.length ?
        `<div class="mb-16"><div class="font-sm text-secondary">${mod}</div>
         <div class="flex gap-8 flex-wrap mt-16">${items.slice(0,20).map(i => `<span class="tag tag-l3">${EM.ui.esc(i)}</span>`).join('')}</div></div>` : ''
      ).join('') || '<p class="text-secondary font-sm">暂无弱项记录</p>'}
    </div>
    <div class="card">
      <div class="card-title">💾 跨设备同步</div>
      <p class="font-sm text-secondary mb-16">导出进度文件到本地,在其他设备上导入即可继续学习</p>
      <button class="btn btn-primary" onclick="EM.progress.export()">📤 导出进度</button>
      <button class="btn btn-secondary" onclick="document.getElementById('importFile').click()">📥 导入进度</button>
    </div>
  `;
};

// ===== 初始化 =====
EM.init = async () => {
  EM.tts.init();
  EM.updateLevelBadge();

  // 预加载学习路径(异步,不阻塞界面)
  EM.path.load().then(() => {
    EM.updateNavLocks();
  });

  // 导航事件
  document.querySelectorAll('.nav-item').forEach(el => {
    el.onclick = () => EM.router.navigate(el.dataset.route);
  });

  // 移动端菜单
  document.getElementById('menuToggle').onclick = () => {
    document.getElementById('sidebar').classList.toggle('open');
  };

  // 设置弹窗
  document.getElementById('settingsBtn').onclick = () => {
    document.getElementById('settingsModal').classList.add('show');
    const s = EM.progress.getSettings();
    document.getElementById('voiceLang').value = s.voiceLang || 'en-US';
    document.getElementById('speechRate').value = s.speechRate || 0.9;
    document.getElementById('rateValue').textContent = s.speechRate || 0.9;
    document.getElementById('themeSelect').value = s.theme || 'dark';
    document.getElementById('aiApiUrl').value = s.aiApiUrl || '';
    document.getElementById('aiApiKey').value = s.aiApiKey || '';
    document.getElementById('aiModel').value = s.aiModel || 'gpt-4o-mini';
  };

  document.querySelectorAll('#settingsModal [data-close]').forEach(el => {
    el.onclick = () => document.getElementById('settingsModal').classList.remove('show');
  });
  document.getElementById('settingsModal').onclick = e => {
    if (e.target.id === 'settingsModal') e.target.classList.remove('show');
  };

  // 设置保存
  document.getElementById('voiceLang').onchange = e => {
    EM.progress.saveSettings({ voiceLang: e.target.value });
    EM.tts.setLang(e.target.value);
  };
  document.getElementById('speechRate').oninput = e => {
    EM.progress.saveSettings({ speechRate: parseFloat(e.target.value) });
    EM.tts.setRate(parseFloat(e.target.value));
    document.getElementById('rateValue').textContent = e.target.value;
  };
  document.getElementById('themeSelect').onchange = e => {
    EM.progress.saveSettings({ theme: e.target.value });
    EM.applyTheme(e.target.value);
  };
  ['aiApiUrl','aiApiKey','aiModel'].forEach(id => {
    document.getElementById(id).onchange = e => {
      EM.progress.saveSettings({ [id]: e.target.value });
      if (EM.modules.rag) EM.modules.rag.reloadConfig();
    };
  });

  // 导入导出
  document.getElementById('exportProgress').onclick = () => EM.progress.export();
  document.getElementById('importProgress').onclick = () => document.getElementById('importFile').click();
  document.getElementById('importFile').onchange = async e => {
    if (e.target.files[0]) {
      try {
        await EM.progress.import(e.target.files[0]);
        EM.ui.toast('进度导入成功!');
        EM.updateLevelBadge();
        EM.updateNavLocks();
        EM.router.navigate(EM.currentRoute);
      } catch (err) { EM.ui.toast('导入失败: ' + err.message); }
    }
  };
  document.getElementById('resetProgress').onclick = () => {
    if (confirm('确定重置所有进度?此操作不可撤销。')) {
      EM.progress.reset();
      EM.path.reset();
      EM.ui.toast('进度已重置,从第1步重新开始');
      EM.updateLevelBadge();
      EM.updateNavLocks();
      EM.router.navigate('home');
    }
  };

  // 语音开关
  document.getElementById('ttsToggle').onclick = () => {
    const on = EM.tts.toggle();
    document.getElementById('ttsToggle').textContent = on ? '🔊' : '🔇';
    EM.ui.toast(on ? '语音已开启' : '语音已关闭');
  };

  // 主题
  const theme = EM.progress.getSettings().theme || 'dark';
  EM.applyTheme(theme);

  // 首页
  EM.router.navigate('home');
};

EM.applyTheme = (theme) => {
  if (theme === 'auto') {
    const dark = matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  } else {
    document.documentElement.setAttribute('data-theme', theme);
  }
};

// 启动
document.addEventListener('DOMContentLoaded', EM.init);
