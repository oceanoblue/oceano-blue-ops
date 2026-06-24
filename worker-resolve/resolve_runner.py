"""
DaVinci Resolve driver. This is the only module that touches Resolve, and the
only part that cannot run in this cloud repo — it must be validated on the Mac
that has Resolve Studio (External scripting = Local) installed.

Design follows the engineering handoff:
 - set project resolution/fps BEFORE creating any timeline (fps locks after)
 - import footage, build the timeline from the cut plan's IN/OUT (seconds→frames)
 - apply one consistent crop per take (chest-up framing)
 - render to MP4/H.264 via the API (no Deliver-page clicking)

Transcription uses Resolve Studio's built-in Create Subtitles From Audio to get
phrase cues; if unavailable, we fall back to keeping whole clips (no mid-clip
trims) so a render still happens.
"""
from __future__ import annotations
import os
import sys
import time
from typing import List, Dict, Optional, Tuple

from cutplan import plan_timeline


def get_resolve():
    """Connect to a running Resolve. Raises RuntimeError if not reachable."""
    # The Resolve Python module is provided by the install; add its path.
    mod_dir = os.environ.get(
        "RESOLVE_SCRIPT_API",
        "/Library/Application Support/Blackmagic Design/DaVinci Resolve/Developer/Scripting",
    )
    libs = os.path.join(mod_dir, "Modules")
    if libs not in sys.path:
        sys.path.append(libs)
    try:
        import DaVinciResolveScript as dvr  # type: ignore
    except Exception as e:  # pragma: no cover - Mac-only
        raise RuntimeError(f"DaVinciResolveScript not importable: {e}")
    resolve = dvr.scriptapp("Resolve")
    if resolve is None:
        raise RuntimeError("Resolve not running / external scripting disabled")
    return resolve


def _aspect_to_wh(aspect: str) -> Tuple[int, int]:
    try:
        w, h = aspect.lower().split("x")
        return int(w), int(h)
    except Exception:
        return 1080, 1920


def _crop_for(reel_type: str) -> Dict[str, float]:
    # Per-take framing from the handoff; a sensible default per format.
    if reel_type == "qa":
        return {"ZoomX": 1.4, "ZoomY": 1.4, "Pan": 0.0, "Tilt": 60.0}
    return {"ZoomX": 1.0, "ZoomY": 1.0, "Pan": 0.0, "Tilt": 0.0}


def transcribe_clip(resolve, media_item, fps: int) -> List[Dict]:
    """Best-effort phrase cues for one clip via a scratch timeline. [] on failure."""
    try:  # pragma: no cover - Mac-only
        pm = resolve.GetProjectManager().GetCurrentProject()
        mp = pm.GetMediaPool()
        tl = mp.CreateTimelineFromClips("__scratch_stt__", [media_item])
        if not tl:
            return []
        ok = tl.CreateSubtitlesFromAudio() if hasattr(tl, "CreateSubtitlesFromAudio") else False
        cues: List[Dict] = []
        if ok:
            n = tl.GetTrackCount("subtitle")
            origin = 0  # subtitle starts are absolute; normalise by timeline start
            start_tc = tl.GetStartFrame()
            for ti in range(1, n + 1):
                for it in tl.GetItemListInTrack("subtitle", ti) or []:
                    s = (it.GetStart() - start_tc) / fps
                    e = (it.GetEnd() - start_tc) / fps
                    cues.append({"text": it.GetName(), "start": s, "end": e})
        # Clean up scratch timeline.
        try:
            mp.DeleteTimelines([tl])
        except Exception:
            pass
        return cues
    except Exception:
        return []


def build_and_render(
    ctx: dict,
    footage_paths: Dict[str, str],
    out_dir: str,
    render_format: str = "mp4",
    render_codec: str = "H264",
) -> Tuple[str, float]:
    """
    Build the timeline from ctx (brief + edit_plan + footage) and render an MP4.
    Returns (render_path, duration_seconds).
    """  # pragma: no cover - Mac-only
    resolve = get_resolve()
    brief = ctx.get("brief") or {}
    plan = ctx.get("edit_plan") or {}
    aspect = brief.get("aspect") or plan.get("aspect") or "1080x1920"
    reel_type = brief.get("reel_type") or plan.get("reel_type") or "monologue"
    width, height = _aspect_to_wh(aspect)
    fps = 30

    pm = resolve.GetProjectManager()
    proj = pm.CreateProject(f"oceano_{ctx.get('edit_job_id','job')[:8]}") or pm.GetCurrentProject()
    # fps must be set before any timeline exists.
    proj.SetSetting("timelineFrameRate", str(fps))
    proj.SetSetting("timelineResolutionWidth", str(width))
    proj.SetSetting("timelineResolutionHeight", str(height))

    mp = proj.GetMediaPool()
    ms = resolve.GetMediaStorage()
    # Import all footage; map filename -> media pool item.
    ms.AddItemListToMediaPool(list(footage_paths.values()))
    root = mp.GetRootFolder()
    by_name = {}
    for it in root.GetClipList() or []:
        by_name[it.GetName()] = it

    # Transcribe each source so we can plan cuts on real word timing.
    timeline_entries = plan.get("timeline") or []
    clips_for_plan = []
    for entry in timeline_entries:
        src = entry.get("source")
        item = by_name.get(os.path.basename(footage_paths.get(src, src or "")))
        cues = transcribe_clip(resolve, item, fps) if item else []
        clips_for_plan.append({
            "source": src,
            "cues": cues,
            "trim": entry.get("trim", "auto"),
            "take_group": entry.get("take_group"),
        })

    cut_list = plan_timeline(clips_for_plan)

    # Build the final timeline from the cut list.
    timeline = mp.CreateEmptyTimeline(f"oceano_reel_{ctx.get('order_id','')[:8]}")
    proj.SetCurrentTimeline(timeline)
    record = timeline.GetStartFrame()
    crop = _crop_for(reel_type)
    total_frames = 0
    for c in cut_list:
        item = by_name.get(os.path.basename(footage_paths.get(c["source"], c["source"] or "")))
        if not item:
            continue
        clip_fps = float(item.GetClipProperty("FPS") or fps)
        in_f = int(round(c["in_s"] * clip_fps))
        out_f = int(round(c["out_s"] * clip_fps))
        dur_tl = int(round((c["out_s"] - c["in_s"]) * fps))
        appended = mp.AppendToTimeline([{
            "mediaPoolItem": item,
            "startFrame": in_f,
            "endFrame": out_f,
            "recordFrame": record,
            "trackIndex": 1,
            "mediaType": 1,
        }])
        # Apply consistent crop on the appended item.
        if appended:
            ti = appended[0]
            for k, v in crop.items():
                try:
                    ti.SetProperty(k, v)
                except Exception:
                    pass
        record += dur_tl
        total_frames += dur_tl

    # Render to MP4/H.264.
    os.makedirs(out_dir, exist_ok=True)
    proj.SetCurrentRenderFormatAndCodec(render_format, render_codec)
    proj.SetRenderSettings({
        "TargetDir": out_dir,
        "CustomName": f"reel_{ctx.get('order_id','')[:8]}",
        "FormatWidth": width,
        "FormatHeight": height,
    })
    job_id = proj.AddRenderJob()
    proj.StartRendering([job_id])
    while proj.IsRenderingInProgress():
        time.sleep(2)

    # Find the produced file.
    out_path = None
    for f in sorted(os.listdir(out_dir)):
        if f.startswith(f"reel_{ctx.get('order_id','')[:8]}") and f.lower().endswith(f".{render_format}"):
            out_path = os.path.join(out_dir, f)
    if not out_path:
        raise RuntimeError("render produced no output file")
    return out_path, total_frames / fps
