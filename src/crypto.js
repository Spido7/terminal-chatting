import crypto from 'crypto';

// Get key from environment variable or use a secure default
const PASSPHRASE = process.env.LOBBY_PASSPHRASE || 'hacker-lobby-default-secure-passphrase-2026';

// Derive 32-byte key from passphrase using SHA-256
const KEY = crypto.createHash('sha256').update(PASSPHRASE).digest();

const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;

/**
 * Encrypts a plaintext string.
 * Returns a string formatted as "iv_hex:ciphertext_hex"
 * If encryption fails, returns the original text (fallback)
 * @param {string} text
 * @returns {string}
 */
export function encrypt(text) {
  try {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return `${iv.toString('hex')}:${encrypted}`;
  } catch (err) {
    return text;
  }
}

/**
 * Decrypts an encrypted string formatted as "iv_hex:ciphertext_hex".
 * If decryption fails or if it's not encrypted, returns a fallback representation or the original text.
 * @param {string} encryptedText
 * @returns {string}
 */
export function decrypt(encryptedText) {
  try {
    if (!encryptedText || typeof encryptedText !== 'string' || !encryptedText.includes(':')) {
      return '🔒 [Encrypted Message]';
    }
    const [ivHex, ciphertextHex] = encryptedText.split(':');
    if (ivHex.length !== 32 || !/^[0-9a-fA-F]+$/.test(ivHex) || !/^[0-9a-fA-F]+$/.test(ciphertextHex)) {
      return '🔒 [Encrypted Message]';
    }
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
    let decrypted = decipher.update(ciphertextHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    // Decryption failed (probably wrong passphrase/key)
    return '🔒 [Encrypted Message]';
  }
}

/**
 * Returns true if a custom passphrase is set in the environment.
 * @returns {boolean}
 */
export function isUsingCustomPassphrase() {
  return !!process.env.LOBBY_PASSPHRASE;
}
