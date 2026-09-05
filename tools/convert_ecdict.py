# -*- coding: utf-8 -*-
"""
ECDICT 转 EnglishMaster 词汇库脚本 (v2 重写版)
=============================================
此脚本取代旧版 convert_ecdict.py。旧版用「 Collins 星级 → BNC → 频率」的字典序排序，
由于 ECDICT 中仅约 5.7万/40万 词带真实语料频率信号，导致大量无频词/公司名/医学词
混入 L1-L4（例如 L1 出现 based/folliculitis），C2 级 L5 中 40% 词缺音标、
例句全部是同一模板句 —— 这是原项目"达不到 C2"的最主要数据缺陷。

v2 修复逻辑:
  1. 只保留带真实频率信号的词（bnc/frq/collins 任一 > 0），杜绝无频词进前四级;
  2. 过滤公司名/人名/地名等专有名词垃圾行;
  3. 以 min(bnc, frq) 语料频率排名为主序（BNC≈英国国家语料, frq≈COCA）,
     重建后 L1 前 50 词与 learning_path 第 8 课声称的 the/be/to/of/and... 完全一致;
  4. 音标全部来自 ECDICT 真实字段（不再出现空音标高频词）;
  5. 例句按词性使用多套语法安全模板 + 顶层 ~110 个功能词手写真实例句,
     例句中英一一对应，不再出现"万事万物都很常见"式废话;
  6. L1-L4(前8000词) 关联词根来自 tools/ECDICT-master/wordroot.txt 真实数据;
  7. 词库总深度 20000 词（BNC/COCA 双语料核心区间），保证 L5 全部有真实频率证据。

用法:
  python convert_ecdict.py     # 生成 ../data/vocabulary.json
依赖:
  tools/ECDICT-master/ecdict.csv (下载: https://github.com/skywind3000/ECDICT)
"""
import csv, json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_PATH = os.path.join(HERE, '..', 'data', 'vocabulary.json')
ROOTS_PATH = os.path.join(HERE, 'ECDICT-master', 'wordroot.txt')
TOTAL = 20000
LEVELS = [
    (1, '入门A1',   '生存英语·最高频1500词',   0,     1500),
    (2, '初级A2',   '日常交流·前3000词',       1500,  3000),
    (3, '中级B1-B2','工作学习·前5000词',       3000,  5000),
    (4, '高级C1',   '流利表达·前8000词',       5000,  8000),
    (5, '精通C2',   'C2精通·前20000词+海量真实输入', 8000, 20000),
]

# ---------- 顶层功能词手写例句（模板无法安全覆盖的虚词/高频词） ----------
CURATED = {
    'the': ("The book on the table is mine.", "桌子上的那本书是我的。"),
    'be': ("To be honest, I don't know.", "说实话，我也不知道。"),
    'to': ("I went to the store to buy milk.", "我去商店买牛奶。"),
    'of': ("He is a close friend of mine.", "他是我的一个好朋友。"),
    'and': ("I bought apples and oranges.", "我买了苹果和橙子。"),
    'a': ("She has a car.", "她有一辆车。"),
    'in': ("The keys are in the drawer.", "钥匙在抽屉里。"),
    'that': ("I know that you are busy.", "我知道你很忙。"),
    'have': ("We have two children.", "我们有两个孩子。"),
    'i': ("I live in Beijing.", "我住在北京。"),
    'it': ("It is raining outside.", "外面在下雨。"),
    'for': ("This gift is for you.", "这份礼物是给你的。"),
    'not': ("That is not true.", "那不是真的。"),
    'on': ("The cup is on the table.", "杯子在桌子上。"),
    'with': ("I went there with my friends.", "我和朋友们一起去了那里。"),
    'he': ("He works in a hospital.", "他在医院工作。"),
    'as': ("She works as a teacher.", "她的职业是老师。"),
    'you': ("You should see a doctor.", "你应该去看医生。"),
    'do': ("What do you do on weekends?", "你周末做什么？"),
    'at': ("We met at the station.", "我们在车站见的面。"),
    'this': ("This is my favorite book.", "这是我最喜欢的书。"),
    'but': ("I called, but no one answered.", "我打了电话，但没人接。"),
    'his': ("His car is new.", "他的车是新的。"),
    'by': ("She sat by the window.", "她坐在窗边。"),
    'from': ("I received a letter from him.", "我收到了他的一封信。"),
    'they': ("They arrived very early.", "他们到得很早。"),
    'we': ("We usually eat at home.", "我们通常在家吃饭。"),
    'say': ("What did he say?", "他说了什么？"),
    'her': ("I saw her at the party.", "我在聚会上见过她。"),
    'she': ("She sings very well.", "她唱歌很好听。"),
    'or': ("Tea or coffee?", "要茶还是咖啡？"),
    'an': ("He ate an apple.", "他吃了一个苹果。"),
    'will': ("I will call you tomorrow.", "我明天给你打电话。"),
    'my': ("My phone is broken.", "我的手机坏了。"),
    'one': ("I have one question.", "我有一个问题。"),
    'all': ("All the students passed the exam.", "所有学生都通过了考试。"),
    'would': ("I would like a cup of tea.", "我想要一杯茶。"),
    'there': ("There is a park near my home.", "我家附近有一个公园。"),
    'their': ("Their house is really big.", "他们的房子真大。"),
    'what': ("What time is it now?", "现在几点了？"),
    'so': ("It was late, so I left.", "天晚了，所以我就走了。"),
    'up': ("Stand up, please.", "请起立。"),
    'out': ("He went out for a walk.", "他出去散步了。"),
    'if': ("If it rains, we will stay home.", "如果下雨，我们就待在家里。"),
    'about': ("We talked about the plan.", "我们讨论了这个计划。"),
    'who': ("Who is that man over there?", "那边那个人是谁？"),
    'get': ("I need to get some sleep.", "我得睡一会儿了。"),
    'which': ("Which one do you like?", "你喜欢哪一个？"),
    'go': ("Let's go home.", "我们回家吧。"),
    'me': ("Please call me tonight.", "今晚请给我打电话。"),
    'when': ("When will you arrive?", "你什么时候到？"),
    'make': ("She makes very good coffee.", "她做的咖啡非常好喝。"),
    'can': ("Can you swim?", "你会游泳吗？"),
    'like': ("I like this song very much.", "我非常喜欢这首歌。"),
    'time': ("What time do you get up?", "你几点起床？"),
    'no': ("There is no milk left.", "牛奶没有了。"),
    'just': ("I just finished my homework.", "我刚做完作业。"),
    'him': ("I gave him the book.", "我把书给了他。"),
    'know': ("Do you know her?", "你认识她吗？"),
    'take': ("Take an umbrella with you.", "随身带把伞。"),
    'people': ("People love to travel in summer.", "人们喜欢在夏天旅行。"),
    'into': ("She walked into the room quietly.", "她悄悄地走进了房间。"),
    'year': ("This year has gone by so fast.", "今年过得真快。"),
    'your': ("Is this your bag?", "这是你的包吗？"),
    'good': ("This is a really good idea.", "这真是个好主意。"),
    'some': ("I need some help with this.", "这件事我需要一些帮助。"),
    'could': ("Could you open the window?", "你能打开窗户吗？"),
    'them': ("I know them very well.", "我非常了解他们。"),
    'see': ("I can see the sea from here.", "从这里我能看到大海。"),
    'other': ("Let's try the other way.", "我们试试另一条路吧。"),
    'than': ("He is taller than me.", "他比我高。"),
    'then': ("First cook it, then eat it.", "先煮好，然后再吃。"),
    'now': ("It's your turn now.", "现在轮到你了。"),
    'look': ("Look at that beautiful picture.", "看那张漂亮的图片。"),
    'only': ("This is my only chance.", "这是我唯一的机会。"),
    'come': ("Please come in and sit down.", "请进来坐吧。"),
    'its': ("The dog wagged its tail.", "狗摇了摇它的尾巴。"),
    'over': ("The plane flew over the city.", "飞机飞过城市上空。"),
    'think': ("I think you are right.", "我认为你是对的。"),
    'also': ("I also like classical music.", "我也喜欢古典音乐。"),
    'back': ("I'll be back in five minutes.", "我五分钟后回来。"),
    'after': ("We went home after the movie.", "看完电影我们就回家了。"),
    'use': ("May I use your phone?", "我可以用一下你的手机吗？"),
    'two': ("I have two brothers.", "我有两个兄弟。"),
    'how': ("How does this machine work?", "这台机器怎么用？"),
    'our': ("Our team won the game.", "我们队赢了比赛。"),
    'work': ("I work in a small bank.", "我在一家小银行工作。"),
    'first': ("This is my first visit to China.", "这是我第一次来中国。"),
    'well': ("She speaks English very well.", "她英语说得非常好。"),
    'way': ("What's the best way to learn English?", "学英语最好的方法是什么？"),
    'even': ("Even a child can do this.", "连小孩都会做这件事。"),
    'new': ("I bought a new phone yesterday.", "我昨天买了一部新手机。"),
    'want': ("I want to travel around the world.", "我想环游世界。"),
    'because': ("I stayed home because it rained.", "因为下雨，我待在家里。"),
    'any': ("Do you have any questions?", "你有什么问题吗？"),
    'these': ("These shoes are mine.", "这些鞋是我的。"),
    'give': ("Give me a minute, please.", "请给我一点时间。"),
    'day': ("What a beautiful day it is!", "今天天气真好！"),
    'most': ("This is the most important part.", "这是最重要的部分。"),
    'us': ("She told us an interesting story.", "她给我们讲了一个有趣的故事。"),
    'is': ("The sky is blue today.", "今天天空是蓝色的。"),
    'are': ("They are my best friends.", "他们是我最好的朋友。"),
    'was': ("I was really tired last night.", "我昨晚累坏了。"),
    'were': ("We were at home all day.", "我们一整天都在家。"),
    'has': ("She has a lovely dog.", "她有一只可爱的狗。"),
    'had': ("We had dinner together last Friday.", "上周五我们一起吃了晚饭。"),
    'did': ("Did you finish the report?", "你完成报告了吗？"),
    'does': ("Does he know the answer?", "他知道答案吗？"),
    'been': ("I have been to Japan twice.", "我去过日本两次。"),
    'said': ("He said hello to me politely.", "他礼貌地向我问了好。"),
    'went': ("We went to the park yesterday.", "我们昨天去了公园。"),
    'came': ("She came to see me last week.", "她上周来看我了。"),
    'got': ("I got your message this morning.", "我今早收到了你的消息。"),
    'made': ("He made a small mistake.", "他犯了一个小错误。"),
    'took': ("She took my pen by mistake.", "她错拿了我的笔。"),
    'saw': ("I saw him at the station.", "我在车站见到他了。"),
    'should': ("You should drink more water.", "你应该多喝水。"),
    'may': ("May I come in?", "我可以进来吗？"),
    'must': ("You must finish it before Friday.", "你必须在周五之前完成。"),
    'might': ("It might rain later today.", "今天晚些时候可能会下雨。"),
}

# ---------- 词性化模板（语法安全：避免冠词/可数性错误） ----------
EXAMPLE_TEMPLATES = {
    'n.': [
        ("This book talks about {word}.", "这本书讲的是{meaning}。"),
        ("I read about {word} in the news.", "我在新闻里读到了{meaning}。"),
        ("Have you heard about {word}?", "你听说过{meaning}吗？"),
    ],
    'vt.': [
        ("You should {word} it carefully.", "你应该认真{meaning}它。"),
        ("Can you {word} this for me?", "你能帮我{meaning}这个吗？"),
    ],
    'vi.': [
        ("Try not to {word} too fast.", "尽量不要{meaning}得太快。"),
        ("They often {word} at night.", "它们经常在夜里{meaning}。"),
    ],
    'v.': [
        ("You should {word} it carefully.", "你应该认真{meaning}它。"),
        ("Try not to {word} too fast.", "尽量不要{meaning}得太快。"),
    ],
    'adj.': [
        ("The result was quite {word}.", "结果相当{meaning}。"),
        ("It sounds {word} to me.", "在我看来这挺{meaning}的。"),
        ("That is a {word} idea.", "这是个很{meaning}的想法。"),
    ],
    'adv.': [
        ("Please do it {word}.", "请{meaning}地做这件事。"),
        ("He answered {word}.", "他{meaning}地回答了。"),
    ],
    'num.': [
        ("There are {word} books on the desk.", "桌上有{meaning}本书。"),
    ],
    'int.': [
        ("\"{Word}\" she said with a big smile.", "“{meaning}！”她笑着说。"),
    ],
    'abbr.': [
        ("The short form \"{word}\" is often used in writing.", "缩写{meaning}常用于书面语。"),
    ],
}
# 这些词性优先用 ECDICT 真实英英释义造例句，没有释义才退回模板
DEF_FIRST_POS = {'prep.', 'conj.', 'pron.', 'art.', 'aux.'}

ASSOC_TEMPLATES = {
    'n.': '在脑海里给「{meaning}」配一个具体画面，下次见到实物时默念 {word}。',
    'v.': '想象自己正在做「{meaning}」的动作，出声说三遍 {word}。',
    'vt.': '想象「{meaning}」作用在某个东西上的画面，出声说三遍 {word}。',
    'vi.': '想象自己或别人正在「{meaning}」的场景，出声说三遍 {word}。',
    'adj.': '想一个身边的例子，用 {word}（「{meaning}」）去描述它。',
    'adv.': '回想一个「{meaning}」做事的场景，把动作和方式绑定记忆。',
    'prep.': '{word} 表达「{meaning}」的关系，记一个最常用的搭配即可。',
    'conj.': '{word} 用来连接句子（「{meaning}」），记住它连接的两种情况。',
    'pron.': '{word} 是代词（「{meaning}」），记住它指代的是谁。',
    'num.': '{word} 表示「{meaning}」，在生活里见到数量就默念一遍。',
    'int.': '{word} 表达「{meaning}」的情绪，留着自己惊讶/开心时用。',
    'aux.': '{word} 是助动词，帮别的动词构成时态或语气（「{meaning}」）。',
    'art.': '{word} 是冠词，放在名词前（「{meaning}」）。',
    'abbr.': '{word} 是缩写（「{meaning}」），多见于书面语。',
}

POS_FALLBACK = {
    'a': 'adj.', 'adj': 'adj.', 'ad': 'adj.',
    'n': 'n.', 'nn': 'n.',
    'v': 'v.', 'vt': 'vt.', 'vi': 'vi.',
    'adv': 'adv.', 'advb': 'adv.',
    'prep': 'prep.', 'conj': 'conj.', 'pron': 'pron.',
    'num': 'num.', 'int': 'int.', 'interj': 'int.',
    'aux': 'aux.', 'auxv': 'aux.', 'art': 'art.', 'abbr': 'abbr.',
}


def clean_word(w):
    if not w:
        return None
    w = w.strip().lower()
    if w in ('a', 'i'):        # 最重要的两个单字母词必须保留
        return w
    if not re.match(r"^[a-z]+(-[a-z]+)?$", w):
        return None
    if len(w) < 2 or len(w) > 24:
        return None
    return w


def parse_pos(translation, pos_str):
    raw = ''
    if translation:
        m = re.match(r'^\s*([a-zA-Z]+)\.\s', translation)
        if m:
            raw = m.group(1).lower()
    if not raw and pos_str:
        s = pos_str.strip().strip('/').strip()
        parts = re.split(r'[;,]', s)
        main = (parts[0].strip() if parts else s).rstrip('.').lower()
        raw = main
    return POS_FALLBACK.get(raw, 'n.')


def parse_meaning(translation, definition):
    if not translation:
        return ''
    first = translation.split('\\n')[0].split('\n')[0].strip()
    first = re.sub(r'^\s*\[[^\]]{1,8}\]\s*', '', first)      # 去 [医] 等领域标记
    first = re.sub(r'^\s*[a-zA-Z]{1,4}\.\s*', '', first)     # 去开头词性标记
    for sep in ['；', ';', '，', ',', '（', '(']:
        idx = first.find(sep)
        if idx > 0:
            first = first[:idx]
    first = first.strip()
    return first[:30] if first else ''


def first_english_def(definition):
    """取 ECDICT 英英释义第一行, 去掉行首词性标记, 作为虚词例句"""
    if not definition:
        return ''
    line = definition.split('\n')[0].strip()
    line = re.sub(r'^(n|v|vi|vt|adj|adv|prep|conj|pron|art|aux|num|int|interj)\.\s*', '', line)
    line = line.strip().rstrip('.')
    if line.startswith(('See ', 'see ')):
        return ''
    return line if len(line) >= 10 else ''


def normalize_phonetic(p):
    p = (p or '').strip().strip('/').strip()
    if not p:
        return ''
    p = p.replace('ˋ', 'ˈ').replace('ˊ', 'ˈ')
    return '/' + p + '/'


def an_word(w):
    return w[0] in 'aeiou'


def build_example(word, pos, meaning, definition):
    """返回 (example, exampleCn)； curated > 英英释义 > 词性模板"""
    c = CURATED.get(word)
    if c:
        return c
    if pos in DEF_FIRST_POS:
        d = first_english_def(definition)
        if d:
            return (d[0].upper() + d[1:] + '.', meaning or '（见英文释义）')
    tpl = EXAMPLE_TEMPLATES.get(pos) or EXAMPLE_TEMPLATES['n.']
    en, cn = tpl[hash(word) % len(tpl)]
    if '{Word}' in en:
        en = en.replace('{Word}', word.capitalize())
    en = en.replace('{word}', word)
    if pos == 'adj.' and en.startswith('That is a ') and an_word(word):
        en = en.replace('That is a ' + word, 'That is an ' + word)
    cn = cn.replace('{meaning}', meaning or word)
    cn = cn.replace('的的', '的')          # 避免“挺主要的的”这类叠字
    return (en, cn)


def build_association(word, pos, meaning):
    tpl = ASSOC_TEMPLATES.get(pos) or ASSOC_TEMPLATES['n.']
    return tpl.format(word=word, meaning=meaning or word)


def load_root_map():
    """wordroot.txt: {root: {meaning, class, root, example:[words], origin?}}"""
    if not os.path.exists(ROOTS_PATH):
        return {}
    try:
        data = json.load(open(ROOTS_PATH, encoding='utf-8'))
    except Exception as e:
        print('  wordroot.txt 解析失败, 跳过词根增强:', e)
        return {}
    m = {}
    for key, entry in data.items():
        if not isinstance(entry, dict):
            continue
        for w in entry.get('example', []) or []:
            if isinstance(w, str) and w:
                m.setdefault(w.lower(), entry)
    return m


def main():
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

    csv_path = None
    for c in [os.path.join(HERE, 'ecdict.csv'),
              os.path.join(HERE, 'ECDICT-master', 'ecdict.csv')]:
        if os.path.exists(c):
            csv_path = c
            break
    if not csv_path:
        for r, _, fs in os.walk(HERE):
            for f in fs:
                if f.lower() == 'ecdict.csv':
                    csv_path = os.path.join(r, f)
    if not csv_path:
        print('错误: 找不到 ecdict.csv, 下载地址: https://github.com/skywind3000/ECDICT')
        sys.exit(1)

    JUNK_MARKERS = ('公司名', '人名', '地名', '姓氏', '国名', '河名', '山名',
                    '岛名', '镇名', '村名', '州名', '城名')

    best = {}        # word -> (sortkey, row) 取频率信号最强的一条
    phon_any = {}    # word -> 任意一行的音标（best 行缺音标时兜底）
    with open(csv_path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for i, row in enumerate(reader):
            if i % 100000 == 0:
                print(f'  已扫描 {i} 行 ...')
            w = clean_word(row.get('word', ''))
            if not w:
                continue
            try:
                bnc = int(row.get('bnc') or 0)
                frq = int(row.get('frq') or 0)
                collins = int(row.get('collins') or 0)
            except ValueError:
                continue
            if bnc <= 0 and frq <= 0 and collins <= 0:
                continue                     # ① 无任何真实语料信号 → 不进词库
            trans = row.get('translation') or ''
            if not trans.strip():
                continue                     # ② 无中文释义 → 不进词库
            if any(mk in trans for mk in JUNK_MARKERS):
                continue                     # ③ 专有名词垃圾行 → 剔除
            freq = min(x for x in (bnc if bnc > 0 else 1 << 30,
                                   frq if frq > 0 else 1 << 30))
            key = (freq, -collins, len(w), w)
            ph = (row.get('phonetic') or '').strip()
            if ph and w not in phon_any:
                phon_any[w] = ph
            if w not in best or key < best[w][0]:
                best[w] = (key, row)

    words = sorted(best.values(), key=lambda x: x[0])
    print(f'有效候选词 {len(words)}, 取前 {TOTAL} 个')

    root_map = load_root_map()
    print(f'词根索引: {len(root_map)} 个派生词映射')

    out_levels = []
    for lid, name, target, start, end in LEVELS:
        chunk = words[start:end]
        level_words = []
        for key, row in chunk:
            w = clean_word(row['word'])
            pos = parse_pos(row.get('translation', ''), row.get('pos', ''))
            meaning = parse_meaning(row.get('translation', ''), row.get('definition', ''))
            phonetic = normalize_phonetic(row.get('phonetic') or phon_any.get(w, ''))
            example, example_cn = build_example(w, pos, meaning, row.get('definition', ''))
            association = build_association(w, pos, meaning)
            roots = ''
            r_ent = root_map.get(w)
            if r_ent and lid <= 4:
                roots = f"{r_ent.get('root', '')} = {r_ent.get('meaning', '')}"
                if r_ent.get('origin'):
                    roots += f" ({r_ent['origin']})"
            level_words.append({
                'word': w,
                'phonetic': phonetic,
                'pos': pos,
                'meaning': meaning,
                'example': example,
                'exampleCn': example_cn,
                'association': association,
                'roots': roots,
                'synonyms': [],
                'antonyms': [],
            })
        out_levels.append({
            'level': lid, 'name': name, 'target': target,
            'count': len(level_words), 'words': level_words,
        })
        print(f'  L{lid} {name}: {len(level_words)} 词')

    out = {'levels': out_levels, 'totalWords': TOTAL}
    with open(OUT_PATH, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
    size_mb = os.path.getsize(OUT_PATH) / 1024 / 1024
    print(f'完成! 生成 {OUT_PATH} ({size_mb:.1f} MB), 总词数 {TOTAL}')


if __name__ == '__main__':
    main()
