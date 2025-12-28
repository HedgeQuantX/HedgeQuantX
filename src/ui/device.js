/**
 * Device Detection & Terminal Info
 */

const chalk = require('chalk');

let cachedDevice = null;

/**
 * Detect device type and terminal capabilities
 */
const detectDevice = () => {
  const width = process.stdout.columns || 80;
  const height = process.stdout.rows || 24;
  const isTTY = process.stdout.isTTY || false;
  const platform = process.platform;
  const termProgram = process.env.TERM_PROGRAM || '';
  const term = process.env.TERM || '';
  const sshClient = process.env.SSH_CLIENT || process.env.SSH_TTY || '';
  
  // Detect mobile terminal apps
  const mobileTerminals = ['termux', 'ish', 'a-shell', 'blink'];
  const isMobileTerminal = mobileTerminals.some(t => 
    termProgram.toLowerCase().includes(t) || 
    term.toLowerCase().includes(t)
  );
  
  // Device type based on width
  let deviceType, deviceIcon;
  
  if (width < 50 || isMobileTerminal) {
    deviceType = 'mobile';
    deviceIcon = '[M]';
  } else if (width < 80) {
    deviceType = 'tablet';
    deviceIcon = '[T]';
  } else if (width < 120) {
    deviceType = 'desktop';
    deviceIcon = '[D]';
  } else {
    deviceType = 'desktop-large';
    deviceIcon = '[L]';
  }
  
  return {
    width,
    height,
    deviceType,
    deviceIcon,
    isMobile: deviceType === 'mobile',
    isTablet: deviceType === 'tablet',
    isDesktop: deviceType === 'desktop' || deviceType === 'desktop-large',
    isLargeDesktop: deviceType === 'desktop-large',
    platform,
    isTTY,
    isRemote: !!sshClient,
    termProgram,
    supportsColor: chalk.supportsColor ? true : false,
    maxContentWidth: Math.min(width - 4, deviceType === 'mobile' ? 45 : 70),
    menuPageSize: deviceType === 'mobile' ? 6 : (deviceType === 'tablet' ? 10 : 15)
  };
};

/**
 * Get cached device info (updates on terminal resize)
 */
const getDevice = () => {
  if (!cachedDevice) {
    cachedDevice = detectDevice();
    process.stdout.on('resize', () => {
      cachedDevice = detectDevice();
    });
  }
  return cachedDevice;
};

/**
 * Get separator line based on device width
 */
const getSeparator = (char = '-') => {
  const device = getDevice();
  return char.repeat(Math.min(device.width - 2, 70));
};

module.exports = { detectDevice, getDevice, getSeparator };
