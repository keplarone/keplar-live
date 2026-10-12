# Keplar render machine: applies the job's settings to the uploaded scene before Blender renders the frames on its command line.
# Runs inside Blender (--python, before -f). The scene's own look stays as it is; only what the cloud needs changes: CPU instead
# of a GPU, the output folder and format, and the resolution and samples the person chose. Settings: $KEPLAR_RENDER_CFG (JSON).
import json
import os

import bpy

JOB = "/vercel/sandbox/job"
cfg = json.load(open(os.environ["KEPLAR_RENDER_CFG"], encoding="utf-8"))
scene = bpy.context.scene
r = scene.render

engine = cfg.get("engine")
if engine in {"CYCLES", "BLENDER_EEVEE", "BLENDER_WORKBENCH"}:
    r.engine = engine

if r.engine == "CYCLES":
    # No GPU here: Cycles renders on every CPU core. OptiX denoising needs an NVIDIA GPU, so Open Image Denoise takes its place.
    try:
        prefs = bpy.context.preferences.addons["cycles"].preferences
        prefs.compute_device_type = "NONE"
    except Exception:  # noqa: BLE001
        pass
    scene.cycles.device = "CPU"
    if getattr(scene.cycles, "denoiser", "") == "OPTIX":
        scene.cycles.denoiser = "OPENIMAGEDENOISE"
    if cfg.get("samples"):
        scene.cycles.samples = int(cfg["samples"])
elif r.engine == "BLENDER_EEVEE" and cfg.get("samples"):
    scene.eevee.taa_render_samples = int(cfg["samples"])

r.threads_mode = "AUTO"
r.resolution_percentage = int(cfg.get("resPercent") or r.resolution_percentage)
r.use_placeholder = False
r.use_overwrite = True
r.use_file_extension = True

fmt = cfg.get("format", "PNG")
img = r.image_settings
if hasattr(img, "media_type"):
    img.media_type = "IMAGE"  # Blender 5: the scene may have been set to write a video
img.file_format = fmt
if fmt == "JPEG":
    img.color_mode = "RGB"
    img.quality = 92
elif fmt == "OPEN_EXR":
    img.color_depth = "16"

os.makedirs(os.path.join(JOB, "out"), exist_ok=True)
r.filepath = os.path.join(JOB, "out", "frame_#####")
print(f"KEPLAR_SETTINGS engine={r.engine} res={r.resolution_x}x{r.resolution_y}@{r.resolution_percentage}% format={fmt}", flush=True)
