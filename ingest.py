"""
Build the static word dataset from a Kaikki.org (Wiktextract) English dump.

Usage:
    python ingest.py

Inputs (downloaded once, cached under .cache/ -- never re-fetched if present):
    .cache/kaikki-en.jsonl.gz   Kaikki English Wiktextract dump (gzip JSONL)
    .cache/freq-en-50k.txt      hermitdave/FrequencyWords en_50k.txt, rank = line order

Output:
    data/entries/{shard}.json   headword -> entry, for dictionary lookups
    data/ac/{shard}.json        [headwords...] frequency-sorted, for autocomplete
    data/manifest.json          dataset-level counts + attribution

No third-party packages required -- stdlib only.
"""

import gzip
import json
import os
import re
import sys
import time
import urllib.request

ROOT = os.path.dirname(os.path.abspath(__file__))
CACHE_DIR = os.path.join(ROOT, ".cache")
DATA_DIR = os.path.join(ROOT, "data")

KAIKKI_URL = "https://kaikki.org/dictionary/English/kaikki.org-dictionary-English.jsonl.gz"
KAIKKI_GZ = os.path.join(CACHE_DIR, "kaikki-en.jsonl.gz")

FREQ_URL = "https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/en/en_50k.txt"
FREQ_TXT = os.path.join(CACHE_DIR, "freq-en-50k.txt")

MAX_SENSES_PER_ENTRY = 2
DEFINITION_MAX_CHARS = 140
EXAMPLE_MAX_CHARS = 160
MAX_RELATION_WORDS = 6

# Register/usage labels worth surfacing next to the part of speech.
# Order = display priority when a sense carries more than one.
REGISTER_TAGS = [
    "slang", "vulgar", "offensive", "derogatory", "informal", "colloquial",
    "dialectal", "euphemistic", "humorous", "childish", "dated", "archaic",
    "rare", "nonstandard", "proscribed",
]
REGISTER_TAG_SET = set(REGISTER_TAGS)

# Per spec section 6.2: only these bypass the frequency cutoff ("always keep
# tagged slang entries regardless of frequency rank"). The broader
# REGISTER_TAGS list above is for display only -- tags like "archaic"/"rare"/
# "nonstandard" are common Wiktionary annotations on genuinely obscure words
# and must NOT also waive the frequency cap, or they swamp the headword
# budget with exactly the long tail the spec says to exclude.
PRIORITY_TAGS = {"slang", "informal", "colloquial", "vulgar", "dated", "dialectal"}

ALLOWED_POS = {
    "noun", "verb", "adj", "adv", "intj", "pron", "prep", "conj", "num",
    "det", "article", "phrase", "proverb", "abbrev", "initialism", "acronym",
    "contraction", "particle",
    # "name" is included too, but only survives the extra is_true_proper_noun()
    # check below -- see that function for why.
    "name",
}

# Wiktionary/Wiktextract tags real proper nouns (people, places) as pos "name",
# but it *also* tags many eponymous "-ism"/theory words this way purely because
# of how their Wiktionary page happens to be headed (e.g. "Platonism" is pos
# "name" despite being a plain philosophy noun with no person/place category).
# A blanket `pos != "name"` exclusion throws those out along with the real
# proper nouns -- and with them, eponymous adjectives like "Socratic"/
# "Freudian"/"Machiavellian" that use pos "adj" and were never excluded by POS
# at all, only by WORD_RE below requiring an all-lowercase headword.
WORD_RE = re.compile(r"^[A-Za-z][A-Za-z'\- ]*$")


PROPER_NOUN_CATEGORY_MARKERS = (
    "given name", "surname", "trademark", "organization", "organisation",
    "brand name", "companies", "businesses",
)


def is_true_proper_noun(obj):
    """pos == "name" entries only: True for actual people/place/brand/org names
    (identified by Wiktextract's own 'place' category kind, or a category name
    matching PROPER_NOUN_CATEGORY_MARKERS), False for eponymous terms like
    "Platonism" that just happen to also be tagged pos "name"."""
    for sense in obj.get("senses", []):
        for cat in sense.get("categories", []) or []:
            if cat.get("kind") == "place":
                return True
            name = (cat.get("name") or "").lower()
            if any(marker in name for marker in PROPER_NOUN_CATEGORY_MARKERS):
                return True
    return False

ATTRIBUTION = "Wiktionary (CC BY-SA 4.0), via Kaikki.org/Wiktextract"


def ensure_downloaded(url, dest, label):
    if os.path.exists(dest) and os.path.getsize(dest) > 0:
        print(f"[cache] {label} already present ({os.path.getsize(dest):,} bytes) -- not re-fetching")
        return
    print(f"[download] {label} <- {url}")
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    tmp = dest + ".part"
    with urllib.request.urlopen(url, timeout=120) as resp, open(tmp, "wb") as out:
        total = int(resp.headers.get("Content-Length", 0))
        read = 0
        chunk = 1024 * 1024
        while True:
            buf = resp.read(chunk)
            if not buf:
                break
            out.write(buf)
            read += len(buf)
            if total:
                print(f"\r  {read / 1e6:8.1f} MB / {total / 1e6:.1f} MB", end="", flush=True)
    print()
    os.replace(tmp, dest)


def load_frequency_ranks(path):
    ranks = {}
    with open(path, "r", encoding="utf-8") as f:
        for i, line in enumerate(f):
            parts = line.strip().split(" ")
            if not parts or not parts[0]:
                continue
            word = parts[0].lower()
            if word not in ranks:
                ranks[word] = i
    return ranks


def truncate(text, max_chars):
    text = text.strip()
    if len(text) <= max_chars:
        return text
    cut = text[:max_chars].rsplit(" ", 1)[0]
    return cut.rstrip(",.;: ") + "…"


def pick_ipa(sound_list):
    best = None
    for s in sound_list:
        ipa = s.get("ipa")
        if not ipa:
            continue
        tags = s.get("tags", [])
        if "US" in tags or "General-American" in tags:
            return ipa
        if best is None:
            best = ipa
    return best


def extract_relations(entry_obj):
    syn = [r.get("word") for r in entry_obj.get("synonyms", []) if r.get("word")]
    ant = [r.get("word") for r in entry_obj.get("antonyms", []) if r.get("word")]
    return syn, ant


def process_sense(sense):
    # form_of = mechanical inflection ("plural of pie") -- exclude per spec.
    # alt_of = a genuine alternative spelling/abbreviation ("Abbreviation of
    # free kick") -- these are exactly the informal/slang variants the spec
    # prioritizes, so keep them.
    if "form_of" in sense:
        return None
    glosses = sense.get("glosses")
    if not glosses:
        return None
    definition = truncate(glosses[-1], DEFINITION_MAX_CHARS)
    if not definition:
        return None

    sense_tags = set(sense.get("tags", []))
    tags = [t for t in REGISTER_TAGS if t in sense_tags]
    is_priority = bool(sense_tags & PRIORITY_TAGS)

    example = None
    for ex in sense.get("examples", []):
        text = ex.get("text")
        if text:
            example = truncate(text, EXAMPLE_MAX_CHARS)
            break

    return definition, tags, example, is_priority


def merge_into_headword(headwords, word, pos, ipa, senses_raw, syn, ant):
    rec = headwords.get(word)
    if rec is None:
        rec = {"w": word, "ipa": None, "s": [], "syn": [], "ant": [], "_priority": False}
        headwords[word] = rec

    if ipa and not rec["ipa"]:
        rec["ipa"] = ipa

    for sense in senses_raw:
        if len(rec["s"]) >= MAX_SENSES_PER_ENTRY:
            break
        processed = process_sense(sense)
        if processed is None:
            continue
        definition, tags, example, is_priority = processed
        entry_sense = {"p": pos, "d": definition}
        if tags:
            entry_sense["t"] = tags
        if is_priority:
            rec["_priority"] = True
        if example:
            entry_sense["e"] = example
        rec["s"].append(entry_sense)

    for w in syn:
        if w not in rec["syn"] and len(rec["syn"]) < MAX_RELATION_WORDS:
            rec["syn"].append(w)
    for w in ant:
        if w not in rec["ant"] and len(rec["ant"]) < MAX_RELATION_WORDS:
            rec["ant"].append(w)


def build_headwords(gz_path):
    headwords = {}
    line_count = 0
    kept_line_count = 0
    t0 = time.time()

    with gzip.open(gz_path, "rt", encoding="utf-8") as f:
        for line in f:
            line_count += 1
            if line_count % 500000 == 0:
                elapsed = time.time() - t0
                print(f"\r  scanned {line_count:,} lines ({elapsed:.0f}s), "
                      f"{len(headwords):,} headwords so far", end="", flush=True)

            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
            except json.JSONDecodeError:
                continue

            if obj.get("lang_code") != "en":
                continue
            pos = obj.get("pos")
            if pos not in ALLOWED_POS:
                continue
            if pos == "name":
                if is_true_proper_noun(obj):
                    continue
                pos = "noun"  # surviving "name" entries (e.g. "Platonism") are functionally nouns
            word = obj.get("word", "")
            if not word or not WORD_RE.match(word):
                continue
            if len(word.split()) > 3:
                continue
            word = word.lower()
            senses = obj.get("senses")
            if not senses:
                continue

            ipa = pick_ipa(obj.get("sounds", []))
            syn, ant = extract_relations(obj)
            merge_into_headword(headwords, word, pos, ipa, senses, syn, ant)
            kept_line_count += 1

    print(f"\r  scanned {line_count:,} lines in {time.time() - t0:.0f}s, "
          f"{kept_line_count:,} matched, {len(headwords):,} distinct headwords")

    # drop headwords that ended up with no usable sense
    headwords = {w: rec for w, rec in headwords.items() if rec["s"]}
    return headwords


def select_final_set(headwords, freq_ranks):
    # No frequency cap: keep every headword that passed the ingest filters.
    # The original frequency-based cap (see git history) existed to bound
    # dataset size for CDN hosting/transfer cost; this project serves data/
    # as local static files with no such constraint, and capping by presence
    # in a *conversational* frequency list (subtitle-derived) was silently
    # dropping legitimate but non-conversational vocabulary -- e.g. "Socratic",
    # "Kantian", "Orwellian" -- that has no frequency rank at all but is a
    # perfectly valid, real dictionary entry.
    return dict(headwords)


def shard_key(word):
    if len(word) == 1:
        return "_" + word
    return word[:2]


def write_shards(final_headwords, freq_ranks):
    entries_dir = os.path.join(DATA_DIR, "entries")
    ac_dir = os.path.join(DATA_DIR, "ac")
    os.makedirs(entries_dir, exist_ok=True)
    os.makedirs(ac_dir, exist_ok=True)

    entry_shards = {}
    ac_shards = {}

    for word, rec in final_headwords.items():
        key = shard_key(word)
        entry = {"w": rec["w"], "src": ATTRIBUTION}
        if rec["ipa"]:
            entry["ipa"] = rec["ipa"]
        entry["s"] = rec["s"]
        if rec["syn"]:
            entry["syn"] = rec["syn"]
        if rec["ant"]:
            entry["ant"] = rec["ant"]
        entry_shards.setdefault(key, {})[word] = entry
        ac_shards.setdefault(key, []).append(word)

    total_bytes = 0
    largest = (None, 0)
    for key, obj in entry_shards.items():
        path = os.path.join(entries_dir, key + ".json")
        payload = json.dumps(obj, ensure_ascii=False, separators=(",", ":"))
        with open(path, "w", encoding="utf-8") as f:
            f.write(payload)
        size = len(payload.encode("utf-8"))
        total_bytes += size
        if size > largest[1]:
            largest = (key, size)

    for key, words in ac_shards.items():
        # frequency-sorted (spec 6.4); words with no frequency rank (mostly
        # priority-only slang/informal terms) sort after ranked ones, alphabetically
        words.sort(key=lambda w: (freq_ranks.get(w, float("inf")), w))
        path = os.path.join(ac_dir, key + ".json")
        with open(path, "w", encoding="utf-8") as f:
            json.dump(words, f, ensure_ascii=False, separators=(",", ":"))

    return total_bytes, largest


def write_manifest(final_headwords, total_bytes, largest, dump_source):
    priority_count = sum(1 for rec in final_headwords.values() if rec["_priority"])
    manifest = {
        "generated": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "source": dump_source,
        "license": ATTRIBUTION,
        "headword_count": len(final_headwords),
        "slang_tagged_count": priority_count,
        "entries_total_bytes": total_bytes,
        "largest_shard": {"key": largest[0], "bytes": largest[1]},
    }
    with open(os.path.join(DATA_DIR, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)
    return manifest


def main():
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    ensure_downloaded(KAIKKI_URL, KAIKKI_GZ, "Kaikki English dump (gz)")
    ensure_downloaded(FREQ_URL, FREQ_TXT, "English frequency list")

    print("[parse] scanning Kaikki dump ...")
    headwords = build_headwords(KAIKKI_GZ)

    print("[rank] loading frequency list ...")
    freq_ranks = load_frequency_ranks(FREQ_TXT)

    print("[select] keeping every headword that passed the filters (no frequency cap) ...")
    final_headwords = select_final_set(headwords, freq_ranks)
    print(f"  final headword count: {len(final_headwords):,}")

    print("[shard] writing data/entries and data/ac ...")
    total_bytes, largest = write_shards(final_headwords, freq_ranks)

    manifest = write_manifest(final_headwords, total_bytes, largest, KAIKKI_URL)

    print("\n=== Phase 1 checkpoint ===")
    print(f"headword count:      {manifest['headword_count']:,}")
    print(f"slang-tagged count:  {manifest['slang_tagged_count']:,}")
    print(f"total entries size:  {manifest['entries_total_bytes'] / 1e6:.2f} MB")
    print(f"largest shard:       {manifest['largest_shard']['key']}.json "
          f"({manifest['largest_shard']['bytes'] / 1e3:.1f} KB)")

    print("\nSample of 10 entries (>=3 slang-tagged where available):")
    priority_words = [w for w, r in final_headwords.items() if r["_priority"]]
    plain_words = [w for w, r in final_headwords.items() if not r["_priority"]]
    sample_words = priority_words[:3] + plain_words[:7]
    for w in sample_words[:10]:
        print(json.dumps(final_headwords[w], ensure_ascii=False))


if __name__ == "__main__":
    sys.exit(main())
