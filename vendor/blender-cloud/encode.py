# Keplar render machine: joins the rendered frames into out/video.mp4 (H.264) with Blender's own video editor.
# Runs as `blender -b --factory-startup --python encode.py` after the frames are done. Settings: $KEPLAR_RENDER_CFG (JSON).
import glob
import json
import os

import bpy

JOB = "/vercel/sandbox/job"
OUT = os.path.join(JOB, "out")
cfg = json.load(open(os.environ["KEPLAR_RENDER_CFG"], encoding="utf-8"))
frames = sorted(glob.glob(os.path.join(OUT, "frame_*.png")) + glob.glob(os.path.join(OUT, "frame_*.jpg")))
if not frames:
    raise SystemExit("No frames to join.")

scene = bpy.context.scene
first = bpy.data.images.load(frames[0])
w, h = first.size
scene.render.resolution_x, scene.render.resolution_y, scene.render.resolution_percentage = w - w % 2, h - h % 2, 100
fps = max(1, min(240, int(round(float(cfg.get("fps") or 24)))))
scene.render.fps, scene.render.fps_base = fps, 1.0

ed = scene.sequence_editor_create()
coll = ed.strips if hasattr(ed, "strips") else ed.sequences  # Blender 5 renamed sequences to strips
strip = coll.new_image(name="frames", filepath=frames[0], channel=1, frame_start=1)
for f in frames[1:]:
    strip.elements.append(os.path.basename(f))
scene.frame_start, scene.frame_end = 1, len(frames)

img = scene.render.image_settings
if hasattr(img, "media_type"):
    img.media_type = "VIDEO"
img.file_format = "FFMPEG"
ff = scene.render.ffmpeg
ff.format = "MPEG4"
ff.codec = "H264"
ff.constant_rate_factor = "HIGH"
ff.audio_codec = "NONE"
scene.render.use_file_extension = False
scene.render.filepath = os.path.join(OUT, "video.mp4")
bpy.ops.render.render(animation=True)
print("KEPLAR_VIDEO", os.path.getsize(os.path.join(OUT, "video.mp4")), flush=True)
