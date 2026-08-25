#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""审计 EnglishMaster 数据完整性"""
import json
import os
import sys

# 切换工作目录
BASE = r'c:\GitHub上传\EnglishMaster\data'
os.chdir(BASE)

def load(name):
    p = os.path.join(BASE, name + '.json')
    if not os.path.exists(p):
        return None
    with open(p, 'r', encoding='utf-8') as f:
        return json.load(f)

print('=' * 60)
print('【1】词汇数据校验')
print('=' * 60)
v = load('vocabulary')
if v:
    total = 0
    b2_total = 0
    for lv in v.get('levels', []):
        words = lv.get('words', [])
        n = len(words)
        total += n
        if lv['level'] <= 3:
            b2_total += n
        phonetic_ok = sum(1 for w in words if w.get('phonetic'))
        pos_ok = sum(1 for w in words if w.get('pos'))
        meaning_ok = sum(1 for w in words if w.get('meaning'))
        example_ok = sum(1 for w in words if w.get('example'))
        assoc_ok = sum(1 for w in words if w.get('association') and len(w.get('association','')) > 5 and '替代名词' not in w.get('association',''))
        roots_ok = sum(1 for w in words if w.get('roots'))
        syns_ok = sum(1 for w in words if w.get('synonyms'))
        ants_ok = sum(1 for w in words if w.get('antonyms'))
        print(f"L{lv['level']} ({lv.get('name','')}) - {n} 词")
        print(f"  phonetic    : {phonetic_ok}/{n} ({100*phonetic_ok//n if n else 0}%)")
        print(f"  pos         : {pos_ok}/{n} ({100*pos_ok//n if n else 0}%)")
        print(f"  meaning     : {meaning_ok}/{n} ({100*meaning_ok//n if n else 0}%)")
        print(f"  example     : {example_ok}/{n} ({100*example_ok//n if n else 0}%)")
        print(f"  association : {assoc_ok}/{n} ({100*assoc_ok//n if n else 0}%)")
        print(f"  roots       : {roots_ok}/{n} ({100*roots_ok//n if n else 0}%)")
        print(f"  synonyms    : {syns_ok}/{n} ({100*syns_ok//n if n else 0}%)")
        print(f"  antonyms    : {ants_ok}/{n} ({100*ants_ok//n if n else 0}%)")
    print(f"\n总词数: {total}")
    print(f"B2(L1+L2+L3)及以下总词数: {b2_total}")

print()
print('=' * 60)
print('【2】词汇增强数据校验 (vocabulary_enhanced.json)')
print('=' * 60)
ve = load('vocabulary_enhanced')
if ve:
    words = ve.get('words', {})
    print(f"增强字段单词数: {len(words)}")
    # 抽样检查字段
    if words:
        sample = list(words.items())[:3]
        for w, d in sample:
            print(f"  {w}: roots={'Y' if d.get('roots') else 'N'}, "
                  f"synonyms={len(d.get('synonyms',[]))}, "
                  f"usage={'Y' if d.get('usage') else 'N'}, "
                  f"collocations={len(d.get('collocations',[]))}, "
                  f"story={'Y' if d.get('story') else 'N'}, "
                  f"etymology={'Y' if d.get('etymology') else 'N'}, "
                  f"homophone={'Y' if d.get('homophone') else 'N'}")
else:
    print("vocabulary_enhanced.json 不存在或为空")

print()
print('=' * 60)
print('【3】语法数据校验')
print('=' * 60)
g = load('grammar')
ge = load('grammar_extra')
if g:
    print(f"grammar.json: {len(g.get('topics',[]))} 个语法点, {len(g.get('categories',[]))} 个分类")
if ge:
    print(f"grammar_extra.json: {len(ge.get('topics',[]))} 个语法点")
total_grammar = (len(g.get('topics',[])) if g else 0) + (len(ge.get('topics',[])) if ge else 0)
print(f"语法点总数: {total_grammar}")

print()
print('=' * 60)
print('【4】RAG 知识库校验')
print('=' * 60)
k = load('knowledge')
if k:
    qa = k.get('qa', [])
    print(f"knowledge.json: {len(qa)} 条问答对")
    cats = {}
    for q in qa:
        c = q.get('category', '其他')
        cats[c] = cats.get(c, 0) + 1
    for c, n in sorted(cats.items()):
        print(f"  {c}: {n} 条")

print()
print('=' * 60)
print('【5】主题词族校验')
print('=' * 60)
t = load('word_themes')
if t:
    themes = t.get('themes', [])
    print(f"word_themes.json: {len(themes)} 个主题, 共 {sum(len(t.get('words',[])) for t in themes)} 个词")
