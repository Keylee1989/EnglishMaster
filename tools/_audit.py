"""校验 vocabulary.json 和 grammar.json 数据完整度"""
import json
from collections import Counter

V = json.load(open(r'c:\GitHub上传\EnglishMaster\data\vocabulary.json','r',encoding='utf-8'))
G = json.load(open(r'c:\GitHub上传\EnglishMaster\data\grammar.json','r',encoding='utf-8'))

out = []

# === 词汇校验 ===
out.append("=" * 60)
out.append("【1】词汇数据校验")
out.append("=" * 60)
levels = V.get('levels', [])
out.append(f"vocabulary.json 共 {len(levels)} 个级别,声称 totalWords={V.get('totalWords')}")
out.append("")

field_stats = {}  # {level: {field: (total, filled)}}

for lv in levels:
    lvl = lv.get('level', '?')
    words = lv.get('words', [])
    claimed = lv.get('count', 0)
    out.append(f"L{lvl} ({lv.get('name','')}) - 声称 {claimed} 词,实际 {len(words)} 词")
    stats = {}
    fields_to_check = ['word','phonetic','pos','meaning','example','exampleCn',
                       'association','roots','synonyms','antonyms']
    for f in fields_to_check:
        filled = 0
        for w in words:
            v = w.get(f)
            if v and (not isinstance(v,(list,str)) or len(v)>0):
                filled += 1
        stats[f] = (len(words), filled)
        pct = (filled/len(words)*100) if words else 0
        out.append(f"  {f:15s}: {filled}/{len(words)} ({pct:.1f}%)")
    field_stats[lvl] = stats
    out.append("")

# B2(=L3)及以下总词数
b2_total = sum(len(lv.get('words',[])) for lv in levels if lv.get('level',99) <= 3)
out.append(f"B2(L1+L2+L3)及以下总词数: {b2_total}")
out.append("")

# === 语法校验 ===
out.append("=" * 60)
out.append("【2】语法数据校验")
out.append("=" * 60)
cats = G.get('categories', [])
topics = G.get('topics', [])
out.append(f"grammar.json 共 {len(cats)} 个分类,{len(topics)} 个语法点")
out.append("")
out.append("分类列表:")
for c in cats:
    cnt = len([t for t in topics if t.get('category') == c.get('id')])
    out.append(f"  {c.get('icon','')} {c.get('name','')} (L{c.get('level')}) - {cnt} 个语法点")
out.append("")

out.append("所有语法点(按级别):")
for lv_num in sorted(set(t.get('level',0) for t in topics)):
    items = [t for t in topics if t.get('level') == lv_num]
    out.append(f"\nL{lv_num} ({len(items)} 个):")
    for t in items:
        title = t.get('title','')
        has_detail = 'Y' if t.get('detail') else 'N'
        has_examples = 'Y' if t.get('examples') else 'N'
        out.append(f"  [{has_detail}detail|{has_examples}ex] {t.get('id')}: {title}")

# === 知识点覆盖检查 ===
out.append("")
out.append("=" * 60)
out.append("【3】语法知识点覆盖检查(对照B2标准)")
out.append("=" * 60)

required_topics = {
    '词法': ['名词','代词','冠词','形容词','副词','介词','连词','数词','感叹词','动词'],
    '时态': ['一般现在','一般过去','一般将来','现在进行','过去进行','将来进行',
             '现在完成','过去完成','将来完成','现在完成进行','过去完成进行'],
    '语态': ['被动语态','主动语态'],
    '从句': ['主语从句','宾语从句','表语从句','同位语从句','定语从句',
             '时间状语从句','原因状语从句','条件状语从句','让步状语从句',
             '目的状语从句','结果状语从句','方式状语从句','比较状语从句'],
    '非谓语': ['不定式','动名词','现在分词','过去分词'],
    '特殊句式': ['倒装句','强调句','省略句','there be','it句型','虚拟语气'],
    '其他': ['主谓一致','直接引语','间接引语','独立主格','反义疑问句','感叹句']
}

all_titles = ' '.join(t.get('title','') for t in topics)
all_details = ' '.join((t.get('detail','') or '') for t in topics)
all_text = all_titles + ' ' + all_details

for cat, items in required_topics.items():
    out.append(f"\n[{cat}]:")
    for it in items:
        hit = it in all_text
        out.append(f"  {'✅' if hit else '❌'} {it}")

open(r'c:\GitHub上传\EnglishMaster\tools\_audit_out.txt','w',encoding='utf-8').write('\n'.join(out))
print("audit done, output saved")
