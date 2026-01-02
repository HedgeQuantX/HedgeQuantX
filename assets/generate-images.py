#!/usr/bin/env python3
"""
Generate HIGH QUALITY PNG images for HQX-CLI README
Exact CLI colors and box characters
Uses 2x supersampling for crisp text rendering
"""

from PIL import Image, ImageDraw, ImageFont
import os

# Exact CLI colors (matching chalk.js)
BG = (13, 17, 23)            # GitHub dark background
CYAN = (0, 255, 255)         # chalk.cyan
YELLOW = (255, 255, 0)       # chalk.yellow
GREEN = (0, 255, 0)          # chalk.green
WHITE = (255, 255, 255)      # chalk.white
RED = (255, 0, 0)            # chalk.red
MAGENTA = (255, 0, 255)      # chalk.magenta

# Box drawing characters (from ui.js)
# ╔ ╗ ╚ ╝ ║ ═ ╠ ╣ ╤ ╧ ╪ │

# Quality settings
SCALE = 2  # Supersampling factor for crisp rendering
BASE_FONT_SIZE = 24  # Larger base font for better quality

def get_font(size):
    paths = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf",
    ]
    for p in paths:
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()

def make_image(lines, filename, font_size=None):
    """Create HIGH QUALITY PNG from colored text lines using supersampling"""
    if font_size is None:
        font_size = BASE_FONT_SIZE
    
    # Render at 2x size for supersampling
    render_size = font_size * SCALE
    font = get_font(render_size)
    lh = int(render_size * 1.3)  # Line height
    px, py = 40 * SCALE, 30 * SCALE  # Padding
    
    # Calculate dimensions
    max_w = 0
    for segs in lines:
        w = sum(font.getbbox(t)[2] for t, c in segs)
        max_w = max(max_w, w)
    
    W = max_w + px * 2
    H = len(lines) * lh + py * 2
    
    # Create high-res image
    img = Image.new('RGB', (W, H), BG)
    draw = ImageDraw.Draw(img)
    
    # Draw text
    y = py
    for segs in lines:
        x = px
        for txt, col in segs:
            draw.text((x, y), txt, font=font, fill=col)
            x += font.getbbox(txt)[2]
        y += lh
    
    # Downsample for antialiasing (high quality resize)
    final_w = W // SCALE
    final_h = H // SCALE
    img = img.resize((final_w, final_h), Image.LANCZOS)
    
    # Save with high quality
    img.save(f'/root/HQX-CLI/assets/{filename}', 'PNG', optimize=False)
    print(f"✓ {filename} ({final_w}x{final_h})")


def gen_logo():
    """Logo only - HEDGEQUANT in cyan, X in yellow"""
    lines = [
        [("██╗  ██╗███████╗██████╗  ██████╗ ███████╗ ██████╗ ██╗   ██╗ █████╗ ███╗   ██╗████████╗", CYAN), ("██╗  ██╗", YELLOW)],
        [("██║  ██║██╔════╝██╔══██╗██╔════╝ ██╔════╝██╔═══██╗██║   ██║██╔══██╗████╗  ██║╚══██╔══╝", CYAN), ("╚██╗██╔╝", YELLOW)],
        [("███████║█████╗  ██║  ██║██║  ███╗█████╗  ██║   ██║██║   ██║███████║██╔██╗ ██║   ██║   ", CYAN), (" ╚███╔╝ ", YELLOW)],
        [("██╔══██║██╔══╝  ██║  ██║██║   ██║██╔══╝  ██║▄▄ ██║██║   ██║██╔══██║██║╚██╗██║   ██║   ", CYAN), (" ██╔██╗ ", YELLOW)],
        [("██║  ██║███████╗██████╔╝╚██████╔╝███████╗╚██████╔╝╚██████╔╝██║  ██║██║ ╚████║   ██║   ", CYAN), ("██╔╝ ██╗", YELLOW)],
        [("╚═╝  ╚═╝╚══════╝╚═════╝  ╚═════╝ ╚══════╝ ╚══▀▀═╝  ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═══╝   ╚═╝   ", CYAN), ("╚═╝  ╚═╝", YELLOW)],
    ]
    make_image(lines, "logo.png", 28)


def gen_dashboard():
    """Dashboard with correct box characters"""
    # Width = 96 inner + 2 borders = 98 total
    W = 96
    H = "═" * W
    
    lines = [
        [("╔" + H + "╗", CYAN)],
        [("║ ", CYAN), ("██╗  ██╗███████╗██████╗  ██████╗ ███████╗ ██████╗ ██╗   ██╗ █████╗ ███╗   ██╗████████╗", CYAN), ("██╗  ██╗", YELLOW), (" ║", CYAN)],
        [("║ ", CYAN), ("██║  ██║██╔════╝██╔══██╗██╔════╝ ██╔════╝██╔═══██╗██║   ██║██╔══██╗████╗  ██║╚══██╔══╝", CYAN), ("╚██╗██╔╝", YELLOW), (" ║", CYAN)],
        [("║ ", CYAN), ("███████║█████╗  ██║  ██║██║  ███╗█████╗  ██║   ██║██║   ██║███████║██╔██╗ ██║   ██║   ", CYAN), (" ╚███╔╝ ", YELLOW), (" ║", CYAN)],
        [("║ ", CYAN), ("██╔══██║██╔══╝  ██║  ██║██║   ██║██╔══╝  ██║▄▄ ██║██║   ██║██╔══██║██║╚██╗██║   ██║   ", CYAN), (" ██╔██╗ ", YELLOW), (" ║", CYAN)],
        [("║ ", CYAN), ("██║  ██║███████╗██████╔╝╚██████╔╝███████╗╚██████╔╝╚██████╔╝██║  ██║██║ ╚████║   ██║   ", CYAN), ("██╔╝ ██╗", YELLOW), (" ║", CYAN)],
        [("║ ", CYAN), ("╚═╝  ╚═╝╚══════╝╚═════╝  ╚═════╝ ╚══════╝ ╚══▀▀═╝  ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═══╝   ╚═╝   ", CYAN), ("╚═╝  ╚═╝", YELLOW), (" ║", CYAN)],
        [("╠" + H + "╣", CYAN)],
        [("║                               ", CYAN), ("Prop Futures Algo Trading  v2.3.4", WHITE), ("                               ║", CYAN)],
        [("╠" + H + "╣", CYAN)],
        [("║                                      ", CYAN), ("Welcome, HQX Trader!", YELLOW), ("                                      ║", CYAN)],
        [("╠" + H + "╣", CYAN)],
        [("║                               ", CYAN), ("● ", GREEN), ("TopStep", WHITE), ("    ", CYAN), ("● ", GREEN), ("Apex Trader Funding", WHITE), ("                               ║", CYAN)],
        [("╠" + H + "╣", CYAN)],
        [("║        ", CYAN), ("✔ ", YELLOW), ("Connections: ", WHITE), ("2", GREEN), ("    ", CYAN), ("✔ ", YELLOW), ("Accounts: ", WHITE), ("2", GREEN), ("    ", CYAN), ("✔ ", YELLOW), ("Balance: ", WHITE), ("$449,682", GREEN), ("    ", CYAN), ("✔ ", YELLOW), ("P&L: ", WHITE), ("+$1,250", GREEN), ("         ║", CYAN)],
        [("╠" + H + "╣", CYAN)],
        [("║  ", CYAN), ("[1] View Accounts", CYAN), ("                             ", CYAN), ("[2] View Stats", CYAN), ("                                  ║", CYAN)],
        [("║  ", CYAN), ("[+] Add Prop-Account", CYAN), ("                          ", CYAN), ("[A] Algo-Trading", MAGENTA), ("                                ║", CYAN)],
        [("║  ", CYAN), ("[U] Update HQX", YELLOW), ("                                ", CYAN), ("[X] Disconnect", RED), ("                                  ║", CYAN)],
        [("╚" + H + "╝", CYAN)],
    ]
    make_image(lines, "dashboard.png")


def gen_algo():
    """Algo trading with correct separators: ╤ ╧ ╪ │"""
    W = 96
    H = "═" * W
    # Two columns: left=47, separator=1, right=48
    L = "═" * 47
    R = "═" * 48
    
    lines = [
        [("╔" + H + "╗", CYAN)],
        [("║                                        ", CYAN), ("HQX ALGO TRADING", YELLOW), ("                                        ║", CYAN)],
        # ╤ = top T with single down
        [("╠" + L + "╤" + R + "╣", CYAN)],
        [("║ ", CYAN), ("Account: ", WHITE), ("HQX *****", CYAN), ("                              ", CYAN), ("│", CYAN), (" Symbol: ", WHITE), ("ES Mar26", YELLOW), ("                               ║", CYAN)],
        # ╪ = cross with single vertical
        [("╠" + L + "╪" + R + "╣", CYAN)],
        [("║ ", CYAN), ("Qty: ", WHITE), ("1", GREEN), ("                                        ", CYAN), ("│", CYAN), (" P&L: ", WHITE), ("+$125.00", GREEN), ("                                ║", CYAN)],
        [("║ ", CYAN), ("Target: ", WHITE), ("$200.00", GREEN), ("                                ", CYAN), ("│", CYAN), (" Risk: ", WHITE), ("$100.00", RED), ("                                 ║", CYAN)],
        [("║ ", CYAN), ("Trades: ", WHITE), ("3", WHITE), ("  W/L: ", WHITE), ("2", GREEN), ("/", WHITE), ("1", RED), ("                          ", CYAN), ("│", CYAN), (" Latency: ", WHITE), ("45ms", GREEN), ("                               ║", CYAN)],
        # ╧ = bottom T with single up
        [("╠" + L + "╧" + R + "╣", CYAN)],
        [("║ ", CYAN), ("BUY  ", GREEN), (" 12:34:56  Filled +1 ES @ 5125.50                                                ", WHITE), ("║", CYAN)],
        [("║ ", CYAN), ("SELL ", RED), (" 12:35:12  Filled -1 ES @ 5126.25                                                ", WHITE), ("║", CYAN)],
        [("║ ", CYAN), ("WIN  ", GREEN), (" 12:35:12  Position closed +$75.00                                               ", WHITE), ("║", CYAN)],
        [("║ ", CYAN), ("INFO ", WHITE), (" 12:35:15  Waiting for next signal...                                            ", WHITE), ("║", CYAN)],
        [("╠" + H + "╣", CYAN)],
        [("║                                    ", CYAN), ("Press ", WHITE), ("[X]", RED), (" to stop trading", WHITE), ("                                   ║", CYAN)],
        [("╚" + H + "╝", CYAN)],
    ]
    make_image(lines, "algo-trading.png")


def gen_copy():
    """Copy trading with correct separators"""
    W = 96
    H = "═" * W
    L = "═" * 47
    R = "═" * 48
    
    lines = [
        [("╔" + H + "╗", CYAN)],
        [("║                                          ", CYAN), ("COPY TRADING", YELLOW), ("                                          ║", CYAN)],
        [("╠" + L + "╤" + R + "╣", CYAN)],
        [("║ ", CYAN), ("LEAD: ", WHITE), ("Apex *****", MAGENTA), ("                             ", CYAN), ("│", CYAN), (" FOLLOWER: ", WHITE), ("TopStep *****", MAGENTA), ("                       ║", CYAN)],
        [("╠" + L + "╪" + R + "╣", CYAN)],
        [("║ ", CYAN), ("Symbol: ", WHITE), ("NQ Mar26", YELLOW), ("                              ", CYAN), ("│", CYAN), (" Symbol: ", WHITE), ("NQ Mar26", YELLOW), ("                               ║", CYAN)],
        [("║ ", CYAN), ("Qty: ", WHITE), ("1", GREEN), ("                                        ", CYAN), ("│", CYAN), (" Qty: ", WHITE), ("1", GREEN), ("                                         ║", CYAN)],
        [("║ ", CYAN), ("P&L: ", WHITE), ("+$180.00", GREEN), ("                                 ", CYAN), ("│", CYAN), (" P&L: ", WHITE), ("+$175.00", GREEN), ("                                 ║", CYAN)],
        [("╠" + L + "╪" + R + "╣", CYAN)],
        [("║ ", CYAN), ("Target: ", WHITE), ("$400.00", GREEN), ("                                ", CYAN), ("│", CYAN), (" Risk: ", WHITE), ("$200.00", RED), ("                                  ║", CYAN)],
        [("╠" + L + "╧" + R + "╣", CYAN)],
        [("║ ", CYAN), ("BUY  ", GREEN), (" 12:34:56  Lead opened +1 NQ @ 18250.25                                          ", WHITE), ("║", CYAN)],
        [("║ ", CYAN), ("BUY  ", GREEN), (" 12:34:56  Follower copied +1 NQ @ 18250.50                                      ", WHITE), ("║", CYAN)],
        [("╠" + H + "╣", CYAN)],
        [("║                                    ", CYAN), ("Press ", WHITE), ("[X]", RED), (" to stop trading", WHITE), ("                                   ║", CYAN)],
        [("╚" + H + "╝", CYAN)],
    ]
    make_image(lines, "copy-trading.png")


if __name__ == '__main__':
    gen_logo()
    gen_dashboard()
    gen_algo()
    gen_copy()
    print("\n✓ All images regenerated with correct box characters!")
