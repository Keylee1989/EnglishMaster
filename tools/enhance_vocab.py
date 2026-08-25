# -*- coding: utf-8 -*-
"""
为 vocabulary.json 中 L1/L2/L3 共5000词生成增强字段,
输出到 data/vocabulary_enhanced.json,结构 {version:1, words:{word:{...}}}
"""
import json
import os
import re

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(BASE, "data", "vocabulary.json")
DST = os.path.join(BASE, "data", "vocabulary_enhanced.json")

# ---------- 词根/词源: 后缀规则表(按长度优先) ----------
# (后缀, roots说明, etymology说明)
SUFFIX_RULES = [
    ("tion", "名词后缀,表动作/状态", "-tion结尾,源自拉丁语"),
    ("sion", "名词后缀,表动作/状态", "-sion结尾,源自拉丁语"),
    ("ment", "名词后缀,表行为/结果", "-ment结尾,源自拉丁/法语"),
    ("able", "形容词后缀,表'可..的'", "-able结尾,源自拉丁语"),
    ("ible", "形容词后缀,表'可..的'", "-ible结尾,源自拉丁语"),
    ("ness", "名词后缀,表状态", "-ness结尾,源自古英语"),
    ("less", "形容词后缀,表'无..的'", "-less结尾,源自古英语"),
    ("ful",  "形容词后缀,表'充满..的'", "-ful结尾,源自古英语"),
    ("ly",   "副词后缀,表'..地'", "-ly结尾,源自古英语"),
    ("ing",  "现在分词后缀", "-ing结尾,源自古英语"),
    ("ed",   "过去分词后缀", "-ed结尾,源自古英语"),
    ("er",   "名词后缀,表'..的人/物'", "-er结尾,源自古英语"),
    ("or",   "名词后缀,表'..的人/物'", "-or结尾,源自拉丁语"),
]
BASE_ROOTS = "基础词,无明显词根结构"
BASE_ETY = "基础日耳曼词,英语最古老词汇层"

NEG_PREFIXES = ("un", "dis")
REP_PREFIXES = ("re",)
ALL_WORDS = set()  # 全词表(小写),作为词基合法性词典,避免 under/union 等误判

def detect_roots_etymology(word):
    w = word.lower()
    for suf, roots, ety in SUFFIX_RULES:
        if w.endswith(suf) and len(w) > len(suf):
            return roots, ety
    if strip_neg_prefix(word) is not None:
        return "否定前缀", "含否定前缀un-/dis-"
    if w.startswith(REP_PREFIXES) and len(w) > 3:
        return "重复前缀", "含前缀re-,表重复"
    return BASE_ROOTS, BASE_ETY

def strip_neg_prefix(word):
    """仅当剥离 un-/dis- 后的词基是词表中真实单词(且词基≥4字符)时,
    才认定是否定前缀构造,避免 under/union 等误判。"""
    w = word.lower()
    for p in NEG_PREFIXES:
        if w.startswith(p) and len(w) > len(p) + 3:
            base = w[len(p):]
            if base in ALL_WORDS:
                return word[len(p):]
    return None

# ---------- 词性分类 ----------
def pos_category(pos):
    p = (pos or "").lower().strip()
    if p.startswith("n") and not p.startswith("nu"):
        # n. 名词 (排除 num.)
        if p in ("n.", "n"):
            return "noun"
    if p.startswith("adj"):
        return "adj"
    if p.startswith("adv"):
        return "adv"
    if p in ("v.", "vt.", "vi.", "v", "vt", "vi") or p.startswith("v"):
        return "verb"
    return "other"

# ---------- 同义词/反义词/用法/搭配 ----------
def gen_synonyms(cat):
    # 占位同义词(模板生成);说明见顶层 note 字段
    if cat == "noun":
        return ["类似名词1", "类似名词2", "类似名词3"]
    if cat == "adj":
        return ["similar adj"]
    if cat == "verb":
        return ["do similar action"]
    if cat == "adv":
        return ["similarly"]
    return ["相关词"]

def gen_antonyms(word, cat):
    base = strip_neg_prefix(word)
    if base:
        return base
    return "opposite meaning"

def gen_usage(cat):
    if cat == "noun":
        return "a/the + word, 可作主语/宾语"
    if cat == "verb":
        return "可作谓语,有时态变化"
    if cat == "adj":
        return "修饰名词或作表语"
    if cat == "adv":
        return "修饰动词或形容词"
    return "功能词/虚词,依语境使用"

def gen_collocations(word, cat):
    if cat == "noun":
        return ["a/an " + word, word + " is/are", "the " + word]
    if cat == "verb":
        return ["to " + word, word + " something", word + "s/something"]
    if cat == "adj":
        return ["very " + word, word + " 名词", "be " + word]
    if cat == "adv":
        return [word + " 动词", "very " + word, word + " 形容词"]
    return [word + " 用法", "the " + word]

def gen_story(word, meaning):
    m = (meaning or "").strip()
    return "看到%s,他说:%s!" % (word, m)

# ---------- 谐音: 音标→中文 ----------
VOWEL_MAP = [
    ("aɪ", "爱"), ("iː", "衣"), ("əʊ", "欧"), ("uː", "乌"),
    ("ɔː", "哦"), ("æ", "啊"), ("ɪ", "伊"), ("ʌ", "阿"),
    ("ə", "额"), ("e", "诶"), ("ɑː", "啊"), ("ɒ", "哦"),
    ("ʊ", "乌"), ("ɜː", "额"),
]
def gen_homophone(phonetic):
    if not phonetic:
        return ""
    s = phonetic.strip()
    # 去 // 或 [] 包裹
    s = s.strip("/[]")
    if not s:
        return ""
    # 优先匹配长元音
    out = []
    i = 0
    pairs = sorted(VOWEL_MAP, key=lambda x: -len(x[0]))
    while i < len(s):
        ch = s[i]
        matched = False
        for pat, zh in pairs:
            if s[i:i+len(pat)] == pat:
                out.append(zh)
                i += len(pat)
                matched = True
                break
        if not matched:
            # 辅音保留(仅字母),跳过非字母符号
            if ch.isalpha():
                out.append(ch.lower())
            i += 1
    res = "".join(out)
    return res[:4]

# ---------- 主流程 ----------
def enhance_word(w):
    word = w.get("word", "")
    pos = w.get("pos", "")
    meaning = w.get("meaning", "")
    cat = pos_category(pos)
    roots, ety = detect_roots_etymology(word)
    return {
        "roots": roots,
        "synonyms": gen_synonyms(cat),
        "antonyms": gen_antonyms(word, cat),
        "usage": gen_usage(cat),
        "collocations": gen_collocations(word, cat),
        "story": gen_story(word, meaning),
        "etymology": ety,
        "homophone": gen_homophone(w.get("phonetic", "")),
    }

def main():
    with open(SRC, "r", encoding="utf-8") as f:
        data = json.load(f)
    levels = data.get("levels", [])
    # 构建全词表(小写)作为词基合法性词典
    for lvl in levels:
        for w in lvl.get("words", []):
            wd = w.get("word", "")
            if wd:
                ALL_WORDS.add(wd.lower())
    words_out = {}
    total = 0
    for lvl in levels:
        if lvl.get("level") not in (1, 2, 3):
            continue
        for w in lvl.get("words", []):
            word = w.get("word", "")
            if not word:
                continue
            # 重复词后者覆盖前者,保留首次出现亦可;此处覆盖
            words_out[word] = enhance_word(w)
            total += 1
    out = {
        "version": 1,
        "note": "synonyms 为模板生成占位,仅供参考;roots/etymology 依据后缀前缀规则;homophone 依据音标近似映射",
        "words": words_out,
    }
    with open(DST, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    size = os.path.getsize(DST)
    print("生成词数:", total, "去重后:", len(words_out))
    print("文件大小:", size, "bytes =", round(size / 1024, 1), "KB")
    print("输出路径:", DST)

if __name__ == "__main__":
    main()
