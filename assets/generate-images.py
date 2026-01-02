#!/usr/bin/env python3
"""
Generate PNG images for HQX-CLI README
Exact CLI colors from chalk
"""

from PIL import Image, ImageDraw, ImageFont
import os

# Exact CLI colors (matching chalk.js)
BG = (13, 17, 23)            # GitHub dark background
CYAN = (0, 255, 255)         # chalk.cyan - borders, HEDGEQUANT part of logo
YELLOW = (255, 255, 0)       # chalk.yellow - X part of logo, Welcome, ✔ icons, [U]
GREEN = (0, 255, 0)          # chalk.green - ● dots, balance, positive P&L
WHITE = (255, 255, 255)      # chalk.white - regular text
GRAY = (128, 128, 128)       # chalk.gray
RED = (255, 0, 0)            # chalk.red - [X] Disconnect, negative P&L
MAGENTA = (255, 0, 255)      # chalk.magenta - [A] Algo-Trading

def get_font(size):
    paths = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf",
    ]
    for p in paths:
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()

def make_image(lines, filename, font_size=14):
    """Create PNG from colored text lines"""
    font = get_font(font_size)
    lh = font_size + 5  # line height
    px, py = 20, 15     # padding
    
    # Calculate dimensions
    max_w = 0
    for segs in lines:
        w = sum(font.getbbox(t)[2] for t, c in segs)
        max_w = max(max_w, w)
    
    W = max_w + px * 2
    H = len(lines) * lh + py * 2
    
    img = Image.new('RGB', (W, H), BG)
    draw = ImageDraw.Draw(img)
    
    y = py
    for segs in lines:
        x = px
        for txt, col in segs:
            draw.text((x, y), txt, font=font, fill=col)
            x += font.getbbox(txt)[2]
        y += lh
    
    img.save(f'/root/HQX-CLI/assets/{filename}')
    print(f"✓ {filename}")

# ============================================================
# LOGO - Just the ASCII art logo
# ============================================================
def gen_logo():
    lines = [
        [("██╗  ██╗███████╗██████╗  ██████╗ ███████╗ ██████╗ ██╗   ██╗ █████╗ ███╗   ██╗████████╗", CYAN), ("██╗  ██╗", YELLOW)],
        [("██║  ██║██╔════╝██╔══██╗██╔════╝ ██╔════╝██╔═══██╗██║   ██║██╔══██╗████╗  ██║╚══██╔══╝", CYAN), ("╚██╗██╔╝", YELLOW)],
        [("███████║█████╗  ██║  ██║██║  ███╗█████╗  ██║   ██║██║   ██║███████║██╔██╗ ██║   ██║   ", CYAN), (" ╚███╔╝ ", YELLOW)],
        [("██╔══██║██╔══╝  ██║  ██║██║   ██║██╔══╝  ██║▄▄ ██║██║   ██║██╔══██║██║╚██╗██║   ██║   ", CYAN), (" ██╔██╗ ", YELLOW)],
        [("██║  ██║███████╗██████╔╝╚██████╔╝███████╗╚██████╔╝╚██████╔╝██║  ██║██║ ╚████║   ██║   ", CYAN), ("██╔╝ ██╗", YELLOW)],
        [("╚═╝  ╚═╝╚══════╝╚═════╝  ╚═════╝ ╚══════╝ ╚══▀▀═╝  ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═══╝   ╚═╝   ", CYAN), ("╚═╝  ╚═╝", YELLOW)],
    ]
    make_image(lines, "logo.png", 15)

# ============================================================
# DASHBOARD
# ============================================================
def gen_dashboard():
    B = "═" * 96  # border line
    lines = [
        [("╔" + B + "╗", CYAN)],
        [("║ ", CYAN), ("██╗  ██╗███████╗██████╗  ██████╗ ███████╗ ██████╗ ██╗   ██╗ █████╗ ███╗   ██╗████████╗", CYAN), ("██╗  ██╗", YELLOW), (" ║", CYAN)],
        [("║ ", CYAN), ("██║  ██║██╔════╝██╔══██╗██╔════╝ ██╔════╝██╔═══██╗██║   ██║██╔══██╗████╗  ██║╚══██╔══╝", CYAN), ("╚██╗██╔╝", YELLOW), (" ║", CYAN)],
        [("║ ", CYAN), ("███████║█████╗  ██║  ██║██║  ███╗█████╗  ██║   ██║██║   ██║███████║██╔██╗ ██║   ██║   ", CYAN), (" ╚███╔╝ ", YELLOW), (" ║", CYAN)],
        [("║ ", CYAN), ("██╔══██║██╔══╝  ██║  ██║██║   ██║██╔══╝  ██║▄▄ ██║██║   ██║██╔══██║██║╚██╗██║   ██║   ", CYAN), (" ██╔██╗ ", YELLOW), (" ║", CYAN)],
        [("║ ", CYAN), ("██║  ██║███████╗██████╔╝╚██████╔╝███████╗╚██████╔╝╚██████╔╝██║  ██║██║ ╚████║   ██║   ", CYAN), ("██╔╝ ██╗", YELLOW), (" ║", CYAN)],
        [("║ ", CYAN), ("╚═╝  ╚═╝╚══════╝╚═════╝  ╚═════╝ ╚══════╝ ╚══▀▀═╝  ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═══╝   ╚═╝   ", CYAN), ("╚═╝  ╚═╝", YELLOW), (" ║", CYAN)],
        [("╠" + B + "╣", CYAN)],
        [("║                               ", CYAN), ("Prop Futures Algo Trading  v2.3.4", WHITE), ("                               ║", CYAN)],
        [("╠" + B + "╣", CYAN)],
        [("║                                      ", CYAN), ("Welcome, HQX Trader!", YELLOW), ("                                      ║", CYAN)],
        [("╠" + B + "╣", CYAN)],
        [("║                               ", CYAN), ("● ", GREEN), ("TopStep", WHITE), ("    ", CYAN), ("● ", GREEN), ("Apex Trader Funding", WHITE), ("                               ║", CYAN)],
        [("╠" + B + "╣", CYAN)],
        [("║        ", CYAN), ("✔ ", YELLOW), ("Connections: ", WHITE), ("2", GREEN), ("    ", CYAN), ("✔ ", YELLOW), ("Accounts: ", WHITE), ("2", GREEN), ("    ", CYAN), ("✔ ", YELLOW), ("Balance: ", WHITE), ("$449,682", GREEN), ("    ", CYAN), ("✔ ", YELLOW), ("P&L: ", WHITE), ("+$1,250", GREEN), ("         ║", CYAN)],
        [("╠" + B + "╣", CYAN)],
        [("║  ", CYAN), ("[1] View Accounts", CYAN), ("                             ", CYAN), ("[2] View Stats", CYAN), ("                                  ║", CYAN)],
        [("║  ", CYAN), ("[+] Add Prop-Account", CYAN), ("                          ", CYAN), ("[A] Algo-Trading", MAGENTA), ("                                ║", CYAN)],
        [("║  ", CYAN), ("[U] Update HQX", YELLOW), ("                                ", CYAN), ("[X] Disconnect", RED), ("                                  ║", CYAN)],
        [("╚" + B + "╝", CYAN)],
    ]
    make_image(lines, "dashboard.png", 14)

# ============================================================
# ALGO TRADING (One Account)
# ============================================================
def gen_algo():
    B = "═" * 96
    H1 = "═" * 47 + "╤" + "═" * 48
    HM = "═" * 47 + "╪" + "═" * 48
    HB = "═" * 47 + "╧" + "═" * 48
    
    lines = [
        [("╔" + B + "╗", CYAN)],
        [("║                                        ", CYAN), ("HQX ALGO TRADING", YELLOW), ("                                        ║", CYAN)],
        [("╠" + H1 + "╣", CYAN)],
        [("║ ", CYAN), ("Account: ", WHITE), ("HQX *****", CYAN), ("                              │ ", CYAN), ("Symbol: ", WHITE), ("ES Mar26", YELLOW), ("                               ║", CYAN)],
        [("╠" + HM + "╣", CYAN)],
        [("║ ", CYAN), ("Qty: ", WHITE), ("1", GREEN), ("                                        │ ", CYAN), ("P&L: ", WHITE), ("+$125.00", GREEN), ("                                ║", CYAN)],
        [("║ ", CYAN), ("Target: ", WHITE), ("$200.00", GREEN), ("                                │ ", CYAN), ("Risk: ", WHITE), ("$100.00", RED), ("                                 ║", CYAN)],
        [("║ ", CYAN), ("Trades: ", WHITE), ("3", WHITE), ("  W/L: ", WHITE), ("2", GREEN), ("/", WHITE), ("1", RED), ("                          │ ", CYAN), ("Latency: ", WHITE), ("45ms", GREEN), ("                               ║", CYAN)],
        [("╠" + HB + "╣", CYAN)],
        [("║ ", CYAN), ("BUY  ", GREEN), (" 12:34:56  Filled +1 ES @ 5125.50", WHITE), ("                                                ║", CYAN)],
        [("║ ", CYAN), ("SELL ", RED), (" 12:35:12  Filled -1 ES @ 5126.25", WHITE), ("                                                ║", CYAN)],
        [("║ ", CYAN), ("WIN  ", GREEN), (" 12:35:12  Position closed +$75.00", WHITE), ("                                               ║", CYAN)],
        [("║ ", CYAN), ("INFO ", GRAY), (" 12:35:15  Waiting for next signal...", WHITE), ("                                            ║", CYAN)],
        [("╠" + B + "╣", CYAN)],
        [("║                                    ", CYAN), ("Press ", GRAY), ("[X]", RED), (" to stop trading", GRAY), ("                                   ║", CYAN)],
        [("╚" + B + "╝", CYAN)],
    ]
    make_image(lines, "algo-trading.png", 14)

# ============================================================
# COPY TRADING
# ============================================================
def gen_copy():
    B = "═" * 96
    H1 = "═" * 47 + "╤" + "═" * 48
    HM = "═" * 47 + "╪" + "═" * 48
    HB = "═" * 47 + "╧" + "═" * 48
    
    lines = [
        [("╔" + B + "╗", CYAN)],
        [("║                                          ", CYAN), ("COPY TRADING", YELLOW), ("                                          ║", CYAN)],
        [("╠" + H1 + "╣", CYAN)],
        [("║ ", CYAN), ("LEAD: ", WHITE), ("Apex *****", MAGENTA), ("                             │ ", CYAN), ("FOLLOWER: ", WHITE), ("TopStep *****", MAGENTA), ("                       ║", CYAN)],
        [("╠" + HM + "╣", CYAN)],
        [("║ ", CYAN), ("Symbol: ", WHITE), ("NQ Mar26", YELLOW), ("                              │ ", CYAN), ("Symbol: ", WHITE), ("NQ Mar26", YELLOW), ("                               ║", CYAN)],
        [("║ ", CYAN), ("Qty: ", WHITE), ("1", GREEN), ("                                        │ ", CYAN), ("Qty: ", WHITE), ("1", GREEN), ("                                         ║", CYAN)],
        [("║ ", CYAN), ("P&L: ", WHITE), ("+$180.00", GREEN), ("                                 │ ", CYAN), ("P&L: ", WHITE), ("+$175.00", GREEN), ("                                 ║", CYAN)],
        [("╠" + HM + "╣", CYAN)],
        [("║ ", CYAN), ("Target: ", WHITE), ("$400.00", GREEN), ("                                │ ", CYAN), ("Risk: ", WHITE), ("$200.00", RED), ("                                  ║", CYAN)],
        [("╠" + HB + "╣", CYAN)],
        [("║ ", CYAN), ("BUY  ", GREEN), (" 12:34:56  Lead opened +1 NQ @ 18250.25", WHITE), ("                                         ║", CYAN)],
        [("║ ", CYAN), ("BUY  ", GREEN), (" 12:34:56  Follower copied +1 NQ @ 18250.50", WHITE), ("                                      ║", CYAN)],
        [("╠" + B + "╣", CYAN)],
        [("║                                    ", CYAN), ("Press ", GRAY), ("[X]", RED), (" to stop trading", GRAY), ("                                   ║", CYAN)],
        [("╚" + B + "╝", CYAN)],
    ]
    make_image(lines, "copy-trading.png", 14)

if __name__ == '__main__':
    gen_logo()
    gen_dashboard()
    gen_algo()
    gen_copy()
    print("\n✓ All images generated!")
