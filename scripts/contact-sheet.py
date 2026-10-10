import sys
from PIL import Image
# usage: sheet.py in.png out_prefix width chunk_h cols
src, outp, w, ch, cols = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5])
im = Image.open(src).convert("RGB")
s = w / im.width
im = im.resize((w, int(im.height * s)), Image.LANCZOS)
chunks = [im.crop((0, y, w, min(y + ch, im.height))) for y in range(0, im.height, ch)]
per = cols
for i in range(0, len(chunks), per):
    grp = chunks[i:i+per]
    sheet = Image.new("RGB", (len(grp) * (w + 8), ch), (255, 0, 255))
    for j, c in enumerate(grp):
        sheet.paste(c, (j * (w + 8), 0))
    sheet.save(f"{outp}-{i//per}.png")
    print(f"{outp}-{i//per}.png")
