"""Plain-python tests for the cut planner. Run: python3 test_cutplan.py"""
from cutplan import plan_clip, plan_timeline, find_gaps, take_score, verify_no_midword


def words(*triples):
    return [{"text": t, "start": s, "end": e} for (t, s, e) in triples]


def test_monologue_trims_only_edges():
    cues = words(("hello", 1.0, 1.4), ("there", 1.5, 1.9), ("friends", 2.0, 2.6))
    seg = plan_clip(cues, mode="auto")
    assert seg is not None
    # Keeps the whole take; trims only leading/trailing silence (with pads).
    assert 0.8 <= seg.in_s <= 1.0, seg.in_s
    assert 2.6 < seg.out_s <= 2.9, seg.out_s
    assert verify_no_midword(seg, cues) == []


def test_qa_head_trims_question():
    # Interviewer question 0..2.0, big pause, then answer from 3.0.
    cues = words(("whats", 0.2, 0.5), ("your", 0.6, 0.9), ("advice", 1.0, 1.6),
                 ("well", 3.0, 3.3), ("i", 3.4, 3.5), ("think", 3.6, 4.0))
    seg = plan_clip(cues, mode="auto_answer")
    assert seg is not None
    # IN should jump past the question into the answer (~3.0), not start at 0.2.
    assert seg.in_s >= 2.5, seg.in_s
    assert verify_no_midword(seg, cues) == []


def test_gaps_detection():
    cues = words(("a", 0.0, 0.4), ("b", 0.5, 0.9), ("c", 2.0, 2.4))
    gaps = find_gaps(cues)
    assert len(gaps) == 1
    assert abs(gaps[0]["dur"] - 1.1) < 1e-6


def test_take_selection_drops_flubbed():
    good = words(("here", 0.0, 0.4), ("is", 0.5, 0.7), ("the", 0.8, 1.0),
                 ("answer", 1.1, 1.6), ("clearly", 1.7, 2.2))
    flub = words(("sorry", 0.0, 0.4), ("let", 0.5, 0.7), ("me", 0.8, 1.0),
                 ("restart", 1.1, 1.6))
    assert take_score(good) > take_score(flub)
    plan = plan_timeline([
        {"source": "good.mov", "cues": good, "trim": "auto", "take_group": "q1"},
        {"source": "flub.mov", "cues": flub, "trim": "auto", "take_group": "q1"},
    ])
    sources = [p["source"] for p in plan]
    assert sources == ["good.mov"], sources


def test_no_midword_warns():
    cues = words(("hello", 1.0, 2.0))
    # A segment whose OUT lands at 1.5 cuts mid-word -> warning.
    from cutplan import Segment
    w = verify_no_midword(Segment(0.9, 1.5), cues)
    assert w and "OUT" in w[0]


if __name__ == "__main__":
    fns = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    for fn in fns:
        fn()
        print(f"ok  {fn.__name__}")
    print(f"\n{len(fns)} passed")
