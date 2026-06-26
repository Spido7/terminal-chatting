#!/usr/bin/env node

import readline from 'readline';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Simple .env file loader for Node.js
function loadEnv() {
  try {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const envPath = path.resolve(__dirname, '.env');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      for (const line of content.split('\n')) {
        const trimmedLine = line.trim();
        if (!trimmedLine || trimmedLine.startsWith('#')) continue;
        const parts = trimmedLine.split('=');
        if (parts.length >= 2) {
          const key = parts[0].trim();
          const value = parts.slice(1).join('=').trim().replace(/(^['"]|['"]$)/g, '');
          if (key && !process.env[key]) {
            process.env[key] = value;
          }
        }
      }
    }
  } catch (e) {
    // Ignore env loading errors
  }
}

loadEnv();

import { 
  clearScreen, 
  drawBanner, 
  formatMessage, 
  formatSystem, 
  formatError, 
  COLORS,
  setScrollRegion,
  resetScrollRegion,
  moveCursor,
  saveCursor,
  restoreCursor,
  clearCurrentLine
} from './src/ui.js';
import { setAlias, getAlias, setToken } from './src/config.js';
import { connectToStream, sendMessage, checkAliasStatus, registerAlias, verifyAlias } from './src/api.js';
import { encrypt, decrypt, isUsingCustomPassphrase } from './src/crypto.js';

let abortController = null;

// Setup readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const messages = [];
let chatActive = false;
let muteNewline = false;
let muteInput = false;

// Override stdout.write to intercept the readline newline on enter keypress.
// This prevents the entire terminal window from scrolling up when the user submits a message.
const originalWrite = process.stdout.write.bind(process.stdout);
process.stdout.write = (chunk, encoding, callback) => {
  const data = chunk.toString();
  if (muteInput && data !== '\n' && data !== '\r\n' && data !== '\r') {
    return true;
  }
  if (muteNewline && (data === '\n' || data === '\r\n' || data === '\r')) {
    return true;
  }
  return originalWrite(chunk, encoding, callback);
};

// Monitor stdin keypresses to catch Enter and mute the corresponding newline.
process.stdin.on('keypress', (char, key) => {
  if (key && (key.name === 'return' || key.name === 'enter')) {
    muteNewline = true;
  }
});

function promptAlias() {
  clearScreen();
  drawBanner();
  
  process.stdout.write(`${COLORS.YELLOW}${COLORS.BOLD}Choose an alias: ${COLORS.RESET}`);
  
  rl.question('', async (input) => {
    const alias = input.trim();
    if (!alias) {
      process.stdout.write('\n' + formatError('Alias cannot be empty. Please try again.') + '\n');
      setTimeout(promptAlias, 1500);
      return;
    }
    
    try {
      const { locked } = await checkAliasStatus(alias);
      if (locked) {
        promptPassword(alias);
      } else {
        promptLockOption(alias);
      }
    } catch (err) {
      process.stdout.write('\n' + formatSystem(`Could not verify alias status (${err.message}). Joining as guest...`) + '\n');
      setTimeout(() => {
        setAlias(alias);
        setToken('');
        initChat();
      }, 1500);
    }
  });
}

function promptPassword(alias) {
  process.stdout.write(`${COLORS.YELLOW}${COLORS.BOLD}This alias is locked. Enter password: ${COLORS.RESET}`);
  
  muteInput = true;
  rl.question('', async (password) => {
    muteInput = false;
    process.stdout.write('\n');
    
    const pw = password.trim();
    if (!pw) {
      process.stdout.write(formatError('Password cannot be empty. Please try again.') + '\n');
      setTimeout(() => promptPassword(alias), 1500);
      return;
    }
    
    try {
      const res = await verifyAlias(alias, pw);
      if (res.success && res.token) {
        setAlias(alias);
        setToken(res.token);
        initChat();
      } else {
        process.stdout.write(formatError('Failed to verify alias.') + '\n');
        setTimeout(promptAlias, 1500);
      }
    } catch (err) {
      process.stdout.write(formatError(err.message || 'Incorrect password or verification error.') + '\n');
      setTimeout(promptAlias, 1500);
    }
  });
}

function promptLockOption(alias) {
  process.stdout.write(`${COLORS.YELLOW}${COLORS.BOLD}Would you like to lock @${alias} with a password? (y/n): ${COLORS.RESET}`);
  
  rl.question('', (ans) => {
    const response = ans.trim().toLowerCase();
    if (response === 'y' || response === 'yes') {
      promptCreatePassword(alias);
    } else {
      setAlias(alias);
      setToken('');
      initChat();
    }
  });
}

function promptCreatePassword(alias) {
  process.stdout.write(`${COLORS.YELLOW}${COLORS.BOLD}Create password: ${COLORS.RESET}`);
  
  muteInput = true;
  rl.question('', (pw1) => {
    muteInput = false;
    process.stdout.write('\n');
    
    if (!pw1.trim()) {
      process.stdout.write(formatError('Password cannot be empty.') + '\n');
      setTimeout(() => promptCreatePassword(alias), 1500);
      return;
    }
    
    process.stdout.write(`${COLORS.YELLOW}${COLORS.BOLD}Confirm password: ${COLORS.RESET}`);
    muteInput = true;
    rl.question('', async (pw2) => {
      muteInput = false;
      process.stdout.write('\n');
      
      if (pw1 !== pw2) {
        process.stdout.write(formatError('Passwords do not match. Let\'s try again.') + '\n');
        setTimeout(() => promptCreatePassword(alias), 1500);
        return;
      }
      
      try {
        const res = await registerAlias(alias, pw1);
        if (res.success && res.token) {
          process.stdout.write(formatSystem(`Alias @${alias} successfully locked!`) + '\n');
          setTimeout(() => {
            setAlias(alias);
            setToken(res.token);
            initChat();
          }, 1500);
        } else {
          process.stdout.write(formatError('Registration failed.') + '\n');
          setTimeout(promptAlias, 1500);
        }
      } catch (err) {
        process.stdout.write(formatError(err.message || 'Error locking alias.') + '\n');
        setTimeout(promptAlias, 1500);
      }
    });
  });
}

function initChat() {
  chatActive = true;
  
  // Set up initial layout and scroll regions
  drawLayout();
  
  // Add welcome system messages
  addSystemMessage(`Welcome @${getAlias()} to the HACKER LOBBY!`);
  addSystemMessage(`Type your message and press Enter. Type "/exit" to leave.`);
  addSystemMessage(
    isUsingCustomPassphrase()
      ? '🔒 E2EE active (using custom LOBBY_PASSPHRASE)'
      : '🔒 E2EE active (using default shared lobby key)'
  );
  
  // Set up prompt
  const promptStr = `${COLORS.CYAN}${COLORS.BOLD}[${getAlias()}]: ${COLORS.RESET}`;
  rl.setPrompt(promptStr);
  
  // Connect to backend Server-Sent Events stream
  abortController = new AbortController();
  connectToStream((message) => {
    addMessage(message.username, decrypt(message.content));
  }, abortController.signal).catch((err) => {
    addSystemMessage(`Stream disconnected: ${err.message}`);
  });
  
  // Post join message to the server
  sendMessage(getAlias(), encrypt('joined the chat')).catch(() => {});
  
  rl.on('line', (line) => {
    // Disable newline muting once readline has finished processing the line
    muteNewline = false;
    
    const text = line.trim();
    if (text) {
      if (text === '/exit' || text === '/quit') {
        cleanupAndExit();
      }
      
      // Post the message to the Edge server
      sendMessage(getAlias(), encrypt(text)).catch((err) => {
        addSystemMessage(`Failed to send message: ${err.message}`);
      });
    }
    
    // Redraw prompt at the bottom
    const rows = process.stdout.rows || 24;
    moveCursor(rows, 1);
    clearCurrentLine();
    rl.prompt(true);
  });

  // Handle window resizing dynamically
  process.stdout.on('resize', () => {
    if (chatActive) {
      drawLayout();
    }
  });
  
  // Handle Ctrl+C gracefully
  rl.on('SIGINT', () => {
    cleanupAndExit();
  });
  
  // Initial prompt display
  rl.prompt(true);
}

function drawLayout() {
  const rows = process.stdout.rows || 24;
  const cols = process.stdout.columns || 80;
  
  // Clear screen completely
  clearScreen();
  
  // 1. Draw static header banner if screen has enough space
  const hasBanner = rows > 16;
  let topMargin = 1;
  
  if (hasBanner) {
    drawBanner();
    topMargin = 11; // Banner + borders take 10 rows
  }
  
  const bottomMargin = rows - 2;
  
  // 2. Draw static divider line just above the input prompt
  moveCursor(rows - 1, 1);
  process.stdout.write(COLORS.GRAY + '-'.repeat(cols) + COLORS.RESET);
  
  // 3. Set the scrolling region for messages
  setScrollRegion(topMargin, bottomMargin);
  
  // 4. Fill the scrolling region with message history
  const maxMessages = bottomMargin - topMargin + 1;
  const history = messages.slice(-maxMessages);
  
  for (let i = 0; i < history.length; i++) {
    moveCursor(topMargin + i, 1);
    process.stdout.write(history[i]);
  }
  
  // Clear remaining lines in scroll region if history is short
  for (let i = history.length; i < maxMessages; i++) {
    moveCursor(topMargin + i, 1);
    clearCurrentLine();
  }
  
  // 5. Position cursor on the bottom row for typing
  moveCursor(rows, 1);
  clearCurrentLine();
  
  // 6. Display prompt
  const promptStr = `${COLORS.CYAN}${COLORS.BOLD}[${getAlias()}]: ${COLORS.RESET}`;
  rl.setPrompt(promptStr);
  rl.prompt(true);
}

function addMessage(sender, text) {
  const formatted = formatMessage(sender, text);
  messages.push(formatted);
  
  const rows = process.stdout.rows || 24;
  const bottomMargin = rows - 2;
  
  // Move to bottom of scroll area
  moveCursor(bottomMargin, 1);
  process.stdout.write(formatted + '\n');
  
  // Restore cursor to prompt line
  const promptLength = getAlias().length + 4;
  const col = promptLength + (rl.cursor || 0) + 1;
  moveCursor(rows, col);
}

function addSystemMessage(text) {
  const formatted = formatSystem(text);
  messages.push(formatted);
  
  const rows = process.stdout.rows || 24;
  const bottomMargin = rows - 2;
  
  // Move to bottom of scroll area
  moveCursor(bottomMargin, 1);
  process.stdout.write(formatted + '\n');
  
  // Restore cursor to prompt line
  const promptLength = getAlias().length + 4;
  const col = promptLength + (rl.cursor || 0) + 1;
  moveCursor(rows, col);
}

async function cleanupAndExit() {
  if (abortController) {
    abortController.abort();
  }
  try {
    // Send leave notification to server before exiting
    await sendMessage(getAlias(), encrypt('left the chat'));
  } catch (_) {}
  resetScrollRegion();
  clearScreen();
  console.log(formatSystem('Goodbye!'));
  process.exit(0);
}

// Start the entry point sequence
promptAlias();
