#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""校验所有 JSON 文件的有效性"""
import json
import os
import sys

BASE = r'c:\GitHub上传\EnglishMaster\data'
files = ['vocabulary.json', 'vocabulary_enhanced.json', 'grammar.json',
         'grammar_extra.json', 'knowledge.json', 'word_themes.json',
         'learning_path.json', 'articles.json', 'conversations.json', 'phonics.json']

for f in files:
    p = os.path.join(BASE, f)
    if not os.path.exists(p):
        print(f"[MISS] {f}")
        continue
    try:
        with open(p, 'r', encoding='utf-8') as fp:
            data = json.load(fp)
        if f == 'knowledge.json':
            qa = data.get('qa', [])
            print(f"[ OK ] {f}: {len(qa)} 条QA")
        elif f == 'vocabulary.json':
            levels = data.get('levels', [])
            total = sum(len(lv.get('words', [])) for lv in levels)
            print(f"[ OK ] {f}: {len(levels)} 级别,共 {total} 词")
        elif f == 'grammar.json':
            print(f"[ OK ] {f}: {len(data.get('topics', []))} 语法点")
        elif f == 'grammar_extra.json':
            print(f"[ OK ] {f}: {len(data.get('topics', []))} 语法点")
        elif f == 'vocabulary_enhanced.json':
            words = data.get('words', {})
            print(f"[ OK ] {f}: {len(words)} 词增强")
        elif f == 'word_themes.json':
            themes = data.get('themes', [])
            print(f"[ OK ] {f}: {len(themes)} 主题")
        else:
            print(f"[ OK ] {f}")
    except json.JSONDecodeError as e:
        print(f"[ERR ] {f}: 行 {e.lineno} 列 {e.colno} - {e.msg}")
        # 显示出错位置附近内容
        with open(p, 'r', encoding='utf-8') as fp:
            lines = fp.readlines()
        start = max(0, e.lineno - 3)
        end = min(len(lines), e.lineno + 2)
        for i in range(start, end):
            mark = ' >>> ' if i == e.lineno - 1 else '     '
            print(f"  {mark}{i+1}: {lines[i].rstrip()[:200]}")
    except Exception as e:
        print(f"[ERR ] {f}: {e}")
