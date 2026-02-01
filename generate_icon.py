"""Generate a 128x128 store icon for LLM Time Blocker.

Design: Clean rounded-square gradient background.
Center: A clock face with a bold red prohibition slash over it.
Concept: "Your time on this site is blocked."
"""
from PIL import Image, ImageDraw
import math

SIZE = 512  # Render at 4x for quality, then downscale
FINAL = 128

img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))

# --- Gradient background (deep indigo top -> teal bottom) ---
for y in range(SIZE):
    t = y / (SIZE - 1)
    r = int(30 * (1 - t) + 10 * t)
    g = int(30 * (1 - t) + 130 * t)
    b = int(160 * (1 - t) + 170 * t)
    for x in range(SIZE):
        img.putpixel((x, y), (r, g, b, 255))

# Rounded corners
mask = Image.new("L", (SIZE, SIZE), 0)
ImageDraw.Draw(mask).rounded_rectangle([0, 0, SIZE - 1, SIZE - 1], radius=SIZE // 5, fill=255)
img.putalpha(mask)

draw = ImageDraw.Draw(img)
cx, cy = SIZE // 2, SIZE // 2

# --- Clock face ---
clock_r = int(SIZE * 0.28)

# Outer ring of clock (white, thick)
ring_w = int(SIZE * 0.025)
draw.ellipse(
    [cx - clock_r, cy - clock_r, cx + clock_r, cy + clock_r],
    outline=(255, 255, 255, 230),
    width=ring_w,
)

# Clock face fill (very subtle)
clock_bg = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
ImageDraw.Draw(clock_bg).ellipse(
    [cx - clock_r + ring_w, cy - clock_r + ring_w,
     cx + clock_r - ring_w, cy + clock_r - ring_w],
    fill=(255, 255, 255, 30),
)
img = Image.alpha_composite(img, clock_bg)
draw = ImageDraw.Draw(img)

# Hour markers (12 small dots)
for i in range(12):
    angle = math.radians(i * 30 - 90)
    marker_r = clock_r - int(SIZE * 0.04)
    mx = cx + marker_r * math.cos(angle)
    my = cy + marker_r * math.sin(angle)
    dot_size = int(SIZE * 0.012) if i % 3 != 0 else int(SIZE * 0.018)
    draw.ellipse(
        [mx - dot_size, my - dot_size, mx + dot_size, my + dot_size],
        fill=(255, 255, 255, 200),
    )

# Hour hand (pointing to ~10)
h_angle = math.radians(10 * 30 - 90)  # 10 o'clock
h_len = clock_r * 0.5
draw.line(
    [(cx, cy), (cx + h_len * math.cos(h_angle), cy + h_len * math.sin(h_angle))],
    fill=(255, 255, 255, 220),
    width=int(SIZE * 0.025),
)

# Minute hand (pointing to 2)
m_angle = math.radians(2 * 30 - 90)  # 2 o'clock position (10 min)
m_len = clock_r * 0.7
draw.line(
    [(cx, cy), (cx + m_len * math.cos(m_angle), cy + m_len * math.sin(m_angle))],
    fill=(255, 255, 255, 220),
    width=int(SIZE * 0.018),
)

# Center cap
cap_r = int(SIZE * 0.02)
draw.ellipse(
    [cx - cap_r, cy - cap_r, cx + cap_r, cy + cap_r],
    fill=(255, 255, 255, 240),
)

# --- Red prohibition circle + slash ---
ban_r = int(SIZE * 0.36)
ban_w = int(SIZE * 0.045)
red = (230, 55, 55, 255)

# Red circle
draw.ellipse(
    [cx - ban_r, cy - ban_r, cx + ban_r, cy + ban_r],
    outline=red,
    width=ban_w,
)

# Diagonal slash (top-right to bottom-left)
slash_angle = math.radians(45)
inner_r = ban_r - ban_w // 2 + 2
x1 = cx + inner_r * math.cos(slash_angle)
y1 = cy - inner_r * math.sin(slash_angle)
x2 = cx - inner_r * math.cos(slash_angle)
y2 = cy + inner_r * math.sin(slash_angle)
draw.line([(x1, y1), (x2, y2)], fill=red, width=ban_w)

# --- Downscale with high-quality resampling ---
img = img.resize((FINAL, FINAL), Image.LANCZOS)

# --- Save ---
output = "/home/user/llm_time_blocker/extension/assets/icons/icon128_store.png"
img.save(output, "PNG")
print(f"Saved {FINAL}x{FINAL} to {output}")
