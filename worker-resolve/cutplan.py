"""
Cut planning — pure, deterministic, and unit-testable (no DaVinci Resolve here).

The golden rule from the engineering handoff (§5): keep each take whole and trim
ONLY inside the silence between sentences. Never splice inside a spoken phrase —
that is what produces mid-word cuts.

Input  : per-clip word cues  [{text, start, end}]  (seconds, within the clip)
Output : a list of Segment(in_s, out_s) per clip — the keep ranges, with IN/OUT
         landing inside silence gaps, padded a few frames into the pause.

This module knows nothing about Resolve frames/timecode; the runner converts
seconds → frames. That keeps the hard logic testable in plain Python.
"""

from __future__ import annotations
from dataclasses import dataclass
from typing import List, Dict, Optional


@dataclass
class Word:
    text: str
    start: float
    end: float


@dataclass
class Segment:
    in_s: float
    out_s: float


# Tunables (seconds). A "silence gap" is a pause between consecutive words long
# enough to cut in. Pads keep the cut a hair inside the pause so we never clip
# the first/last phoneme.
MIN_GAP = 0.35          # gap >= this counts as a sentence pause we may cut at
HEAD_PAD = 0.12         # keep this much silence before the first kept word
TAIL_PAD = 0.20         # keep this much silence after the last kept word
LEAD_TRIM_MAX = 1.5     # never trim more than this much leading silence


def _to_words(cues: List[Dict]) -> List[Word]:
    out = [Word(str(c.get("text", "")).strip(), float(c["start"]), float(c["end"]))
           for c in cues if c.get("end", 0) > c.get("start", 0)]
    out.sort(key=lambda w: w.start)
    return out


def find_gaps(cues, min_gap: float = MIN_GAP) -> List[Dict]:
    """Silence gaps between consecutive words: {start, end, dur}.
    Accepts either raw cue dicts or Word objects."""
    words = cues if cues and isinstance(cues[0], Word) else _to_words(cues)
    gaps = []
    for a, b in zip(words, words[1:]):
        dur = b.start - a.end
        if dur >= min_gap:
            gaps.append({"start": a.end, "end": b.start, "dur": dur})
    return gaps


# Markers that signal a flubbed take we should drop when a better one exists.
RESTART_MARKERS = (
    "let me restart", "let me start over", "excuse me", "sorry", "can we",
    "one more time", "take two", "let's redo", "scratch that", "um wait",
)


def take_score(cues: List[Dict]) -> float:
    """Higher = cleaner/more complete take. Used to pick among repeated answers."""
    words = _to_words(cues)
    if not words:
        return 0.0
    text = " ".join(w.text for w in words).lower()
    penalty = sum(3.0 for m in RESTART_MARKERS if m in text)
    # Favour longer, more-complete answers; penalise restart markers.
    return len(words) - penalty


def plan_clip(
    cues: List[Dict],
    *,
    mode: str = "auto",          # "auto" (monologue) | "auto_answer" (Q&A)
) -> Optional[Segment]:
    """
    Choose one keep-range for a clip.

    - auto         : trim leading/trailing silence only; keep the whole take.
    - auto_answer  : additionally skip the interviewer's question at the head —
                     drop everything before the FIRST gap that follows the first
                     speech burst (a proxy for "first answer word") so the
                     question is cut but the answer runs to the end.
    """
    words = _to_words(cues)
    if not words:
        return None

    first_in = max(0.0, words[0].start - HEAD_PAD)
    # Don't trim more than LEAD_TRIM_MAX of dead air at the very start.
    first_in = max(first_in, words[0].start - LEAD_TRIM_MAX)
    last_out = words[-1].end + TAIL_PAD

    if mode == "auto_answer":
        gaps = find_gaps(cues)
        if gaps:
            # Head-trim to just after the first sizeable pause = start of the
            # answer (the interviewer's question sits before it).
            answer_start = gaps[0]["end"] - HEAD_PAD
            # Guard: only skip if the question is a meaningful chunk (>0.8s).
            if gaps[0]["start"] > 0.8:
                first_in = max(first_in, answer_start)

    if last_out <= first_in:
        return None
    return Segment(in_s=round(first_in, 3), out_s=round(last_out, 3))


def verify_no_midword(segment: Segment, cues: List[Dict]) -> List[str]:
    """
    Re-check (handoff §6 step 7): a cut must not land inside a word. Returns a
    list of warnings — empty means the cut sits cleanly in silence.
    """
    warnings = []
    for c in cues:
        s, e = float(c["start"]), float(c["end"])
        # A boundary lands inside this word if it's strictly between s and e.
        for boundary, label in ((segment.in_s, "IN"), (segment.out_s, "OUT")):
            if s < boundary < e:
                warnings.append(f"{label} cut at {boundary:.2f}s splits word '{c.get('text','')}'")
    return warnings


def plan_timeline(clips: List[Dict]) -> List[Dict]:
    """
    Build the full cut list from the edit plan's timeline entries.

    Each clip dict: {source, cues:[...], trim:'auto'|'auto_answer', take_group?}
    Clips sharing a take_group are competing takes — only the best is kept.

    Returns ordered entries: {source, in_s, out_s, warnings:[...]}
    """
    # Resolve repeated takes: keep the highest-scoring per take_group.
    best_in_group: Dict[str, float] = {}
    for c in clips:
        g = c.get("take_group")
        if g is None:
            continue
        sc = take_score(c.get("cues", []))
        if g not in best_in_group or sc > best_in_group[g]:
            best_in_group[g] = sc

    out = []
    for c in clips:
        g = c.get("take_group")
        if g is not None and take_score(c.get("cues", [])) < best_in_group[g]:
            continue  # a better take in this group wins
        seg = plan_clip(c.get("cues", []), mode=c.get("trim", "auto"))
        if seg is None:
            continue
        out.append({
            "source": c.get("source"),
            "in_s": seg.in_s,
            "out_s": seg.out_s,
            "warnings": verify_no_midword(seg, c.get("cues", [])),
        })
    return out
