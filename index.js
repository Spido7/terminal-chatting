#!/usr/bin/env node

import readline from 'readline';
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
import { setAlias, getAlias } from './src/config.js';
import { connectToStream, sendMessage } from './src/api.js';

let abortController = null;

// Setup readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const messages = [];
let chatActive = false;
let muteNewline = false;

// Override stdout.write to intercept the readline newline on enter keypress.
// This prevents the entire terminal window from scrolling up when the user submits a message.
const originalWrite = process.stdout.write.bind(process.stdout);
process.stdout.write = (chunk, encoding, callback) => {
  const data = chunk.toString();
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
  
  rl.question('', (input) => {
    const alias = input.trim();
    if (!alias) {
      process.stdout.write('\n' + formatError('Alias cannot be empty. Please try again.') + '\n');
      setTimeout(promptAlias, 1500);
      return;
    }
    
    setAlias(alias);
    initChat();
  });
}

function initChat() {
  chatActive = true;
  
  // Set up initial layout and scroll regions
  drawLayout();
  
  // Add welcome system messages
  addSystemMessage(`Welcome @${getAlias()} to the HACKER LOBBY!`);
  addSystemMessage(`Type your message and press Enter. Type "/exit" to leave.`);
  
  // Set up prompt
  const promptStr = `${COLORS.CYAN}${COLORS.BOLD}[${getAlias()}]: ${COLORS.RESET}`;
  rl.setPrompt(promptStr);
  
  // Connect to backend Server-Sent Events stream
  abortController = new AbortController();
  connectToStream((message) => {
    addMessage(message.username, message.content);
  }, abortController.signal).catch((err) => {
    addSystemMessage(`Stream disconnected: ${err.message}`);
  });
  
  // Post join message to the server
  sendMessage(getAlias(), 'joined the chat').catch(() => {});
  
  rl.on('line', (line) => {
    // Disable newline muting once readline has finished processing the line
    muteNewline = false;
    
    const text = line.trim();
    if (text) {
      if (text === '/exit' || text === '/quit') {
        cleanupAndExit();
      }
      
      // Post the message to the Edge server
      sendMessage(getAlias(), text).catch((err) => {
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
    await sendMessage(getAlias(), 'left the chat');
  } catch (_) {}
  resetScrollRegion();
  clearScreen();
  console.log(formatSystem('Goodbye!'));
  process.exit(0);
}

// Start the entry point sequence
promptAlias();
