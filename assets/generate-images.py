#!/usr/bin/env python3
"""
Generate HIGH QUALITY PNG images for HQX-CLI README
Exact CLI colors and box characters
Uses 2x supersampling for crisp text rendering
Fixed-width character rendering for perfect alignment
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

def make_image_fixed_width(lines, filename, font_size=None):
    """
    Create HIGH QUALITY PNG using fixed-width character rendering.
    Each line is a string, with a parallel color_map list indicating color per character.
    """
    if font_size is None:
        font_size = BASE_FONT_SIZE
    
    # Render at 2x size for supersampling
    render_size = font_size * SCALE
    font = get_font(render_size)
    
    # Get fixed character width (monospace)
    char_width = font.getbbox("W")[2]
    lh = int(render_size * 1.3)  # Line height
    px, py = 40 * SCALE, 30 * SCALE  # Padding
    
    # Calculate dimensions
    max_chars = max(len(line) for line, _ in lines)
    W = max_chars * char_width + px * 2
    H = len(lines) * lh + py * 2
    
    # Create high-res image
    img = Image.new('RGB', (W, H), BG)
    draw = ImageDraw.Draw(img)
    
    # Draw text character by character
    y = py
    for line_text, color_map in lines:
        x = px
        for i, char in enumerate(line_text):
            color = color_map[i] if i < len(color_map) else WHITE
            draw.text((x, y), char, font=font, fill=color)
            x += char_width
        y += lh
    
    # Downsample for antialiasing (high quality resize)
    final_w = W // SCALE
    final_h = H // SCALE
    img = img.resize((final_w, final_h), Image.LANCZOS)
    
    # Save with high quality
    img.save(f'/root/HQX-CLI/assets/{filename}', 'PNG', optimize=False)
    print(f"✓ {filename} ({final_w}x{final_h})")


def colorize(text, color):
    """Return list of colors for each character in text"""
    return [color] * len(text)


def build_line(segments):
    """
    Build a line from segments: [(text, color), ...]
    Returns (full_text, color_map)
    """
    full_text = ""
    color_map = []
    for text, color in segments:
        full_text += text
        color_map.extend([color] * len(text))
    return (full_text, color_map)


def gen_logo():
    """Logo only - HEDGEQUANT in cyan, X in yellow - properly aligned"""
    raw_lines = [
        [("██╗  ██╗███████╗██████╗  ██████╗ ███████╗ ██████╗ ██╗   ██╗ █████╗ ███╗   ██╗████████╗██╗  ██╗", CYAN)],
        [("██║  ██║██╔════╝██╔══██╗██╔════╝ ██╔════╝██╔═══██╗██║   ██║██╔══██╗████╗  ██║╚══██╔══╝╚██╗██╔╝", CYAN)],
        [("███████║█████╗  ██║  ██║██║  ███╗█████╗  ██║   ██║██║   ██║███████║██╔██╗ ██║   ██║    ╚███╔╝ ", CYAN)],
        [("██╔══██║██╔══╝  ██║  ██║██║   ██║██╔══╝  ██║▄▄ ██║██║   ██║██╔══██║██║╚██╗██║   ██║    ██╔██╗ ", CYAN)],
        [("██║  ██║███████╗██████╔╝╚██████╔╝███████╗╚██████╔╝╚██████╔╝██║  ██║██║ ╚████║   ██║   ██╔╝ ██╗", CYAN)],
        [("╚═╝  ╚═╝╚══════╝╚═════╝  ╚═════╝ ╚══════╝ ╚══▀▀═╝  ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═══╝   ╚═╝   ╚═╝  ╚═╝", CYAN)],
    ]
    # Apply yellow color to the X (last 8 characters of each line)
    lines = []
    for segs in raw_lines:
        text, colors = build_line(segs)
        # Color last 8 chars yellow (the X)
        for i in range(len(colors) - 8, len(colors)):
            colors[i] = YELLOW
        lines.append((text, colors))
    make_image_fixed_width(lines, "logo.png", 28)


def gen_dashboard():
    """Dashboard with correct box characters - fixed width 98 chars"""
    W = 98  # Total width including borders
    
    def pad_line(segments, total_width=W):
        """Build line and pad to exact width"""
        text, colors = build_line(segments)
        if len(text) < total_width:
            padding = total_width - len(text)
            # Insert padding before last segment (assumed to be border)
            text = text[:-1] + " " * padding + text[-1]
            colors = colors[:-1] + [CYAN] * padding + [colors[-1]]
        return (text, colors)
    
    def full_border(left, mid, right):
        """Create full-width border line"""
        line = left + "═" * (W - 2) + right
        return (line, [CYAN] * len(line))
    
    # Logo lines with X in yellow (last 8 chars) - centered in 98-char width
    logo_lines = [
        "██╗  ██╗███████╗██████╗  ██████╗ ███████╗ ██████╗ ██╗   ██╗ █████╗ ███╗   ██╗████████╗██╗  ██╗",
        "██║  ██║██╔════╝██╔══██╗██╔════╝ ██╔════╝██╔═══██╗██║   ██║██╔══██╗████╗  ██║╚══██╔══╝╚██╗██╔╝",
        "███████║█████╗  ██║  ██║██║  ███╗█████╗  ██║   ██║██║   ██║███████║██╔██╗ ██║   ██║    ╚███╔╝ ",
        "██╔══██║██╔══╝  ██║  ██║██║   ██║██╔══╝  ██║▄▄ ██║██║   ██║██╔══██║██║╚██╗██║   ██║    ██╔██╗ ",
        "██║  ██║███████╗██████╔╝╚██████╔╝███████╗╚██████╔╝╚██████╔╝██║  ██║██║ ╚████║   ██║   ██╔╝ ██╗",
        "╚═╝  ╚═╝╚══════╝╚═════╝  ╚═════╝ ╚══════╝ ╚══▀▀═╝  ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═══╝   ╚═╝   ╚═╝  ╚═╝",
    ]
    
    def logo_line(logo_text):
        """Create a logo line with border, centered, X in yellow"""
        content_w = W - 2
        logo_len = len(logo_text)
        left_pad = (content_w - logo_len) // 2
        right_pad = content_w - logo_len - left_pad
        
        full = "║" + " " * left_pad + logo_text + " " * right_pad + "║"
        colors = [CYAN]  # left border
        colors.extend([CYAN] * left_pad)  # left padding
        # Logo: cyan except last 8 chars which are yellow (the X)
        colors.extend([CYAN] * (logo_len - 8))
        colors.extend([YELLOW] * 8)
        colors.extend([CYAN] * right_pad)  # right padding
        colors.append(CYAN)  # right border
        return (full, colors)
    
    lines = [
        full_border("╔", "═", "╗"),
    ]
    for ll in logo_lines:
        lines.append(logo_line(ll))
    lines.append(full_border("╠", "═", "╣"))
    
    # Center text helper
    def center_line(text_segments, border="║"):
        """Center text within borders"""
        text, colors = build_line(text_segments)
        content_width = W - 2  # minus borders
        text_len = len(text)
        left_pad = (content_width - text_len) // 2
        right_pad = content_width - text_len - left_pad
        
        full = border + " " * left_pad + text + " " * right_pad + border
        full_colors = [CYAN] + [CYAN] * left_pad + colors + [CYAN] * right_pad + [CYAN]
        return (full, full_colors)
    
    lines.append(center_line([("Prop Futures Algo Trading  v2.3.4", WHITE)]))
    lines.append(full_border("╠", "═", "╣"))
    lines.append(center_line([("Welcome, HQX Trader!", YELLOW)]))
    lines.append(full_border("╠", "═", "╣"))
    lines.append(center_line([("● ", GREEN), ("TopStep", WHITE), ("      ", CYAN), ("● ", GREEN), ("Apex Trader Funding", WHITE)]))
    lines.append(full_border("╠", "═", "╣"))
    lines.append(center_line([("✔ ", YELLOW), ("Connections: ", WHITE), ("2", GREEN), ("    ", CYAN), ("✔ ", YELLOW), ("Accounts: ", WHITE), ("2", GREEN), ("    ", CYAN), ("✔ ", YELLOW), ("Balance: ", WHITE), ("$449,682", GREEN), ("    ", CYAN), ("✔ ", YELLOW), ("P&L: ", WHITE), ("+$1,250", GREEN)]))
    lines.append(full_border("╠", "═", "╣"))
    
    # Menu items - left aligned with padding
    def menu_line(left_item, right_item):
        left_text, left_colors = build_line(left_item)
        right_text, right_colors = build_line(right_item)
        
        col_width = (W - 2) // 2
        left_padded = left_text + " " * (col_width - len(left_text))
        right_padded = right_text + " " * (col_width - len(right_text))
        
        full = "║" + left_padded + right_padded + "║"
        full_colors = [CYAN] + left_colors + [CYAN] * (col_width - len(left_text)) + right_colors + [CYAN] * (col_width - len(right_text)) + [CYAN]
        return (full, full_colors)
    
    lines.append(menu_line([("  [1] View Accounts", CYAN)], [("[2] View Stats", CYAN)]))
    lines.append(menu_line([("  [+] Add Prop-Account", CYAN)], [("[A] Algo-Trading", MAGENTA)]))
    lines.append(menu_line([("  [U] Update HQX", YELLOW)], [("[X] Disconnect", RED)]))
    lines.append(full_border("╚", "═", "╝"))
    
    make_image_fixed_width(lines, "dashboard.png")


def gen_algo():
    """Algo trading with correct separators: ╤ ╧ ╪ │"""
    W = 98  # Total width including borders
    # Left column = 48 chars, separator = 1, right column = 47 chars (total inner = 96)
    LEFT_W = 48
    RIGHT_W = 47
    
    def full_border(left, right, mid=None):
        """Create full-width border line with optional middle separator"""
        if mid:
            line = left + "═" * LEFT_W + mid + "═" * RIGHT_W + right
        else:
            line = left + "═" * (W - 2) + right
        return (line, [CYAN] * len(line))
    
    def center_line(text_segments):
        """Center text within borders"""
        text, colors = build_line(text_segments)
        content_width = W - 2
        text_len = len(text)
        left_pad = (content_width - text_len) // 2
        right_pad = content_width - text_len - left_pad
        
        full = "║" + " " * left_pad + text + " " * right_pad + "║"
        full_colors = [CYAN] + [CYAN] * left_pad + colors + [CYAN] * right_pad + [CYAN]
        return (full, full_colors)
    
    def two_col_line(left_segments, right_segments):
        """Create a two-column line with │ separator - perfectly aligned"""
        left_text, left_colors = build_line(left_segments)
        right_text, right_colors = build_line(right_segments)
        
        # Pad each column to exact width
        left_padded = left_text + " " * (LEFT_W - len(left_text))
        right_padded = right_text + " " * (RIGHT_W - len(right_text))
        
        full = "║" + left_padded + "│" + right_padded + "║"
        full_colors = ([CYAN] + 
                      left_colors + [CYAN] * (LEFT_W - len(left_text)) + 
                      [CYAN] +  # separator │
                      right_colors + [CYAN] * (RIGHT_W - len(right_text)) + 
                      [CYAN])
        return (full, full_colors)
    
    def log_line(tag, tag_color, message):
        """Create a log line"""
        content = " " + tag + " " + message
        padding = W - 2 - len(content)
        full = "║" + content + " " * padding + "║"
        
        colors = [CYAN]  # ║
        colors.append(CYAN)  # space
        colors.extend([tag_color] * len(tag))
        colors.append(WHITE)  # space after tag
        colors.extend([WHITE] * len(message))
        colors.extend([CYAN] * padding)
        colors.append(CYAN)  # final ║
        return (full, colors)
    
    # Log line with timestamp format matching ui.js
    def smart_log(timestamp, tag, tag_color, message):
        """Create a smart log line: TIMESTAMP TAG MESSAGE"""
        content = " " + timestamp + " " + tag + " " + message
        padding = W - 2 - len(content)
        full = "║" + content + " " * padding + "║"
        
        colors = [CYAN]  # ║
        colors.append(WHITE)  # space
        colors.extend([WHITE] * len(timestamp))  # timestamp in white
        colors.append(WHITE)  # space
        colors.extend([tag_color] * len(tag))  # tag color
        colors.append(WHITE)  # space
        colors.extend([WHITE] * len(message))  # message
        colors.extend([CYAN] * padding)
        colors.append(CYAN)  # final ║
        return (full, colors)
    
    lines = [
        full_border("╔", "╗"),
        center_line([("One Account Mode", YELLOW)]),
        full_border("╠", "╣", "╤"),
        two_col_line([(" Account: ", WHITE), ("HQX *****", CYAN)], [(" Symbol: ", WHITE), ("MNQ Mar25", YELLOW)]),
        full_border("╠", "╣", "╪"),
        two_col_line([(" Qty: ", WHITE), ("1", GREEN)], [(" P&L: ", WHITE), ("+$42.50", GREEN)]),
        two_col_line([(" Target: ", WHITE), ("$200.00", GREEN)], [(" Risk: ", WHITE), ("$100.00", RED)]),
        two_col_line([(" Trades: ", WHITE), ("3", WHITE), ("  W/L: ", WHITE), ("2", GREEN), ("/", WHITE), ("1", RED)], [(" Server: ", WHITE), ("ON", GREEN)]),
        full_border("╠", "╣", "╪"),
        two_col_line([(" Latency: ", WHITE), ("45ms", GREEN)], [(" Propfirm: ", WHITE), ("Apex", CYAN)]),
        full_border("╠", "╣", "╧"),
        smart_log("09:31:02", "SYS  ", CYAN, "HQX Algo Engine v2.3.4 initialized"),
        smart_log("09:31:03", "CONN ", GREEN, "Connected to Rithmic"),
        smart_log("09:31:03", "READY", CYAN, "Listening MNQ Mar25 | Target $200 | Risk $100"),
        smart_log("09:32:15", "SYS  ", CYAN, "Signal detected: LONG setup forming"),
        smart_log("09:32:16", "BUY  ", GREEN, "+1 MNQ @ 21,845.25 | SL: 21,837.25 | TP: 21,869.25"),
        smart_log("09:33:42", "SYS  ", CYAN, "TP1 hit - moving SL to breakeven"),
        smart_log("09:34:18", "SELL ", RED, "-1 MNQ @ 21,862.50 | P&L: +$34.50"),
        smart_log("09:34:18", "WIN  ", GREEN, "Trade #1 closed +$34.50 | Session: +$34.50"),
        smart_log("09:35:05", "SYS  ", CYAN, "Signal detected: SHORT setup forming"),
        smart_log("09:35:06", "SELL ", RED, "-1 MNQ @ 21,858.00 | SL: 21,866.00 | TP: 21,834.00"),
        smart_log("09:35:52", "SYS  ", CYAN, "Price action weak - tightening SL"),
        smart_log("09:36:15", "BUY  ", GREEN, "+1 MNQ @ 21,854.00 | P&L: +$8.00"),
        smart_log("09:36:15", "WIN  ", GREEN, "Trade #2 closed +$8.00 | Session: +$42.50"),
        smart_log("09:36:30", "INFO ", WHITE, "Scanning for next setup..."),
        full_border("╠", "╣"),
        center_line([("Press ", WHITE), ("[X]", RED), (" to stop trading", WHITE)]),
        full_border("╚", "╝"),
    ]
    
    make_image_fixed_width(lines, "algo-trading.png")


def gen_copy():
    """Copy trading with correct separators"""
    W = 98
    LEFT_W = 48
    RIGHT_W = 47
    
    def full_border(left, right, mid=None):
        if mid:
            line = left + "═" * LEFT_W + mid + "═" * RIGHT_W + right
        else:
            line = left + "═" * (W - 2) + right
        return (line, [CYAN] * len(line))
    
    def center_line(text_segments):
        text, colors = build_line(text_segments)
        content_width = W - 2
        text_len = len(text)
        left_pad = (content_width - text_len) // 2
        right_pad = content_width - text_len - left_pad
        
        full = "║" + " " * left_pad + text + " " * right_pad + "║"
        full_colors = [CYAN] + [CYAN] * left_pad + colors + [CYAN] * right_pad + [CYAN]
        return (full, full_colors)
    
    def two_col_line(left_segments, right_segments):
        left_text, left_colors = build_line(left_segments)
        right_text, right_colors = build_line(right_segments)
        
        left_padded = left_text + " " * (LEFT_W - len(left_text))
        right_padded = right_text + " " * (RIGHT_W - len(right_text))
        
        full = "║" + left_padded + "│" + right_padded + "║"
        full_colors = ([CYAN] + 
                      left_colors + [CYAN] * (LEFT_W - len(left_text)) + 
                      [CYAN] +
                      right_colors + [CYAN] * (RIGHT_W - len(right_text)) + 
                      [CYAN])
        return (full, full_colors)
    
    def smart_log(timestamp, tag, tag_color, message):
        """Create a smart log line: TIMESTAMP TAG MESSAGE"""
        content = " " + timestamp + " " + tag + " " + message
        padding = W - 2 - len(content)
        full = "║" + content + " " * padding + "║"
        
        colors = [CYAN]  # ║
        colors.append(WHITE)  # space
        colors.extend([WHITE] * len(timestamp))
        colors.append(WHITE)  # space
        colors.extend([tag_color] * len(tag))
        colors.append(WHITE)  # space
        colors.extend([WHITE] * len(message))
        colors.extend([CYAN] * padding)
        colors.append(CYAN)
        return (full, colors)
    
    lines = [
        full_border("╔", "╗"),
        center_line([("Copy Trading Mode", YELLOW)]),
        full_border("╠", "╣", "╤"),
        two_col_line([(" Lead: ", WHITE), ("HQX *****", CYAN)], [(" Follower: ", WHITE), ("HQX *****", CYAN)]),
        full_border("╠", "╣"),
        center_line([("Symbol: ", WHITE), ("MNQ Mar25", YELLOW)]),
        full_border("╠", "╣", "╤"),
        two_col_line([(" Qty: ", WHITE), ("1", GREEN)], [(" Qty: ", WHITE), ("1", GREEN)]),
        full_border("╠", "╣", "╪"),
        two_col_line([(" Target: ", WHITE), ("$400.00", GREEN)], [(" Risk: ", WHITE), ("$200.00", RED)]),
        full_border("╠", "╣", "╪"),
        two_col_line([(" P&L: ", WHITE), ("+$62.50", GREEN)], [(" Server: ", WHITE), ("ON", GREEN)]),
        full_border("╠", "╣", "╪"),
        two_col_line([(" Trades: ", WHITE), ("2", WHITE), ("  W/L: ", WHITE), ("2", GREEN), ("/", WHITE), ("0", RED)], [(" Latency: ", WHITE), ("38ms", GREEN)]),
        full_border("╠", "╣", "╧"),
        smart_log("09:31:02", "SYS  ", CYAN, "Copy Trading Engine initialized"),
        smart_log("09:31:03", "CONN ", GREEN, "Lead account connected"),
        smart_log("09:31:03", "CONN ", GREEN, "Follower account connected"),
        smart_log("09:31:04", "READY", CYAN, "Watching MNQ Mar25 | Target $400 | Risk $200"),
        smart_log("09:32:15", "BUY  ", GREEN, "Lead: +1 MNQ @ 21,845.25"),
        smart_log("09:32:15", "BUY  ", GREEN, "Follower: Copied +1 MNQ @ 21,845.50 (0.25 slip)"),
        smart_log("09:33:42", "SELL ", RED, "Lead: -1 MNQ @ 21,860.50"),
        smart_log("09:33:42", "SELL ", RED, "Follower: Copied -1 MNQ @ 21,860.25 (0.25 slip)"),
        smart_log("09:33:42", "WIN  ", GREEN, "Trade #1 | Lead: +$30.50 | Follower: +$29.50"),
        smart_log("09:34:55", "BUY  ", GREEN, "Lead: +1 MNQ @ 21,855.00"),
        smart_log("09:34:55", "BUY  ", GREEN, "Follower: Copied +1 MNQ @ 21,855.00 (no slip)"),
        smart_log("09:35:38", "SELL ", RED, "Lead: -1 MNQ @ 21,871.50"),
        smart_log("09:35:38", "SELL ", RED, "Follower: Copied -1 MNQ @ 21,871.25 (0.25 slip)"),
        smart_log("09:35:38", "WIN  ", GREEN, "Trade #2 | Lead: +$33.00 | Follower: +$32.50"),
        smart_log("09:35:50", "INFO ", WHITE, "Session P&L: +$63.50 / +$62.00 | Waiting..."),
        full_border("╠", "╣"),
        center_line([("Press ", WHITE), ("[X]", RED), (" to stop trading", WHITE)]),
        full_border("╚", "╝"),
    ]
    
    make_image_fixed_width(lines, "copy-trading.png")


if __name__ == '__main__':
    gen_logo()
    gen_dashboard()
    gen_algo()
    gen_copy()
    print("\n✓ All images regenerated with perfect alignment!")
