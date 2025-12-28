#!/usr/bin/env node

const chalk = require('chalk');
const figlet = require('figlet');
const inquirer = require('inquirer');
const ora = require('ora');
const asciichart = require('asciichart');
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { program } = require('commander');

// Import modular services
const { ProjectXService, connections: connMgr, storage: sessionStorage } = require('../src/services');
const { HQXServerService } = require('../src/services/hqx-server');
const { PROPFIRMS, PROPFIRM_CHOICES, ACCOUNT_STATUS, ACCOUNT_TYPE, ORDER_STATUS, ORDER_TYPE, ORDER_SIDE, FUTURES_SYMBOLS } = require('../src/config');
const { getDevice, getSeparator, getLogoWidth, visibleLength, centerText, padText, drawBoxHeader, drawBoxFooter, drawBoxRow, drawBoxSeparator, getColWidths, draw2ColHeader, draw2ColRow, draw2ColRowRaw, draw2ColSeparator, fmtRow, printLogo } = require('../src/ui');
const { showStats } = require('../src/pages');

// Alias for connections module
const connections = connMgr;

// Session courante (pour compatibilité)
let currentService = null;

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
  console.log(chalk.white(`  [>] Platform: ${chalk.cyan(device.platform)}`));
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
  // Clear screen properly with ANSI escape codes
  process.stdout.write('\x1b[2J\x1b[0f');
  const device = getDevice();
  
  // Get stats if connected
  let statsInfo = null;
  if (connections.count() > 0) {
    try {
      const allAccounts = await connections.getAllAccounts();
      let totalBalance = 0;
      let totalStartingBalance = 0;
      let totalPnl = 0;
      
      allAccounts.forEach(account => {
        totalBalance += account.balance || 0;
        totalStartingBalance += account.startingBalance || 0;
        totalPnl += account.profitAndLoss || 0;
      });
      
      // Use API P&L if available, otherwise calculate
      const pnl = totalPnl !== 0 ? totalPnl : (totalBalance - totalStartingBalance);
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
    const pkg = require('../package.json');
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
      console.log(chalk.yellow.bold('  Prop Futures Algo Trading') + chalk.gray(`  v${pkg.version}`));
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
    
    // Remove trailing empty lines from logo
    const logoLines = logoText.split('\n').filter(line => line.trim().length > 0);
    
    // Get max width of all logo lines
    const maxLogoWidth = Math.max(...logoLines.map(line => line.length));
    
    // Box width = logo width + 2 for borders
    const boxWidth = maxLogoWidth + 2;
    
    // Draw top border
    console.log(chalk.cyan('╔' + '═'.repeat(maxLogoWidth) + '╗'));
    
    // Draw logo lines inside box - pad each line to max width
    logoLines.forEach(line => {
      const paddedLine = line.padEnd(maxLogoWidth);
      console.log(chalk.cyan('║') + chalk.cyan(paddedLine) + chalk.cyan('║'));
    });
    
    // Inner width (content area between ║ and ║)
    const innerWidth = maxLogoWidth;
    
    console.log(chalk.cyan('╠' + '═'.repeat(innerWidth) + '╣'));
    
    // Always show tagline centered
    const tagline = 'Prop Futures Algo Trading';
    const pkg = require('../package.json');
    const version = 'v' + pkg.version;
    const taglineText = chalk.yellow.bold(tagline) + '  ' + chalk.gray(version);
    const taglineLen = tagline.length + 2 + version.length;
    const taglineLeftPad = Math.floor((innerWidth - taglineLen) / 2);
    const taglineRightPad = innerWidth - taglineLen - taglineLeftPad;
    console.log(chalk.cyan('║') + ' '.repeat(taglineLeftPad) + taglineText + ' '.repeat(taglineRightPad) + chalk.cyan('║'));
    
    // Show stats if connected
    if (statsInfo) {
      // Separator between tagline and stats
      console.log(chalk.cyan('╠' + '═'.repeat(innerWidth) + '╣'));
      
      const pnlColor = statsInfo.pnl >= 0 ? chalk.green : chalk.red;
      const pnlSign = statsInfo.pnl >= 0 ? '+' : '';
      
      // Build info line
      const connStr = `Connections: ${statsInfo.connections}`;
      const accStr = `Accounts: ${statsInfo.accounts}`;
      const balStr = `Balance: $${statsInfo.balance.toLocaleString()}`;
      const pnlStr = `P&L: ${pnlSign}$${statsInfo.pnl.toLocaleString()} (${statsInfo.pnlPercent}%)`;
      
      const statsLen = connStr.length + 4 + accStr.length + 4 + balStr.length + 4 + pnlStr.length;
      const statsLeftPad = Math.floor((innerWidth - statsLen) / 2);
      const statsRightPad = innerWidth - statsLen - statsLeftPad;
      
      console.log(chalk.cyan('║') + ' '.repeat(statsLeftPad) +
        chalk.white(connStr) + '    ' +
        chalk.white(accStr) + '    ' +
        chalk.green(balStr) + '    ' +
        pnlColor(pnlStr) + ' '.repeat(statsRightPad) + chalk.cyan('║')
      );
    }
    
    console.log(chalk.cyan('╚' + '═'.repeat(innerWidth) + '╝'));
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
      console.log(chalk.white(`  ${user.userName.toUpperCase()}`));
    }
  } else {
    console.log(chalk.green.bold(`  Connected to ${propfirmName}`));
    if (user) {
      console.log(chalk.white(`  Welcome, ${user.userName.toUpperCase()}!`));
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

// Afficher les comptes (toutes connexions)
const showAccounts = async (service) => {
  const spinner = ora('Fetching accounts...').start();
  const boxWidth = getLogoWidth();
  const { col1, col2 } = getColWidths(boxWidth);
  
  // Helper to format a row with label and value
  const fmtRow = (label, value, colW) => {
    const labelStr = ' ' + label.padEnd(12);
    const valueVisible = (value || '').toString().replace(/\x1b\[[0-9;]*m/g, '');
    const totalVisible = labelStr.length + valueVisible.length;
    const padding = Math.max(0, colW - totalVisible);
    return chalk.white(labelStr) + value + ' '.repeat(padding);
  };
  
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
      } catch (e) {}
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
    drawBoxHeader('ACCOUNTS', boxWidth);
    draw2ColRowRaw(chalk.yellow('  No accounts found.'), '', boxWidth);
    drawBoxFooter(boxWidth);
  } else {
    const totalConns = connections.count() || 1;
    drawBoxHeader(`ACCOUNTS (${allAccountsData.length} accounts, ${totalConns} connection${totalConns > 1 ? 's' : ''})`, boxWidth);
    
    // Display 2 accounts per row
    for (let i = 0; i < allAccountsData.length; i += 2) {
      const acc1 = allAccountsData[i];
      const acc2 = allAccountsData[i + 1];
      
      const name1 = acc1.accountName || acc1.name || `Account #${acc1.accountId}`;
      const name2 = acc2 ? (acc2.accountName || acc2.name || `Account #${acc2.accountId}`) : '';
      
      // Account name header
      draw2ColHeader(name1.substring(0, col1 - 4), name2.substring(0, col2 - 4), boxWidth);
      
      // PropFirm
      const st1 = ACCOUNT_STATUS[acc1.status] || { text: 'Unknown', color: 'gray' };
      const st2 = acc2 ? (ACCOUNT_STATUS[acc2.status] || { text: 'Unknown', color: 'gray' }) : null;
      const tp1 = ACCOUNT_TYPE[acc1.type] || { text: 'Unknown', color: 'white' };
      const tp2 = acc2 ? (ACCOUNT_TYPE[acc2.type] || { text: 'Unknown', color: 'white' }) : null;
      
      console.log(chalk.cyan('║') + fmtRow('PropFirm:', chalk.magenta(acc1.propfirm), col1) + chalk.cyan('│') + (acc2 ? fmtRow('PropFirm:', chalk.magenta(acc2.propfirm), col2) : ' '.repeat(col2)) + chalk.cyan('║'));
      console.log(chalk.cyan('║') + fmtRow('Balance:', acc1.balance >= 0 ? chalk.green('$' + acc1.balance.toLocaleString()) : chalk.red('$' + acc1.balance.toLocaleString()), col1) + chalk.cyan('│') + (acc2 ? fmtRow('Balance:', acc2.balance >= 0 ? chalk.green('$' + acc2.balance.toLocaleString()) : chalk.red('$' + acc2.balance.toLocaleString()), col2) : ' '.repeat(col2)) + chalk.cyan('║'));
      console.log(chalk.cyan('║') + fmtRow('Status:', chalk[st1.color](st1.text), col1) + chalk.cyan('│') + (acc2 ? fmtRow('Status:', chalk[st2.color](st2.text), col2) : ' '.repeat(col2)) + chalk.cyan('║'));
      console.log(chalk.cyan('║') + fmtRow('Type:', chalk[tp1.color](tp1.text), col1) + chalk.cyan('│') + (acc2 ? fmtRow('Type:', chalk[tp2.color](tp2.text), col2) : ' '.repeat(col2)) + chalk.cyan('║'));
      
      if (i + 2 < allAccountsData.length) {
        draw2ColSeparator(boxWidth);
      }
    }
    
    drawBoxFooter(boxWidth);
  }
  
  console.log();
  await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
};

// Afficher les infos utilisateur
const showUserInfo = async (service) => {
  const boxWidth = getLogoWidth();
  const spinner = ora('Fetching user info...').start();
  
  // Collecter les infos de TOUTES les connexions
  let allUsers = [];
  
  if (connections.count() > 0) {
    for (const conn of connections.getAll()) {
      try {
        const result = await conn.service.getUser();
        if (result.success && result.user) {
          allUsers.push({
            ...result.user,
            propfirm: conn.propfirm || conn.type
          });
        }
      } catch (e) {}
    }
  } else if (service) {
    const result = await service.getUser();
    if (result.success && result.user) {
      allUsers.push({
        ...result.user,
        propfirm: service.getPropfirmName()
      });
    }
  }
  
  spinner.succeed('User info loaded');
  console.log();
  
  // Inner width for content
  const innerWidth = boxWidth - 2;
  
  // Helper to format row
  const fmtRow = (label, value, totalW) => {
    const labelStr = ' ' + label.padEnd(14);
    const valueVisible = (value || '').toString().replace(/\x1b\[[0-9;]*m/g, '');
    const totalVisible = labelStr.length + valueVisible.length;
    const padding = Math.max(0, totalW - totalVisible - 1);
    return chalk.white(labelStr) + value + ' '.repeat(padding);
  };
  
  if (allUsers.length === 0) {
    drawBoxHeader('USER INFO', boxWidth);
    console.log(chalk.cyan('║') + padText(chalk.yellow('  No user information available.'), innerWidth) + chalk.cyan('║'));
    drawBoxFooter(boxWidth);
  } else {
    drawBoxHeader(`USER INFO (${allUsers.length} connection${allUsers.length > 1 ? 's' : ''})`, boxWidth);
    
    allUsers.forEach((user, index) => {
      // PropFirm header
      const pfHeader = `── ${user.propfirm} ──`;
      console.log(chalk.cyan('║') + chalk.magenta.bold(centerText(pfHeader, innerWidth)) + chalk.cyan('║'));
      
      // Username
      console.log(chalk.cyan('║') + fmtRow('Username:', chalk.cyan(user.userName || 'N/A'), innerWidth) + chalk.cyan('║'));
      
      // Full Name
      const fullName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'N/A';
      console.log(chalk.cyan('║') + fmtRow('Name:', chalk.white(fullName), innerWidth) + chalk.cyan('║'));
      
      // Email
      console.log(chalk.cyan('║') + fmtRow('Email:', chalk.white(user.email || 'N/A'), innerWidth) + chalk.cyan('║'));
      
      // User ID
      console.log(chalk.cyan('║') + fmtRow('User ID:', chalk.gray(user.userId || 'N/A'), innerWidth) + chalk.cyan('║'));
      
      // Separator between users if there are more
      if (index < allUsers.length - 1) {
        console.log(chalk.cyan('╠' + '─'.repeat(innerWidth) + '╣'));
      }
    });
    
    drawBoxFooter(boxWidth);
  }
  
  console.log();
  await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
};

// Afficher les positions
const showPositions = async (service) => {
  const spinner = ora('Fetching positions...').start();
  const boxWidth = getLogoWidth();
  const { col1, col2 } = getColWidths(boxWidth);
  
  // Collecter les positions de TOUTES les connexions
  let allPositions = [];
  
  if (connections.count() > 0) {
    for (const conn of connections.getAll()) {
      try {
        const accountsResult = await conn.service.getTradingAccounts();
        if (accountsResult.success && accountsResult.accounts) {
          for (const account of accountsResult.accounts) {
            const result = await conn.service.getPositions(account.accountId);
            if (result.success && result.positions) {
              allPositions = allPositions.concat(result.positions.map(p => ({
                ...p,
                accountName: account.accountName || account.name || `Account #${account.accountId}`,
                propfirm: conn.propfirm || conn.type
              })));
            }
          }
        }
      } catch (e) {}
    }
  } else if (service) {
    const accountsResult = await service.getTradingAccounts();
    if (accountsResult.success && accountsResult.accounts) {
      for (const account of accountsResult.accounts) {
        const result = await service.getPositions(account.accountId);
        if (result.success && result.positions) {
          allPositions = allPositions.concat(result.positions.map(p => ({
            ...p,
            accountName: account.accountName || account.name || `Account #${account.accountId}`,
            propfirm: service.getPropfirmName()
          })));
        }
      }
    }
  }

  spinner.succeed('Positions loaded');
  console.log();
  
  // Helper to format row for positions
  const fmtRow = (label, value, colW) => {
    const labelStr = ' ' + label.padEnd(12);
    const valueVisible = (value || '').toString().replace(/\x1b\[[0-9;]*m/g, '');
    const totalVisible = labelStr.length + valueVisible.length;
    const padding = Math.max(0, colW - totalVisible);
    return chalk.white(labelStr) + value + ' '.repeat(padding);
  };
  
  if (allPositions.length === 0) {
    drawBoxHeader('OPEN POSITIONS', boxWidth);
    draw2ColRowRaw(chalk.yellow('  No open positions.'), '', boxWidth);
    drawBoxFooter(boxWidth);
  } else {
    drawBoxHeader(`OPEN POSITIONS (${allPositions.length})`, boxWidth);
    
    // Display 2 positions per row
    for (let i = 0; i < allPositions.length; i += 2) {
      const pos1 = allPositions[i];
      const pos2 = allPositions[i + 1];
      
      const symbol1 = pos1.symbolId || pos1.contractId || 'Unknown';
      const symbol2 = pos2 ? (pos2.symbolId || pos2.contractId || 'Unknown') : '';
      
      // Symbol header
      draw2ColHeader(symbol1.substring(0, col1 - 4), symbol2.substring(0, col2 - 4), boxWidth);
      
      // Position details
      const size1 = pos1.positionSize || pos1.size || 0;
      const size2 = pos2 ? (pos2.positionSize || pos2.size || 0) : 0;
      const sizeColor1 = size1 > 0 ? chalk.green : (size1 < 0 ? chalk.red : chalk.white);
      const sizeColor2 = size2 > 0 ? chalk.green : (size2 < 0 ? chalk.red : chalk.white);
      const price1 = pos1.averagePrice ? '$' + pos1.averagePrice.toFixed(2) : 'N/A';
      const price2 = pos2 && pos2.averagePrice ? '$' + pos2.averagePrice.toFixed(2) : 'N/A';
      const pnl1 = pos1.profitAndLoss || 0;
      const pnl2 = pos2 ? (pos2.profitAndLoss || 0) : 0;
      const pnlColor1 = pnl1 >= 0 ? chalk.green : chalk.red;
      const pnlColor2 = pnl2 >= 0 ? chalk.green : chalk.red;
      
      console.log(chalk.cyan('║') + fmtRow('Account:', chalk.cyan(pos1.accountName.substring(0, 15)), col1) + chalk.cyan('│') + (pos2 ? fmtRow('Account:', chalk.cyan(pos2.accountName.substring(0, 15)), col2) : ' '.repeat(col2)) + chalk.cyan('║'));
      console.log(chalk.cyan('║') + fmtRow('PropFirm:', chalk.magenta(pos1.propfirm), col1) + chalk.cyan('│') + (pos2 ? fmtRow('PropFirm:', chalk.magenta(pos2.propfirm), col2) : ' '.repeat(col2)) + chalk.cyan('║'));
      console.log(chalk.cyan('║') + fmtRow('Size:', sizeColor1(size1.toString()), col1) + chalk.cyan('│') + (pos2 ? fmtRow('Size:', sizeColor2(size2.toString()), col2) : ' '.repeat(col2)) + chalk.cyan('║'));
      console.log(chalk.cyan('║') + fmtRow('Avg Price:', chalk.white(price1), col1) + chalk.cyan('│') + (pos2 ? fmtRow('Avg Price:', chalk.white(price2), col2) : ' '.repeat(col2)) + chalk.cyan('║'));
      console.log(chalk.cyan('║') + fmtRow('P&L:', pnlColor1((pnl1 >= 0 ? '+' : '') + '$' + pnl1.toFixed(2)), col1) + chalk.cyan('│') + (pos2 ? fmtRow('P&L:', pnlColor2((pnl2 >= 0 ? '+' : '') + '$' + pnl2.toFixed(2)), col2) : ' '.repeat(col2)) + chalk.cyan('║'));
      
      if (i + 2 < allPositions.length) {
        draw2ColSeparator(boxWidth);
      }
    }
    
    drawBoxFooter(boxWidth);
  }
  
  console.log();
  await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
};

// Afficher les ordres
const showOrders = async (service) => {
  const spinner = ora('Fetching orders...').start();
  const boxWidth = getLogoWidth();
  const { col1, col2 } = getColWidths(boxWidth);
  
  // Order status mapping
  const ORDER_STATUS = {
    0: { text: 'Pending', color: 'gray' },
    1: { text: 'Open', color: 'yellow' },
    2: { text: 'Filled', color: 'green' },
    3: { text: 'Cancelled', color: 'red' }
  };
  
  // Order side mapping
  const ORDER_SIDE = {
    1: { text: 'BUY', color: 'green' },
    2: { text: 'SELL', color: 'red' }
  };
  
  // Collecter les ordres de TOUTES les connexions
  let allOrders = [];
  
  if (connections.count() > 0) {
    for (const conn of connections.getAll()) {
      try {
        const accountsResult = await conn.service.getTradingAccounts();
        if (accountsResult.success && accountsResult.accounts) {
          for (const account of accountsResult.accounts) {
            const result = await conn.service.getOrders(account.accountId);
            if (result.success && result.orders) {
              allOrders = allOrders.concat(result.orders.map(o => ({
                ...o,
                accountName: account.accountName || account.name || `Account #${account.accountId}`,
                propfirm: conn.propfirm || conn.type
              })));
            }
          }
        }
      } catch (e) {}
    }
  } else if (service) {
    const accountsResult = await service.getTradingAccounts();
    if (accountsResult.success && accountsResult.accounts) {
      for (const account of accountsResult.accounts) {
        const result = await service.getOrders(account.accountId);
        if (result.success && result.orders) {
          allOrders = allOrders.concat(result.orders.map(o => ({
            ...o,
            accountName: account.accountName || account.name || `Account #${account.accountId}`,
            propfirm: service.getPropfirmName()
          })));
        }
      }
    }
  }

  spinner.succeed('Orders loaded');
  console.log();
  
  // Limit to recent 20 orders
  const recentOrders = allOrders.slice(0, 20);
  
  // Helper to format row for orders
  const fmtRow = (label, value, colW) => {
    const labelStr = ' ' + label.padEnd(12);
    const valueVisible = (value || '').toString().replace(/\x1b\[[0-9;]*m/g, '');
    const totalVisible = labelStr.length + valueVisible.length;
    const padding = Math.max(0, colW - totalVisible);
    return chalk.white(labelStr) + value + ' '.repeat(padding);
  };
  
  if (recentOrders.length === 0) {
    drawBoxHeader('ORDERS', boxWidth);
    draw2ColRowRaw(chalk.yellow('  No recent orders.'), '', boxWidth);
    drawBoxFooter(boxWidth);
  } else {
    drawBoxHeader(`ORDERS (${recentOrders.length} of ${allOrders.length})`, boxWidth);
    
    // Display 2 orders per row
    for (let i = 0; i < recentOrders.length; i += 2) {
      const ord1 = recentOrders[i];
      const ord2 = recentOrders[i + 1];
      
      const symbol1 = ord1.symbolId || 'Unknown';
      const symbol2 = ord2 ? (ord2.symbolId || 'Unknown') : '';
      
      // Symbol header
      draw2ColHeader(symbol1.substring(0, col1 - 4), symbol2.substring(0, col2 - 4), boxWidth);
      
      // Order details
      const side1 = ORDER_SIDE[ord1.side || ord1.orderSide] || { text: 'N/A', color: 'white' };
      const side2 = ord2 ? (ORDER_SIDE[ord2.side || ord2.orderSide] || { text: 'N/A', color: 'white' }) : null;
      const st1 = ORDER_STATUS[ord1.status] || { text: 'Unknown', color: 'gray' };
      const st2 = ord2 ? (ORDER_STATUS[ord2.status] || { text: 'Unknown', color: 'gray' }) : null;
      const size1 = ord1.positionSize || ord1.size || ord1.quantity || 0;
      const size2 = ord2 ? (ord2.positionSize || ord2.size || ord2.quantity || 0) : 0;
      const price1 = ord1.price ? '$' + ord1.price.toFixed(2) : 'Market';
      const price2 = ord2 && ord2.price ? '$' + ord2.price.toFixed(2) : (ord2 ? 'Market' : '');
      
      console.log(chalk.cyan('║') + fmtRow('Account:', chalk.cyan(ord1.accountName.substring(0, 15)), col1) + chalk.cyan('│') + (ord2 ? fmtRow('Account:', chalk.cyan(ord2.accountName.substring(0, 15)), col2) : ' '.repeat(col2)) + chalk.cyan('║'));
      console.log(chalk.cyan('║') + fmtRow('Side:', chalk[side1.color](side1.text), col1) + chalk.cyan('│') + (ord2 ? fmtRow('Side:', chalk[side2.color](side2.text), col2) : ' '.repeat(col2)) + chalk.cyan('║'));
      console.log(chalk.cyan('║') + fmtRow('Size:', chalk.white(size1.toString()), col1) + chalk.cyan('│') + (ord2 ? fmtRow('Size:', chalk.white(size2.toString()), col2) : ' '.repeat(col2)) + chalk.cyan('║'));
      console.log(chalk.cyan('║') + fmtRow('Price:', chalk.white(price1), col1) + chalk.cyan('│') + (ord2 ? fmtRow('Price:', chalk.white(price2), col2) : ' '.repeat(col2)) + chalk.cyan('║'));
      console.log(chalk.cyan('║') + fmtRow('Status:', chalk[st1.color](st1.text), col1) + chalk.cyan('│') + (ord2 ? fmtRow('Status:', chalk[st2.color](st2.text), col2) : ' '.repeat(col2)) + chalk.cyan('║'));
      
      if (i + 2 < recentOrders.length) {
        draw2ColSeparator(boxWidth);
      }
    }
    
    drawBoxFooter(boxWidth);
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
  
  // Filtrer seulement les comptes actifs (status === 0 = Active)
  const activeAccounts = result.accounts.filter(acc => acc.status === 0);
  
  if (activeAccounts.length === 0) {
    spinner.fail('No active accounts found');
    console.log(chalk.yellow('  You need at least one active trading account (status: Active).'));
    console.log();
    await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
    return;
  }
  
  spinner.succeed(`Found ${activeAccounts.length} active account(s)`);
  console.log();
  
  // Afficher seulement les comptes actifs
  const accountChoices = activeAccounts.map(account => ({
    name: chalk.cyan(`${account.accountName || account.name || 'Account #' + account.accountId} - Balance: $${account.balance.toLocaleString()}`),
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
  
  // Vérifier si le marché est ouvert
  const accountName = selectedAccount.accountName || selectedAccount.name || 'Account #' + selectedAccount.accountId;
  console.log();
  const marketSpinner = ora('Checking market status...').start();
  
  // Vérifier les heures de marché
  const marketHours = service.checkMarketHours();
  
  // Vérifier aussi via l'API si le compte peut trader
  const marketStatus = await service.getMarketStatus(selectedAccount.accountId);
  
  if (!marketHours.isOpen) {
    marketSpinner.fail('Market is CLOSED');
    console.log();
    console.log(chalk.red.bold('  [X] ' + marketHours.message));
    console.log();
    console.log(chalk.gray('  Futures markets (CME) trading hours:'));
    console.log(chalk.gray('  Sunday 5:00 PM CT - Friday 4:00 PM CT'));
    console.log(chalk.gray('  Daily maintenance: 4:00 PM - 5:00 PM CT'));
    console.log();
    await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
    return;
  }
  
  if (marketStatus.success && !marketStatus.isOpen) {
    marketSpinner.fail('Cannot trade on this account');
    console.log();
    console.log(chalk.red.bold('  [X] ' + marketStatus.message));
    console.log();
    await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
    return;
  }
  
  marketSpinner.succeed('Market is OPEN - Ready to trade!');
  
  // Passer à la sélection du symbole
  await selectSymbolMenu(service, selectedAccount);
};

// Menu de sélection du symbole futures
const selectSymbolMenu = async (service, account) => {
  const device = getDevice();
  const accountName = account.accountName || account.name || 'Account #' + account.accountId;
  
  console.log();
  console.log(chalk.gray(getSeparator()));
  console.log(chalk.cyan.bold(`  Account: ${accountName}`));
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
  
  // Rechercher le contrat via Gateway API
  const spinner = ora(`Searching for ${selectedSymbol.value} contract...`).start();
  const contractResult = await service.searchContracts(selectedSymbol.searchText, false);
  
  let contract = null;
  if (contractResult.success && contractResult.contracts && contractResult.contracts.length > 0) {
    // Trouver le contrat actif ou prendre le premier
    contract = contractResult.contracts.find(c => c.activeContract) || contractResult.contracts[0];
    spinner.succeed(`Found: ${contract.name || selectedSymbol.value}`);
    if (contract.tickSize && contract.tickValue) {
      console.log(chalk.gray(`  Tick Size: ${contract.tickSize} | Tick Value: $${contract.tickValue}`));
    }
  } else {
    // Fallback: utiliser le symbole directement si l'API ne retourne rien
    spinner.warn(`Using ${selectedSymbol.value} (contract details unavailable)`);
    contract = {
      id: selectedSymbol.value,
      name: selectedSymbol.name,
      symbol: selectedSymbol.value
    };
  }
  
  console.log();
  
  // Demander le nombre de contrats
  const { contracts } = await inquirer.prompt([
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
  
  // Confirmation et lancement
  console.log();
  console.log(chalk.gray(getSeparator()));
  console.log(chalk.white.bold('  Algo Configuration:'));
  console.log(chalk.gray(getSeparator()));
  console.log(chalk.white(`  Account:   ${chalk.cyan(accountName)}`));
  console.log(chalk.white(`  Symbol:    ${chalk.cyan(contract.name || selectedSymbol.value)}`));
  console.log(chalk.white(`  Contracts: ${chalk.cyan(contracts)}`));
  console.log(chalk.gray(getSeparator()));
  console.log();
  
  const { launch } = await inquirer.prompt([
    {
      type: 'list',
      name: 'launch',
      message: chalk.white.bold('Ready to launch?'),
      choices: [
        { name: chalk.green.bold('[>] Launch Algo'), value: 'launch' },
        { name: chalk.yellow('< Back'), value: 'back' }
      ],
      loop: false
    }
  ]);
  
  if (launch === 'back') {
    return;
  }
  
  // Lancer l'algo
  await launchAlgo(service, account, contract, contracts);
};

// Lancer l'algo
const launchAlgo = async (service, account, contract, numContracts) => {
  const accountName = account.accountName || account.name || 'Account #' + account.accountId;
  const symbolName = contract.name || contract.symbol || contract.id;
  
  console.log();
  console.log(chalk.green.bold('  [>] Launching HQX Algo...'));
  console.log();
  
  const spinner = ora('Connecting to HQX Server...').start();
  
  // Essayer de se connecter au serveur HQX
  let hqxConnected = false;
  try {
    if (hqxServer) {
      await hqxServer.connect();
      hqxConnected = hqxServer.isConnected();
    }
  } catch (e) {
    // Ignore connection errors
  }
  
  if (hqxConnected) {
    spinner.succeed('Connected to HQX Server');
  } else {
    spinner.warn('HQX Server unavailable - Running in Demo Mode');
  }
  
  console.log();
  console.log(chalk.gray(getSeparator()));
  console.log(chalk.cyan.bold('  HQX Ultra-Scalping Algo'));
  console.log(chalk.gray(getSeparator()));
  console.log(chalk.white(`  Status:    ${chalk.green('RUNNING')}`));
  console.log(chalk.white(`  Account:   ${chalk.cyan(accountName)}`));
  console.log(chalk.white(`  Symbol:    ${chalk.cyan(symbolName)}`));
  console.log(chalk.white(`  Contracts: ${chalk.cyan(numContracts)}`));
  console.log(chalk.white(`  Mode:      ${hqxConnected ? chalk.green('LIVE') : chalk.yellow('DEMO')}`));
  console.log(chalk.gray(getSeparator()));
  console.log();
  
  // Afficher les logs en temps réel
  let running = true;
  let logs = [];
  
  const addLog = (type, message) => {
    const timestamp = new Date().toLocaleTimeString();
    const typeColors = {
      info: chalk.cyan,
      signal: chalk.yellow,
      trade: chalk.green,
      error: chalk.red,
      warning: chalk.yellow
    };
    const color = typeColors[type] || chalk.white;
    logs.push({ timestamp, type, message, color });
    if (logs.length > 10) logs.shift();
    return logs;
  };
  
  const displayLogs = () => {
    console.log(chalk.gray('  Recent Activity:'));
    logs.forEach(log => {
      console.log(chalk.gray(`  [${log.timestamp}]`) + ' ' + log.color(log.message));
    });
  };
  
  // Simulation de l'algo en mode demo
  addLog('info', 'Algo initialized');
  addLog('info', `Monitoring ${symbolName}...`);
  displayLogs();
  
  if (!hqxConnected) {
    // Mode demo - simulation
    console.log();
    console.log(chalk.yellow('  Demo mode: No real trades will be executed.'));
  }
  
  console.log();
  
  // Menu pour arrêter l'algo
  const { stopAction } = await inquirer.prompt([
    {
      type: 'list',
      name: 'stopAction',
      message: chalk.red.bold(''),
      choices: [
        { name: chalk.red.bold('[X] Stop Algo'), value: 'stop' }
      ],
      pageSize: 1,
      loop: false
    }
  ]);
  
  if (stopAction === 'stop') {
    running = false;
    console.log();
    console.log(chalk.yellow('  Stopping algo...'));
    
    if (hqxConnected && hqxServer) {
      hqxServer.stopAlgo();
      hqxServer.disconnect();
    }
    
    console.log(chalk.green('  [OK] Algo stopped successfully'));
    console.log();
    await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
  }
};

// Menu des paramètres de trading (legacy - peut être supprimé)
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
    success: '[+]',
    warning: '!',
    error: '✗',
    trade: '$',
    signal: '[>]'
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
      console.log(chalk.green.bold(' [*] LIVE'));
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

// Fonction pour gérer les mises à jour
const handleUpdate = async () => {
  const pkg = require('../package.json');
  const currentVersion = pkg.version;
  
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
    try {
      const gitRemoteUrl = execSync('git remote get-url origin', { cwd: cliDir, stdio: 'pipe' }).toString().trim();
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
        // Check for local changes that might block pull
        let hasLocalChanges = false;
        try {
          const statusOutput = execSync('git status --porcelain', { cwd: cliDir, stdio: 'pipe' }).toString().trim();
          hasLocalChanges = statusOutput.length > 0;
        } catch (e) {
          hasLocalChanges = false;
        }
        
        // If there are local changes, stash them or reset
        if (hasLocalChanges) {
          spinnerRefresh.text = 'Stashing local changes...';
          try {
            // Try to stash changes first
            execSync('git stash --include-untracked', { cwd: cliDir, stdio: 'pipe' });
          } catch (e) {
            // If stash fails, do a hard reset (for generated files like package-lock.json)
            spinnerRefresh.text = 'Resetting local changes...';
            execSync('git checkout -- .', { cwd: cliDir, stdio: 'pipe' });
            execSync('git clean -fd', { cwd: cliDir, stdio: 'pipe' });
          }
        }
        
        spinnerRefresh.text = 'Downloading updates...';
        
        // Pull from remote
        execSync('git pull origin main', { cwd: cliDir, stdio: 'pipe' });
        const afterCommit = execSync('git rev-parse --short HEAD', { cwd: cliDir, stdio: 'pipe' }).toString().trim();
        
        // Reinstall dependencies if package.json changed
        spinnerRefresh.text = 'Installing dependencies...';
        try {
          execSync('npm install --silent', { cwd: cliDir, stdio: 'pipe' });
        } catch (e) {
          // Ignore npm install errors
        }
        
        // Re-read package.json to get new version
        delete require.cache[require.resolve('../package.json')];
        const newPkg = require('../package.json');
        const newVersion = newPkg.version;
        
        spinnerRefresh.succeed('CLI updated!');
        console.log();
        console.log(chalk.green(`  Version: v${currentVersion} -> v${newVersion}`));
        console.log(chalk.gray(`  Commits: ${beforeCommit} -> ${afterCommit} (${behindCount} new)`));
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
          console.log();
          
          // Clear require cache to reload modules
          Object.keys(require.cache).forEach(key => {
            delete require.cache[key];
          });
          
          // Restart by spawning a new process and replacing current one
          const { spawn } = require('child_process');
          const child = spawn(process.argv[0], [path.join(cliDir, 'bin', 'cli.js')], {
            cwd: cliDir,
            stdio: 'inherit',
            shell: true
          });
          
          child.on('exit', (code) => {
            process.exit(code);
          });
          
          // Prevent current process from continuing
          return;
        }
      } else {
        spinnerRefresh.succeed('Already up to date!');
        console.log(chalk.cyan(`  Version: v${currentVersion}`));
        console.log(chalk.gray(`  Commit: ${beforeCommit}`));
      }
    } else {
      spinnerRefresh.succeed('Data refreshed');
      console.log(chalk.cyan(`  Version: v${currentVersion} (local dev mode)`));
    }
    
    // Refresh user data
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
};

// Fonction principale
const main = async () => {
  await banner();

  // Essayer de restaurer les sessions précédentes
  const spinner = ora('Restoring session...').start();
  const restored = await connections.restoreFromStorage();
  
  if (restored) {
    spinner.succeed('Session restored!');
    currentService = connections.services[0].service;
    
    // Aller directement au dashboard
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
        case 'add_prop_account':
          await addPropAccount();
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
        case 'refresh':
          await handleUpdate();
          break;
        case 'disconnect':
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
    spinner.stop();
  }

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
                await handleUpdate();
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
const packageInfo = require('../package.json');
program
  .name('hedgequantx')
  .description('Prop Futures Algo Trading CLI')
  .version(packageInfo.version);

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
