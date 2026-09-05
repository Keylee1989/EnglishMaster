#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""校验所有 JSON 数据文件的有效性 (路径无关, 从仓库任意位置运行)"""
import json
import os
import sys

try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

BASE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data')
files = ['vocabulary.json', 'vocabulary_enhanced.json', 'grammar.json',
         'grammar_extra.json', 'knowledge.json', 'word_themes.json',
         'learning_path.json', 'articles.json', 'conversations.json',
         'phonics.json', 'phonics_resources.json', 'video_lessons.json']

for f in files:
    p = os.path.join(BASE, f)
    if not os.path.exists(p):
        print(f"[MISS] {f}")
        continue
    try:
        with open(p, 'r', encoding='utf-8') as fp:
            data = json.load(fp)
        if f == 'knowledge.json':
            print(f"[ OK ] {f}: {len(data.get('qa', []))} 条QA")
        elif f == 'vocabulary.json':
            levels = data.get('levels', [])
            total = sum(len(lv.get('words', [])) for lv in levels)
            print(f"[ OK ] {f}: {len(levels)} 级别,共 {total} 词")
        elif f == 'grammar.json':
            print(f"[ OK ] {f}: {len(data.get('topics', []))} 语法点")
        elif f == 'grammar_extra.json':
            print(f"[ OK ] {f}: {len(data.get('topics', []))} 语法点")
        elif f == 'vocabulary_enhanced.json':
            print(f"[ OK ] {f}: {len(data.get('words', {}))} 词增强")
        elif f == 'word_themes.json':
            print(f"[ OK ] {f}: {len(data.get('themes', []))} 主题")
        elif f == 'learning_path.json':
            print(f"[ OK ] {f}: {len(data.get('path', []))} 步")
        elif f == 'articles.json':
            n = sum(len(lv.get('articles', [])) for lv in data.get('levels', []))
            print(f"[ OK ] {f}: {n} 篇")
        elif f == 'conversations.json':
            n = sum(len(lv.get('items', [])) for lv in data.get('levels', []))
            print(f"[ OK ] {f}: {n} 段")
        else:
            print(f"[ OK ] {f}")
    except json.JSONDecodeError as e:
        print(f"[ERR ] {f}: 行 {e.lineno} 列 {e.colno} - {e.msg}")
        with open(p, 'r', encoding='utf-8') as fp:
            lines = fp.readlines()
        start = max(0, e.lineno - 3)
        end = min(len(lines), e.lineno + 2)
        for i in range(start, end):
            mark = ' >>> ' if i == e.lineno - 1 else '     '
            print(f"  {mark}{i+1}: {lines[i].rstrip()[:200]}")
    except Exception as e:
        print(f"[ERR ] {f}: {e}")
