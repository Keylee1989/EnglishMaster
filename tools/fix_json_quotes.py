#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""修复 knowledge.json 中答案内的未转义双引号"""
import json
import re

p = r'c:\GitHub上传\EnglishMaster\data\knowledge.json'

with open(p, 'r', encoding='utf-8') as f:
    raw = f.read()

# 找出每个 "answer": "..." 中的内容,把内嵌的 " 替换为 '
# 简单做法:用 ast 思路 - 找 "answer": " 起始,找到对应的结束 "
# 但 JSON 内的 " 没有转义,需手动处理
# 用正则匹配 "answer": "(.*?)" 但 .*? 不能跨行且匹配最短
# 我们用行级处理

lines = raw.split('\n')
fixed_lines = []
in_answer = False
answer_buf = []
answer_start_idx = -1
answer_quote_count = 0

def fix_answer_text(text):
    """把答案中出现的未转义 " 替换为 ' """
    # 已转义的 \" 保留
    # 我们逐字符扫描,跳过 \",把其余的 " 替换
    out = []
    i = 0
    while i < len(text):
        if text[i] == '\\' and i + 1 < len(text):
            out.append(text[i:i+2])
            i += 2
        elif text[i] == '"':
            out.append("'")
            i += 1
        else:
            out.append(text[i])
            i += 1
    return ''.join(out)

i = 0
while i < len(lines):
    line = lines[i]
    # 检测 "answer": " 开始行
    m = re.match(r'^(\s*"answer":\s*")(.*)$', line)
    if m:
        prefix = m.group(1)
        content = m.group(2)
        # content 末尾是否就是结束 "
        # 答案可能跨多行,先判断本行末尾
        if content.endswith('",') or content.endswith('"'):
            # 单行答案:把内部 " 替换为 ',保留末尾的 " 或 ",
            # 找最后一个 "
            # 末尾是 "," 或 "
            if content.endswith('",'):
                inner = content[:-2]
                tail = '",'
            else:
                inner = content[:-1]
                tail = '"'
            fixed_lines.append(prefix + fix_answer_text(inner) + tail)
        else:
            # 多行答案:把内部所有 " 替换为 ',直到找到行末是 " 或 ",的结束
            # 缓冲当前行内容(去掉末尾换行)
            buf = [content]
            j = i + 1
            while j < len(lines):
                cur = lines[j]
                if cur.rstrip().endswith('",') or cur.rstrip().endswith('"'):
                    # 找到结束行
                    # 处理最后一行:把末尾 " 或 "," 之前的内容也修复
                    if cur.rstrip().endswith('",'):
                        last_inner = cur.rstrip()[:-2]
                        last_tail = '",'
                    else:
                        last_inner = cur.rstrip()[:-1]
                        last_tail = '"'
                    buf_inner = '\n'.join(buf) + '\n' + last_inner
                    fixed_inner = fix_answer_text(buf_inner)
                    # 重新拼接
                    fixed_lines.append(prefix + fixed_inner + last_tail)
                    i = j
                    break
                else:
                    buf.append(cur)
                    j += 1
            else:
                # 没找到结束,按原样追加
                fixed_lines.append(line)
                for k in range(i+1, j+1):
                    fixed_lines.append(lines[k])
                i = j
    else:
        fixed_lines.append(line)
    i += 1

# 写回
with open(p, 'w', encoding='utf-8') as f:
    f.write('\n'.join(fixed_lines))

# 验证
try:
    with open(p, 'r', encoding='utf-8') as f:
        data = json.load(f)
    print(f"修复成功: {len(data.get('qa', []))} 条 QA")
except json.JSONDecodeError as e:
    print(f"仍有错误: 行 {e.lineno} 列 {e.colno} - {e.msg}")
    with open(p, 'r', encoding='utf-8') as f:
        all_lines = f.readlines()
    start = max(0, e.lineno - 3)
    end = min(len(all_lines), e.lineno + 2)
    for i in range(start, end):
        mark = ' >>> ' if i == e.lineno - 1 else '     '
        print(f"  {mark}{i+1}: {all_lines[i].rstrip()[:200]}")
