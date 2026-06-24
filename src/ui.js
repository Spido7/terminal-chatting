export const COLORS = {
  RESET: '\x1b[0m',
  BOLD: '\x1b[1m',
  DIM: '\x1b[2m',
  ITALIC: '\x1b[3m',
  UNDERLINE: '\x1b[4m',
  
  // Foreground Colors
  RED: '\x1b[31m',
  GREEN: '\x1b[32m',
  YELLOW: '\x1b[33m',
  BLUE: '\x1b[34m',
  MAGENTA: '\x1b[35m',
  CYAN: '\x1b[36m',
  WHITE: '\x1b[37m',
  GRAY: '\x1b[90m',
  
  // Custom theme colors
  NEON_GREEN: '\x1b[38;5;82m',
  NEON_CYAN: '\x1b[38;5;87m',
  DARK_GRAY: '\x1b[38;5;240m',
};

/**
 * Clear the entire terminal screen and scrollback buffer,
 * then place cursor at top-left.
 */
export function clearScreen() {
  process.stdout.write('\x1b[2J\x1b[3J\x1b[H');
}

/**
 * Render the high-impact hacker lobby ASCII banner
 */
export function drawBanner() {
  const banner = `
${COLORS.CYAN} ██╗  ██╗ █████╗  ██████╗██╗  ██╗███████╗██████╗     ██╗      ██████╗ ██████╗ ██████╗ ██╗   ██╗
 ██║  ██║██╔══██╗██╔════╝██║ ██╔╝██╔════╝██╔══██╗    ██║     ██╔═══██╗██╔══██╗██╔══██╗╚██╗ ██╔╝
 ███████║███████║██║     █████╔╝ █████╗  ██████╔╝    ██║     ██║   ██║██████╔╝██████╔╝ ╚████╔╝ 
 ██╔══██║██╔══██║██║     ██╔═██╗ ██╔══╝  ██╔══██╗    ██║     ██║   ██║██╔══██╗██╔══██╗  ╚██╔╝  
 ██║  ██║██║  ██║╚██████╗██║  ██╗███████╗██║  ██║    ███████╗╚██████╔╝██████╔╝██████╔╝   ██║   
 ╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝    ╚══════╝ ╚══════╝╚══════╝╚══════╝    ╚═╝${COLORS.RESET}
`;
  process.stdout.write(banner);
  process.stdout.write(`\n${COLORS.GRAY}===========================================================================================${COLORS.RESET}\n`);
  process.stdout.write(`${COLORS.NEON_GREEN}${COLORS.BOLD}  [SECURE MULTIPLAYER CHAT LOBBY] — TYPE /exit TO QUIT${COLORS.RESET}\n`);
  process.stdout.write(`${COLORS.GRAY}===========================================================================================${COLORS.RESET}\n\n`);
}

/**
 * Formats user chat message
 * @param {string} sender 
 * @param {string} text 
 * @returns {string}
 */
export function formatMessage(sender, text) {
  if (text === 'joined the chat') {
    return `${COLORS.GREEN}${COLORS.BOLD}[+]${COLORS.RESET} ${COLORS.CYAN}${COLORS.BOLD}${sender}${COLORS.RESET} ${COLORS.NEON_GREEN}joined the chat${COLORS.RESET}`;
  }
  if (text === 'left the chat') {
    return `${COLORS.RED}${COLORS.BOLD}[-]${COLORS.RESET} ${COLORS.CYAN}${COLORS.BOLD}${sender}${COLORS.RESET} ${COLORS.RED}left the chat${COLORS.RESET}`;
  }
  return `${COLORS.CYAN}${COLORS.BOLD}${sender}${COLORS.RESET}: ${text}`;
}

/**
 * Formats a system status message
 * @param {string} text 
 * @returns {string}
 */
export function formatSystem(text) {
  return `${COLORS.GREEN}${COLORS.BOLD}[SYSTEM]${COLORS.RESET} ${COLORS.NEON_GREEN}${text}${COLORS.RESET}`;
}

/**
 * Formats an error notification
 * @param {string} text 
 * @returns {string}
 */
export function formatError(text) {
  return `${COLORS.RED}${COLORS.BOLD}[ERROR]${COLORS.RESET} ${COLORS.RED}${text}${COLORS.RESET}`;
}

/**
 * Set terminal scrolling region (rows 1-indexed)
 * @param {number} top 
 * @param {number} bottom 
 */
export function setScrollRegion(top, bottom) {
  process.stdout.write(`\x1b[${top};${bottom}r`);
}

/**
 * Reset terminal scrolling region to full window
 */
export function resetScrollRegion() {
  process.stdout.write('\x1b[r');
}

/**
 * Move cursor to a specific row and column
 * @param {number} row 
 * @param {number} col 
 */
export function moveCursor(row, col) {
  process.stdout.write(`\x1b[${row};${col}H`);
}

/**
 * Save current cursor position
 */
export function saveCursor() {
  process.stdout.write('\x1b[s');
}

/**
 * Restore previously saved cursor position
 */
export function restoreCursor() {
  process.stdout.write('\x1b[u');
}

/**
 * Clear the current cursor line
 */
export function clearCurrentLine() {
  process.stdout.write('\x1b[2K');
}
