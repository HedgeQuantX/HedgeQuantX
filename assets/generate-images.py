#!/usr/bin/env python3
"""
Generate PNG images from ASCII art for README
"""

from PIL import Image, ImageDraw, ImageFont
import os

# Colors (Terminal theme) - RGB tuples
BG_COLOR = (13, 17, 23)
CYAN = (0, 255, 255)
YELLOW = (255, 255, 0)
GREEN = (0, 255, 0)
WHITE = (255, 255, 255)
GRAY = (128, 128, 128)
MAGENTA = (255, 0, 255)

# Try to find a monospace font
def get_font(size):
    font_paths = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationMono-Regular.ttf",
        "/usr/share/fonts/truetype/ubuntu/UbuntuMono-R.ttf",
    ]
    for path in font_paths:
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()

def create_dashboard_image():
    """Create dashboard preview image"""
    
    font_size = 14
    font = get_font(font_size)
    line_height = font_size + 4
    padding = 20
    
    lines = [
        ("╔════════════════════════════════════════════════════════════════════════════════════════════════╗", CYAN),
        ("║ ██╗  ██╗███████╗██████╗  ██████╗ ███████╗ ██████╗ ██╗   ██╗ █████╗ ███╗   ██╗████████╗██╗  ██╗ ║", CYAN),
        ("║ ██║  ██║██╔════╝██╔══██╗██╔════╝ ██╔════╝██╔═══██╗██║   ██║██╔══██╗████╗  ██║╚══██╔══╝╚██╗██╔╝ ║", CYAN),
        ("║ ███████║█████╗  ██║  ██║██║  ███╗█████╗  ██║   ██║██║   ██║███████║██╔██╗ ██║   ██║    ╚███╔╝  ║", CYAN),
        ("║ ██╔══██║██╔══╝  ██║  ██║██║   ██║██╔══╝  ██║▄▄ ██║██║   ██║██╔══██║██║╚██╗██║   ██║    ██╔██╗  ║", CYAN),
        ("║ ██║  ██║███████╗██████╔╝╚██████╔╝███████╗╚██████╔╝╚██████╔╝██║  ██║██║ ╚████║   ██║   ██╔╝ ██╗ ║", CYAN),
        ("║ ╚═╝  ╚═╝╚══════╝╚═════╝  ╚═════╝ ╚══════╝ ╚══▀▀═╝  ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═══╝   ╚═╝   ╚═╝  ╚═╝ ║", CYAN),
        ("╠════════════════════════════════════════════════════════════════════════════════════════════════╣", CYAN),
        ("║                               Prop Futures Algo Trading  v2.3.4                               ║", WHITE),
        ("╠════════════════════════════════════════════════════════════════════════════════════════════════╣", CYAN),
        ("║                                      Welcome, HQX Trader!                                      ║", YELLOW),
        ("╠════════════════════════════════════════════════════════════════════════════════════════════════╣", CYAN),
        ("║                               ● TopStep    ● Apex Trader Funding                               ║", GREEN),
        ("╠════════════════════════════════════════════════════════════════════════════════════════════════╣", CYAN),
        ("║        ✔ Connections: 2    ✔ Accounts: 2    ✔ Balance: $449,682    ✔ P&L: +$1,250             ║", WHITE),
        ("╠════════════════════════════════════════════════════════════════════════════════════════════════╣", CYAN),
        ("║  [1] View Accounts                             [2] View Stats                                  ║", CYAN),
        ("║  [+] Add Prop-Account                          [A] Algo-Trading                                ║", CYAN),
        ("║  [U] Update HQX                                [X] Disconnect                                  ║", CYAN),
        ("╚════════════════════════════════════════════════════════════════════════════════════════════════╝", CYAN),
    ]
    
    max_width = max(len(line[0]) for line in lines) * (font_size // 2 + 2)
    height = len(lines) * line_height + padding * 2
    width = max_width + padding * 2
    
    img = Image.new('RGB', (width, height), color=BG_COLOR)
    draw = ImageDraw.Draw(img)
    
    y = padding
    for text, color in lines:
        draw.text((padding, y), text, font=font, fill=color)
        y += line_height
    
    img.save('/root/HQX-CLI/assets/dashboard.png', 'PNG')
    print("Created dashboard.png")

def create_algo_image():
    """Create algo trading preview image"""
    
    font_size = 14
    font = get_font(font_size)
    line_height = font_size + 4
    padding = 20
    
    lines = [
        ("╔════════════════════════════════════════════════════════════════════════════════════════════════╗", CYAN),
        ("║                                        HQX ALGO TRADING                                        ║", YELLOW),
        ("╠════════════════════════════════════════════════╤═══════════════════════════════════════════════╣", CYAN),
        ("║ Account: HQX *****                             │ Symbol: ES Mar26                              ║", WHITE),
        ("╠════════════════════════════════════════════════┼═══════════════════════════════════════════════╣", CYAN),
        ("║ Qty: 1                                         │ P&L: +$125.00                                 ║", WHITE),
        ("║ Target: $200                                   │ Risk: $100                                    ║", WHITE),
        ("║ Trades: 3  W/L: 2/1                            │ Latency: 45ms                                 ║", WHITE),
        ("╠════════════════════════════════════════════════╧═══════════════════════════════════════════════╣", CYAN),
        ("║ [12:34:56] Signal: BUY ES @ 5125.50                                                            ║", GREEN),
        ("║ [12:34:57] Order filled: +1 ES @ 5125.50                                                       ║", GREEN),
        ("║ [12:35:12] Signal: SELL ES @ 5126.25                                                           ║", YELLOW),
        ("║ [12:35:13] Position closed: +$75.00                                                            ║", GREEN),
        ("╠════════════════════════════════════════════════════════════════════════════════════════════════╣", CYAN),
        ("║                                    Press [X] to stop trading                                   ║", GRAY),
        ("╚════════════════════════════════════════════════════════════════════════════════════════════════╝", CYAN),
    ]
    
    max_width = max(len(line[0]) for line in lines) * (font_size // 2 + 2)
    height = len(lines) * line_height + padding * 2
    width = max_width + padding * 2
    
    img = Image.new('RGB', (width, height), color=BG_COLOR)
    draw = ImageDraw.Draw(img)
    
    y = padding
    for text, color in lines:
        draw.text((padding, y), text, font=font, fill=color)
        y += line_height
    
    img.save('/root/HQX-CLI/assets/algo-trading.png', 'PNG')
    print("Created algo-trading.png")

def create_copy_trading_image():
    """Create copy trading preview image"""
    
    font_size = 14
    font = get_font(font_size)
    line_height = font_size + 4
    padding = 20
    
    lines = [
        ("╔════════════════════════════════════════════════════════════════════════════════════════════════╗", CYAN),
        ("║                                          COPY TRADING                                          ║", YELLOW),
        ("╠════════════════════════════════════════════════╤═══════════════════════════════════════════════╣", CYAN),
        ("║ LEAD: Apex *****                               │ FOLLOWER: TopStep *****                       ║", WHITE),
        ("╠════════════════════════════════════════════════┼═══════════════════════════════════════════════╣", CYAN),
        ("║ Symbol: NQ Mar26                               │ Symbol: NQ Mar26                              ║", WHITE),
        ("║ Qty: 1                                         │ Qty: 1                                        ║", WHITE),
        ("║ P&L: +$180.00                                  │ P&L: +$175.00                                 ║", GREEN),
        ("╠════════════════════════════════════════════════┼═══════════════════════════════════════════════╣", CYAN),
        ("║ Target: $400                                   │ Risk: $200                                    ║", WHITE),
        ("╠════════════════════════════════════════════════╧═══════════════════════════════════════════════╣", CYAN),
        ("║ [12:34:56] Lead opened: BUY NQ @ 18250.25                                                      ║", GREEN),
        ("║ [12:34:56] Follower copied: BUY NQ @ 18250.50                                                  ║", GREEN),
        ("╠════════════════════════════════════════════════════════════════════════════════════════════════╣", CYAN),
        ("║                                    Press [X] to stop trading                                   ║", GRAY),
        ("╚════════════════════════════════════════════════════════════════════════════════════════════════╝", CYAN),
    ]
    
    max_width = max(len(line[0]) for line in lines) * (font_size // 2 + 2)
    height = len(lines) * line_height + padding * 2
    width = max_width + padding * 2
    
    img = Image.new('RGB', (width, height), color=BG_COLOR)
    draw = ImageDraw.Draw(img)
    
    y = padding
    for text, color in lines:
        draw.text((padding, y), text, font=font, fill=color)
        y += line_height
    
    img.save('/root/HQX-CLI/assets/copy-trading.png', 'PNG')
    print("Created copy-trading.png")

if __name__ == '__main__':
    create_dashboard_image()
    create_algo_image()
    create_copy_trading_image()
    print("\nAll images created in /root/HQX-CLI/assets/")
