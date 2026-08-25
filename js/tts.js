/* ===== 语音合成模块 (Web Speech API) ===== */
window.EM = window.EM || {};
EM.tts = {
  voices: [],
  voice: null,
  enabled: true,
  rate: 0.9,
  lang: 'en-US',

  init() {
    if (!('speechSynthesis' in window)) {
      console.warn('浏览器不支持语音合成');
      this.enabled = false;
      return;
    }
    this.loadVoices();
    // iOS Safari 需要异步加载
    speechSynthesis.onvoiceschanged = () => this.loadVoices();
    // 从设置恢复
    const saved = EM.progress.getSettings();
    if (saved.voiceLang) this.lang = saved.voiceLang;
    if (saved.speechRate) this.rate = saved.speechRate;
  },

  loadVoices() {
    this.voices = speechSynthesis.getVoices();
    this.voice = this.voices.find(v => v.lang === this.lang) ||
      this.voices.find(v => v.lang.startsWith('en')) || this.voices[0];
  },

  speak(text, opts = {}) {
    if (!this.enabled || !text) return;
    // 取消正在播放的
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = opts.lang || this.lang;
    u.rate = opts.rate || this.rate;
    u.pitch = opts.pitch || 1;
    if (this.voice) u.voice = this.voice;
    // iOS需要用户交互后才能播放
    speechSynthesis.speak(u);
  },

  pause() { if (speechSynthesis.speaking) speechSynthesis.pause(); },
  resume() { if (speechSynthesis.paused) speechSynthesis.resume(); },
  stop() { speechSynthesis.cancel(); },

  toggle() {
    this.enabled = !this.enabled;
    if (!this.enabled) this.stop();
    return this.enabled;
  },

  setLang(lang) {
    this.lang = lang;
    this.voice = this.voices.find(v => v.lang === lang) ||
      this.voices.find(v => v.lang.startsWith('en'));
  },

  setRate(rate) { this.rate = rate; },

  // 连续朗读单词列表(每个词之间间隔500ms)
  speakSequence(words, opts = {}) {
    if (!this.enabled || !words || !words.length) return;
    speechSynthesis.cancel();
    let i = 0;
    const playNext = () => {
      if (i >= words.length) return;
      const u = new SpeechSynthesisUtterance(words[i]);
      u.lang = opts.lang || this.lang;
      u.rate = opts.rate || this.rate;
      if (this.voice) u.voice = this.voice;
      u.onend = () => {
        i++;
        setTimeout(playNext, 500);
      };
      u.onerror = () => { i++; setTimeout(playNext, 200); };
      speechSynthesis.speak(u);
    };
    playNext();
  },

  // 列出可用语音
  listVoices() {
    return this.voices.filter(v => v.lang.startsWith('en')).map(v => ({
      name: v.name, lang: v.lang
    }));
  }
};
