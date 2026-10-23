#!/usr/bin/env python3
"""
Real evaluation harness for Meet2Momentum  (drop into backend/evals/real_eval.py)

Why this exists: the existing evals/benchmark.py never calls the extractor; it counts every
gold item as a true positive, so its 100% scores are guaranteed. This harness measures the
REAL extractor against HUMAN labels on REAL meeting transcripts (AMI / ICSI / committee
meetings as redistributed in QMSum).

Workflow
  0) git clone https://github.com/Yale-LILY/QMSum.git        (MIT-licensed repo)
  1) python evals/real_eval.py sample  --qmsum ./QMSum --n 12 --turns 100
        -> eval_windows.json  +  annotation_sheet.csv   (give the CSV to 2 people)
  2) Annotators fill the `label` column (blank / commitment / suggestion / question),
     optionally `owner` and `due`.  Save as annotatorA.csv / annotatorB.csv.
     Merge disagreements into gold.csv (discuss, then decide).
  3) python evals/real_eval.py extract --windows eval_windows.json --out predictions.json
        (uses your REAL extractor + Gemini key; add --mock for a no-API plumbing test)
  4) python evals/real_eval.py score --windows eval_windows.json --predictions predictions.json \
        --gold gold.csv --gold2 annotatorB.csv --gold1 annotatorA.csv
        -> precision / recall / F1, category accuracy, confusion matrix, Cohen's kappa
"""
import argparse, csv, glob, json, os, random, re, sys, tempfile
from collections import Counter, defaultdict
from difflib import SequenceMatcher

LABELS = ["commitment", "suggestion", "question"]
CAND = re.compile(r"\b(I 'll|I will|I 'm gonna|we should|we could|we need to|we have to|maybe we|"
                  r"who 's gonna|who will|going to|action item|by (monday|tuesday|wednesday|thursday|"
                  r"friday|next week|tomorrow))\b", re.I)


def clean(t):
    t = re.sub(r"\{[^}]*\}", "", t)               # {disfmarker} {vocalsound} ...
    t = re.sub(r"\s+([,.?!;:])", r"\1", t)         # detokenise " ," -> ","
    t = re.sub(r"\s+'(s|ll|re|ve|d|m|t)\b", r"'\1", t)
    return re.sub(r"\s+", " ", t).strip()


def source_of(path):
    p = path.replace("\\", "/")
    return "AMI-product" if "/Product/" in p else "ICSI-academic" if "/Academic/" in p else "committee"


# ---------------------------------------------------------------- sample
def cmd_sample(a):
    rng = random.Random(a.seed)
    files = sorted(glob.glob(os.path.join(a.qmsum, "data", "ALL", "test", "*.json")) +
                   glob.glob(os.path.join(a.qmsum, "data", "ALL", "val", "*.json")))
    # source type from the per-domain folders (ALL has no domain marker)
    dom = {}
    for d in ("Product", "Academic", "Committee"):
        for f in glob.glob(os.path.join(a.qmsum, "data", d, "*", "*.json")):
            dom[os.path.basename(f)] = d
    windows, wid = [], 0
    rng.shuffle(files)
    for f in files:
        if len(windows) >= a.n:
            break
        turns = json.load(open(f, encoding="utf-8"))["meeting_transcripts"]
        turns = [{"speaker": t["speaker"], "text": clean(t["content"])} for t in turns]
        turns = [t for t in turns if t["text"]]
        if len(turns) < a.turns:
            continue
        starts = list(range(0, len(turns) - a.turns + 1, max(1, a.turns // 2)))
        # half the windows are candidate-rich, half random: random ones measure false positives
        want_rich = len(windows) % 2 == 0
        def richness(s):
            return sum(bool(CAND.search(t["text"])) for t in turns[s:s + a.turns])
        s = max(starts, key=richness) if want_rich else rng.choice(starts)
        name = os.path.basename(f)
        windows.append({"window_id": f"w{wid:02d}", "meeting": name[:-5], "source": dom.get(name, "unknown"),
                        "stratum": "candidate-rich" if want_rich else "random",
                        "turns": turns[s:s + a.turns]})
        wid += 1
    json.dump(windows, open(a.out, "w", encoding="utf-8"), indent=1)
    with open(a.sheet, "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["window_id", "turn_id", "speaker", "text", "label", "owner", "due"])
        for win in windows:
            for i, t in enumerate(win["turns"]):
                w.writerow([win["window_id"], i, t["speaker"], t["text"], "", "", ""])
    print(f"{len(windows)} windows, {sum(len(w['turns']) for w in windows)} turns -> {a.out}, {a.sheet}")
    print("Label guide: commitment = someone clearly takes responsibility ('I'll send it Friday');")
    print("suggestion = idea not agreed ('maybe we should...'); question = open issue / unowned ('who will...?').")
    print("Leave blank for everything else.  Do NOT look at model output while labelling.")


# ---------------------------------------------------------------- extract
def window_text(win):
    return "\n".join(f"{t['speaker']}: {t['text']}" for t in win["turns"])


def mock_extract(win):  # plumbing test only - NOT a result
    out = []
    for i, t in enumerate(win["turns"]):
        if CAND.search(t["text"]):
            cat = "commitment" if re.search(r"I 'll|I will|I 'm gonna", t["text"]) else "suggestion"
            out.append({"title": t["text"][:50], "category": cat, "owner": None, "due_date": None,
                        "source_text": t["text"]})
    return out


def cmd_extract(a):
    windows = json.load(open(a.windows, encoding="utf-8"))
    preds = {}
    if not a.mock:
        sys.path.insert(0, os.getcwd())
        from app.services.extractor import extract_meeting_outcomes
        from app.database import init_db, insert_meeting
        db = os.path.join(tempfile.mkdtemp(), "eval.db")
        init_db(db_path=db)
    for win in windows:
        if a.mock:
            preds[win["window_id"]] = mock_extract(win)
            continue
        m = insert_meeting(win["window_id"], window_text(win), db_path=db)["meeting_id"]
        r = extract_meeting_outcomes(m, win["window_id"], window_text(win), db_path=db)
        preds[win["window_id"]] = [
            {"title": x.title, "category": x.category.value, "owner": x.owner,
             "due_date": x.due_date, "source_text": x.source_text, "evidence_verified": x.evidence_verified}
            for x in r.action_items]
        print(win["window_id"], len(preds[win["window_id"]]), "items")
    json.dump(preds, open(a.out, "w", encoding="utf-8"), indent=1)


# ---------------------------------------------------------------- score
def norm(s):
    return re.sub(r"[^a-z0-9 ]", "", s.lower())


def map_to_turn(quote, turns):
    q, best, best_i = norm(quote), 0, None
    for i, t in enumerate(turns):
        tt = norm(t["text"])
        if not tt:
            continue
        m = SequenceMatcher(None, q, tt, autojunk=False).find_longest_match(0, len(q), 0, len(tt))
        cov = m.size / max(1, min(len(q), len(tt)))
        if m.size >= 15 and cov > best:
            best, best_i = cov, i
    return best_i if best >= 0.6 else None


def load_gold(path):
    g = {}
    for r in csv.DictReader(open(path, encoding="utf-8")):
        lab = (r["label"] or "").strip().lower()
        if lab in ("unresolved_question", "q"):
            lab = "question"
        g[(r["window_id"], int(r["turn_id"]))] = lab if lab in LABELS else ""
    return g


def kappa(a, b, keys):
    cats = LABELS + [""]
    n = len(keys)
    po = sum(a[k] == b[k] for k in keys) / n
    pe = sum((sum(a[k] == c for k in keys) / n) * (sum(b[k] == c for k in keys) / n) for c in cats)
    return (po - pe) / (1 - pe) if pe < 1 else 1.0


def prf(tp, fp, fn):
    p = tp / (tp + fp) if tp + fp else 0.0
    r = tp / (tp + fn) if tp + fn else 0.0
    return p, r, (2 * p * r / (p + r) if p + r else 0.0)


def cmd_score(a):
    windows = {w["window_id"]: w for w in json.load(open(a.windows, encoding="utf-8"))}
    preds = json.load(open(a.predictions, encoding="utf-8"))
    gold = load_gold(a.gold)
    pred = {}                       # (window, turn) -> predicted category
    unmapped = 0
    for wid, items in preds.items():
        for it in items:
            ti = map_to_turn(it["source_text"], windows[wid]["turns"])
            if ti is None:
                unmapped += 1       # quote not found in transcript -> counts as a false positive
                pred[(wid, -1 - unmapped)] = it["category"].replace("unresolved_", "")
            else:
                pred[(wid, ti)] = it["category"].replace("unresolved_", "")
    gold_pos = {k: v for k, v in gold.items() if v}
    tp = [k for k in pred if k in gold_pos]
    fp = [k for k in pred if k not in gold_pos]
    fn = [k for k in gold_pos if k not in pred]
    p, r, f = prf(len(tp), len(fp), len(fn))
    print("=" * 66)
    print(f"Windows {len(windows)} | turns {sum(len(w['turns']) for w in windows.values())} | "
          f"gold outcomes {len(gold_pos)} | predicted {len(pred)}")
    print(f"DETECTION (is this turn an actionable outcome?)  P={p:.2f}  R={r:.2f}  F1={f:.2f}"
          f"   [TP {len(tp)} FP {len(fp)} FN {len(fn)}; {unmapped} quotes not found in transcript]")
    ok = sum(pred[k] == gold_pos[k] for k in tp)
    print(f"CATEGORY ACCURACY on detected outcomes: {ok}/{len(tp)} = {ok / max(1, len(tp)):.2f}")
    print("\nConfusion (rows = human gold, cols = model; 'missed' = model found nothing):")
    cols = LABELS + ["missed"]
    print(f"{'':12}" + "".join(f"{c:>12}" for c in cols))
    for g in LABELS:
        row = Counter(pred.get(k, "missed") for k, v in gold_pos.items() if v == g)
        print(f"{g:12}" + "".join(f"{row.get(c, 0):>12}" for c in cols))
    print("\nPer-class (model category vs gold, over matched+unmatched):")
    for c in LABELS:
        tpc = sum(1 for k in pred if pred[k] == c and gold_pos.get(k) == c)
        fpc = sum(1 for k in pred if pred[k] == c and gold_pos.get(k) != c)
        fnc = sum(1 for k in gold_pos if gold_pos[k] == c and pred.get(k) != c)
        pc, rc, fc = prf(tpc, fpc, fnc)
        print(f"  {c:11} P={pc:.2f} R={rc:.2f} F1={fc:.2f}  (support {tpc + fnc})")
    by = defaultdict(lambda: [0, 0, 0])
    for k in pred:
        w = windows.get(k[0], {}); s = w.get("stratum", "?")
        by[s][0 if k in gold_pos else 1] += 1
    for k in gold_pos:
        if k not in pred:
            by[windows[k[0]]["stratum"]][2] += 1
    print("\nBy stratum:")
    for s, (a_, b_, c_) in by.items():
        pp, rr, ff = prf(a_, b_, c_)
        print(f"  {s:15} P={pp:.2f} R={rr:.2f} F1={ff:.2f}")
    if a.gold1 and a.gold2:
        g1, g2 = load_gold(a.gold1), load_gold(a.gold2)
        keys = [k for k in g1 if k in g2]
        print(f"\nINTER-ANNOTATOR AGREEMENT (Cohen's kappa, {len(keys)} turns): {kappa(g1, g2, keys):.2f}"
              "   (>0.6 substantial, >0.8 near-perfect)")
    print("=" * 66)


def main():
    ap = argparse.ArgumentParser()
    sp = ap.add_subparsers(dest="cmd", required=True)
    s = sp.add_parser("sample"); s.add_argument("--qmsum", required=True)
    s.add_argument("--n", type=int, default=12); s.add_argument("--turns", type=int, default=100)
    s.add_argument("--seed", type=int, default=7)
    s.add_argument("--out", default="eval_windows.json"); s.add_argument("--sheet", default="annotation_sheet.csv")
    e = sp.add_parser("extract"); e.add_argument("--windows", required=True)
    e.add_argument("--out", default="predictions.json"); e.add_argument("--mock", action="store_true")
    c = sp.add_parser("score"); c.add_argument("--windows", required=True)
    c.add_argument("--predictions", required=True); c.add_argument("--gold", required=True)
    c.add_argument("--gold1"); c.add_argument("--gold2")
    a = ap.parse_args()
    {"sample": cmd_sample, "extract": cmd_extract, "score": cmd_score}[a.cmd](a)


if __name__ == "__main__":
    main()
