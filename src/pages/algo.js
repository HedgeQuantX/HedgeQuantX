/**
 * Algo Trading Page
 */

const chalk = require('chalk');
const ora = require('ora');
const inquirer = require('inquirer');
const readline = require('readline');

const { connections } = require('../services');
const { HQXServerService } = require('../services/hqx-server');
const { FUTURES_SYMBOLS } = require('../config');
const { getDevice, getSeparator } = require('../ui');

/**
 * Algo Trading Menu
 */
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
        { name: chalk.green('Copy Trading'), value: 'copy_trading' },
        new inquirer.Separator(),
        { name: chalk.yellow('< Back'), value: 'back' }
      ],
      pageSize: 10,
      loop: false
    }
  ]);

  switch (action) {
    case 'one_account':
      await oneAccountMenu(service);
      break;
    case 'copy_trading':
      await copyTradingMenu();
      break;
    case 'back':
      return 'back';
  }
  
  return action;
};

/**
 * One Account Menu - Select active account
 */
const oneAccountMenu = async (service) => {
  const spinner = ora('Fetching active accounts...').start();
  
  const result = await service.getTradingAccounts();
  
  if (!result.success || !result.accounts || result.accounts.length === 0) {
    spinner.fail('No accounts found');
    console.log(chalk.yellow('  You need at least one trading account.'));
    console.log();
    await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
    return;
  }
  
  // Filter only active accounts (status === 0)
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
  
  // Check market status
  console.log();
  const marketSpinner = ora('Checking market status...').start();
  
  const marketHours = service.checkMarketHours();
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
  
  await selectSymbolMenu(service, selectedAccount);
};

/**
 * Symbol Selection Menu
 */
const selectSymbolMenu = async (service, account) => {
  const device = getDevice();
  const accountName = account.accountName || account.name || 'Account #' + account.accountId;
  const propfirm = account.propfirm || 'projectx';
  
  console.log();
  console.log(chalk.gray(getSeparator()));
  console.log(chalk.cyan.bold(`  Account: ${accountName}`));
  console.log(chalk.gray(getSeparator()));
  console.log();
  
  // Fetch available symbols from API
  const spinner = ora('Loading available symbols...').start();
  
  let availableSymbols = [];
  
  // Search for common symbols to get available contracts (including micros)
  // Use various search terms to find all contracts
  const commonSearches = [
    'NQ', 'ES', 'YM', 'RTY',           // E-mini indices
    'Micro', 'MNQ', 'MES', 'MYM', 'M2K', // Micro indices (try multiple search terms)
    'CL', 'MCL', 'QM',                 // Crude Oil
    'GC', 'MGC',                       // Gold
    'SI', 'SIL',                       // Silver
    '6E', 'M6E', '6B', '6J', '6A', '6C', // Currencies
    'ZB', 'ZN', 'ZF', 'ZT',            // Treasuries
    'NG', 'QG',                        // Natural Gas
    'HG', 'PL'                         // Copper, Platinum
  ];
  
  try {
    const seenIds = new Set();
    
    for (const search of commonSearches) {
      const result = await service.searchContracts(search, false);
      if (result.success && result.contracts && result.contracts.length > 0) {
        for (const contract of result.contracts) {
          // Skip if already added (by contract ID)
          const contractId = contract.id || '';
          if (!contractId || seenIds.has(contractId)) continue;
          seenIds.add(contractId);
          
          // Add the raw contract data from API
          availableSymbols.push(contract);
        }
      }
    }
  } catch (e) {
    spinner.fail('Failed to load symbols from API: ' + e.message);
    return;
  }
  
  // Only use REAL data from API - no mock/static data
  if (availableSymbols.length === 0) {
    spinner.fail('No contracts available from API');
    console.log(chalk.red('  Please check your connection and try again'));
    return;
  }
  
  spinner.succeed(`Found ${availableSymbols.length} available contracts`);
  
  console.log();
  
  // Format symbols for display - show ALL contracts from API (REAL DATA ONLY)
  const symbolChoices = [];
  
  for (const contract of availableSymbols) {
    // Get symbol code and description directly from API
    const symbolCode = contract.name || contract.id || 'Unknown';
    const description = contract.description || symbolCode;
    
    // Format: "NQH6         E-mini NASDAQ-100: March 2026"
    symbolChoices.push({
      name: chalk.yellow(symbolCode.padEnd(12)) + chalk.white(description),
      value: contract
    });
  }
  
  // Sort by category: E-mini indices first, then Micro E-mini, then others
  const getSymbolPriority = (contract) => {
    const name = (contract.name || contract.symbol || '').toUpperCase();
    const desc = (contract.description || '').toLowerCase();
    
    // E-mini indices (NQ, ES, YM, RTY) - highest priority
    if (name.match(/^(NQ|ES|YM|RTY)[A-Z]\d/) && !name.startsWith('M')) {
      if (name.startsWith('NQ')) return 10;
      if (name.startsWith('ES')) return 11;
      if (name.startsWith('YM')) return 12;
      if (name.startsWith('RTY')) return 13;
      return 15;
    }
    
    // Micro E-mini indices (MNQ, MES, MYM, M2K)
    if (name.match(/^(MNQ|MES|MYM|M2K)/)) {
      if (name.startsWith('MNQ')) return 20;
      if (name.startsWith('MES')) return 21;
      if (name.startsWith('MYM')) return 22;
      if (name.startsWith('M2K')) return 23;
      return 25;
    }
    
    // Energy (CL, MCL, NG)
    if (name.match(/^(CL|MCL|NG|QG)/)) return 30;
    
    // Metals (GC, MGC, SI)
    if (name.match(/^(GC|MGC|SI|HG|PL)/)) return 40;
    
    // Currencies (6E, 6B, etc)
    if (name.match(/^(6E|6B|6J|6A|6C|M6E)/)) return 50;
    
    // Treasuries (ZB, ZN, ZF, ZT)
    if (name.match(/^(ZB|ZN|ZF|ZT)/)) return 60;
    
    // Everything else
    return 100;
  };
  
  symbolChoices.sort((a, b) => {
    const priorityA = getSymbolPriority(a.value);
    const priorityB = getSymbolPriority(b.value);
    
    if (priorityA !== priorityB) {
      return priorityA - priorityB;
    }
    
    // Same priority - sort alphabetically
    const aCode = a.value.name || a.value.symbol || '';
    const bCode = b.value.name || b.value.symbol || '';
    return aCode.localeCompare(bCode);
  });
  
  symbolChoices.push(new inquirer.Separator());
  symbolChoices.push({ name: chalk.yellow('< Back'), value: 'back' });
  
  const { selectedSymbol } = await inquirer.prompt([
    {
      type: 'list',
      name: 'selectedSymbol',
      message: chalk.white.bold('Select Symbol:'),
      choices: symbolChoices,
      pageSize: 50,
      loop: false
    }
  ]);
  
  if (selectedSymbol === 'back') {
    return;
  }
  
  // Use the selected contract directly (already fetched from API)
  let contract = selectedSymbol;
  
  console.log();
  console.log(chalk.green(`  [OK] Selected: ${contract.name || contract.symbol}`));
  if (contract.tickSize && contract.tickValue) {
    console.log(chalk.gray(`  Tick Size: ${contract.tickSize} | Tick Value: $${contract.tickValue}`));
  }
  
  // If contract doesn't have full details, search again
  if (!contract.id || !contract.tickSize) {
    const searchSpinner = ora(`Getting contract details...`).start();
    const contractResult = await service.searchContracts(contract.symbol || contract.searchText, false);
    
    if (contractResult.success && contractResult.contracts && contractResult.contracts.length > 0) {
      const found = contractResult.contracts.find(c => c.activeContract) || contractResult.contracts[0];
      contract = { ...contract, ...found };
      searchSpinner.succeed(`Contract: ${contract.name || contract.symbol}`);
    } else {
      searchSpinner.warn('Using basic contract info');
      contract = {
        id: contract.symbol || contract.id,
        name: contract.name || contract.symbol,
        symbol: contract.symbol || contract.id
      };
    }
  }
  
  console.log();
  
  // Number of contracts
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

  // Risk Management
  console.log();
  console.log(chalk.cyan.bold('  Risk Management'));
  console.log(chalk.gray('  Set your daily target and maximum risk to auto-stop the algo.'));
  console.log();

  const { dailyTarget } = await inquirer.prompt([
    {
      type: 'input',
      name: 'dailyTarget',
      message: chalk.white.bold('Daily Target ($):'),
      default: '500',
      validate: (input) => {
        const num = parseFloat(input);
        if (isNaN(num) || num <= 0) {
          return 'Please enter a valid amount greater than 0';
        }
        return true;
      },
      filter: (input) => parseFloat(input)
    }
  ]);

  const { maxRisk } = await inquirer.prompt([
    {
      type: 'input',
      name: 'maxRisk',
      message: chalk.white.bold('Max Risk ($):'),
      default: '200',
      validate: (input) => {
        const num = parseFloat(input);
        if (isNaN(num) || num <= 0) {
          return 'Please enter a valid amount greater than 0';
        }
        return true;
      },
      filter: (input) => parseFloat(input)
    }
  ]);
  
  // Privacy option - show or hide account name
  console.log();
  const { showAccountName } = await inquirer.prompt([
    {
      type: 'list',
      name: 'showAccountName',
      message: chalk.white.bold('Account name visibility:'),
      choices: [
        { name: chalk.cyan('[>] Show account name'), value: true },
        { name: chalk.gray('[.] Hide account name'), value: false }
      ],
      loop: false
    }
  ]);
  
  const displayAccountName = showAccountName ? accountName : 'HQX *****';
  
  // Confirmation
  console.log();
  console.log(chalk.gray(getSeparator()));
  console.log(chalk.white.bold('  Algo Configuration:'));
  console.log(chalk.gray(getSeparator()));
  console.log(chalk.white(`  Account:      ${chalk.cyan(displayAccountName)}`));
  console.log(chalk.white(`  Symbol:       ${chalk.cyan(contract.name || selectedSymbol.value)}`));
  console.log(chalk.white(`  Contracts:    ${chalk.cyan(contracts)}`));
  console.log(chalk.white(`  Daily Target: ${chalk.green('$' + dailyTarget.toFixed(2))}`));
  console.log(chalk.white(`  Max Risk:     ${chalk.red('$' + maxRisk.toFixed(2))}`));
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
  
  await launchAlgo(service, account, contract, contracts, dailyTarget, maxRisk, showAccountName);
};

/**
 * Launch Algo with HQX Server Connection
 */
const launchAlgo = async (service, account, contract, numContracts, dailyTarget, maxRisk, showAccountName = true) => {
  const realAccountName = account.accountName || account.name || 'Account #' + account.accountId;
  const accountName = showAccountName ? realAccountName : 'HQX *****';
  const symbolName = contract.name || contract.symbol || contract.id;
  const symbol = contract.symbol || contract.id;
  
  console.log();
  console.log(chalk.green.bold('  [>] Launching HQX Algo...'));
  console.log();
  
  // Initialize HQX Server connection
  const hqxServer = new HQXServerService();
  let hqxConnected = false;
  let algoRunning = false;
  let stopReason = null;
  let latency = 0;
  let spinnerFrame = 0;
  const spinnerChars = ['\u280B', '\u2819', '\u2839', '\u2838', '\u283C', '\u2834', '\u2826', '\u2827', '\u2807', '\u280F'];
  const sessionStartTime = Date.now();
  
  // Stats
  let stats = {
    trades: 0,
    wins: 0,
    losses: 0,
    pnl: 0,
    signals: 0,
    winRate: '0.0'
  };
  
  // Logs buffer - newest first display, show many logs
  const logs = [];
  const MAX_LOGS = 50;
  
  // Log colors
  const typeColors = {
    info: chalk.cyan,
    success: chalk.green,
    signal: chalk.yellow.bold,
    trade: chalk.green.bold,
    loss: chalk.magenta.bold,
    error: chalk.red,
    warning: chalk.yellow
  };
  
  const getIcon = (type) => {
    // Fixed width tags (10 chars) for alignment
    switch(type) {
      case 'signal':   return '[SIGNAL]  ';
      case 'trade':    return '[TRADE]   ';
      case 'order':    return '[ORDER]   ';
      case 'position': return '[POSITION]';
      case 'error':    return '[ERROR]   ';
      case 'warning':  return '[WARNING] ';
      case 'success':  return '[OK]      ';
      case 'analysis': return '[ANALYSIS]';
      default:         return '[INFO]    ';
    }
  };
  
  // Add log (oldest first, newest at bottom)
  const addLog = (type, message) => {
    const timestamp = new Date().toLocaleTimeString();
    logs.push({ timestamp, type, message }); // Add at end
    if (logs.length > MAX_LOGS) logs.shift(); // Remove oldest from top
  };
  
  // Print log - just add to buffer, spinner interval will refresh display
  // This prevents display flicker from multiple concurrent displayUI() calls
  const printLog = (type, message) => {
    addLog(type, message);
    // Don't call displayUI() here - let the spinner interval handle it
    // This prevents flickering when logs arrive rapidly
  };
  
  // Check market hours
  const checkMarketStatus = () => {
    const now = new Date();
    const utcDay = now.getUTCDay();
    const utcHour = now.getUTCHours();
    const isDST = (() => {
      const jan = new Date(now.getFullYear(), 0, 1);
      const jul = new Date(now.getFullYear(), 6, 1);
      return now.getTimezoneOffset() < Math.max(jan.getTimezoneOffset(), jul.getTimezoneOffset());
    })();
    const ctOffset = isDST ? 5 : 6;
    const ctHour = (utcHour - ctOffset + 24) % 24;
    const ctDay = utcHour < ctOffset ? (utcDay + 6) % 7 : utcDay;

    if (ctDay === 6) return { isOpen: false, message: 'Market closed (Saturday)' };
    if (ctDay === 0 && ctHour < 17) return { isOpen: false, message: 'Market opens Sunday 5:00 PM CT' };
    if (ctDay === 5 && ctHour >= 16) return { isOpen: false, message: 'Market closed (Friday after 4PM CT)' };
    if (ctHour === 16 && ctDay >= 1 && ctDay <= 4) return { isOpen: false, message: 'Daily maintenance (4:00-5:00 PM CT)' };
    return { isOpen: true, message: 'Market OPEN' };
  };

  // Display full UI with logs (newest first at top)
  let firstDraw = true;
  let isDrawing = false; // Mutex to prevent concurrent draws
  
  // Build entire screen as a single string buffer to write atomically
  let screenBuffer = '';
  
  const bufferLine = (text) => {
    screenBuffer += text + '\x1B[K\n'; // Add text + clear to EOL + newline
  };
  
  // Legacy function for compatibility
  const printLine = bufferLine;
  
  const displayUI = () => {
    // Prevent concurrent draws
    if (isDrawing) return;
    isDrawing = true;
    
    // Reset buffer
    screenBuffer = '';
    
    if (firstDraw) {
      // Switch to alternate screen buffer - isolates our display
      screenBuffer += '\x1B[?1049h'; // Enter alternate screen
      screenBuffer += '\x1B[?25l'; // Hide cursor
      screenBuffer += '\x1B[2J'; // Clear screen
      firstDraw = false;
    }
    
    // Move cursor to home position
    screenBuffer += '\x1B[H';
    
    // Stats
    const pnlColor = stats.pnl >= 0 ? chalk.green : chalk.red;
    const pnlStr = (stats.pnl >= 0 ? '+$' : '-$') + Math.abs(stats.pnl).toFixed(2);
    // Always show latency in ms format
    const latencyMs = latency > 0 ? latency : 0;
    const latencyStr = `${latencyMs}ms`;
    const latencyColor = latencyMs < 100 ? chalk.green : (latencyMs < 300 ? chalk.yellow : chalk.red);
    const serverStatus = hqxConnected ? 'ON' : 'OFF';
    const serverColor = hqxConnected ? chalk.green : chalk.red;
    
    // Current date
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
    
    // Get package version
    const version = require('../../package.json').version;
    
    // Fixed width = 96 inner chars
    const W = 96;
    const TOP    = '\u2554' + '\u2550'.repeat(W) + '\u2557';
    const MID    = '\u2560' + '\u2550'.repeat(W) + '\u2563';
    const BOT    = '\u255A' + '\u2550'.repeat(W) + '\u255D';
    const V      = '\u2551';
    
    // Center text helper
    const center = (text, width) => {
      const pad = Math.floor((width - text.length) / 2);
      return ' '.repeat(pad) + text + ' '.repeat(width - pad - text.length);
    };
    
    // Pad text to exact width
    const padRight = (text, width) => {
      if (text.length >= width) return text.substring(0, width);
      return text + ' '.repeat(width - text.length);
    };
    
    printLine('');
    printLine(chalk.cyan(TOP));
    // Logo = 87 chars cyan + 9 chars yellow = 96 total
    printLine(chalk.cyan(V) + chalk.cyan(' ██╗  ██╗███████╗██████╗  ██████╗ ███████╗ ██████╗ ██╗   ██╗ █████╗ ███╗   ██╗████████╗') + chalk.yellow('██╗  ██╗') + ' ' + chalk.cyan(V));
    printLine(chalk.cyan(V) + chalk.cyan(' ██║  ██║██╔════╝██╔══██╗██╔════╝ ██╔════╝██╔═══██╗██║   ██║██╔══██╗████╗  ██║╚══██╔══╝') + chalk.yellow('╚██╗██╔╝') + ' ' + chalk.cyan(V));
    printLine(chalk.cyan(V) + chalk.cyan(' ███████║█████╗  ██║  ██║██║  ███╗█████╗  ██║   ██║██║   ██║███████║██╔██╗ ██║   ██║   ') + chalk.yellow(' ╚███╔╝ ') + ' ' + chalk.cyan(V));
    printLine(chalk.cyan(V) + chalk.cyan(' ██╔══██║██╔══╝  ██║  ██║██║   ██║██╔══╝  ██║▄▄ ██║██║   ██║██╔══██║██║╚██╗██║   ██║   ') + chalk.yellow(' ██╔██╗ ') + ' ' + chalk.cyan(V));
    printLine(chalk.cyan(V) + chalk.cyan(' ██║  ██║███████╗██████╔╝╚██████╔╝███████╗╚██████╔╝╚██████╔╝██║  ██║██║ ╚████║   ██║   ') + chalk.yellow('██╔╝ ██╗') + ' ' + chalk.cyan(V));
    printLine(chalk.cyan(V) + chalk.cyan(' ╚═╝  ╚═╝╚══════╝╚═════╝  ╚═════╝ ╚══════╝ ╚══▀▀═╝  ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═══╝   ╚═╝   ') + chalk.yellow('╚═╝  ╚═╝') + ' ' + chalk.cyan(V));
    printLine(chalk.cyan(MID));
    
    // Centered title
    const title1 = `Prop Futures Algo Trading  v${version}`;
    printLine(chalk.cyan(V) + chalk.white(center(title1, W)) + chalk.cyan(V));
    printLine(chalk.cyan(MID));
    
    // Centered subtitle
    const title2 = 'HQX Ultra-Scalping Algorithm';
    printLine(chalk.cyan(V) + chalk.yellow(center(title2, W)) + chalk.cyan(V));
    
    // Grid layout for metrics - 2 columns per row, 4 rows
    // Row 1: Account | Symbol + Qty
    // Row 2: Target | Risk  
    // Row 3: P&L | Server
    // Row 4: Trades + W/L | Latency
    const VS = '\u2502'; // Vertical separator (thin)
    
    // 2 columns: 48 + 47 + 1 separator = 96
    const colL = 48, colR = 47;
    
    // Safe padding function
    const safePad = (len) => ' '.repeat(Math.max(0, len));
    
    // Build cell helper
    const buildCell = (label, value, valueColor, width) => {
      const text = ` ${label}: ${valueColor(value)}`;
      const plain = ` ${label}: ${value}`;
      return { text, plain, padded: text + safePad(width - plain.length) };
    };
    
    // Row 1: Account | Symbol + Qty
    const accVal = accountName.length > 35 ? accountName.substring(0, 35) : accountName;
    const symVal = symbolName.length > 12 ? symbolName.substring(0, 12) : symbolName;
    const r1c1 = buildCell('Account', accVal, chalk.cyan, colL);
    const r1c2text = ` Symbol: ${chalk.yellow(symVal)}  Qty: ${chalk.cyan(numContracts)}`;
    const r1c2plain = ` Symbol: ${symVal}  Qty: ${numContracts}`;
    const r1c2 = r1c2text + safePad(colR - r1c2plain.length);
    
    // Row 2: Target | Risk
    const r2c1 = buildCell('Target', '$' + dailyTarget.toFixed(2), chalk.green, colL);
    const r2c2 = buildCell('Risk', '$' + maxRisk.toFixed(2), chalk.red, colR);
    
    // Row 3: P&L | Server
    const r3c1 = buildCell('P&L', pnlStr, pnlColor, colL);
    const r3c2 = buildCell('Server', serverStatus, serverColor, colR);
    
    // Row 4: Trades + W/L | Latency
    const r4c1text = ` Trades: ${chalk.cyan(stats.trades)}  W/L: ${chalk.green(stats.wins)}/${chalk.red(stats.losses)}`;
    const r4c1plain = ` Trades: ${stats.trades}  W/L: ${stats.wins}/${stats.losses}`;
    const r4c1 = r4c1text + safePad(colL - r4c1plain.length);
    const r4c2 = buildCell('Latency', latencyStr, latencyColor, colR);
    
    // Grid separators
    const GRID_TOP = '\u2560' + '\u2550'.repeat(colL) + '\u2564' + '\u2550'.repeat(colR) + '\u2563';
    const GRID_MID = '\u2560' + '\u2550'.repeat(colL) + '\u256A' + '\u2550'.repeat(colR) + '\u2563';
    const GRID_BOT = '\u2560' + '\u2550'.repeat(colL) + '\u2567' + '\u2550'.repeat(colR) + '\u2563';
    
    // Print grid
    printLine(chalk.cyan(GRID_TOP));
    printLine(chalk.cyan(V) + r1c1.padded + chalk.cyan(VS) + r1c2 + chalk.cyan(V));
    printLine(chalk.cyan(GRID_MID));
    printLine(chalk.cyan(V) + r2c1.padded + chalk.cyan(VS) + r2c2.padded + chalk.cyan(V));
    printLine(chalk.cyan(GRID_MID));
    printLine(chalk.cyan(V) + r3c1.padded + chalk.cyan(VS) + r3c2.padded + chalk.cyan(V));
    printLine(chalk.cyan(GRID_MID));
    printLine(chalk.cyan(V) + r4c1 + chalk.cyan(VS) + r4c2.padded + chalk.cyan(V));
    printLine(chalk.cyan(GRID_BOT));
    
    // Activity log header with spinner and centered date
    spinnerFrame = (spinnerFrame + 1) % spinnerChars.length;
    const spinnerChar = spinnerChars[spinnerFrame];
    const actLeft = ` Activity Log ${chalk.yellow(spinnerChar)}`;
    const actLeftPlain = ` Activity Log ${spinnerChar}`;
    const actRight = 'Press X to stop ';
    const dateCentered = `- ${dateStr} -`;
    const leftLen = actLeftPlain.length;
    const rightLen = actRight.length;
    const midSpace = Math.max(0, W - leftLen - rightLen);
    const datePad = Math.max(0, Math.floor((midSpace - dateCentered.length) / 2));
    const remainingPad = Math.max(0, midSpace - datePad - dateCentered.length);
    const dateSection = ' '.repeat(datePad) + chalk.cyan(dateCentered) + ' '.repeat(remainingPad);
    bufferLine(chalk.cyan(V) + chalk.white(actLeft) + dateSection + chalk.yellow(actRight) + chalk.cyan(V));
    bufferLine(chalk.cyan(MID));
    
    // Helper to strip ANSI codes for length calculation
    const stripAnsi = (str) => str.replace(/\x1B\[[0-9;]*m/g, '');
    
    // Helper to truncate and pad text to exact width W
    const fitToWidth = (text, width) => {
      const plainText = stripAnsi(text);
      if (plainText.length > width) {
        // Truncate - find where to cut in original string
        let count = 0;
        let cutIndex = 0;
        for (let i = 0; i < text.length && count < width - 3; i++) {
          if (text[i] === '\x1B') {
            // Skip ANSI sequence
            while (i < text.length && text[i] !== 'm') i++;
          } else {
            count++;
            cutIndex = i + 1;
          }
        }
        return text.substring(0, cutIndex) + '...';
      }
      return text + ' '.repeat(width - plainText.length);
    };
    
    // Logs inside the rectangle - newest first, max 50 lines
    const MAX_VISIBLE_LOGS = 50;
    
    if (logs.length === 0) {
      const emptyLine = ' Waiting for activity...';
      bufferLine(chalk.cyan(V) + chalk.gray(fitToWidth(emptyLine, W)) + chalk.cyan(V));
      // Fill remaining lines
      for (let i = 0; i < MAX_VISIBLE_LOGS - 1; i++) {
        bufferLine(chalk.cyan(V) + ' '.repeat(W) + chalk.cyan(V));
      }
    } else {
      // Show newest first (reverse), limited to MAX_VISIBLE_LOGS
      const reversedLogs = [...logs].reverse().slice(0, MAX_VISIBLE_LOGS);
      reversedLogs.forEach(log => {
        const color = typeColors[log.type] || chalk.white;
        const icon = getIcon(log.type);
        // Build log line content (plain text, no color yet)
        const logContent = ` [${log.timestamp}] ${icon} ${log.message}`;
        // Fit to width then apply color
        const fitted = fitToWidth(logContent, W);
        bufferLine(chalk.cyan(V) + color(fitted) + chalk.cyan(V));
      });
      // Fill remaining lines with empty to keep fixed height
      for (let i = reversedLogs.length; i < MAX_VISIBLE_LOGS; i++) {
        bufferLine(chalk.cyan(V) + ' '.repeat(W) + chalk.cyan(V));
      }
    }
    
    // Bottom border to close the rectangle
    bufferLine(chalk.cyan(BOT));
    
    // Write entire buffer atomically
    process.stdout.write(screenBuffer);
    
    isDrawing = false;
  };
  
  // Spinner interval to refresh UI - 250ms for stability
  const spinnerInterval = setInterval(() => {
    if (algoRunning && !isDrawing) {
      displayUI();
    }
  }, 250);
  
  // Connect to HQX Server
  const spinner = ora('Authenticating with HQX Server...').start();
  
  try {
    // Authenticate
    const authResult = await hqxServer.authenticate(account.accountId.toString(), account.propfirm || 'projectx');
    
    if (!authResult.success) {
      spinner.fail('Authentication failed: ' + (authResult.error || 'Unknown error'));
      addLog('error', 'Authentication failed');
      
      // Fallback to offline mode
      console.log(chalk.yellow('  Running in offline demo mode...'));
      console.log();
      await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
      return;
    }
    
    spinner.text = 'Connecting to WebSocket...';
    
    // Connect WebSocket
    const connectResult = await hqxServer.connect();
    
    if (connectResult.success) {
      spinner.succeed('Connected to HQX Server');
      hqxConnected = true;
    } else {
      throw new Error('WebSocket connection failed');
    }
    
  } catch (error) {
    spinner.warn('HQX Server unavailable - Running in offline mode');
    hqxConnected = false;
  }
  
  // Setup event handlers - logs scroll down naturally
  hqxServer.on('latency', (data) => {
    latency = data.latency || 0;
    // Don't call displayUI() - spinner interval will refresh
  });
  
  hqxServer.on('log', (data) => {
    let message = data.message;
    // If account name is hidden, filter it from logs too
    if (!showAccountName && realAccountName) {
      message = message.replace(new RegExp(realAccountName, 'gi'), 'HQX *****');
    }
    printLog(data.type || 'info', message);
  });
  
  hqxServer.on('signal', (data) => {
    stats.signals++;
    const side = data.side === 'long' ? 'BUY' : 'SELL';
    printLog('signal', `${side} Signal @ ${data.entry?.toFixed(2) || 'N/A'} | SL: ${data.stop?.toFixed(2) || 'N/A'} | TP: ${data.target?.toFixed(2) || 'N/A'}`);
    
    // Execute order via PropFirm API if connected
    if (hqxConnected && service) {
      executeSignal(service, account, contract, numContracts, data);
    }
  });
  
  hqxServer.on('trade', (data) => {
    stats.trades++;
    stats.pnl += data.pnl || 0;
    if (data.pnl > 0) {
      stats.wins++;
      printLog('trade', `Closed +$${data.pnl.toFixed(2)} (${data.reason || 'take_profit'})`);
    } else {
      stats.losses++;
      printLog('loss', `Closed -$${Math.abs(data.pnl).toFixed(2)} (${data.reason || 'stop_loss'})`);
    }
    stats.winRate = stats.trades > 0 ? ((stats.wins / stats.trades) * 100).toFixed(1) : '0.0';
    
    // Print updated stats
    const statsType = stats.pnl >= 0 ? 'info' : 'loss';
    printLog(statsType, `Stats: Trades: ${stats.trades} | Wins: ${stats.wins} | P&L: $${stats.pnl.toFixed(2)}`);
    
    // Check daily target
    if (stats.pnl >= dailyTarget) {
      stopReason = 'target';
      printLog('success', `Daily target reached! +$${stats.pnl.toFixed(2)}`);
      algoRunning = false;
      if (hqxConnected) {
        hqxServer.stopAlgo();
      }
    }
    
    // Check max risk
    if (stats.pnl <= -maxRisk) {
      stopReason = 'risk';
      printLog('error', `Max risk reached! -$${Math.abs(stats.pnl).toFixed(2)}`);
      algoRunning = false;
      if (hqxConnected) {
        hqxServer.stopAlgo();
      }
    }
  });
  
  hqxServer.on('stats', (data) => {
    // Update stats from server
    stats.trades = data.trades || stats.trades;
    stats.wins = data.wins || stats.wins;
    stats.losses = data.losses || stats.losses;
    stats.signals = data.signals || stats.signals;
    stats.winRate = data.winRate || stats.winRate;
    
    // P&L = realized P&L + unrealized P&L from open position
    const realizedPnl = data.pnl || 0;
    const unrealizedPnl = data.position?.pnl || 0;
    stats.pnl = realizedPnl + unrealizedPnl;
  });
  
  hqxServer.on('error', (data) => {
    printLog('error', data.message || 'Unknown error');
    // Stop algo on connection error
    if (!stopReason) {
      stopReason = 'connection_error';
      algoRunning = false;
    }
  });
  
  hqxServer.on('disconnected', () => {
    hqxConnected = false;
    // Only log error if not intentionally stopped by user
    if (!stopReason || stopReason === 'user') {
      // Don't show error for user-initiated stop
      if (!stopReason) {
        printLog('error', 'Connection lost - Stopping algo');
        stopReason = 'disconnected';
        algoRunning = false;
      }
    }
  });
  
  // Display header once
  displayUI();
  
  // Start algo
  if (hqxConnected) {
    printLog('info', 'Starting HQX Ultra-Scalping...');
    printLog('info', `Target: $${dailyTarget.toFixed(2)} | Risk: $${maxRisk.toFixed(2)}`);
    
    // Get propfirm token for real market data
    const propfirmToken = service.getToken ? service.getToken() : null;
    const propfirmId = service.getPropfirm ? service.getPropfirm() : (account.propfirm || 'topstep');
    
    hqxServer.startAlgo({
      accountId: account.accountId,
      contractId: contract.id || contract.contractId,
      symbol: symbol,
      contracts: numContracts,
      dailyTarget: dailyTarget,
      maxRisk: maxRisk,
      propfirm: propfirmId,
      propfirmToken: propfirmToken
    });
    algoRunning = true;
  } else {
    printLog('warning', 'Running in offline demo mode');
    printLog('info', 'No real trades will be executed');
    algoRunning = true;
  }
  
  // Wait for X key OR auto-stop (target/risk reached)
  await new Promise((resolve) => {
    let resolved = false;
    
    const cleanup = () => {
      if (resolved) return;
      resolved = true;
      clearInterval(checkInterval);
      if (process.stdin.isTTY) {
        try {
          process.stdin.setRawMode(false);
          process.stdin.removeAllListeners('keypress');
        } catch (e) {}
      }
      resolve();
    };
    
    // Check for auto-stop every 500ms
    const checkInterval = setInterval(() => {
      if (!algoRunning || stopReason) {
        cleanup();
      }
    }, 500);

    // Listen for X key
    if (process.stdin.isTTY) {
      try {
        readline.emitKeypressEvents(process.stdin);
        process.stdin.setRawMode(true);
        process.stdin.resume();
        
        process.stdin.on('keypress', (str, key) => {
          if (!key) return;
          const keyName = key.name?.toLowerCase();
          if (keyName === 'x' || (key.ctrl && keyName === 'c')) {
            stopReason = 'user'; // Set stop reason before cleanup
            cleanup();
          }
        });
      } catch (e) {
        // Fallback: just wait for auto-stop
      }
    }
  });
  
  // Clear spinner interval
  clearInterval(spinnerInterval);
  
  // Exit alternate screen buffer and show cursor
  process.stdout.write('\x1B[?1049l'); // Exit alternate screen
  process.stdout.write('\x1B[?25h'); // Show cursor
  
  // Stop algo
  console.log();
  if (!stopReason) {
    printLog('warning', 'Stopping algo...');
  }
  
  // Cancel all pending orders and close positions
  printLog('info', 'Cancelling pending orders...');
  
  try {
    // Cancel all orders
    const cancelResult = await service.cancelAllOrders(account.accountId);
    if (cancelResult.success) {
      printLog('success', 'All pending orders cancelled');
    } else {
      printLog('warning', 'No pending orders to cancel');
    }
  } catch (e) {
    printLog('warning', 'Could not cancel orders: ' + e.message);
  }
  
  // Close all positions for this symbol
  printLog('info', 'Closing open positions...');
  
  try {
    const positions = await service.getPositions(account.accountId);
    if (positions.success && positions.positions) {
      const symbolPos = positions.positions.find(p => 
        p.symbol === symbol || 
        p.contractId === (contract.id || contract.contractId)
      );
      
      if (symbolPos && symbolPos.quantity !== 0) {
        const closeResult = await service.closePosition(account.accountId, symbolPos.contractId || symbolPos.symbol);
        if (closeResult.success) {
          printLog('success', `Position closed: ${Math.abs(symbolPos.quantity)} ${symbol}`);
        } else {
          printLog('error', 'Failed to close position: ' + (closeResult.error || 'Unknown'));
        }
      } else {
        printLog('info', 'No open position to close');
      }
    }
  } catch (e) {
    printLog('warning', 'Could not close positions: ' + e.message);
  }
  
  if (hqxConnected && algoRunning) {
    hqxServer.stopAlgo();
  }
  
  hqxServer.disconnect();
  algoRunning = false;
  
  // Small delay to ensure all cleanup is done
  await new Promise(r => setTimeout(r, 500));
  
  // Show cursor again (don't clear screen - show summary below logs)
  process.stdout.write('\x1B[?25h');
  
  // Print stop reason message
  console.log();
  console.log();
  if (stopReason === 'target') {
    console.log(chalk.green.bold(' [OK] Daily target reached! Algo stopped.'));
  } else if (stopReason === 'risk') {
    console.log(chalk.red.bold(' [X] Max risk reached! Algo stopped.'));
  } else if (stopReason === 'disconnected' || stopReason === 'connection_error') {
    console.log(chalk.red.bold(' [X] Connection lost! Algo stopped.'));
  } else if (stopReason === 'user') {
    console.log(chalk.yellow(' [OK] Algo stopped by user'));
  } else {
    console.log(chalk.yellow(' [OK] Algo stopped by user'));
  }
  console.log();
  
  // Final stats in a grid box - must match main UI width of 96
  const summaryV = '\u2551';
  const summaryVS = '\u2502';
  const summaryH = '\u2550';
  const summaryW = 96; // Same as main UI
  
  // Calculate session duration
  const sessionDuration = Date.now() - sessionStartTime;
  const durationSec = Math.floor(sessionDuration / 1000);
  const durationMin = Math.floor(durationSec / 60);
  const durationHr = Math.floor(durationMin / 60);
  const durationStr = durationHr > 0 
    ? `${durationHr}h ${durationMin % 60}m ${durationSec % 60}s`
    : durationMin > 0 
      ? `${durationMin}m ${durationSec % 60}s`
      : `${durationSec}s`;
  
  // 4 cells + 3 separators = 96 inner chars
  // 96 - 3 separators = 93, divided by 4 = 23.25, so use 24+23+24+23 = 94... need 96
  // Let's use: 24 + 24 + 24 + 21 = 93 + 3 sep = 96
  const sc1 = 24, sc2 = 24, sc3 = 24, sc4 = 21;
  
  const summaryCell = (label, value, width) => {
    const text = ` ${label}: ${value}`;
    const stripped = text.replace(/\x1b\[[0-9;]*m/g, '');
    const padding = Math.max(0, width - stripped.length);
    return text + ' '.repeat(padding);
  };
  
  const centerSummaryTitle = (text, width) => {
    const pad = Math.floor((width - text.length) / 2);
    return ' '.repeat(pad) + text + ' '.repeat(width - pad - text.length);
  };
  
  const pnlValue = stats.pnl >= 0 ? chalk.green('+$' + stats.pnl.toFixed(2)) : chalk.red('-$' + Math.abs(stats.pnl).toFixed(2));
  
  // Build separator lines
  const SUMMARY_TOP = '\u2554' + summaryH.repeat(summaryW) + '\u2557';
  const SUMMARY_GRID_TOP = '\u2560' + summaryH.repeat(sc1) + '\u2564' + summaryH.repeat(sc2) + '\u2564' + summaryH.repeat(sc3) + '\u2564' + summaryH.repeat(sc4) + '\u2563';
  const SUMMARY_GRID_MID = '\u2560' + summaryH.repeat(sc1) + '\u256A' + summaryH.repeat(sc2) + '\u256A' + summaryH.repeat(sc3) + '\u256A' + summaryH.repeat(sc4) + '\u2563';
  const SUMMARY_BOT = '\u255A' + summaryH.repeat(sc1) + '\u2567' + summaryH.repeat(sc2) + '\u2567' + summaryH.repeat(sc3) + '\u2567' + summaryH.repeat(sc4) + '\u255D';
  
  console.log();
  console.log(chalk.cyan(SUMMARY_TOP));
  console.log(chalk.cyan(summaryV) + chalk.white.bold(centerSummaryTitle('Session Summary', summaryW)) + chalk.cyan(summaryV));
  console.log(chalk.cyan(SUMMARY_GRID_TOP));
  
  // Row 1: Target | Risk | P&L | Win Rate
  const r1c1 = summaryCell('Target', chalk.green('$' + dailyTarget.toFixed(2)), sc1);
  const r1c2 = summaryCell('Risk', chalk.red('$' + maxRisk.toFixed(2)), sc2);
  const r1c3 = summaryCell('P&L', pnlValue, sc3);
  const r1c4 = summaryCell('Win Rate', chalk.yellow(stats.winRate + '%'), sc4);
  console.log(chalk.cyan(summaryV) + r1c1 + chalk.cyan(summaryVS) + r1c2 + chalk.cyan(summaryVS) + r1c3 + chalk.cyan(summaryVS) + r1c4 + chalk.cyan(summaryV));
  
  console.log(chalk.cyan(SUMMARY_GRID_MID));
  
  // Row 2: Trades | Wins | Losses | Duration
  const r2c1 = summaryCell('Trades', chalk.cyan(stats.trades.toString()), sc1);
  const r2c2 = summaryCell('Wins', chalk.green(stats.wins.toString()), sc2);
  const r2c3 = summaryCell('Losses', chalk.red(stats.losses.toString()), sc3);
  const r2c4 = summaryCell('Duration', chalk.white(durationStr), sc4);
  console.log(chalk.cyan(summaryV) + r2c1 + chalk.cyan(summaryVS) + r2c2 + chalk.cyan(summaryVS) + r2c3 + chalk.cyan(summaryVS) + r2c4 + chalk.cyan(summaryV));
  
  console.log(chalk.cyan(SUMMARY_BOT));
  console.log();
  
  await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
};

/**
 * Execute signal via PropFirm API
 */
const executeSignal = async (service, account, contract, numContracts, signal) => {
  try {
    const orderData = {
      accountId: account.accountId,
      contractId: contract.id || contract.contractId,
      type: 2,  // Market order
      side: signal.side === 'long' ? 0 : 1,  // 0=Buy, 1=Sell
      size: numContracts
    };
    
    // Place order via ProjectX Gateway API
    const result = await service.placeOrder(orderData);
    
    if (result.success) {
      console.log(chalk.green(`  [OK] Order executed: ${signal.side.toUpperCase()} ${numContracts} contracts`));
    } else {
      console.log(chalk.red(`  [X] Order failed: ${result.error || 'Unknown error'}`));
    }
  } catch (error) {
    console.log(chalk.red(`  [X] Order error: ${error.message}`));
  }
};

/**
 * Copy Trading Menu
 */
const copyTradingMenu = async () => {
  console.log();
  console.log(chalk.gray(getSeparator()));
  console.log(chalk.green.bold('  Copy Trading Setup'));
  console.log(chalk.gray(getSeparator()));
  console.log();

  // Check market status first
  const marketSpinner = ora('Checking market status...').start();
  
  // Use a simple market hours check
  const now = new Date();
  const utcDay = now.getUTCDay();
  const utcHour = now.getUTCHours();
  const isDST = (() => {
    const jan = new Date(now.getFullYear(), 0, 1);
    const jul = new Date(now.getFullYear(), 6, 1);
    return now.getTimezoneOffset() < Math.max(jan.getTimezoneOffset(), jul.getTimezoneOffset());
  })();
  const ctOffset = isDST ? 5 : 6;
  const ctHour = (utcHour - ctOffset + 24) % 24;
  const ctDay = utcHour < ctOffset ? (utcDay + 6) % 7 : utcDay;

  let marketClosed = false;
  let marketMessage = '';

  if (ctDay === 6) {
    marketClosed = true;
    marketMessage = 'Market closed (Saturday)';
  } else if (ctDay === 0 && ctHour < 17) {
    marketClosed = true;
    marketMessage = 'Market opens Sunday 5:00 PM CT';
  } else if (ctDay === 5 && ctHour >= 16) {
    marketClosed = true;
    marketMessage = 'Market closed (Friday after 4PM CT)';
  } else if (ctHour === 16 && ctDay >= 1 && ctDay <= 4) {
    marketClosed = true;
    marketMessage = 'Daily maintenance (4:00-5:00 PM CT)';
  }

  if (marketClosed) {
    marketSpinner.fail('Market is CLOSED');
    console.log();
    console.log(chalk.red.bold('  [X] ' + marketMessage));
    console.log();
    console.log(chalk.gray('  Futures markets (CME) trading hours:'));
    console.log(chalk.gray('  Sunday 5:00 PM CT - Friday 4:00 PM CT'));
    console.log(chalk.gray('  Daily maintenance: 4:00 PM - 5:00 PM CT'));
    console.log();
    await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
    return;
  }

  marketSpinner.succeed('Market is OPEN - Ready to trade!');
  console.log();

  // Get all active accounts from all connections
  const allAccounts = await connections.getAllAccounts();
  const activeAccounts = allAccounts.filter(acc => acc.status === 0);

  if (activeAccounts.length < 2) {
    console.log(chalk.red('  [X] You need at least 2 active accounts for copy trading.'));
    console.log(chalk.gray('      Connect more prop firm accounts first.'));
    console.log();
    await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
    return;
  }

  // Step 1: Risk Management Settings
  console.log(chalk.cyan.bold('  Step 1: Risk Management'));
  console.log(chalk.gray('  Set your daily target and maximum risk to auto-stop copy trading.'));
  console.log();

  const { dailyTarget } = await inquirer.prompt([
    {
      type: 'input',
      name: 'dailyTarget',
      message: chalk.white.bold('Daily Target ($):'),
      default: '500',
      validate: (input) => {
        const num = parseFloat(input);
        if (isNaN(num) || num <= 0) {
          return 'Please enter a valid amount greater than 0';
        }
        return true;
      },
      filter: (input) => parseFloat(input)
    }
  ]);

  const { maxRisk } = await inquirer.prompt([
    {
      type: 'input',
      name: 'maxRisk',
      message: chalk.white.bold('Max Risk ($):'),
      default: '200',
      validate: (input) => {
        const num = parseFloat(input);
        if (isNaN(num) || num <= 0) {
          return 'Please enter a valid amount greater than 0';
        }
        return true;
      },
      filter: (input) => parseFloat(input)
    }
  ]);

  console.log();
  console.log(chalk.gray('  Daily Target: ') + chalk.green('$' + dailyTarget.toFixed(2)));
  console.log(chalk.gray('  Max Risk:     ') + chalk.red('$' + maxRisk.toFixed(2)));
  console.log();

  // Step 2: Select Lead Account
  console.log(chalk.cyan.bold('  Step 2: Select Lead Account'));
  console.log(chalk.gray('  The lead account is the master account whose trades will be copied.'));
  console.log();

  const leadChoices = activeAccounts.map(acc => ({
    name: chalk.cyan(`${acc.accountName || acc.name} - ${acc.propfirm} - $${acc.balance.toLocaleString()}`),
    value: acc
  }));
  leadChoices.push(new inquirer.Separator());
  leadChoices.push({ name: chalk.yellow('< Back'), value: 'back' });

  const { leadAccount } = await inquirer.prompt([
    {
      type: 'list',
      name: 'leadAccount',
      message: chalk.white.bold('Lead Account:'),
      choices: leadChoices,
      pageSize: 15,
      loop: false
    }
  ]);

  if (leadAccount === 'back') return;

  // Step 3: Select Follower Account
  console.log();
  console.log(chalk.cyan.bold('  Step 3: Select Follower Account'));
  console.log(chalk.gray('  The follower account will copy trades from the lead account.'));
  console.log();

  const followerChoices = activeAccounts
    .filter(acc => acc.accountId !== leadAccount.accountId)
    .map(acc => ({
      name: chalk.cyan(`${acc.accountName || acc.name} - ${acc.propfirm} - $${acc.balance.toLocaleString()}`),
      value: acc
    }));
  followerChoices.push(new inquirer.Separator());
  followerChoices.push({ name: chalk.yellow('< Back'), value: 'back' });

  const { followerAccount } = await inquirer.prompt([
    {
      type: 'list',
      name: 'followerAccount',
      message: chalk.white.bold('Follower Account:'),
      choices: followerChoices,
      pageSize: 15,
      loop: false
    }
  ]);

  if (followerAccount === 'back') return;

  // Step 4: Select Lead Symbol
  console.log();
  console.log(chalk.cyan.bold('  Step 4: Configure Lead Symbol'));
  console.log();

  const { leadSymbol } = await inquirer.prompt([
    {
      type: 'list',
      name: 'leadSymbol',
      message: chalk.white.bold('Lead Symbol:'),
      choices: FUTURES_SYMBOLS.map(s => ({
        name: chalk.cyan(s.name),
        value: s
      })),
      pageSize: 15,
      loop: false
    }
  ]);

  const { leadContracts } = await inquirer.prompt([
    {
      type: 'input',
      name: 'leadContracts',
      message: chalk.white.bold('Lead Number of Contracts:'),
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

  // Step 5: Select Follower Symbol
  console.log();
  console.log(chalk.cyan.bold('  Step 5: Configure Follower Symbol'));
  console.log();

  const { followerSymbol } = await inquirer.prompt([
    {
      type: 'list',
      name: 'followerSymbol',
      message: chalk.white.bold('Follower Symbol:'),
      choices: FUTURES_SYMBOLS.map(s => ({
        name: chalk.cyan(s.name),
        value: s
      })),
      pageSize: 15,
      loop: false
    }
  ]);

  const { followerContracts } = await inquirer.prompt([
    {
      type: 'input',
      name: 'followerContracts',
      message: chalk.white.bold('Follower Number of Contracts:'),
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

  // Configuration Summary
  console.log();
  console.log(chalk.gray(getSeparator()));
  console.log(chalk.white.bold('  Copy Trading Configuration'));
  console.log(chalk.gray(getSeparator()));
  console.log();
  console.log(chalk.white('  RISK MANAGEMENT'));
  console.log(chalk.white(`    Daily Target: ${chalk.green('$' + dailyTarget.toFixed(2))}`));
  console.log(chalk.white(`    Max Risk:     ${chalk.red('$' + maxRisk.toFixed(2))}`));
  console.log();
  console.log(chalk.white('  LEAD ACCOUNT'));
  console.log(chalk.white(`    Account:   ${chalk.cyan(leadAccount.accountName || leadAccount.name)}`));
  console.log(chalk.white(`    PropFirm:  ${chalk.magenta(leadAccount.propfirm)}`));
  console.log(chalk.white(`    Symbol:    ${chalk.cyan(leadSymbol.name)}`));
  console.log(chalk.white(`    Contracts: ${chalk.cyan(leadContracts)}`));
  console.log();
  console.log(chalk.white('  FOLLOWER ACCOUNT'));
  console.log(chalk.white(`    Account:   ${chalk.cyan(followerAccount.accountName || followerAccount.name)}`));
  console.log(chalk.white(`    PropFirm:  ${chalk.magenta(followerAccount.propfirm)}`));
  console.log(chalk.white(`    Symbol:    ${chalk.cyan(followerSymbol.name)}`));
  console.log(chalk.white(`    Contracts: ${chalk.cyan(followerContracts)}`));
  console.log();
  console.log(chalk.gray(getSeparator()));
  console.log();

  const { launch } = await inquirer.prompt([
    {
      type: 'list',
      name: 'launch',
      message: chalk.white.bold('Ready to launch Copy Trading?'),
      choices: [
        { name: chalk.green.bold('[>] Launch Copy Trading'), value: 'launch' },
        { name: chalk.yellow('< Back'), value: 'back' }
      ],
      loop: false
    }
  ]);

  if (launch === 'back') return;

  // Launch Copy Trading
  await launchCopyTrading({
    dailyTarget,
    maxRisk,
    lead: {
      account: leadAccount,
      symbol: leadSymbol,
      contracts: leadContracts,
      service: leadAccount.service
    },
    follower: {
      account: followerAccount,
      symbol: followerSymbol,
      contracts: followerContracts,
      service: followerAccount.service
    }
  });
};

/**
 * Launch Copy Trading
 */
const launchCopyTrading = async (config) => {
  const { lead, follower, dailyTarget, maxRisk } = config;

  console.log();
  console.log(chalk.green.bold('  [>] Launching Copy Trading...'));
  console.log();

  let isRunning = true;
  let stopReason = null;
  let lastLeadPosition = null;
  const logs = [];
  const MAX_LOGS = 25;

  const stats = {
    copiedTrades: 0,
    leadTrades: 0,
    followerTrades: 0,
    signals: 0,
    errors: 0,
    pnl: 0,
    trades: 0,
    wins: 0,
    losses: 0
  };

  // Log colors
  const typeColors = {
    info: chalk.cyan,
    success: chalk.green,
    trade: chalk.green.bold,
    copy: chalk.yellow.bold,
    signal: chalk.magenta.bold,
    loss: chalk.red.bold,
    error: chalk.red,
    warning: chalk.yellow
  };

  const getIcon = (type) => {
    switch(type) {
      case 'signal': return '[~]';
      case 'trade': return '[>]';
      case 'copy': return '[+]';
      case 'loss': return '[-]';
      case 'error': return '[X]';
      case 'success': return '[OK]';
      default: return '[.]';
    }
  };

  const addLog = (type, message) => {
    const timestamp = new Date().toLocaleTimeString();
    logs.push({ timestamp, type, message });
    if (logs.length > MAX_LOGS) logs.shift();
  };

  // Build entire screen as a single string buffer to write atomically
  let screenBuffer = '';
  let firstDraw = true;
  let isDrawing = false;
  let spinnerFrame = 0;
  const spinnerChars = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  
  // HQX Server connection state (declared here so displayUI can access it)
  const hqxServer = new HQXServerService();
  let hqxConnected = false;
  let latency = 0;
  
  const bufferLine = (text) => {
    screenBuffer += text + '\x1B[K\n';
  };

  const displayUI = () => {
    // Prevent concurrent draws
    if (isDrawing) return;
    isDrawing = true;
    
    // Reset buffer
    screenBuffer = '';
    
    if (firstDraw) {
      screenBuffer += '\x1B[?1049h'; // Enter alternate screen
      screenBuffer += '\x1B[?25l'; // Hide cursor
      screenBuffer += '\x1B[2J'; // Clear screen
      firstDraw = false;
    }
    
    // Move cursor to home position
    screenBuffer += '\x1B[H';
    
    // Stats
    const pnlColor = stats.pnl >= 0 ? chalk.green : chalk.red;
    const pnlStr = (stats.pnl >= 0 ? '+$' : '-$') + Math.abs(stats.pnl).toFixed(2);
    
    // Latency formatting
    const latencyMs = latency > 0 ? latency : 0;
    const latencyStr = `${latencyMs}ms`;
    const latencyColor = latencyMs < 100 ? chalk.green : (latencyMs < 300 ? chalk.yellow : chalk.red);
    
    // Current date
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
    
    // Get package version
    const version = require('../../package.json').version;
    
    // Fixed width = 96 inner chars
    const W = 96;
    const TOP    = '\u2554' + '\u2550'.repeat(W) + '\u2557';
    const MID    = '\u2560' + '\u2550'.repeat(W) + '\u2563';
    const BOT    = '\u255A' + '\u2550'.repeat(W) + '\u255D';
    const V      = '\u2551';
    
    // Center text helper
    const center = (text, width) => {
      const pad = Math.floor((width - text.length) / 2);
      return ' '.repeat(pad) + text + ' '.repeat(width - pad - text.length);
    };
    
    // Safe padding function
    const safePad = (len) => ' '.repeat(Math.max(0, len));
    
    // Build cell helper
    const buildCell = (label, value, valueColor, width) => {
      const text = ` ${label}: ${valueColor(value)}`;
      const plain = ` ${label}: ${value}`;
      return { text, plain, padded: text + safePad(width - plain.length) };
    };
    
    bufferLine('');
    bufferLine(chalk.cyan(TOP));
    // Logo HEDGEQUANTX
    bufferLine(chalk.cyan(V) + chalk.cyan(' ██╗  ██╗███████╗██████╗  ██████╗ ███████╗ ██████╗ ██╗   ██╗ █████╗ ███╗   ██╗████████╗') + chalk.yellow('██╗  ██╗') + ' ' + chalk.cyan(V));
    bufferLine(chalk.cyan(V) + chalk.cyan(' ██║  ██║██╔════╝██╔══██╗██╔════╝ ██╔════╝██╔═══██╗██║   ██║██╔══██╗████╗  ██║╚══██╔══╝') + chalk.yellow('╚██╗██╔╝') + ' ' + chalk.cyan(V));
    bufferLine(chalk.cyan(V) + chalk.cyan(' ███████║█████╗  ██║  ██║██║  ███╗█████╗  ██║   ██║██║   ██║███████║██╔██╗ ██║   ██║   ') + chalk.yellow(' ╚███╔╝ ') + ' ' + chalk.cyan(V));
    bufferLine(chalk.cyan(V) + chalk.cyan(' ██╔══██║██╔══╝  ██║  ██║██║   ██║██╔══╝  ██║▄▄ ██║██║   ██║██╔══██║██║╚██╗██║   ██║   ') + chalk.yellow(' ██╔██╗ ') + ' ' + chalk.cyan(V));
    bufferLine(chalk.cyan(V) + chalk.cyan(' ██║  ██║███████╗██████╔╝╚██████╔╝███████╗╚██████╔╝╚██████╔╝██║  ██║██║ ╚████║   ██║   ') + chalk.yellow('██╔╝ ██╗') + ' ' + chalk.cyan(V));
    bufferLine(chalk.cyan(V) + chalk.cyan(' ╚═╝  ╚═╝╚══════╝╚═════╝  ╚═════╝ ╚══════╝ ╚══▀▀═╝  ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═══╝   ╚═╝   ') + chalk.yellow('╚═╝  ╚═╝') + ' ' + chalk.cyan(V));
    bufferLine(chalk.cyan(MID));
    
    // Centered title
    const title1 = `Copy Trading System  v${version}`;
    bufferLine(chalk.cyan(V) + chalk.white(center(title1, W)) + chalk.cyan(V));
    bufferLine(chalk.cyan(MID));
    
    // Centered subtitle
    const title2 = 'HQX Ultra-Scalping Algorithm';
    bufferLine(chalk.cyan(V) + chalk.yellow(center(title2, W)) + chalk.cyan(V));
    
    // Grid layout - 2 columns
    const VS = '\u2502'; // Vertical separator (thin)
    const colL = 48, colR = 47;
    
    // Row 1: Lead Account | Lead Symbol
    const leadName = (lead.account.accountName || '').substring(0, 30);
    const leadSym = lead.symbol.value || lead.symbol.name || '';
    const r1c1 = buildCell('Lead', leadName, chalk.cyan, colL);
    const r1c2text = ` Symbol: ${chalk.yellow(leadSym)}  Qty: ${chalk.cyan(lead.contracts)}`;
    const r1c2plain = ` Symbol: ${leadSym}  Qty: ${lead.contracts}`;
    const r1c2 = r1c2text + safePad(colR - r1c2plain.length);
    
    // Row 2: Follower Account | Follower Symbol
    const followerName = (follower.account.accountName || '').substring(0, 30);
    const followerSym = follower.symbol.value || follower.symbol.name || '';
    const r2c1 = buildCell('Follower', followerName, chalk.magenta, colL);
    const r2c2text = ` Symbol: ${chalk.yellow(followerSym)}  Qty: ${chalk.cyan(follower.contracts)}`;
    const r2c2plain = ` Symbol: ${followerSym}  Qty: ${follower.contracts}`;
    const r2c2 = r2c2text + safePad(colR - r2c2plain.length);
    
    // Row 3: Target | Risk
    const r3c1 = buildCell('Target', '$' + dailyTarget.toFixed(2), chalk.green, colL);
    const r3c2 = buildCell('Risk', '$' + maxRisk.toFixed(2), chalk.red, colR);
    
    // Row 4: P&L | Server Status
    const r4c1 = buildCell('P&L', pnlStr, pnlColor, colL);
    const serverStr = hqxConnected ? 'HQX ON' : 'MONITOR';
    const serverColor = hqxConnected ? chalk.green : chalk.yellow;
    const r4c2 = buildCell('Server', serverStr, serverColor, colR);
    
    // Row 5: Signals + Lead Trades | Copied + Errors
    const r5c1text = ` Signals: ${chalk.magenta(stats.signals || 0)}  Lead: ${chalk.cyan(stats.leadTrades)}`;
    const r5c1plain = ` Signals: ${stats.signals || 0}  Lead: ${stats.leadTrades}`;
    const r5c1 = r5c1text + safePad(colL - r5c1plain.length);
    const r5c2text = ` Copied: ${chalk.green(stats.copiedTrades)}  Errors: ${chalk.red(stats.errors)}`;
    const r5c2plain = ` Copied: ${stats.copiedTrades}  Errors: ${stats.errors}`;
    const r5c2 = r5c2text + safePad(colR - r5c2plain.length);
    
    // Row 6: Trades + W/L | Latency
    const r6c1text = ` Trades: ${chalk.cyan(stats.trades || 0)}  W/L: ${chalk.green(stats.wins || 0)}/${chalk.red(stats.losses || 0)}`;
    const r6c1plain = ` Trades: ${stats.trades || 0}  W/L: ${stats.wins || 0}/${stats.losses || 0}`;
    const r6c1 = r6c1text + safePad(colL - r6c1plain.length);
    const r6c2 = buildCell('Latency', latencyStr, latencyColor, colR);
    
    // Grid separators
    const GRID_TOP = '\u2560' + '\u2550'.repeat(colL) + '\u2564' + '\u2550'.repeat(colR) + '\u2563';
    const GRID_MID = '\u2560' + '\u2550'.repeat(colL) + '\u256A' + '\u2550'.repeat(colR) + '\u2563';
    const GRID_BOT = '\u2560' + '\u2550'.repeat(colL) + '\u2567' + '\u2550'.repeat(colR) + '\u2563';
    
    // Print grid
    bufferLine(chalk.cyan(GRID_TOP));
    bufferLine(chalk.cyan(V) + r1c1.padded + chalk.cyan(VS) + r1c2 + chalk.cyan(V));
    bufferLine(chalk.cyan(GRID_MID));
    bufferLine(chalk.cyan(V) + r2c1.padded + chalk.cyan(VS) + r2c2 + chalk.cyan(V));
    bufferLine(chalk.cyan(GRID_MID));
    bufferLine(chalk.cyan(V) + r3c1.padded + chalk.cyan(VS) + r3c2.padded + chalk.cyan(V));
    bufferLine(chalk.cyan(GRID_MID));
    bufferLine(chalk.cyan(V) + r4c1.padded + chalk.cyan(VS) + r4c2.padded + chalk.cyan(V));
    bufferLine(chalk.cyan(GRID_MID));
    bufferLine(chalk.cyan(V) + r5c1 + chalk.cyan(VS) + r5c2 + chalk.cyan(V));
    bufferLine(chalk.cyan(GRID_MID));
    bufferLine(chalk.cyan(V) + r6c1 + chalk.cyan(VS) + r6c2.padded + chalk.cyan(V));
    bufferLine(chalk.cyan(GRID_BOT));
    
    // Activity log header with spinner and centered date
    spinnerFrame = (spinnerFrame + 1) % spinnerChars.length;
    const spinnerChar = spinnerChars[spinnerFrame];
    const actLeft = ` Activity Log ${chalk.yellow(spinnerChar)}`;
    const actLeftPlain = ` Activity Log ${spinnerChar}`;
    const actRight = 'Press X to stop ';
    const dateCentered = `- ${dateStr} -`;
    const leftLen = actLeftPlain.length;
    const rightLen = actRight.length;
    const midSpace = Math.max(0, W - leftLen - rightLen);
    const datePad = Math.max(0, Math.floor((midSpace - dateCentered.length) / 2));
    const remainingPad = Math.max(0, midSpace - datePad - dateCentered.length);
    const dateSection = ' '.repeat(datePad) + chalk.cyan(dateCentered) + ' '.repeat(remainingPad);
    bufferLine(chalk.cyan(V) + chalk.white(actLeft) + dateSection + chalk.yellow(actRight) + chalk.cyan(V));
    bufferLine(chalk.cyan(MID));
    
    // Helper to strip ANSI codes for length calculation
    const stripAnsi = (str) => str.replace(/\x1B\[[0-9;]*m/g, '');
    
    // Helper to truncate and pad text to exact width W
    const fitToWidth = (text, width) => {
      const plainText = stripAnsi(text);
      if (plainText.length > width) {
        let count = 0;
        let cutIndex = 0;
        for (let i = 0; i < text.length && count < width - 3; i++) {
          if (text[i] === '\x1B') {
            while (i < text.length && text[i] !== 'm') i++;
          } else {
            count++;
            cutIndex = i + 1;
          }
        }
        return text.substring(0, cutIndex) + '...';
      }
      return text + ' '.repeat(width - plainText.length);
    };
    
    // Logs inside the rectangle - newest first, max 30 lines
    const MAX_VISIBLE_LOGS = 50;
    
    if (logs.length === 0) {
      const emptyLine = ' Waiting for activity...';
      bufferLine(chalk.cyan(V) + chalk.gray(fitToWidth(emptyLine, W)) + chalk.cyan(V));
      for (let i = 0; i < MAX_VISIBLE_LOGS - 1; i++) {
        bufferLine(chalk.cyan(V) + ' '.repeat(W) + chalk.cyan(V));
      }
    } else {
      const reversedLogs = [...logs].reverse().slice(0, MAX_VISIBLE_LOGS);
      reversedLogs.forEach(log => {
        const color = typeColors[log.type] || chalk.white;
        const icon = getIcon(log.type);
        const logContent = ` [${log.timestamp}] ${icon} ${log.message}`;
        const fitted = fitToWidth(logContent, W);
        bufferLine(chalk.cyan(V) + color(fitted) + chalk.cyan(V));
      });
      for (let i = reversedLogs.length; i < MAX_VISIBLE_LOGS; i++) {
        bufferLine(chalk.cyan(V) + ' '.repeat(W) + chalk.cyan(V));
      }
    }
    
    // Bottom border
    bufferLine(chalk.cyan(BOT));
    
    // Write entire buffer atomically
    process.stdout.write(screenBuffer);
    isDrawing = false;
  };
  
  // Spinner interval for animation
  const spinnerInterval = setInterval(() => {
    if (isRunning) displayUI();
  }, 250);

  addLog('info', 'Copy trading initialized');
  addLog('info', 'Connecting to HQX Server...');
  displayUI();

  // Authenticate with HQX Server
  displayUI();

  try {
    const authResult = await hqxServer.authenticate(
      lead.account.accountId.toString(), 
      lead.account.propfirm || 'projectx'
    );

    if (authResult.success) {
      const connectResult = await hqxServer.connect();
      if (connectResult.success) {
        hqxConnected = true;
        addLog('success', 'Connected to HQX Server');
      } else {
        addLog('warning', 'HQX Server unavailable - Running in monitor mode');
      }
    } else {
      addLog('warning', 'HQX Auth failed - Running in monitor mode');
    }
  } catch (error) {
    addLog('warning', 'HQX Server unavailable - Running in monitor mode');
  }

  displayUI();

  // Helper function to execute signal on both accounts
  const executeSignalOnBothAccounts = async (signal) => {
    const side = signal.side === 'long' ? 0 : 1; // 0=Buy, 1=Sell
    const sideStr = signal.side === 'long' ? 'LONG' : 'SHORT';

    // Execute on Lead account
    try {
      const leadResult = await lead.service.placeOrder({
        accountId: lead.account.rithmicAccountId || lead.account.accountId,
        symbol: lead.symbol.value,
        exchange: 'CME',
        size: lead.contracts,
        side: side,
        type: 2 // Market
      });

      if (leadResult.success) {
        stats.leadTrades++;
        addLog('trade', `Lead: ${sideStr} ${lead.contracts} ${lead.symbol.value} @ MKT`);
      } else {
        throw new Error(leadResult.error || 'Lead order failed');
      }
    } catch (e) {
      stats.errors++;
      addLog('error', `Lead order failed: ${e.message}`);
      return; // Don't copy if lead fails
    }

    // Execute on Follower account (copy)
    try {
      const followerResult = await follower.service.placeOrder({
        accountId: follower.account.rithmicAccountId || follower.account.accountId,
        symbol: follower.symbol.value,
        exchange: 'CME',
        size: follower.contracts,
        side: side,
        type: 2 // Market
      });

      if (followerResult.success) {
        stats.copiedTrades++;
        addLog('copy', `Follower: ${sideStr} ${follower.contracts} ${follower.symbol.value} @ MKT`);
      } else {
        throw new Error(followerResult.error || 'Follower order failed');
      }
    } catch (e) {
      stats.errors++;
      addLog('error', `Follower order failed: ${e.message}`);
    }
  };

  // Helper function to close positions on both accounts
  const closePositionsOnBothAccounts = async (reason) => {
    // Close Lead position
    try {
      await lead.service.closePosition(
        lead.account.rithmicAccountId || lead.account.accountId,
        lead.symbol.value
      );
      addLog('trade', `Lead: Position closed (${reason})`);
    } catch (e) {
      // Position may already be closed
    }

    // Close Follower position
    try {
      await follower.service.closePosition(
        follower.account.rithmicAccountId || follower.account.accountId,
        follower.symbol.value
      );
      addLog('copy', `Follower: Position closed (${reason})`);
    } catch (e) {
      // Position may already be closed
    }
  };

  // Setup HQX Server event handlers (attach before connection, check hqxConnected inside)
  hqxServer.on('latency', (data) => {
    latency = data.latency || 0;
  });

  hqxServer.on('log', (data) => {
    addLog(data.type || 'info', data.message);
  });

  hqxServer.on('signal', async (data) => {
    stats.signals = (stats.signals || 0) + 1;
    const side = data.side === 'long' ? 'BUY' : 'SELL';
    addLog('signal', `${side} Signal @ ${data.entry?.toFixed(2) || 'N/A'} | SL: ${data.stop?.toFixed(2) || 'N/A'} | TP: ${data.target?.toFixed(2) || 'N/A'}`);
    
    // Execute on both accounts
    if (hqxConnected) {
      await executeSignalOnBothAccounts(data);
    }
    displayUI();
  });

  hqxServer.on('trade', async (data) => {
    stats.pnl += data.pnl || 0;
    if (data.pnl > 0) {
      stats.wins = (stats.wins || 0) + 1;
      addLog('trade', `Closed +$${data.pnl.toFixed(2)} (${data.reason || 'take_profit'})`);
    } else {
      stats.losses = (stats.losses || 0) + 1;
      addLog('loss', `Closed -$${Math.abs(data.pnl).toFixed(2)} (${data.reason || 'stop_loss'})`);
    }
    stats.trades = (stats.trades || 0) + 1;
    
    // Print updated stats like One Account
    const statsType = stats.pnl >= 0 ? 'info' : 'loss';
    addLog(statsType, `Stats: Trades: ${stats.trades} | Wins: ${stats.wins || 0} | P&L: $${stats.pnl.toFixed(2)}`);

    // Check daily target
    if (stats.pnl >= dailyTarget) {
      stopReason = 'target';
      addLog('success', `Daily target reached! +$${stats.pnl.toFixed(2)}`);
      isRunning = false;
      if (hqxConnected) hqxServer.stopAlgo();
      await closePositionsOnBothAccounts('target');
    }

    // Check max risk
    if (stats.pnl <= -maxRisk) {
      stopReason = 'risk';
      addLog('error', `Max risk reached! -$${Math.abs(stats.pnl).toFixed(2)}`);
      isRunning = false;
      if (hqxConnected) hqxServer.stopAlgo();
      await closePositionsOnBothAccounts('risk');
    }

    displayUI();
  });

  hqxServer.on('stats', (data) => {
    const realizedPnl = data.pnl || 0;
    const unrealizedPnl = data.position?.pnl || 0;
    stats.pnl = realizedPnl + unrealizedPnl;
    stats.trades = data.trades || stats.trades;
    stats.wins = data.wins || stats.wins;
    stats.losses = data.losses || stats.losses;
  });

  hqxServer.on('error', (data) => {
    const errorMsg = data.message || 'Unknown error';
    addLog('error', errorMsg);
    
    // If algo failed to start, switch to monitor mode
    if (errorMsg.includes('Failed to start') || errorMsg.includes('WebSocket failed') || errorMsg.includes('Échec')) {
      if (hqxConnected) {
        hqxConnected = false;
        addLog('warning', 'Switching to Monitor Mode (watching Lead positions)');
        displayUI();
      }
    }
  });

  hqxServer.on('disconnected', () => {
    hqxConnected = false;
    if (!stopReason) {
      addLog('warning', 'HQX Server disconnected - Switching to Monitor Mode');
    }
  });

  // Start algo if connected
  if (hqxConnected) {

    // Start the Ultra-Scalping algo
    addLog('info', 'Starting HQX Ultra-Scalping...');
    addLog('info', `Target: $${dailyTarget.toFixed(2)} | Risk: $${maxRisk.toFixed(2)}`);
    
    const propfirmToken = lead.service.getToken ? lead.service.getToken() : null;
    const propfirmId = lead.service.getPropfirm ? lead.service.getPropfirm() : (lead.account.propfirm || 'topstep');
    
    // Get Rithmic credentials if this is a Rithmic account
    let rithmicCredentials = null;
    if (lead.service.getRithmicCredentials) {
      rithmicCredentials = lead.service.getRithmicCredentials();
    } else if (lead.account.rithmicUserId && lead.account.rithmicPassword) {
      rithmicCredentials = {
        userId: lead.account.rithmicUserId,
        password: lead.account.rithmicPassword,
        systemName: lead.account.rithmicSystem || 'Apex',
        gateway: lead.account.rithmicGateway || 'wss://rprotocol.rithmic.com:443'
      };
    }

    hqxServer.startAlgo({
      accountId: lead.account.accountId,
      contractId: lead.symbol.id || lead.symbol.contractId,
      symbol: lead.symbol.value,
      contracts: lead.contracts,
      dailyTarget: dailyTarget,
      maxRisk: maxRisk,
      propfirm: propfirmId,
      propfirmToken: propfirmToken,
      rithmicCredentials: rithmicCredentials,
      copyTrading: true, // Flag for copy trading mode
      followerSymbol: follower.symbol.value,
      followerContracts: follower.contracts
    });

    displayUI();
  }

  // Position monitoring loop (for P&L tracking and fallback copy)
  const monitorInterval = setInterval(async () => {
    if (!isRunning) return;

    try {
      // Get positions from both accounts for P&L tracking
      const [leadPositions, followerPositions] = await Promise.all([
        lead.service.getPositions(lead.account.rithmicAccountId || lead.account.accountId),
        follower.service.getPositions(follower.account.rithmicAccountId || follower.account.accountId)
      ]);

      // Calculate combined P&L
      let leadPnl = 0, followerPnl = 0;

      if (leadPositions.success && leadPositions.positions) {
        const leadPos = leadPositions.positions.find(p => 
          p.symbol === lead.symbol.value || p.symbol?.includes(lead.symbol.searchText)
        );
        if (leadPos && typeof leadPos.unrealizedPnl === 'number') {
          leadPnl = leadPos.unrealizedPnl;
        }
      }

      if (followerPositions.success && followerPositions.positions) {
        const followerPos = followerPositions.positions.find(p => 
          p.symbol === follower.symbol.value || p.symbol?.includes(follower.symbol.searchText)
        );
        if (followerPos && typeof followerPos.unrealizedPnl === 'number') {
          followerPnl = followerPos.unrealizedPnl;
        }
      }

      // Update combined P&L (or just follower if HQX handles lead)
      stats.pnl = leadPnl + followerPnl;

      // Check if daily target reached
      if (stats.pnl >= dailyTarget && !stopReason) {
        isRunning = false;
        stopReason = 'target';
        addLog('success', `Daily target reached! +$${stats.pnl.toFixed(2)}`);
        
        if (hqxConnected) hqxServer.stopAlgo();
        await closePositionsOnBothAccounts('target');
        displayUI();
        return;
      }

      // Check if max risk reached
      if (stats.pnl <= -maxRisk && !stopReason) {
        isRunning = false;
        stopReason = 'risk';
        addLog('error', `Max risk reached! -$${Math.abs(stats.pnl).toFixed(2)}`);
        
        if (hqxConnected) hqxServer.stopAlgo();
        await closePositionsOnBothAccounts('risk');
        displayUI();
        return;
      }

      // Fallback: If HQX not connected, monitor lead and copy manually
      if (!hqxConnected) {
        let currentLeadPosition = null;
        if (leadPositions.success && leadPositions.positions) {
          currentLeadPosition = leadPositions.positions.find(p => 
            p.symbol === lead.symbol.value || p.symbol?.includes(lead.symbol.searchText)
          );
        }

        const hadPosition = lastLeadPosition && lastLeadPosition.quantity !== 0;
        const hasPosition = currentLeadPosition && currentLeadPosition.quantity !== 0;

        if (!hadPosition && hasPosition) {
          stats.leadTrades++;
          const side = currentLeadPosition.quantity > 0 ? 'LONG' : 'SHORT';
          addLog('trade', `Lead opened ${side} ${Math.abs(currentLeadPosition.quantity)} @ ${currentLeadPosition.averagePrice || 'MKT'}`);
          await copyTradeToFollower(follower, currentLeadPosition, 'open');
          stats.copiedTrades++;
          displayUI();

        } else if (hadPosition && !hasPosition) {
          addLog('trade', `Lead closed position`);
          await copyTradeToFollower(follower, lastLeadPosition, 'close');
          stats.copiedTrades++;
          displayUI();

        } else if (hadPosition && hasPosition && lastLeadPosition.quantity !== currentLeadPosition.quantity) {
          const diff = currentLeadPosition.quantity - lastLeadPosition.quantity;
          const action = diff > 0 ? 'added' : 'reduced';
          addLog('trade', `Lead ${action} ${Math.abs(diff)} contracts`);
          await copyTradeToFollower(follower, { ...currentLeadPosition, quantityChange: diff }, 'adjust');
          stats.copiedTrades++;
          displayUI();
        }

        lastLeadPosition = currentLeadPosition ? { ...currentLeadPosition } : null;
      }

    } catch (error) {
      stats.errors++;
      addLog('error', `Monitor error: ${error.message}`);
      displayUI();
    }
  }, 2000); // Check every 2 seconds

  // Wait for X key OR auto-stop (target/risk reached)
  await new Promise((resolve) => {
    // Check for auto-stop every 500ms
    const checkInterval = setInterval(() => {
      if (!isRunning || stopReason) {
        clearInterval(checkInterval);
        clearInterval(monitorInterval);
        if (process.stdin.isTTY && process.stdin.isRaw) {
          process.stdin.setRawMode(false);
        }
        resolve();
      }
    }, 500);

    // Also listen for X key
    if (process.stdin.isTTY) {
      try {
        readline.emitKeypressEvents(process.stdin);
        process.stdin.setRawMode(true);
        process.stdin.resume();
        
        const onKeypress = (str, key) => {
          if (!key) return;
          const keyName = key.name?.toLowerCase();
          if (keyName === 'x' || (key.ctrl && keyName === 'c')) {
            clearInterval(checkInterval);
            clearInterval(monitorInterval);
            process.stdin.setRawMode(false);
            process.stdin.removeListener('keypress', onKeypress);
            resolve();
          }
        };
        
        process.stdin.on('keypress', onKeypress);
      } catch (e) {
        // Fallback: just wait for auto-stop
      }
    }
  });

  // Cleanup
  clearInterval(spinnerInterval);
  isRunning = false;

  // Stop HQX Server and close positions
  if (hqxConnected) {
    hqxServer.stopAlgo();
    hqxServer.disconnect();
  }

  // Cancel all pending orders and close positions on both accounts
  try {
    await Promise.all([
      lead.service.cancelAllOrders(lead.account.rithmicAccountId || lead.account.accountId),
      follower.service.cancelAllOrders(follower.account.rithmicAccountId || follower.account.accountId)
    ]);
  } catch (e) {
    // Ignore cancel errors
  }

  if (!stopReason) {
    // User stopped manually, close positions
    await closePositionsOnBothAccounts('user_stop');
  }

  // Restore stdin to normal mode
  try {
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }
    process.stdin.removeAllListeners('keypress');
  } catch (e) {
    // Ignore stdin restoration errors
  }

  // Exit alternate screen buffer and show cursor
  process.stdout.write('\x1B[?1049l');
  process.stdout.write('\x1B[?25h');

  console.log();
  if (stopReason === 'target') {
    console.log(chalk.green.bold('  [OK] Daily target reached! Copy trading stopped.'));
  } else if (stopReason === 'risk') {
    console.log(chalk.red.bold('  [X] Max risk reached! Copy trading stopped.'));
  } else {
    console.log(chalk.yellow('  [OK] Copy trading stopped by user'));
  }
  console.log();
  console.log(chalk.gray(getSeparator()));
  console.log(chalk.white.bold('  Session Summary'));
  console.log(chalk.gray(getSeparator()));
  console.log(chalk.white(`  Daily Target:  ${chalk.green('$' + dailyTarget.toFixed(2))}`));
  console.log(chalk.white(`  Max Risk:      ${chalk.red('$' + maxRisk.toFixed(2))}`));
  console.log(chalk.white(`  Final P&L:     ${stats.pnl >= 0 ? chalk.green('+$' + stats.pnl.toFixed(2)) : chalk.red('-$' + Math.abs(stats.pnl).toFixed(2))}`));
  console.log(chalk.gray(getSeparator()));
  console.log(chalk.white(`  Lead Trades:   ${chalk.cyan(stats.leadTrades)}`));
  console.log(chalk.white(`  Copied Trades: ${chalk.green(stats.copiedTrades)}`));
  console.log(chalk.white(`  Errors:        ${chalk.red(stats.errors)}`));
  console.log(chalk.gray(getSeparator()));
  console.log();

  await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
};

/**
 * Copy trade to follower account
 */
const copyTradeToFollower = async (follower, position, action) => {
  try {
    const service = follower.service;
    const accountId = follower.account.rithmicAccountId || follower.account.accountId;

    if (action === 'open') {
      // Open new position
      const side = position.quantity > 0 ? 0 : 1; // 0=Buy, 1=Sell
      const result = await service.placeOrder({
        accountId: accountId,
        symbol: follower.symbol.value,
        exchange: 'CME',
        size: follower.contracts,
        side: side,
        type: 2 // Market
      });

      if (result.success) {
        console.log(chalk.green(`  [+] Follower: Opened ${side === 0 ? 'LONG' : 'SHORT'} ${follower.contracts} ${follower.symbol.value}`));
      } else {
        throw new Error(result.error || 'Order failed');
      }

    } else if (action === 'close') {
      // Close position
      const result = await service.closePosition(accountId, follower.symbol.value);

      if (result.success) {
        console.log(chalk.green(`  [+] Follower: Closed position`));
      } else {
        throw new Error(result.error || 'Close failed');
      }

    } else if (action === 'adjust') {
      // Adjust position size
      const side = position.quantityChange > 0 ? 0 : 1;
      const size = Math.abs(position.quantityChange);
      const adjustedSize = Math.round(size * (follower.contracts / Math.abs(position.quantity - position.quantityChange)));

      if (adjustedSize > 0) {
        const result = await service.placeOrder({
          accountId: accountId,
          symbol: follower.symbol.value,
          exchange: 'CME',
          size: adjustedSize,
          side: side,
          type: 2
        });

        if (result.success) {
          console.log(chalk.green(`  [+] Follower: Adjusted by ${side === 0 ? '+' : '-'}${adjustedSize}`));
        }
      }
    }

  } catch (error) {
    console.log(chalk.red(`  [X] Follower error: ${error.message}`));
  }
};

/**
 * Wait for X key to stop
 */
const waitForStopKey = () => {
  return new Promise((resolve) => {
    // Enable raw mode to capture keypresses
    if (process.stdin.isTTY) {
      readline.emitKeypressEvents(process.stdin);
      process.stdin.setRawMode(true);
      
      const onKeypress = (str, key) => {
        if (key && (key.name === 'x' || key.name === 'X' || (key.ctrl && key.name === 'c'))) {
          process.stdin.setRawMode(false);
          process.stdin.removeListener('keypress', onKeypress);
          resolve();
        }
      };
      
      process.stdin.on('keypress', onKeypress);
    } else {
      // Fallback: wait 30 seconds in non-TTY mode
      setTimeout(resolve, 30000);
    }
  });
};

module.exports = { algoTradingMenu };
