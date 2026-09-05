# -*- coding: utf-8 -*-
"""
为 vocabulary.json 中的高频词生成「诚实版」增强字段,
输出 data/vocabulary_enhanced.json, 结构 {version:2, words:{word:{...}}}

v2 重写说明（取代旧版）:
  旧版把 L1-L3 前5000词全部塞满模板生成的“伪数据”:
  占位同义词("类似名词1")、凑数搭配("him 用法")、固定短语故事 —— 这些内容会直接
  展示给学习者并造成误导。v2 只输出**可从真实数据推导**的字段:

    roots       来自 tools/ECDICT-master/wordroot.txt 的真实词根表
    exchange    来自 ecdict.csv 的真实屈折变化(复数/时态/比较级), 展示为"词形变化"
    englishDef  来自 ecdict.csv 的真实英英释义(WordNet), 多义词每个义项一条
    freqInfo    来自 ecdict.csv 的真实语料频率(bnc/frq/collins)

  词形变化和英英释义是词典真实数据，不会误导；同义词/搭配等容易出错的字段
  留空，由 dictionary.js 的本地生成器兜底（本来就有实时生成逻辑）。
  这样前5000词的"记忆卡片"永远只显示真话。

用法: python enhance_vocab.py    (先运行 convert_ecdict.py 生成新词表)
依赖: tools/ECDICT-master/ecdict.csv, tools/ECDICT-master/wordroot.txt
"""
import csv
import json
import os
import re

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(BASE, 'data', 'vocabulary.json')
DST = os.path.join(BASE, 'data', 'vocabulary_enhanced.json')
CSV_PATH = os.path.join(BASE, 'tools', 'ECDICT-master', 'ecdict.csv')
ROOTS_PATH = os.path.join(BASE, 'tools', 'ECDICT-master', 'wordroot.txt')
COVER_WORDS = 5000   # 覆盖 L1-L4 前段（新词表前5000 = A1~B2 核心）

EXCHANGE_LABELS = {
    'p': '复数', 'd': '过去式', 'i': '现在分词', '3': '三单',
    'r': '比较级', 't': '最高级', 's': '第三人称单数',
}


def load_root_map():
    if not os.path.exists(ROOTS_PATH):
        return {}
    try:
        data = json.load(open(ROOTS_PATH, encoding='utf-8'))
    except Exception as e:
        print('wordroot.txt 解析失败, 跳过词根增强:', e)
        return {}
    m = {}
    for key, entry in data.items():
        if not isinstance(entry, dict):
            continue
        for w in entry.get('example', []) or []:
            if isinstance(w, str) and w:
                m.setdefault(w.lower(), entry)
    return m


def parse_exchange(ex):
    """'d:went/p:went' -> [('过去式','went'), ('复数','went')]"""
    out = []
    if not ex:
        return out
    for seg in ex.split('/'):
        if ':' not in seg:
            continue
        k, v = seg.split(':', 1)
        label = EXCHANGE_LABELS.get(k.strip())
        v = v.strip()
        if label and v and v.lower() != '0':
            out.append((label, v))
    return out


def main():
    try:
        import sys
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

    vocab = json.load(open(SRC, encoding='utf-8'))
    ordered = []
    seen = set()
    for lv in vocab['levels']:
        for w in lv['words']:
            if w['word'] not in seen:
                seen.add(w['word'])
                ordered.append(w['word'])
    targets = set(ordered[:COVER_WORDS])
    print(f'目标增强词: 前 {COVER_WORDS} 个 (L1-L3 核心区)')

    root_map = load_root_map()
    print(f'词根索引: {len(root_map)} 个派生词映射')

    rows = {}
    with open(CSV_PATH, encoding='utf-8') as f:
        for row in csv.DictReader(f):
            w = (row.get('word') or '').strip().lower()
            if w in targets and w not in rows:
                rows[w] = row    # 第一条即主条目

    out_words = {}
    have_roots = have_def = have_exch = 0
    for w in ordered[:COVER_WORDS]:
        entry = {}
        row = rows.get(w)
        ent = root_map.get(w)
        if ent and ent.get('meaning'):
            r = ent.get('root', w)
            entry['roots'] = f"{r} = {ent['meaning']}" + (f" ({ent['origin']})" if ent.get('origin') else '')
            have_roots += 1
        if row:
            exch = parse_exchange(row.get('exchange', ''))
            if exch:
                entry['exchange'] = [{'label': lb, 'form': v} for lb, v in exch[:4]]
                have_exch += 1
            d = (row.get('definition') or '').replace('\\n', '\n').strip()
            if d:
                defs = []
                for ln in d.split('\n'):
                    ln = ln.strip()
                    if len(ln) >= 8 and not ln.startswith('See ') and ln not in defs:
                        defs.append(ln)
                if defs:
                    entry['englishDefs'] = defs[:4]
                    have_def += 1
            info = []
            bnc = int(row.get('bnc') or 0)
            frq = int(row.get('frq') or 0)
            collins = int(row.get('collins') or 0)
            if collins:
                info.append(f"Collins {collins} 星")
            if bnc:
                info.append(f"BNC 语料排名 #{bnc}")
            if frq:
                info.append(f"COCA 语料排名 #{frq}")
            if info:
                entry['freqInfo'] = '；'.join(info)
        if entry:
            out_words[w] = entry

    out = {
        'version': 2,
        'note': '诚实版增强数据: 词根来自 wordroot.txt, 词形变化/英英释义/语料频率来自 ecdict.csv 真实字段; '
                '不再包含任何模板生成的伪同义词/伪搭配。仅覆盖词表前5000词。',
        'words': out_words,
    }
    with open(DST, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
    size_mb = os.path.getsize(DST) / 1024 / 1024
    print(f"完成! {DST} ({size_mb:.2f} MB): {len(out_words)} 词 | "
          f"词根 {have_roots} | 词形变化 {have_exch} | 英英释义 {have_def}")


if __name__ == '__main__':
    main()
