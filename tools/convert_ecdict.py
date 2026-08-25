# -*- coding: utf-8 -*-
"""
ECDICT 转 EnglishMaster 词汇库脚本
=====================================
用法：
  1. 下载 ecdict.csv 放到本脚本同级目录 (tools/)
     下载地址: https://github.com/skywind3000/ECDICT
  2. 运行: python convert_ecdict.py
  3. 自动生成 ../data/vocabulary.json (55000词分级)

分级逻辑(按频率):
  L1 入门A1:   前1500高频词
  L2 初级A2:   1500-3000
  L3 中级B1B2: 3000-5000
  L4 高级C1:   5000-8000
  L5 精通C2:   8000-55000+
"""
import csv, json, os, sys, re

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_PATH = os.path.join(HERE, '..', 'data', 'vocabulary.json')

# 自动搜索 ecdict.csv(支持直接放tools/或放解压子目录ECDICT-master/)
def find_csv():
    candidates = [
        os.path.join(HERE, 'ecdict.csv'),
        os.path.join(HERE, 'ECDICT-master', 'ecdict.csv'),
        os.path.join(HERE, 'ECDICT', 'ecdict.csv'),
    ]
    for c in candidates:
        if os.path.exists(c): return c
    # 递归搜索 tools/ 下任意位置的 ecdict.csv
    for r, _, fs in os.walk(HERE):
        for f in fs:
            if f.lower() == 'ecdict.csv':
                return os.path.join(r, f)
    return None

CSV_PATH = find_csv()
TOTAL = 55000  # 目标词数
LEVELS = [
    (1, '入门A1', '生存英语1000-2000词', 0, 1500),
    (2, '初级A2', '日常交流3000词', 1500, 3000),
    (3, '中级B1-B2', '工作学习5000词', 3000, 5000),
    (4, '高级C1', '流利表达8000词', 5000, 8000),
    (5, '精通C2', '母语水平16000+词', 8000, TOTAL),
]

# 联想记忆模板(按词性)
ASSOC_TEMPLATES = {
    'n.': '名词「{meaning}」。联想：把{word}和具体场景绑定记忆，多造句。',
    'v.': '动词「{meaning}」。联想：动作词，想象自己做这个动作的画面。',
    'v. n.': '动名两用「{meaning}」。联想：既可做动作也可做事物。',
    'adj.': '形容词「{meaning}」。联想：描述性词，想象用它描述的物体。',
    'adv.': '副词「{meaning}」。联想：修饰动作的方式，搭配动词记。',
    'prep.': '介词「{meaning}」。联想：表关系，记常见搭配。',
    'conj.': '连词「{meaning}」。联想：连接词，记它连接的两类句子。',
    'pron.': '代词「{meaning}」。联想：替代名词，记住指代对象。',
    'num.': '数词「{meaning}」。联想：表数量顺序。',
    'int.': '感叹词「{meaning}」。联想：表情绪，记使用场景。',
}

# 例句模板(按词性,语法正确的通用句子)
EXAMPLE_TEMPLATES = {
    'n.': 'The {word} is very common in our daily life.',
    'v.': 'We should learn how to {word} properly in practice.',
    'adj.': 'Here is a {word} example for students.',
    'adv.': 'She speaks English {word} and everyone understands her.',
    'prep.': 'The book is {word} the table in the living room.',
    'conj.': 'I am happy {word} the weather is nice today.',
    'pron.': 'The pronoun {word} is commonly used in English.',
    'num.': 'There are {word} books on the table right now.',
    'int.': '{word}! What a wonderful day it is today!',
    'vt.': 'Please {word} this sentence for me now.',
    'vi.': 'They will {word} when they have free time.',
    'aux.': 'You {word} finish your homework before dinner.',
    'art.': 'I bought {word} new book from the store today.',
    'abbr.': 'The short form {word} is used in writing.',
}

def clean_word(w):
    """只保留纯字母词,过滤短语/复合"""
    if not w: return None
    w = w.strip().lower()
    if not re.match(r'^[a-z]+(-[a-z]+)?$', w): return None
    if len(w) < 2 or len(w) > 20: return None
    return w

def parse_pos(translation, pos_str):
    """从translation开头或pos字段解析词性,并归一化"""
    raw = ''
    # 先从translation开头提取(如"n. 苹果" "pron. 他" "v. 跑")
    if translation:
        m = re.match(r'^\s*([a-zA-Z]+)\.\s', translation)
        if m:
            raw = m.group(1).lower()
    # 再从pos字段
    if not raw and pos_str:
        s = pos_str.strip().strip('/').strip()
        parts = re.split(r'[;,]', s)
        main = parts[0].strip() if parts else s
        main = main.rstrip('.')
        raw = main.lower()
    # 归一化词性(统一到模板能识别的)
    mapping = {
        'a': 'adj.', 'adj': 'adj.',
        'n': 'n.', 'nn': 'n.',
        'v': 'v.',
        'vt': 'vt.', 'vi': 'vi.',
        'adv': 'adv.', 'advb': 'adv.',
        'prep': 'prep.',
        'conj': 'conj.',
        'pron': 'pron.',
        'num': 'num.',
        'int': 'int.', 'interj': 'int.',
        'aux': 'aux.', 'auxv': 'aux.',
        'art': 'art.',  # 冠词
        'abbr': 'abbr.',
    }
    return mapping.get(raw, 'n.')  # 未知默认名词

def parse_meaning(translation, definition):
    """取中文释义(只取第一个词义,去掉词性标记和多余内容)"""
    if translation:
        first = translation.split('\\n')[0].split('\n')[0].strip()
        # 去除开头词性标记如"n. " "pron. " "v. "
        first = re.sub(r'^\s*[a-zA-Z]+\.\s*', '', first)
        # 只取第一个词义(到逗号/分号/顿号/圆括号前)
        for sep in ['；', ';', '，', ',', '（', '(', '\n']:
            idx = first.find(sep)
            if idx > 0:
                first = first[:idx]
        first = first.strip()
        if first: return first[:30]
    if definition:
        return definition.split(';')[0].strip()[:30]
    return ''

def make_association(word, pos, meaning):
    """生成联想记忆"""
    tpl = ASSOC_TEMPLATES.get(pos)
    if tpl:
        return tpl.format(word=word, meaning=meaning)
    # 默认
    return f'「{meaning}」。多读多造句,把{word}和具体场景关联记忆。'

def make_example(word, pos):
    """生成简单例句"""
    tpl = EXAMPLE_TEMPLATES.get(pos)
    if tpl:
        return tpl.format(word=word)
    return f'I learned the word {word} today.'

EXAMPLE_CN_TEMPLATES = {
    'n.': '这个{meaning}在我们日常生活中很常见。',
    'v.': '我们应该学会如何正确地{meaning}。',
    'adj.': '这是一个{meaning}的例句。',
    'adv.': '她英语说得{meaning},大家都听得懂。',
    'prep.': '书在客厅桌子{meaning}。',
    'conj.': '我很开心{meaning}今天天气很好。',
    'pron.': '代词{meaning}在日常英语中常用。',
    'num.': '桌子上有{meaning}本书。',
    'int.': '{meaning}！今天天气真好！',
    'vt.': '请现在帮我{meaning}这个句子。',
    'vi.': '他们有空的时候会{meaning}。',
    'aux.': '你{meaning}在晚饭前完成作业。',
    'art.': '我从店里买了{meaning}本新书。',
    'abbr.': '缩写{meaning}常用于书面语。',
}

def make_example_cn(meaning, pos):
    tpl = EXAMPLE_CN_TEMPLATES.get(pos)
    if tpl:
        return tpl.format(meaning=meaning)
    return f'我学会了「{meaning}」这个词。'

def main():
    if not os.path.exists(CSV_PATH):
        print('错误: 找不到 ecdict.csv')
        print(f'请把ecdict.csv放到: {HERE}')
        print('下载地址: https://github.com/skywind3000/ECDICT')
        sys.exit(1)

    print(f'读取 {CSV_PATH} ...')
    words = []
    with open(CSV_PATH, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for i, row in enumerate(reader):
            if i % 50000 == 0:
                print(f'  已处理 {i} 行, 收集 {len(words)} 词')
            w = clean_word(row.get('word', ''))
            if not w: continue
            phonetic = (row.get('phonetic') or '').strip().strip('/')
            if phonetic: phonetic = '/' + phonetic + '/'
            pos = parse_pos(row.get('translation', ''), row.get('pos', ''))
            meaning = parse_meaning(row.get('translation', ''), row.get('definition', ''))
            if not meaning: continue
            # 频率排序键: collins星级(高优先), bnc排名(小优先)
            try:
                collins = int(row.get('collins') or 0)
            except: collins = 0
            try:
                bnc = int(row.get('bnc') or 999999)
            except: bnc = 999999
            try:
                frq = int(row.get('frq') or 0)
            except: frq = 0
            words.append({
                'word': w, 'phonetic': phonetic, 'pos': pos,
                'meaning': meaning, 'collins': collins, 'bnc': bnc, 'frq': frq
            })

    print(f'共收集 {len(words)} 词, 按频率排序...')
    # 排序: collins降序, bnc升序, frq降序
    words.sort(key=lambda x: (-x['collins'], x['bnc'], -x['frq']))
    # 去重(保留频率高的)
    seen = set()
    uniq = []
    for w in words:
        if w['word'] in seen: continue
        seen.add(w['word'])
        uniq.append(w)
        if len(uniq) >= TOTAL: break
    words = uniq[:TOTAL]
    print(f'取前 {len(words)} 词')

    # 分级
    out_levels = []
    for lid, name, target, start, end in LEVELS:
        chunk = words[start:end]
        level_words = []
        for w in chunk:
            pos = w['pos'] or 'n.'
            meaning = w['meaning']
            level_words.append({
                'word': w['word'],
                'phonetic': w['phonetic'] or '',
                'pos': pos,
                'meaning': meaning,
                'example': make_example(w['word'], pos),
                'exampleCn': make_example_cn(meaning, pos),
                'association': make_association(w['word'], pos, meaning),
                'roots': '',
                'synonyms': [],
                'antonyms': []
            })
        out_levels.append({
            'level': lid, 'name': name, 'target': target,
            'count': len(level_words), 'words': level_words
        })
        print(f'  L{lid} {name}: {len(level_words)} 词')

    out = {'levels': out_levels, 'totalWords': len(words)}
    with open(OUT_PATH, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, separators=(',',':'))
    size_mb = os.path.getsize(OUT_PATH) / 1024 / 1024
    print(f'完成! 生成 {OUT_PATH}')
    print(f'总词数: {len(words)}, 文件大小: {size_mb:.1f} MB')

if __name__ == '__main__':
    main()
