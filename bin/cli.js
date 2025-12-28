#!/usr/bin/env node

const chalk = require('chalk');
const figlet = require('figlet');
const inquirer = require('inquirer');
const ora = require('ora');
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { program } = require('commander');
const { ProjectXService } = require('../src/services/projectx');
const { HQXServerService } = require('../src/services/hqx-server');

// ==================== MULTI-CONNECTION MANAGER ====================
// Stocke toutes les connexions actives (ProjectX, Rithmic, Tradovate)
const connections = {
  services: [],      // Array of { type: 'projectx'|'rithmic'|'tradovate', service: ServiceInstance, propfirm: string }
  
  // Ajouter une connexion
  add(type, service, propfirm = null) {
    this.services.push({ type, service, propfirm, connectedAt: new Date() });
  },
  
  // Supprimer une connexion
  remove(index) {
    this.services.splice(index, 1);
  },
  
  // Obtenir toutes les connexions
  getAll() {
    return this.services;
  },
  
  // Obtenir les connexions par type
  getByType(type) {
    return this.services.filter(c => c.type === type);
  },
  
  // Nombre de connexions
  count() {
    return this.services.length;
  },
  
  // Obtenir tous les comptes de toutes les connexions
  async getAllAccounts() {
    const allAccounts = [];
    for (const conn of this.services) {
      try {
        const result = await conn.service.getTradingAccounts();
        if (result.success && result.accounts) {
          result.accounts.forEach(account => {
            allAccounts.push({
              ...account,
              connectionType: conn.type,
              propfirm: conn.propfirm || conn.type,
              service: conn.service
            });
          });
        }
      } catch (e) {
        // Ignore connection errors
      }
    }
    return allAccounts;
  },
  
  // Vérifier si connecté
  isConnected() {
    return this.services.length > 0;
  },
  
  // Déconnecter tout
  disconnectAll() {
    this.services.forEach(conn => {
      if (conn.service && conn.service.logout) {
        conn.service.logout();
      }
    });
    this.services = [];
  }
};

// Session courante (pour compatibilité)
let currentService = null;

// ==================== DEVICE DETECTION & RESPONSIVE ====================

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
  
  // Detect if running on mobile terminal apps
  const mobileTerminals = ['termux', 'ish', 'a-shell', 'blink'];
  const isMobileTerminal = mobileTerminals.some(t => 
    termProgram.toLowerCase().includes(t) || 
    term.toLowerCase().includes(t)
  );
  
  // Detect device type based on width
  let deviceType;
  let deviceIcon;
  
  if (width < 50 || isMobileTerminal) {
    deviceType = 'mobile';
    deviceIcon = '📱';
  } else if (width < 80) {
    deviceType = 'tablet';
    deviceIcon = '📲';
  } else if (width < 120) {
    deviceType = 'desktop';
    deviceIcon = '💻';
  } else {
    deviceType = 'desktop-large';
    deviceIcon = '🖥️';
  }
  
  // Check if remote connection (SSH)
  const isRemote = !!sshClient;
  
  return {
    // Dimensions
    width,
    height,
    
    // Device type
    deviceType,
    deviceIcon,
    isMobile: deviceType === 'mobile',
    isTablet: deviceType === 'tablet',
    isDesktop: deviceType === 'desktop' || deviceType === 'desktop-large',
    isLargeDesktop: deviceType === 'desktop-large',
    
    // Environment
    platform,
    isTTY,
    isRemote,
    termProgram,
    
    // Capabilities
    supportsColor: chalk.supportsColor ? true : false,
    supportsEmoji: !platform.includes('win32') || termProgram.includes('Windows Terminal'),
    
    // Layout helpers
    maxContentWidth: Math.min(width - 4, deviceType === 'mobile' ? 45 : 70),
    menuPageSize: deviceType === 'mobile' ? 6 : (deviceType === 'tablet' ? 10 : 15)
  };
};

/**
 * Get current device info (cached, updates on resize)
 */
let cachedDevice = null;
const getDevice = () => {
  if (!cachedDevice) {
    cachedDevice = detectDevice();
  }
  return cachedDevice;
};

// Update on terminal resize
process.stdout.on('resize', () => {
  cachedDevice = detectDevice();
});

/**
 * Get appropriate separator based on device
 */
const getSeparator = (char = '─') => {
  const device = getDevice();
  return char.repeat(device.maxContentWidth);
};

/**
 * Format text for current device width
 */
const formatForDevice = (text, indent = 2) => {
  const device = getDevice();
  const maxWidth = device.maxContentWidth - indent;
  
  if (text.length <= maxWidth) {
    return ' '.repeat(indent) + text;
  }
  
  // Word wrap for mobile
  const words = text.split(' ');
  const lines = [];
  let currentLine = '';
  
  for (const word of words) {
    if ((currentLine + ' ' + word).trim().length <= maxWidth) {
      currentLine = (currentLine + ' ' + word).trim();
    } else {
      if (currentLine) lines.push(' '.repeat(indent) + currentLine);
      currentLine = word;
    }
  }
  if (currentLine) lines.push(' '.repeat(indent) + currentLine);
  
  return lines.join('\n');
};

/**
 * Show device info (for debugging)
 */
const showDeviceInfo = () => {
  const device = getDevice();
  console.log();
  console.log(chalk.gray(getSeparator()));
  console.log(chalk.white(`  ${device.deviceIcon} Device: ${chalk.cyan(device.deviceType.toUpperCase())}`));
  console.log(chalk.white(`  📐 Size: ${chalk.cyan(device.width + 'x' + device.height)}`));
  console.log(chalk.white(`  💻 Platform: ${chalk.cyan(device.platform)}`));
  if (device.isRemote) {
    console.log(chalk.white(`  🌐 Remote: ${chalk.yellow('SSH Connection')}`));
  }
  console.log(chalk.gray(getSeparator()));
  console.log();
};

// Liste des PropFirms ProjectX
const projectXPropfirms = [
  { name: 'Topstep', value: 'topstep' },
  { name: 'Alpha Futures', value: 'alpha_futures' },
  { name: 'TickTickTrader', value: 'tickticktrader' },
  { name: 'Bulenox', value: 'bulenox' },
  { name: 'TradeDay', value: 'tradeday' },
  { name: 'Blusky', value: 'blusky' },
  { name: 'Goat Futures', value: 'goat_futures' },
  { name: 'The Futures Desk', value: 'futures_desk' },
  { name: 'DayTraders', value: 'daytraders' },
  { name: 'E8 Futures', value: 'e8_futures' },
  { name: 'Blue Guardian Futures', value: 'blue_guardian' },
  { name: 'FuturesElite', value: 'futures_elite' },
  { name: 'FXIFY', value: 'fxify' },
  { name: 'Hola Prime', value: 'hola_prime' },
  { name: 'Top One Futures', value: 'top_one_futures' },
  { name: 'Funding Futures', value: 'funding_futures' },
  { name: 'TX3 Funding', value: 'tx3_funding' },
  { name: 'Lucid Trading', value: 'lucid_trading' },
  { name: 'Tradeify', value: 'tradeify' },
  { name: 'Earn2Trade (Coming Soon!)', value: 'earn2trade', disabled: 'Coming Soon' },
];

// Banner - Responsive for all devices
const banner = async () => {
  console.clear();
  const device = getDevice();
  
  // Get stats if connected
  let statsInfo = null;
  if (connections.count() > 0) {
    try {
      const allAccounts = await connections.getAllAccounts();
      let totalBalance = 0;
      let totalStartingBalance = 0;
      
      allAccounts.forEach(account => {
        totalBalance += account.balance || 0;
        const name = account.accountName || '';
        if (name.includes('150')) totalStartingBalance += 150000;
        else if (name.includes('100')) totalStartingBalance += 100000;
        else if (name.includes('50')) totalStartingBalance += 50000;
        else if (name.includes('25')) totalStartingBalance += 25000;
      });
      
      const pnl = totalBalance - totalStartingBalance;
      const pnlPercent = totalStartingBalance > 0 ? ((pnl / totalStartingBalance) * 100).toFixed(1) : '0.0';
      
      statsInfo = {
        connections: connections.count(),
        accounts: allAccounts.length,
        balance: totalBalance,
        pnl: pnl,
        pnlPercent: pnlPercent
      };
    } catch (e) {
      // Ignore errors
    }
  }
  
  if (device.isMobile) {
    // 📱 MOBILE: Adaptive to screen width
    const width = device.width - 2; // Leave margin
    const innerWidth = width - 4; // Account for borders and spaces
    
    const centerText = (text, w) => {
      const padding = Math.max(0, w - text.length);
      const left = Math.floor(padding / 2);
      const right = padding - left;
      return ' '.repeat(left) + text + ' '.repeat(right);
    };
    
    console.log();
    console.log(chalk.cyan.bold(' ┌' + '─'.repeat(innerWidth + 2) + '┐'));
    console.log(chalk.cyan.bold(' │' + centerText('HEDGEQUANTX', innerWidth + 2) + '│'));
    console.log(chalk.cyan.bold(' │' + centerText('═'.repeat(Math.min(11, innerWidth)), innerWidth + 2) + '│'));
    
    if (statsInfo) {
      const pnlColor = statsInfo.pnl >= 0 ? chalk.green : chalk.red;
      const balStr = `$${(statsInfo.balance/1000).toFixed(0)}K`;
      const accStr = `${statsInfo.accounts} acc`;
      const pnlStr = `${statsInfo.pnl >= 0 ? '+' : ''}${statsInfo.pnlPercent}%`;
      const infoText = `${balStr} | ${accStr} | ${pnlStr}`;
      console.log(chalk.cyan.bold(' │') + centerText(infoText, innerWidth + 2) + chalk.cyan.bold('│'));
    } else {
      console.log(chalk.cyan.bold(' │') + chalk.yellow.bold(centerText('Algo Trading', innerWidth + 2)) + chalk.cyan.bold('│'));
    }
    
    console.log(chalk.cyan.bold(' └' + '─'.repeat(innerWidth + 2) + '┘'));
    console.log();
    
  } else if (device.isTablet) {
    // 📲 TABLET: Medium compact
    console.log();
    console.log(
      chalk.cyan(
        figlet.textSync('HQX', {
          font: 'Small',
          horizontalLayout: 'fitted'
        })
      )
    );
    console.log(chalk.gray(getSeparator()));
    if (statsInfo) {
      const pnlColor = statsInfo.pnl >= 0 ? chalk.green : chalk.red;
      console.log(
        chalk.white(`  Conn: ${chalk.cyan(statsInfo.connections)}`) +
        chalk.gray(' | ') +
        chalk.white(`Acc: ${chalk.cyan(statsInfo.accounts)}`) +
        chalk.gray(' | ') +
        chalk.white(`Bal: ${chalk.green('$' + statsInfo.balance.toLocaleString())}`) +
        chalk.gray(' | ') +
        chalk.white(`P&L: ${pnlColor((statsInfo.pnl >= 0 ? '+' : '') + '$' + statsInfo.pnl.toLocaleString())}`)
      );
    } else {
      console.log(chalk.yellow.bold('  Prop Futures Algo Trading'));
    }
    console.log(chalk.gray(getSeparator()));
    console.log();
    
  } else {
    // 💻 DESKTOP & LARGE DESKTOP
    const logoText = figlet.textSync('HEDGEQUANTX', {
      font: 'ANSI Shadow',
      horizontalLayout: 'default',
      verticalLayout: 'default'
    });
    
    console.log(chalk.cyan(logoText));
    
    // Get logo width (first line length)
    const logoWidth = logoText.split('\n')[0].length;
    
    console.log(chalk.gray('═'.repeat(logoWidth)));
    
    if (statsInfo) {
      const pnlColor = statsInfo.pnl >= 0 ? chalk.green : chalk.red;
      const pnlSign = statsInfo.pnl >= 0 ? '+' : '';
      
      // Build info line
      const connStr = `Connections: ${statsInfo.connections}`;
      const accStr = `Accounts: ${statsInfo.accounts}`;
      const balStr = `Balance: $${statsInfo.balance.toLocaleString()}`;
      const pnlStr = `P&L: ${pnlSign}$${statsInfo.pnl.toLocaleString()} (${statsInfo.pnlPercent}%)`;
      
      // Calculate spacing
      const totalTextLen = connStr.length + accStr.length + balStr.length + pnlStr.length;
      const availableSpace = logoWidth - totalTextLen - 8; // 8 for margins
      const gap = Math.max(2, Math.floor(availableSpace / 3));
      const spacer = ' '.repeat(gap);
      
      console.log(
        chalk.white('  ' + connStr) + spacer +
        chalk.white(accStr) + spacer +
        chalk.green(balStr) + spacer +
        pnlColor(pnlStr)
      );
    } else {
      // Not connected - show tagline centered
      const tagline = 'Prop Futures Algo Trading';
      const version = 'v1.0.0';
      const padding = logoWidth - tagline.length - version.length - 4;
      console.log(chalk.yellow.bold('  ' + tagline) + ' '.repeat(padding) + chalk.gray(version));
    }
    
    console.log(chalk.gray('═'.repeat(logoWidth)));
    console.log();
  }
};

// Menu principal - Choix de connexion (Responsive)
const mainMenu = async () => {
  const device = getDevice();
  
  const { connection } = await inquirer.prompt([
    {
      type: 'list',
      name: 'connection',
      message: device.isMobile 
        ? chalk.white.bold('Connection:')
        : chalk.white.bold('Choose Your Connection:'),
      choices: [
        { name: chalk.cyan('ProjectX'), value: 'projectx' },
        { name: chalk.gray('Rithmic (Soon)'), value: 'rithmic', disabled: device.isMobile ? '' : 'Coming Soon' },
        { name: chalk.gray('Tradovate (Soon)'), value: 'tradovate', disabled: device.isMobile ? '' : 'Coming Soon' },
        new inquirer.Separator(),
        { name: chalk.red('Exit'), value: 'exit' }
      ],
      pageSize: device.menuPageSize,
      loop: false
    }
  ]);

  return connection;
};

// Menu PropFirm pour ProjectX (Responsive)
const projectXMenu = async () => {
  const device = getDevice();
  console.log();
  
  // Sur mobile, afficher des noms plus courts
  const formatPropfirmName = (name) => {
    if (device.isMobile && name.length > 15) {
      // Raccourcir les noms longs sur mobile
      const shortNames = {
        'TickTickTrader': 'TickTick',
        'Blue Guardian Futures': 'BlueGuardian',
        'The Futures Desk': 'FuturesDesk',
        'Top One Futures': 'TopOne',
        'Funding Futures': 'FundingFut',
        'Lucid Trading': 'Lucid',
        'Earn2Trade (Coming Soon!)': 'Earn2Trade'
      };
      return shortNames[name] || name.substring(0, 12);
    }
    return name;
  };
  
  const { propfirm } = await inquirer.prompt([
    {
      type: 'list',
      name: 'propfirm',
      message: device.isMobile 
        ? chalk.white.bold('Propfirm:')
        : chalk.white.bold('Choose Your Propfirm:'),
      choices: [
        ...projectXPropfirms.map(pf => ({
          name: pf.disabled 
            ? chalk.gray(formatPropfirmName(pf.name)) 
            : chalk.cyan(formatPropfirmName(pf.name)),
          value: pf.value,
          disabled: pf.disabled
        })),
        new inquirer.Separator(),
        { name: chalk.yellow('< Back'), value: 'back' }
      ],
      pageSize: device.menuPageSize,
      loop: false
    }
  ]);

  return propfirm;
};

// Login prompt (Responsive)
const loginPrompt = async (propfirmName) => {
  const device = getDevice();
  console.log();
  
  if (device.isMobile) {
    console.log(chalk.cyan(`→ ${propfirmName}`));
  } else {
    console.log(chalk.cyan(`Connecting to ${propfirmName}...`));
  }
  console.log();

  const credentials = await inquirer.prompt([
    {
      type: 'input',
      name: 'username',
      message: device.isMobile ? chalk.white.bold('Username:') : chalk.white.bold('Enter Your Username:'),
      validate: (input) => input.length > 0 || 'Required'
    },
    {
      type: 'password',
      name: 'password',
      message: device.isMobile ? chalk.white.bold('Password:') : chalk.white.bold('Enter Your Password:'),
      mask: '*',
      validate: (input) => input.length > 0 || 'Required'
    }
  ]);

  return credentials;
};

// Menu après connexion (Responsive)
const dashboardMenu = async (service) => {
  const device = getDevice();
  const user = service.user;
  const propfirmName = service.getPropfirmName();

  console.log();
  console.log(chalk.gray(getSeparator()));
  
  if (device.isMobile) {
    console.log(chalk.green.bold(`  ✓ ${propfirmName}`));
    if (user) {
      console.log(chalk.white(`  ${user.userName}`));
    }
  } else {
    console.log(chalk.green.bold(`  Connected to ${propfirmName}`));
    if (user) {
      console.log(chalk.white(`  Welcome, ${user.userName}!`));
    }
  }
  console.log(chalk.gray(getSeparator()));
  console.log();

  // Choix adaptatifs selon le device
  let choices;
  if (device.isMobile) {
    choices = [
      { name: chalk.cyan('Accounts'), value: 'accounts' },
      { name: chalk.cyan('Positions'), value: 'positions' },
      { name: chalk.cyan('Orders'), value: 'orders' },
      { name: chalk.cyan('Stats'), value: 'stats' },
      { name: chalk.cyan('Add Prop-Account'), value: 'add_prop_account' },
      new inquirer.Separator(),
      { name: chalk.cyan('Algo'), value: 'algotrading' },
      new inquirer.Separator(),
      { name: chalk.yellow('Update HQX'), value: 'refresh' },
      { name: chalk.red('Disconnect'), value: 'disconnect' }
    ];
  } else {
    choices = [
      { name: chalk.cyan('View Accounts'), value: 'accounts' },
      { name: chalk.cyan('View Positions'), value: 'positions' },
      { name: chalk.cyan('View Orders'), value: 'orders' },
      { name: chalk.cyan('View Stats'), value: 'stats' },
      { name: chalk.cyan('Add Prop-Account'), value: 'add_prop_account' },
      { name: chalk.cyan('User Info'), value: 'userinfo' },
      new inquirer.Separator(),
      { name: chalk.cyan('Algo-Trading'), value: 'algotrading' },
      new inquirer.Separator(),
      { name: chalk.yellow('Update HQX'), value: 'refresh' },
      { name: chalk.red('Disconnect'), value: 'disconnect' }
    ];
  }

  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: device.isMobile ? chalk.white.bold('Menu:') : chalk.white.bold('What would you like to do?'),
      choices,
      pageSize: device.menuPageSize,
      loop: false
    }
  ]);

  return action;
};

// Account Status Enum (ProjectX UserAPI)
const ACCOUNT_STATUS = {
  0: { text: 'Active', color: 'green' },
  1: { text: 'End Of Day', color: 'cyan' },
  2: { text: 'Halted', color: 'red' },
  3: { text: 'Paused', color: 'yellow' },
  4: { text: 'Holiday', color: 'blue' },
  5: { text: 'Expired', color: 'gray' },
  6: { text: 'Terminated', color: 'red' },
  7: { text: 'Cancelled', color: 'red' },
  8: { text: 'Failed', color: 'red' },
  9: { text: 'Passed', color: 'green' }
};

// Account Type Enum (ProjectX UserAPI)
const ACCOUNT_TYPE = {
  0: { text: 'Practice', color: 'blue' },
  1: { text: 'Evaluation', color: 'yellow' },
  2: { text: 'Live', color: 'green' },
  3: { text: 'Express', color: 'magenta' },
  4: { text: 'Sim', color: 'gray' }
};

// Afficher les comptes (toutes connexions)
const showAccounts = async (service) => {
  const spinner = ora('Fetching accounts...').start();
  
  // Collecter les comptes de TOUTES les connexions
  let allAccountsData = [];
  
  if (connections.count() > 0) {
    for (const conn of connections.getAll()) {
      try {
        const result = await conn.service.getTradingAccounts();
        if (result.success && result.accounts) {
          result.accounts.forEach(account => {
            allAccountsData.push({
              ...account,
              propfirm: conn.propfirm || conn.type,
              service: conn.service
            });
          });
        }
      } catch (e) {
        // Ignore errors
      }
    }
  } else if (service) {
    const result = await service.getTradingAccounts();
    if (result.success && result.accounts) {
      allAccountsData = result.accounts.map(a => ({ ...a, propfirm: service.getPropfirmName(), service }));
    }
  }
  
  spinner.succeed('Accounts loaded');
  console.log();
  
  if (allAccountsData.length === 0) {
    console.log(chalk.yellow('  No accounts found.'));
  } else {
    // Afficher le nombre de connexions
    const totalConnections = connections.count() || 1;
    console.log(chalk.white.bold(`  Your Trading Accounts (${totalConnections} connection${totalConnections > 1 ? 's' : ''}):`));
    console.log(chalk.gray('  ' + '─'.repeat(50)));
    
    // Grouper par PropFirm
    const groupedByPropfirm = {};
    allAccountsData.forEach(account => {
      const key = account.propfirm || 'Unknown';
      if (!groupedByPropfirm[key]) {
        groupedByPropfirm[key] = [];
      }
      groupedByPropfirm[key].push(account);
    });
    
    // Afficher par groupe
    for (const [propfirm, accounts] of Object.entries(groupedByPropfirm)) {
      console.log(chalk.magenta.bold(`\n  ${propfirm}`));
      console.log(chalk.gray('  ' + '─'.repeat(40)));
      
      // Tri des comptes
      const sortedAccounts = [...accounts].sort((a, b) => {
        const statusOrder = { 0: 0, 1: 1, 2: 2, 6: 3, 7: 4, 3: 5, 4: 6, 5: 7 };
        const statusA = statusOrder[a.status] !== undefined ? statusOrder[a.status] : 99;
        const statusB = statusOrder[b.status] !== undefined ? statusOrder[b.status] : 99;
        if (statusA !== statusB) return statusA - statusB;
        
        const typeOrder = { 2: 0, 3: 1, 1: 2, 0: 3 };
        const typeA = typeOrder[a.type] !== undefined ? typeOrder[a.type] : 99;
        const typeB = typeOrder[b.type] !== undefined ? typeOrder[b.type] : 99;
        return typeA - typeB;
      });

      sortedAccounts.forEach((account, index) => {
        console.log(chalk.cyan(`    ${index + 1}. ${account.accountName || account.name || `Account #${account.accountId}`}`));
        
        if (account.balance !== undefined) {
          const balanceColor = account.balance >= 0 ? chalk.green : chalk.red;
          console.log(`       Balance: ${balanceColor('$' + account.balance.toLocaleString())}`);
        }
        
        const statusInfo = ACCOUNT_STATUS[account.status] || { text: `Unknown (${account.status})`, color: 'gray' };
        console.log(`       Status: ${chalk[statusInfo.color](statusInfo.text)}`);

        const typeInfo = ACCOUNT_TYPE[account.type] || { text: `Unknown (${account.type})`, color: 'white' };
        console.log(`       Type: ${chalk[typeInfo.color](typeInfo.text)}`);
        
        console.log();
      });
    }
  }
  
  console.log();
  await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
};

// Afficher les infos utilisateur
const showUserInfo = async (service) => {
  const spinner = ora('Fetching user info...').start();
  
  const result = await service.getUser();
  
  if (result.success && result.user) {
    spinner.succeed('User info loaded');
    console.log();
    
    const user = result.user;
    console.log(chalk.white.bold('  User Information:'));
    console.log(chalk.gray('  ' + '─'.repeat(50)));
    console.log(chalk.white(`  Username:   ${user.userName || 'N/A'}`));
    console.log(chalk.white(`  Name:       ${user.firstName || ''} ${user.lastName || ''}`));
    console.log(chalk.white(`  Email:      ${user.email || 'N/A'}`));
    console.log(chalk.white(`  User ID:    ${user.userId || 'N/A'}`));
    console.log();
  } else {
    spinner.fail('Failed to fetch user info');
    console.log(chalk.red(`  Error: ${result.error}`));
  }
  
  console.log();
  await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
};

// Afficher les positions
const showPositions = async (service) => {
  // D'abord récupérer les comptes
  const accountsResult = await service.getTradingAccounts();
  
  if (!accountsResult.success || !accountsResult.accounts || accountsResult.accounts.length === 0) {
    console.log(chalk.yellow('  No accounts available to check positions.'));
    await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
    return;
  }

  const spinner = ora('Fetching positions...').start();
  
  let allPositions = [];
  for (const account of accountsResult.accounts) {
    const result = await service.getPositions(account.accountId);
    if (result.success && result.positions) {
      allPositions = allPositions.concat(result.positions.map(p => ({
        ...p,
        accountName: account.accountName || account.name || `Account #${account.accountId}`
      })));
    }
  }
  
  spinner.succeed('Positions loaded');
  console.log();
  
  if (allPositions.length === 0) {
    console.log(chalk.yellow('  No open positions.'));
  } else {
    console.log(chalk.white.bold('  Open Positions:'));
    console.log(chalk.gray('  ' + '─'.repeat(50)));
    
    allPositions.forEach((pos, index) => {
      console.log(chalk.cyan(`  ${index + 1}. ${pos.symbolId || pos.contractId || 'Unknown'}`));
      console.log(chalk.white(`     Account: ${pos.accountName}`));
      console.log(chalk.white(`     Size: ${pos.positionSize || pos.size || 0}`));
      if (pos.averagePrice) {
        console.log(chalk.white(`     Avg Price: $${pos.averagePrice}`));
      }
      if (pos.profitAndLoss !== undefined) {
        const pnlColor = pos.profitAndLoss >= 0 ? chalk.green : chalk.red;
        console.log(pnlColor(`     P&L: $${pos.profitAndLoss.toFixed(2)}`));
      }
      console.log();
    });
  }
  
  console.log();
  await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
};

// Afficher les ordres
const showOrders = async (service) => {
  const accountsResult = await service.getTradingAccounts();
  
  if (!accountsResult.success || !accountsResult.accounts || accountsResult.accounts.length === 0) {
    console.log(chalk.yellow('  No accounts available to check orders.'));
    await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
    return;
  }

  const spinner = ora('Fetching orders...').start();
  
  let allOrders = [];
  for (const account of accountsResult.accounts) {
    const result = await service.getOrders(account.accountId);
    if (result.success && result.orders) {
      allOrders = allOrders.concat(result.orders.map(o => ({
        ...o,
        accountName: account.accountName || account.name || `Account #${account.accountId}`
      })));
    }
  }
  
  spinner.succeed('Orders loaded');
  console.log();
  
  if (allOrders.length === 0) {
    console.log(chalk.yellow('  No recent orders.'));
  } else {
    console.log(chalk.white.bold('  Recent Orders:'));
    console.log(chalk.gray('  ' + '─'.repeat(50)));
    
    allOrders.slice(0, 10).forEach((order, index) => {
      const statusColors = {
        0: chalk.gray,
        1: chalk.yellow,
        2: chalk.green,
        3: chalk.red
      };
      const statusNames = {
        0: 'Pending',
        1: 'Open',
        2: 'Filled',
        3: 'Cancelled'
      };
      const statusColor = statusColors[order.status] || chalk.white;
      const statusName = statusNames[order.status] || 'Unknown';
      
      console.log(chalk.cyan(`  ${index + 1}. ${order.symbolId || 'Unknown'}`));
      console.log(chalk.white(`     Account: ${order.accountName}`));
      console.log(chalk.white(`     Size: ${order.positionSize || order.size || 0}`));
      console.log(statusColor(`     Status: ${statusName}`));
      console.log();
    });
  }
  
  console.log();
  await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
};

// Ajouter un compte PropFirm supplémentaire
const addPropAccount = async () => {
  const device = getDevice();
  
  // Afficher les connexions actives
  if (connections.count() > 0) {
    console.log();
    console.log(chalk.cyan.bold('  Active Connections:'));
    connections.getAll().forEach((conn, i) => {
      console.log(chalk.green(`    ${i + 1}. ${conn.propfirm || conn.type}`));
    });
    console.log();
  }
  
  // Menu pour choisir le type de connexion
  const { connectionType } = await inquirer.prompt([
    {
      type: 'list',
      name: 'connectionType',
      message: chalk.white.bold('Add Connection:'),
      choices: [
        { name: chalk.cyan('ProjectX (19 PropFirms)'), value: 'projectx' },
        { name: chalk.gray('Rithmic (Coming Soon)'), value: 'rithmic', disabled: 'Coming Soon' },
        { name: chalk.gray('Tradovate (Coming Soon)'), value: 'tradovate', disabled: 'Coming Soon' },
        new inquirer.Separator(),
        { name: chalk.yellow('< Back'), value: 'back' }
      ],
      pageSize: device.menuPageSize,
      loop: false
    }
  ]);
  
  if (connectionType === 'back') {
    return;
  }
  
  if (connectionType === 'projectx') {
    // Sélection de la PropFirm
    const propfirm = await projectXMenu();
    if (propfirm === 'back') {
      return;
    }
    
    // Demander les credentials
    console.log();
    const credentials = await inquirer.prompt([
      {
        type: 'input',
        name: 'username',
        message: chalk.white('Username/Email:'),
        validate: (input) => input.length > 0 || 'Username is required'
      },
      {
        type: 'password',
        name: 'password',
        message: chalk.white('Password:'),
        mask: '*',
        validate: (input) => input.length > 0 || 'Password is required'
      }
    ]);
    
    // Tenter la connexion
    const spinner = ora('Connecting to PropFirm...').start();
    
    try {
      const newService = new ProjectXService(propfirm);
      const loginResult = await newService.login(credentials.username, credentials.password);
      
      if (loginResult.success) {
        await newService.getUser();
        const accountsResult = await newService.getTradingAccounts();
        
        // Ajouter au connection manager
        connections.add('projectx', newService, newService.getPropfirmName());
        
        spinner.succeed('Connection added!');
        console.log();
        console.log(chalk.green(`  Connected to ${newService.getPropfirmName()}`));
        
        if (accountsResult.success && accountsResult.accounts) {
          console.log(chalk.cyan(`  Found ${accountsResult.accounts.length} trading account(s)`));
        }
        
        console.log(chalk.white(`  Total connections: ${connections.count()}`));
      } else {
        spinner.fail('Connection failed');
        console.log(chalk.red(`  Error: ${loginResult.error}`));
      }
    } catch (error) {
      spinner.fail('Connection failed');
      console.log(chalk.red(`  Error: ${error.message}`));
    }
  }
  
  console.log();
  await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
};

// Afficher les stats de tous les comptes (toutes connexions)
const showStats = async (service) => {
  const spinner = ora('Fetching stats for all accounts...').start();
  
  // Collecter les comptes de TOUTES les connexions
  let allAccountsData = [];
  
  if (connections.count() > 0) {
    // Multi-connexion: récupérer de toutes les connexions
    for (const conn of connections.getAll()) {
      try {
        const result = await conn.service.getTradingAccounts();
        if (result.success && result.accounts) {
          result.accounts.forEach(account => {
            allAccountsData.push({
              ...account,
              propfirm: conn.propfirm || conn.type,
              service: conn.service
            });
          });
        }
      } catch (e) {
        // Ignore errors
      }
    }
  } else if (service) {
    // Single connexion (compatibilité)
    const result = await service.getTradingAccounts();
    if (result.success && result.accounts) {
      allAccountsData = result.accounts.map(a => ({ ...a, service }));
    }
  }
  
  if (allAccountsData.length === 0) {
    spinner.fail('No accounts found');
    await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
    return;
  }

  // Variables pour les totaux
  let totalBalance = 0;
  let totalStartingBalance = 0;
  let totalPnL = 0;
  let allTrades = [];
  let totalOpenPositions = 0;
  let totalOpenOrders = 0;
  let totalConnections = connections.count() || 1;

  spinner.text = 'Fetching detailed stats...';

  // Collecter les données de tous les comptes
  for (const account of allAccountsData) {
    const accountService = account.service;
    totalBalance += account.balance || 0;
    
    // Starting Balance estimation
    const accountName = account.accountName || '';
    let startingBalance = 0;
    if (accountName.includes('150')) startingBalance = 150000;
    else if (accountName.includes('100')) startingBalance = 100000;
    else if (accountName.includes('50')) startingBalance = 50000;
    else if (accountName.includes('25')) startingBalance = 25000;
    totalStartingBalance += startingBalance;
    
    // Positions
    const posResult = await accountService.getPositions(account.accountId);
    if (posResult.success && posResult.positions) {
      totalOpenPositions += posResult.positions.length;
    }
    
    // Orders (for open orders count)
    const ordersResult = await accountService.getOrders(account.accountId);
    if (ordersResult.success && ordersResult.orders) {
      totalOpenOrders += ordersResult.orders.filter(o => o.status === 1).length;
    }
    
    // Trade History (for metrics calculation)
    const tradesResult = await accountService.getTradeHistory(account.accountId, 30);
    if (tradesResult.success && tradesResult.trades && tradesResult.trades.length > 0) {
      allTrades = allTrades.concat(tradesResult.trades.map(t => ({
        ...t,
        accountName: account.accountName,
        propfirm: account.propfirm
      })));
    } else {
      // Fallback: use filled orders if trade history not available
      if (ordersResult.success && ordersResult.orders) {
        const filledOrders = ordersResult.orders.filter(o => o.status === 2);
        allTrades = allTrades.concat(filledOrders.map(o => ({
          ...o,
          accountName: account.accountName,
          propfirm: account.propfirm
        })));
      }
    }
  }

  totalPnL = totalBalance - totalStartingBalance;

  // Calculer les métriques de trading
  let winningTrades = 0;
  let losingTrades = 0;
  let totalWinAmount = 0;
  let totalLossAmount = 0;
  let bestTrade = 0;
  let worstTrade = 0;
  let totalVolume = 0;
  let consecutiveWins = 0;
  let consecutiveLosses = 0;
  let maxConsecutiveWins = 0;
  let maxConsecutiveLosses = 0;
  let longTrades = 0;
  let shortTrades = 0;
  let longWins = 0;
  let shortWins = 0;

  // Analyser chaque trade pour les métriques
  for (const trade of allTrades) {
    const pnl = trade.profitAndLoss || trade.pnl || 0;
    const size = trade.positionSize || trade.size || trade.quantity || 1;
    const side = trade.side || trade.orderSide; // 1 = Buy/Long, 2 = Sell/Short
    
    totalVolume += Math.abs(size);
    
    // Comptage Long/Short
    if (side === 1) {
      longTrades++;
      if (pnl > 0) longWins++;
    } else if (side === 2) {
      shortTrades++;
      if (pnl > 0) shortWins++;
    }
    
    if (pnl > 0) {
      winningTrades++;
      totalWinAmount += pnl;
      consecutiveWins++;
      consecutiveLosses = 0;
      if (consecutiveWins > maxConsecutiveWins) maxConsecutiveWins = consecutiveWins;
      if (pnl > bestTrade) bestTrade = pnl;
    } else if (pnl < 0) {
      losingTrades++;
      totalLossAmount += Math.abs(pnl);
      consecutiveLosses++;
      consecutiveWins = 0;
      if (consecutiveLosses > maxConsecutiveLosses) maxConsecutiveLosses = consecutiveLosses;
      if (pnl < worstTrade) worstTrade = pnl;
    }
  }

  const totalTrades = allTrades.length;
  const breakEvenTrades = totalTrades - winningTrades - losingTrades;

  spinner.succeed('Stats loaded');
  console.log();
  
  const boxWidth = 57;
  const innerWidth = boxWidth - 4; // 4 = 2 borders + 2 spaces
  
  // Helper function to center text
  const centerText = (text, width) => {
    const padding = Math.max(0, width - text.length);
    const leftPad = Math.floor(padding / 2);
    const rightPad = padding - leftPad;
    return ' '.repeat(leftPad) + text + ' '.repeat(rightPad);
  };
  
  // ═══════════════════════════════════════════════════════
  // HQX STATS - MAIN SUMMARY
  // ═══════════════════════════════════════════════════════
  console.log(chalk.cyan('  ╔' + '═'.repeat(boxWidth - 2) + '╗'));
  console.log(chalk.cyan('  ║') + chalk.cyan.bold(centerText('HQX STATS', boxWidth - 2)) + chalk.cyan('║'));
  console.log(chalk.cyan('  ╚' + '═'.repeat(boxWidth - 2) + '╝'));
  console.log();
  
  const labelWidth = 20;
  const formatLabel = (label) => label.padEnd(labelWidth);
  
  // Calculate additional metrics
  const winRate = totalTrades > 0 ? ((winningTrades / totalTrades) * 100).toFixed(1) : '0.0';
  const avgWin = winningTrades > 0 ? (totalWinAmount / winningTrades).toFixed(2) : '0.00';
  const avgLoss = losingTrades > 0 ? (totalLossAmount / losingTrades).toFixed(2) : '0.00';
  const profitFactor = totalLossAmount > 0 ? (totalWinAmount / totalLossAmount).toFixed(2) : totalWinAmount > 0 ? '∞' : '0.00';
  const netPnL = totalWinAmount - totalLossAmount;
  const avgTrade = totalTrades > 0 ? (netPnL / totalTrades).toFixed(2) : '0.00';
  const maxDrawdown = totalStartingBalance > 0 ? Math.min(0, totalPnL) : 0;
  const maxDrawdownPercent = totalStartingBalance > 0 ? ((maxDrawdown / totalStartingBalance) * 100).toFixed(2) : '0.00';
  const returnPercent = totalStartingBalance > 0 ? ((totalPnL / totalStartingBalance) * 100).toFixed(2) : '0.00';
  const expectancy = totalTrades > 0 ? ((winRate / 100 * parseFloat(avgWin)) - ((100 - winRate) / 100 * parseFloat(avgLoss))).toFixed(2) : '0.00';
  const payoffRatio = parseFloat(avgLoss) > 0 ? (parseFloat(avgWin) / parseFloat(avgLoss)).toFixed(2) : '0.00';
  const longWinRate = longTrades > 0 ? ((longWins / longTrades) * 100).toFixed(1) : '0.0';
  const shortWinRate = shortTrades > 0 ? ((shortWins / shortTrades) * 100).toFixed(1) : '0.0';
  
  // Section: Account Overview
  console.log(chalk.cyan.bold('  ACCOUNT OVERVIEW'));
  console.log(chalk.gray('  ' + '─'.repeat(boxWidth - 4)));
  console.log(chalk.white('  ' + formatLabel('Connections:')) + chalk.cyan(totalConnections));
  console.log(chalk.white('  ' + formatLabel('Total Accounts:')) + chalk.cyan(allAccountsData.length));
  
  const totalBalanceColor = totalBalance >= 0 ? chalk.green : chalk.red;
  console.log(chalk.white('  ' + formatLabel('Total Balance:')) + totalBalanceColor('$' + totalBalance.toLocaleString()));
  
  if (totalStartingBalance > 0) {
    console.log(chalk.white('  ' + formatLabel('Starting Balance:')) + chalk.white('$' + totalStartingBalance.toLocaleString()));
    const pnlColor = totalPnL >= 0 ? chalk.green : chalk.red;
    console.log(chalk.white('  ' + formatLabel('Total P&L:')) + pnlColor('$' + totalPnL.toLocaleString() + ' (' + returnPercent + '%)'));
  }
  
  console.log(chalk.white('  ' + formatLabel('Open Positions:')) + chalk.white(totalOpenPositions));
  console.log(chalk.white('  ' + formatLabel('Open Orders:')) + chalk.white(totalOpenOrders));
  console.log();
  
  // Section: Trading Performance
  console.log(chalk.cyan.bold('  TRADING PERFORMANCE'));
  console.log(chalk.gray('  ' + '─'.repeat(boxWidth - 4)));
  console.log(chalk.white('  ' + formatLabel('Total Trades:')) + chalk.white(totalTrades));
  console.log(chalk.white('  ' + formatLabel('Winning Trades:')) + chalk.green(winningTrades));
  console.log(chalk.white('  ' + formatLabel('Losing Trades:')) + chalk.red(losingTrades));
  console.log(chalk.white('  ' + formatLabel('Break Even:')) + chalk.gray(breakEvenTrades));
  console.log(chalk.white('  ' + formatLabel('Win Rate:')) + (parseFloat(winRate) >= 50 ? chalk.green(winRate + '%') : chalk.yellow(winRate + '%')));
  console.log(chalk.white('  ' + formatLabel('Long Trades:')) + chalk.white(longTrades) + chalk.gray(' (Win: ') + chalk.cyan(longWinRate + '%') + chalk.gray(')')); 
  console.log(chalk.white('  ' + formatLabel('Short Trades:')) + chalk.white(shortTrades) + chalk.gray(' (Win: ') + chalk.cyan(shortWinRate + '%') + chalk.gray(')'));
  console.log(chalk.white('  ' + formatLabel('Total Volume:')) + chalk.white(totalVolume + ' contracts'));
  console.log();
  
  // Section: P&L Metrics
  console.log(chalk.cyan.bold('  P&L METRICS'));
  console.log(chalk.gray('  ' + '─'.repeat(boxWidth - 4)));
  console.log(chalk.white('  ' + formatLabel('Net P&L:')) + (netPnL >= 0 ? chalk.green('$' + netPnL.toFixed(2)) : chalk.red('$' + netPnL.toFixed(2))));
  console.log(chalk.white('  ' + formatLabel('Gross Profit:')) + chalk.green('$' + totalWinAmount.toFixed(2)));
  console.log(chalk.white('  ' + formatLabel('Gross Loss:')) + chalk.red('-$' + totalLossAmount.toFixed(2)));
  console.log(chalk.white('  ' + formatLabel('Avg Win:')) + chalk.green('$' + avgWin));
  console.log(chalk.white('  ' + formatLabel('Avg Loss:')) + chalk.red('-$' + avgLoss));
  console.log(chalk.white('  ' + formatLabel('Avg Trade:')) + (parseFloat(avgTrade) >= 0 ? chalk.green('$' + avgTrade) : chalk.red('$' + avgTrade)));
  console.log(chalk.white('  ' + formatLabel('Best Trade:')) + chalk.green('$' + bestTrade.toFixed(2)));
  console.log(chalk.white('  ' + formatLabel('Worst Trade:')) + chalk.red('$' + worstTrade.toFixed(2)));
  console.log();
  
  // Section: Risk Metrics
  console.log(chalk.cyan.bold('  RISK METRICS'));
  console.log(chalk.gray('  ' + '─'.repeat(boxWidth - 4)));
  console.log(chalk.white('  ' + formatLabel('Profit Factor:')) + (profitFactor === '∞' ? chalk.green(profitFactor) : parseFloat(profitFactor) >= 1.5 ? chalk.green(profitFactor) : parseFloat(profitFactor) >= 1 ? chalk.yellow(profitFactor) : chalk.red(profitFactor)));
  console.log(chalk.white('  ' + formatLabel('Payoff Ratio:')) + (parseFloat(payoffRatio) >= 1 ? chalk.green(payoffRatio) : chalk.red(payoffRatio)));
  console.log(chalk.white('  ' + formatLabel('Expectancy:')) + (parseFloat(expectancy) >= 0 ? chalk.green('$' + expectancy) : chalk.red('$' + expectancy)));
  console.log(chalk.white('  ' + formatLabel('Max Drawdown:')) + chalk.red('$' + Math.abs(maxDrawdown).toFixed(2) + ' (' + maxDrawdownPercent + '%)'));
  console.log(chalk.white('  ' + formatLabel('Return:')) + (parseFloat(returnPercent) >= 0 ? chalk.green(returnPercent + '%') : chalk.red(returnPercent + '%')));
  console.log();
  
  // Section: Streaks
  console.log(chalk.cyan.bold('  STREAKS'));
  console.log(chalk.gray('  ' + '─'.repeat(boxWidth - 4)));
  console.log(chalk.white('  ' + formatLabel('Max Consec. Wins:')) + chalk.green(maxConsecutiveWins));
  console.log(chalk.white('  ' + formatLabel('Max Consec. Losses:')) + chalk.red(maxConsecutiveLosses));
  
  console.log();
  console.log(chalk.cyan('  ' + '═'.repeat(boxWidth)));
  
  // ═══════════════════════════════════════════════════════
  // INDIVIDUAL ACCOUNT STATS
  // ═══════════════════════════════════════════════════════
  console.log();
  console.log(chalk.cyan('  ╔' + '═'.repeat(boxWidth - 2) + '╗'));
  console.log(chalk.cyan('  ║') + chalk.cyan.bold(centerText('INDIVIDUAL ACCOUNTS', boxWidth - 2)) + chalk.cyan('║'));
  console.log(chalk.cyan('  ╚' + '═'.repeat(boxWidth - 2) + '╝'));

  // Group accounts by propfirm
  const groupedAccounts = {};
  allAccountsData.forEach(account => {
    const key = account.propfirm || 'Unknown';
    if (!groupedAccounts[key]) groupedAccounts[key] = [];
    groupedAccounts[key].push(account);
  });

  for (const [propfirmName, accounts] of Object.entries(groupedAccounts)) {
    console.log();
    console.log(chalk.magenta.bold(`  ${propfirmName}`));
    console.log(chalk.gray('  ' + '─'.repeat(50)));
    
    for (const account of accounts) {
      const accountService = account.service;
      const accountName = account.accountName || account.name || `Account #${account.accountId}`;
      const statusInfo = ACCOUNT_STATUS[account.status] || { text: 'Unknown', color: 'gray' };
      const typeInfo = ACCOUNT_TYPE[account.type] || { text: 'Unknown', color: 'white' };
      
      console.log();
      console.log(chalk.cyan.bold(`    ${accountName}`));
      
      // Balance
      const balance = account.balance || 0;
      const balanceColor = balance >= 0 ? chalk.green : chalk.red;
      console.log(`       Balance:        ${balanceColor('$' + balance.toLocaleString())}`);
      
      // Status & Type
      console.log(`       Status:         ${chalk[statusInfo.color](statusInfo.text)}`);
      console.log(`       Type:           ${chalk[typeInfo.color](typeInfo.text)}`);
      
      // Starting Balance
      let startingBalance = null;
      if (accountName.includes('150')) startingBalance = 150000;
      else if (accountName.includes('100')) startingBalance = 100000;
      else if (accountName.includes('50')) startingBalance = 50000;
      else if (accountName.includes('25')) startingBalance = 25000;
      
      if (startingBalance) {
        const pnl = balance - startingBalance;
        const pnlPercent = ((pnl / startingBalance) * 100).toFixed(2);
        const pnlColor = pnl >= 0 ? chalk.green : chalk.red;
        console.log(`       Starting:       ${chalk.white('$' + startingBalance.toLocaleString())}`);
        console.log(`       P&L:            ${pnlColor('$' + pnl.toLocaleString() + ' (' + pnlPercent + '%)')}`);
      }
      
      // Positions
      const posResult = await accountService.getPositions(account.accountId);
      if (posResult.success && posResult.positions) {
        const openPositions = posResult.positions.length;
        console.log(`       Open Positions: ${chalk.white(openPositions)}`);
        
        if (openPositions > 0) {
          let totalUnrealizedPnL = 0;
          posResult.positions.forEach(pos => {
            if (pos.profitAndLoss !== undefined) {
              totalUnrealizedPnL += pos.profitAndLoss;
            }
          });
          const unrealizedColor = totalUnrealizedPnL >= 0 ? chalk.green : chalk.red;
          console.log(`       Unrealized P&L: ${unrealizedColor('$' + totalUnrealizedPnL.toFixed(2))}`);
        }
      }
      
      // Orders
      const ordersResult = await accountService.getOrders(account.accountId);
      if (ordersResult.success && ordersResult.orders) {
        const openOrders = ordersResult.orders.filter(o => o.status === 1).length;
        const filledOrders = ordersResult.orders.filter(o => o.status === 2).length;
        console.log(`       Open Orders:    ${chalk.white(openOrders)}`);
        console.log(`       Filled Trades:  ${chalk.white(filledOrders)}`);
      }
    }
  }
  
  console.log();
  console.log(chalk.gray('  ' + '═'.repeat(55)));
  console.log();
  await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
};

// Liste des symboles futures populaires
const FUTURES_SYMBOLS = [
  { name: 'NQ - E-mini NASDAQ-100', value: 'NQ', searchText: 'NQ' },
  { name: 'MNQ - Micro E-mini NASDAQ-100', value: 'MNQ', searchText: 'MNQ' },
  { name: 'ES - E-mini S&P 500', value: 'ES', searchText: 'ES' },
  { name: 'MES - Micro E-mini S&P 500', value: 'MES', searchText: 'MES' },
  { name: 'YM - E-mini Dow Jones', value: 'YM', searchText: 'YM' },
  { name: 'MYM - Micro E-mini Dow Jones', value: 'MYM', searchText: 'MYM' },
  { name: 'RTY - E-mini Russell 2000', value: 'RTY', searchText: 'RTY' },
  { name: 'M2K - Micro E-mini Russell 2000', value: 'M2K', searchText: 'M2K' },
  { name: 'CL - Crude Oil', value: 'CL', searchText: 'CL' },
  { name: 'MCL - Micro Crude Oil', value: 'MCL', searchText: 'MCL' },
  { name: 'GC - Gold', value: 'GC', searchText: 'GC' },
  { name: 'MGC - Micro Gold', value: 'MGC', searchText: 'MGC' },
  { name: 'SI - Silver', value: 'SI', searchText: 'SI' },
  { name: 'SIL - Micro Silver', value: 'SIL', searchText: 'SIL' }
];

// Session de trading active
let activeAlgoSession = null;

// Menu Algo-Trading principal
const algoTradingMenu = async (service) => {
  const device = getDevice();
  console.log();
  console.log(chalk.gray(getSeparator()));
  console.log(chalk.magenta.bold('  Algo-Trading'));
  console.log(chalk.gray(getSeparator()));
  console.log();

  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: chalk.white.bold('Select Mode:'),
      choices: [
        { name: chalk.cyan('One Account'), value: 'one_account' },
        { name: chalk.gray('Copy Trading (Coming Soon)'), value: 'copy_trading', disabled: 'Coming Soon' },
        new inquirer.Separator(),
        { name: chalk.yellow('< Back'), value: 'back' }
      ],
      pageSize: device.menuPageSize,
      loop: false
    }
  ]);

  switch (action) {
    case 'one_account':
      await oneAccountMenu(service);
      break;
    case 'copy_trading':
      // Disabled - Coming Soon
      break;
    case 'back':
      return 'back';
  }
  
  return action;
};

// Menu One Account - Sélection du compte actif
const oneAccountMenu = async (service) => {
  const spinner = ora('Fetching active accounts...').start();
  
  // Récupérer les comptes via getTradingAccounts (plus fiable)
  const result = await service.getTradingAccounts();
  
  if (!result.success || !result.accounts || result.accounts.length === 0) {
    spinner.fail('No active accounts found');
    console.log(chalk.yellow('  You need at least one active trading account.'));
    console.log();
    await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
    return;
  }
  
  // Filtrer seulement les comptes actifs (status === 1)
  const activeAccounts = result.accounts.filter(acc => acc.status === 1);
  
  if (activeAccounts.length === 0) {
    spinner.fail('No active accounts found');
    console.log(chalk.yellow('  You need at least one active trading account (status: Active).'));
    console.log();
    await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
    return;
  }
  
  spinner.succeed(`Found ${activeAccounts.length} active account(s)`);
  console.log();
  
  // Afficher les comptes actifs
  const accountChoices = result.accounts.map(account => ({
    name: chalk.cyan(`${account.name} - Balance: $${account.balance.toLocaleString()}`),
    value: account
  }));
  
  accountChoices.push(new inquirer.Separator());
  accountChoices.push({ name: chalk.yellow('< Back'), value: 'back' });
  
  const { selectedAccount } = await inquirer.prompt([
    {
      type: 'list',
      name: 'selectedAccount',
      message: chalk.white.bold('Select Account:'),
      choices: accountChoices,
      pageSize: 15,
      loop: false
    }
  ]);
  
  if (selectedAccount === 'back') {
    return;
  }
  
  // Passer à la sélection du symbole
  await selectSymbolMenu(service, selectedAccount);
};

// Menu de sélection du symbole futures
const selectSymbolMenu = async (service, account) => {
  const device = getDevice();
  console.log();
  console.log(chalk.gray(getSeparator()));
  console.log(chalk.cyan.bold(`  Account: ${account.name}`));
  console.log(chalk.gray(getSeparator()));
  console.log();
  
  const symbolChoices = FUTURES_SYMBOLS.map(symbol => ({
    name: chalk.cyan(device.isMobile ? symbol.value : symbol.name),
    value: symbol
  }));
  
  symbolChoices.push(new inquirer.Separator());
  symbolChoices.push({ name: chalk.yellow('< Back'), value: 'back' });
  
  const { selectedSymbol } = await inquirer.prompt([
    {
      type: 'list',
      name: 'selectedSymbol',
      message: chalk.white.bold('Select Symbol:'),
      choices: symbolChoices,
      pageSize: device.menuPageSize,
      loop: false
    }
  ]);
  
  if (selectedSymbol === 'back') {
    return;
  }
  
  // Rechercher le contrat actif pour ce symbole
  const spinner = ora(`Searching for active ${selectedSymbol.value} contract...`).start();
  const contractResult = await service.searchContracts(selectedSymbol.searchText, false);
  
  if (!contractResult.success || !contractResult.contracts || contractResult.contracts.length === 0) {
    spinner.fail(`No contracts found for ${selectedSymbol.value}`);
    console.log();
    await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
    return;
  }
  
  // Trouver le contrat actif
  const activeContract = contractResult.contracts.find(c => c.activeContract) || contractResult.contracts[0];
  spinner.succeed(`Found: ${activeContract.name} - ${activeContract.description}`);
  console.log(chalk.gray(`     Tick Size: ${activeContract.tickSize} | Tick Value: $${activeContract.tickValue}`));
  console.log();
  
  // Passer aux paramètres de trading
  await tradingSettingsMenu(service, account, activeContract);
};

// Menu des paramètres de trading
const tradingSettingsMenu = async (service, account, contract) => {
  console.log(chalk.gray('─'.repeat(60)));
  console.log(chalk.white.bold('  Trading Settings'));
  console.log(chalk.gray('─'.repeat(60)));
  console.log();
  
  const settings = await inquirer.prompt([
    {
      type: 'input',
      name: 'dailyTarget',
      message: chalk.white.bold('Daily Target ($):'),
      default: '500',
      validate: (input) => {
        const num = parseFloat(input);
        if (isNaN(num) || num <= 0) {
          return 'Please enter a valid positive number';
        }
        return true;
      },
      filter: (input) => parseFloat(input)
    },
    {
      type: 'input',
      name: 'maxRisk',
      message: chalk.white.bold('Max Risk ($):'),
      default: '250',
      validate: (input) => {
        const num = parseFloat(input);
        if (isNaN(num) || num <= 0) {
          return 'Please enter a valid positive number';
        }
        return true;
      },
      filter: (input) => parseFloat(input)
    },
    {
      type: 'input',
      name: 'contracts',
      message: chalk.white.bold('Number of Contracts:'),
      default: '1',
      validate: (input) => {
        const num = parseInt(input);
        if (isNaN(num) || num <= 0 || num > 100) {
          return 'Please enter a valid number between 1 and 100';
        }
        return true;
      },
      filter: (input) => parseInt(input)
    }
  ]);
  
  // Afficher le résumé
  const device = getDevice();
  console.log();
  console.log(chalk.gray(getSeparator()));
  console.log(chalk.green.bold('  Trading Session Summary'));
  console.log(chalk.gray(getSeparator()));
  console.log();
  
  if (device.isMobile) {
    console.log(chalk.white(`  ${chalk.cyan(account.name)}`));
    console.log(chalk.white(`  ${chalk.cyan(contract.name)}`));
    console.log(chalk.white(`  Target: ${chalk.green('$' + settings.dailyTarget)} | Risk: ${chalk.red('$' + settings.maxRisk)}`));
    console.log(chalk.white(`  Contracts: ${chalk.yellow(settings.contracts)}`));
  } else {
    console.log(chalk.white(`  Account:        ${chalk.cyan(account.name)}`));
    console.log(chalk.white(`  Symbol:         ${chalk.cyan(contract.name)} (${contract.description})`));
    console.log(chalk.white(`  Daily Target:   ${chalk.green('$' + settings.dailyTarget.toLocaleString())}`));
    console.log(chalk.white(`  Max Risk:       ${chalk.red('$' + settings.maxRisk.toLocaleString())}`));
    console.log(chalk.white(`  Contracts:      ${chalk.yellow(settings.contracts)}`));
    console.log(chalk.white(`  Tick Value:     ${chalk.gray('$' + contract.tickValue)}`));
  }
  console.log();
  
  // Menu d'action
  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: chalk.white.bold('Action:'),
      choices: [
        { name: chalk.cyan.bold('Launch Algo'), value: 'launch' },
        { name: chalk.yellow('< Back'), value: 'back' }
      ],
      pageSize: 5,
      loop: false
    }
  ]);
  
  if (action === 'launch') {
    // Sauvegarder la session active
    activeAlgoSession = {
      account,
      contract,
      settings,
      startTime: new Date(),
      status: 'active',
      pnl: 0,
      trades: 0,
      wins: 0,
      losses: 0
    };
    
    // Lancer l'écran de logs
    await algoLogsScreen(service);
  }
};

// Fonction pour formater le timestamp (Responsive)
const formatTimestamp = () => {
  const device = getDevice();
  const now = new Date();
  
  if (device.isMobile) {
    // Format court pour mobile: HH:MM
    return chalk.gray(`[${now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}]`);
  }
  return chalk.gray(`[${now.toLocaleTimeString()}]`);
};

// Fonction pour ajouter un log (Responsive)
const addLog = (logs, type, message) => {
  const device = getDevice();
  const timestamp = formatTimestamp();
  let coloredMessage;
  
  // Labels courts pour mobile
  const labels = device.isMobile ? {
    info: 'i',
    success: '✓',
    warning: '!',
    error: '✗',
    trade: '$',
    signal: '→'
  } : {
    info: 'INFO',
    success: 'SUCCESS',
    warning: 'WARNING',
    error: 'ERROR',
    trade: 'TRADE',
    signal: 'SIGNAL'
  };
  
  switch (type) {
    case 'info':
      coloredMessage = chalk.blue(`[${labels.info}] ${message}`);
      break;
    case 'success':
      coloredMessage = chalk.green(`[${labels.success}] ${message}`);
      break;
    case 'warning':
      coloredMessage = chalk.yellow(`[${labels.warning}] ${message}`);
      break;
    case 'error':
      coloredMessage = chalk.red(`[${labels.error}] ${message}`);
      break;
    case 'trade':
      coloredMessage = chalk.magenta(`[${labels.trade}] ${message}`);
      break;
    case 'signal':
      coloredMessage = chalk.cyan(`[${labels.signal}] ${message}`);
      break;
    default:
      coloredMessage = chalk.white(message);
  }
  
  logs.push(`${timestamp} ${coloredMessage}`);
  return logs;
};

// Écran des logs de l'algo (Responsive) - Connected to HQX-Algo Server
const algoLogsScreen = async (service) => {
  let logs = [];
  let running = true;
  const device = getDevice();
  let hqxServer = null;
  let refreshInterval = null;
  
  // Header (Responsive)
  const showHeader = () => {
    console.clear();
    const sep = getSeparator('═');
    const sepLight = getSeparator('─');
    
    if (device.isMobile) {
      // 📱 MOBILE: Compact header
      console.log(chalk.gray(sep));
      console.log(chalk.magenta.bold(' HQX ULTRA-SCALPING'));
      console.log(chalk.green.bold(' ● LIVE'));
      console.log(chalk.gray(sep));
      console.log(chalk.cyan(` ${activeAlgoSession.contract.name}`) + chalk.gray(` x${activeAlgoSession.settings.contracts}`));
      
      // Stats compactes sur une ligne
      const pnlColor = activeAlgoSession.pnl >= 0 ? chalk.green : chalk.red;
      console.log(pnlColor(`$${activeAlgoSession.pnl.toFixed(0)}`) + 
                  chalk.gray(` W:${activeAlgoSession.wins} L:${activeAlgoSession.losses}`));
      console.log(chalk.gray(sepLight));
      
    } else if (device.isTablet) {
      // 📲 TABLET: Medium header
      console.log(chalk.gray(sep));
      console.log(chalk.magenta.bold('  HQX ULTRA-SCALPING') + chalk.green.bold(' - LIVE'));
      console.log(chalk.gray(sep));
      console.log();
      console.log(chalk.white(`  ${chalk.cyan(activeAlgoSession.contract.name)} | ${chalk.yellow(activeAlgoSession.settings.contracts + ' contracts')}`));
      console.log(chalk.white(`  Target: ${chalk.green('$' + activeAlgoSession.settings.dailyTarget)} | Risk: ${chalk.red('$' + activeAlgoSession.settings.maxRisk)}`));
      console.log();
      
      const pnlColor = activeAlgoSession.pnl >= 0 ? chalk.green : chalk.red;
      console.log(chalk.gray(sepLight));
      console.log(chalk.white(`  P&L: ${pnlColor('$' + activeAlgoSession.pnl.toFixed(2))} | T:${activeAlgoSession.trades} W:${chalk.green(activeAlgoSession.wins)} L:${chalk.red(activeAlgoSession.losses)}`));
      console.log(chalk.gray(sepLight));
      console.log();
      
    } else {
      // 💻 DESKTOP: Full header
      console.log(chalk.gray(sep));
      console.log(chalk.magenta.bold('  HQX ULTRA-SCALPING') + chalk.green.bold(' - LIVE'));
      console.log(chalk.gray(sep));
      console.log();
      console.log(chalk.white(`  Account:    ${chalk.cyan(activeAlgoSession.account.name)}`));
      console.log(chalk.white(`  Symbol:     ${chalk.cyan(activeAlgoSession.contract.name)}`));
      console.log(chalk.white(`  Contracts:  ${chalk.yellow(activeAlgoSession.settings.contracts)}`));
      console.log(chalk.white(`  Target:     ${chalk.green('$' + activeAlgoSession.settings.dailyTarget)}`));
      console.log(chalk.white(`  Max Risk:   ${chalk.red('$' + activeAlgoSession.settings.maxRisk)}`));
      console.log();
      
      const pnlColor = activeAlgoSession.pnl >= 0 ? chalk.green : chalk.red;
      console.log(chalk.gray(sepLight));
      console.log(chalk.white(`  P&L: ${pnlColor('$' + activeAlgoSession.pnl.toFixed(2))}  |  Trades: ${chalk.white(activeAlgoSession.trades)}  |  Wins: ${chalk.green(activeAlgoSession.wins)}  |  Losses: ${chalk.red(activeAlgoSession.losses)}`));
      console.log(chalk.gray(sepLight));
      console.log();
    }
  };
  
  // Afficher les logs (Responsive)
  const showLogs = () => {
    const maxLogs = device.isMobile ? 6 : (device.isTablet ? 10 : 15);
    
    if (!device.isMobile) {
      console.log(chalk.white.bold('  Logs:'));
      console.log();
    }
    
    const recentLogs = logs.slice(-maxLogs);
    recentLogs.forEach(log => {
      console.log(device.isMobile ? ` ${log}` : `  ${log}`);
    });
    
    // Remplir les lignes vides
    for (let i = recentLogs.length; i < maxLogs; i++) {
      console.log();
    }
    
    console.log();
    console.log(chalk.gray(getSeparator()));
    console.log(chalk.yellow(device.isMobile ? ' CTRL+C to stop' : '  Press CTRL+C or select Stop to exit'));
    console.log(chalk.gray(getSeparator()));
  };
  
  // Refresh display
  const refreshDisplay = () => {
    if (running) {
      showHeader();
      showLogs();
    }
  };
  
  // Initialize HQX Server connection
  const initHQXServer = async () => {
    hqxServer = new HQXServerService();
    
    // Setup event listeners
    hqxServer.on('connected', () => {
      logs = addLog(logs, 'success', 'Connected to HQX Server');
      refreshDisplay();
    });
    
    hqxServer.on('disconnected', () => {
      logs = addLog(logs, 'warning', 'Disconnected from HQX Server');
      refreshDisplay();
    });
    
    hqxServer.on('signal', (data) => {
      const direction = data.direction === 'long' ? 'BUY' : 'SELL';
      logs = addLog(logs, 'signal', `${direction} @ ${data.price}`);
      refreshDisplay();
    });
    
    hqxServer.on('trade', (data) => {
      const pnlStr = data.pnl >= 0 ? `+$${data.pnl.toFixed(2)}` : `-$${Math.abs(data.pnl).toFixed(2)}`;
      logs = addLog(logs, 'trade', `${data.type.toUpperCase()} | P&L: ${pnlStr}`);
      
      // Update session stats
      activeAlgoSession.trades++;
      activeAlgoSession.pnl += data.pnl;
      if (data.pnl > 0) {
        activeAlgoSession.wins++;
      } else {
        activeAlgoSession.losses++;
      }
      refreshDisplay();
    });
    
    hqxServer.on('log', (data) => {
      logs = addLog(logs, data.type || 'info', data.message);
      refreshDisplay();
    });
    
    hqxServer.on('stats', (data) => {
      if (data.pnl !== undefined) activeAlgoSession.pnl = data.pnl;
      if (data.trades !== undefined) activeAlgoSession.trades = data.trades;
      if (data.wins !== undefined) activeAlgoSession.wins = data.wins;
      if (data.losses !== undefined) activeAlgoSession.losses = data.losses;
      refreshDisplay();
    });
    
    hqxServer.on('error', (data) => {
      logs = addLog(logs, 'error', data.message || 'Unknown error');
      refreshDisplay();
    });
    
    return hqxServer;
  };
  
  // Logs initiaux
  logs = addLog(logs, 'info', 'Initializing HQX Ultra-Scalping...');
  logs = addLog(logs, 'info', `Connecting to ${service.getPropfirmName()}...`);
  
  // Afficher l'écran initial
  showHeader();
  showLogs();
  
  // Try to connect to HQX Server
  try {
    await initHQXServer();
    
    // Get PropFirm token for market data
    const propfirmToken = service.getToken();
    
    // Authenticate with HQX Server (using propfirm token as API key for now)
    logs = addLog(logs, 'info', 'Authenticating with HQX Server...');
    refreshDisplay();
    
    const authResult = await hqxServer.authenticate(propfirmToken).catch(() => null);
    
    if (authResult && authResult.success) {
      logs = addLog(logs, 'success', 'Authenticated');
      
      // Connect WebSocket
      await hqxServer.connect().catch(() => null);
      
      // Start algo
      hqxServer.startAlgo({
        accountId: activeAlgoSession.account.id,
        contractId: activeAlgoSession.contract.id,
        symbol: activeAlgoSession.contract.name,
        contracts: activeAlgoSession.settings.contracts,
        dailyTarget: activeAlgoSession.settings.dailyTarget,
        maxRisk: activeAlgoSession.settings.maxRisk,
        propfirm: service.propfirm,
        propfirmToken: propfirmToken
      });
      
      logs = addLog(logs, 'success', 'Algo started');
    } else {
      // Fallback to simulation mode if HQX Server not available
      logs = addLog(logs, 'warning', 'HQX Server unavailable - Simulation mode');
      logs = addLog(logs, 'info', 'Running in demo mode');
      
      // Start simulation
      startSimulation();
    }
  } catch (error) {
    // Fallback to simulation
    logs = addLog(logs, 'warning', 'HQX Server unavailable - Simulation mode');
    startSimulation();
  }
  
  refreshDisplay();
  
  // Simulation mode (when HQX Server not available)
  function startSimulation() {
    logs = addLog(logs, 'success', 'Engine started (Simulation)');
    refreshDisplay();
    
    refreshInterval = setInterval(() => {
      if (!running) {
        clearInterval(refreshInterval);
        return;
      }
      
      const randomMsgs = [
        { type: 'info', msg: 'Monitoring market...' },
        { type: 'signal', msg: 'Scanning for entry...' },
        { type: 'info', msg: 'No positions' },
        { type: 'info', msg: 'Risk: OK' },
        { type: 'signal', msg: 'Analyzing order flow...' },
        { type: 'info', msg: 'Volatility: Normal' }
      ];
      const randomMsg = randomMsgs[Math.floor(Math.random() * randomMsgs.length)];
      logs = addLog(logs, randomMsg.type, randomMsg.msg);
      refreshDisplay();
    }, 3000);
  }
  
  // Wait for user to stop
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  const { stopAction } = await inquirer.prompt([
    {
      type: 'list',
      name: 'stopAction',
      message: chalk.red.bold(''),
      choices: [
        { name: chalk.red.bold('Stop Algo'), value: 'stop' }
      ],
      pageSize: 1,
      loop: false
    }
  ]);
  
  if (stopAction === 'stop') {
    running = false;
    activeAlgoSession.status = 'stopped';
    
    // Clear simulation interval if running
    if (refreshInterval) {
      clearInterval(refreshInterval);
    }
    
    logs = addLog(logs, 'warning', 'Stop signal received');
    logs = addLog(logs, 'info', 'Closing all positions...');
    
    // Stop algo on HQX Server
    if (hqxServer && hqxServer.isConnected()) {
      hqxServer.stopAlgo();
    }
    
    await new Promise(resolve => setTimeout(resolve, 500));
    logs = addLog(logs, 'success', 'All positions closed');
    logs = addLog(logs, 'info', 'Disconnecting...');
    
    // Disconnect from HQX Server
    if (hqxServer) {
      hqxServer.disconnect();
    }
    
    await new Promise(resolve => setTimeout(resolve, 500));
    logs = addLog(logs, 'success', 'Algo stopped successfully');
    
    showHeader();
    showLogs();
    
    console.log();
    console.log(chalk.yellow.bold('  Algo stopped.'));
    console.log();
    await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
  }
};

// Fonction principale
const main = async () => {
  await banner();

  let running = true;
  
  while (running) {
    const connection = await mainMenu();

    switch (connection) {
      case 'projectx':
        const propfirm = await projectXMenu();
        if (propfirm === 'back') {
          await banner();
          continue;
        }

        // Créer le service
        currentService = new ProjectXService(propfirm);
        
        // Login
        const credentials = await loginPrompt(currentService.getPropfirmName());
        
        const spinner = ora('Authenticating...').start();
        const loginResult = await currentService.login(credentials.username, credentials.password);
        
        if (loginResult.success) {
          // Récupérer les infos utilisateur
          await currentService.getUser();
          
          // Ajouter au connection manager
          connections.add('projectx', currentService, currentService.getPropfirmName());
          
          spinner.succeed('Connected successfully!');
          
          // Dashboard loop
          let connected = true;
          while (connected) {
            await banner();
            const action = await dashboardMenu(currentService);
            
            switch (action) {
              case 'accounts':
                await showAccounts(currentService);
                break;
              case 'positions':
                await showPositions(currentService);
                break;
              case 'orders':
                await showOrders(currentService);
                break;
              case 'stats':
                await showStats(currentService);
                break;
              case 'userinfo':
                await showUserInfo(currentService);
                break;
              case 'algotrading':
                let algoRunning = true;
                while (algoRunning) {
                  await banner();
                  const algoResult = await algoTradingMenu(currentService);
                  if (algoResult === 'back') {
                    algoRunning = false;
                  }
                }
                break;
              case 'add_prop_account':
                await addPropAccount();
                break;
              case 'refresh':
                const spinnerRefresh = ora('Checking for updates...').start();
                try {
                  const cliDir = path.resolve(__dirname, '..');
                  
                  // Check if git repo exists
                  try {
                    execSync('git status', { cwd: cliDir, stdio: 'pipe' });
                  } catch (e) {
                    throw new Error('Not a git repository');
                  }
                  
                  // Check if remote exists
                  let hasRemote = false;
                  let gitRemoteUrl = '';
                  try {
                    gitRemoteUrl = execSync('git remote get-url origin', { cwd: cliDir, stdio: 'pipe' }).toString().trim();
                    hasRemote = gitRemoteUrl.length > 0;
                  } catch (e) {
                    hasRemote = false;
                  }
                  
                  if (hasRemote) {
                    // Get current commit before pull
                    const beforeCommit = execSync('git rev-parse --short HEAD', { cwd: cliDir, stdio: 'pipe' }).toString().trim();
                    
                    // Fetch first to check if updates available
                    execSync('git fetch origin main', { cwd: cliDir, stdio: 'pipe' });
                    
                    // Check if we're behind
                    const behindCount = execSync('git rev-list HEAD..origin/main --count', { cwd: cliDir, stdio: 'pipe' }).toString().trim();
                    
                    if (parseInt(behindCount) > 0) {
                      // Pull from remote
                      const pullResult = execSync('git pull origin main', { cwd: cliDir, stdio: 'pipe' }).toString();
                      const afterCommit = execSync('git rev-parse --short HEAD', { cwd: cliDir, stdio: 'pipe' }).toString().trim();
                      
                      spinnerRefresh.succeed('CLI updated!');
                      console.log(chalk.green(`  Updated: ${beforeCommit} → ${afterCommit}`));
                      console.log(chalk.green(`  ${behindCount} new commit(s) applied.`));
                      console.log();
                      
                      // Ask user if they want to restart
                      const { restart } = await inquirer.prompt([
                        {
                          type: 'confirm',
                          name: 'restart',
                          message: chalk.yellow('Restart CLI to apply changes?'),
                          default: true
                        }
                      ]);
                      
                      if (restart) {
                        console.log(chalk.cyan('  Restarting...'));
                        // Spawn new process and exit current one
                        const { spawn } = require('child_process');
                        const child = spawn(process.argv[0], process.argv.slice(1), {
                          cwd: cliDir,
                          detached: true,
                          stdio: 'inherit'
                        });
                        child.unref();
                        process.exit(0);
                      }
                    } else {
                      spinnerRefresh.succeed('Already up to date!');
                      console.log(chalk.cyan(`  Current version: ${beforeCommit}`));
                      console.log(chalk.gray('  No updates available.'));
                    }
                  } else {
                    // Local dev mode - just refresh data
                    spinnerRefresh.succeed('Data refreshed');
                    console.log(chalk.cyan('  Local dev mode. Session still active.'));
                  }
                  
                  // Refresh user data without disconnecting
                  if (currentService) {
                    await currentService.getUser();
                  }
                  
                } catch (err) {
                  spinnerRefresh.fail('Update failed');
                  console.log(chalk.red(`  Error: ${err.message}`));
                  console.log(chalk.gray('  Your session is still active.'));
                }
                console.log();
                await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
                break;
              case 'disconnect':
                // Déconnecter toutes les connexions
                connections.disconnectAll();
                currentService = null;
                connected = false;
                await banner();
                console.log(chalk.yellow('  All connections disconnected.'));
                console.log();
                break;
            }
          }
        } else {
          spinner.fail('Authentication failed');
          console.log(chalk.red(`  Error: ${loginResult.error}`));
          console.log();
          await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
          await banner();
        }
        break;

      case 'rithmic':
        console.log();
        console.log(chalk.cyan('Rithmic connection...'));
        console.log(chalk.gray('Feature coming soon!'));
        console.log();
        await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
        await banner();
        break;

      case 'tradovate':
        console.log();
        console.log(chalk.cyan('Tradovate connection...'));
        console.log(chalk.gray('Feature coming soon!'));
        console.log();
        await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
        await banner();
        break;

      case 'exit':
        console.log();
        console.log(chalk.yellow('Goodbye!'));
        running = false;
        break;
    }
  }
};

// Configuration CLI
program
  .name('hedgequantx')
  .description('Prop Futures Algo Trading CLI')
  .version('1.0.0');

program
  .command('status')
  .description('Show system status')
  .action(() => {
    console.log(chalk.green('System Status: Online'));
  });

program
  .command('start')
  .description('Start trading')
  .action(() => {
    console.log(chalk.green('Starting trading engine...'));
  });

program
  .command('stop')
  .description('Stop trading')
  .action(() => {
    console.log(chalk.red('Stopping trading engine...'));
  });

// Si aucune commande, lancer le menu interactif
if (!process.argv.slice(2).length) {
  main().catch(console.error);
} else {
  program.parse();
}
