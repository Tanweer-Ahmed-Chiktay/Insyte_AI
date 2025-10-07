import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16; // 128 bits
const TAG_LENGTH = 16; // 128 bits

interface EncryptionResult {
  encrypted: string;
  iv: string;
  tag: string;
}

interface DecryptionInput {
  encrypted: string;
  iv: string;
  tag: string;
}

class EncryptionManager {
  private masterKey: string;

  constructor(secretKey?: string) {
    const keyString = secretKey || process.env.ENCRYPTION_KEY;
    if (!keyString) {
      throw new Error('Encryption key not provided');
    }
    
    this.masterKey = keyString;
  }

  /**
   * Derive a key using a random salt for each encryption operation
   */
  private deriveKey(salt: Buffer): Buffer {
    return crypto.scryptSync(this.masterKey, salt, KEY_LENGTH);
  }

  /**
   * Encrypt a string value
   */
  encrypt(text: string): EncryptionResult & { salt: string } {
    try {
      const iv = crypto.randomBytes(IV_LENGTH);
      const salt = crypto.randomBytes(16); // Random salt for each encryption
      const key = this.deriveKey(salt);
      
      const cipher = crypto.createCipher(ALGORITHM, key);
      cipher.setAAD(Buffer.from('additional-data'));
      
      let encrypted = cipher.update(text, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      const tag = cipher.getAuthTag();
      
      return {
        encrypted,
        iv: iv.toString('hex'),
        tag: tag.toString('hex'),
        salt: salt.toString('hex'),
      };
    } catch (error) {
      throw new Error(`Encryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Decrypt a string value
   */
  decrypt(data: DecryptionInput & { salt?: string }): string {
    try {
      const salt = data.salt ? Buffer.from(data.salt, 'hex') : Buffer.from('salt'); // Fallback for old data
      const key = this.deriveKey(salt);
      const decipher = crypto.createDecipher(ALGORITHM, key);
      decipher.setAAD(Buffer.from('additional-data'));
      decipher.setAuthTag(Buffer.from(data.tag, 'hex'));
      
      let decrypted = decipher.update(data.encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      throw new Error(`Decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Encrypt an object (converts to JSON first)
   */
  encryptObject<T>(obj: T): EncryptionResult {
    const jsonString = JSON.stringify(obj);
    return this.encrypt(jsonString);
  }

  /**
   * Decrypt to an object (parses JSON after decryption)
   */
  decryptObject<T>(data: DecryptionInput): T {
    const jsonString = this.decrypt(data);
    return JSON.parse(jsonString) as T;
  }

  /**
   * Create a hash of a value (one-way)
   */
  hash(value: string): string {
    return crypto.createHash('sha256').update(value).digest('hex');
  }

  /**
   * Create a secure random token
   */
  generateToken(length: number = 32): string {
    return crypto.randomBytes(length).toString('hex');
  }

  /**
   * Compare a value with its hash (constant-time comparison)
   */
  verifyHash(value: string, hash: string): boolean {
    const valueHash = this.hash(value);
    return crypto.timingSafeEqual(
      Buffer.from(valueHash, 'hex'),
      Buffer.from(hash, 'hex')
    );
  }
}

// Utility functions for common encryption tasks
const encryptionManager = new EncryptionManager();

/**
 * Encrypt sensitive data like access tokens
 */
export function encryptToken(token: string): string {
  const result = encryptionManager.encrypt(token);
  return `${result.encrypted}:${result.iv}:${result.tag}`;
}

/**
 * Decrypt sensitive data like access tokens
 */
export function decryptToken(encryptedToken: string): string {
  const [encrypted, iv, tag] = encryptedToken.split(':');
  if (!encrypted || !iv || !tag) {
    throw new Error('Invalid encrypted token format');
  }
  
  return encryptionManager.decrypt({ encrypted, iv, tag });
}

/**
 * Encrypt user credentials or sensitive settings
 */
export function encryptCredentials(credentials: Record<string, any>): string {
  const result = encryptionManager.encryptObject(credentials);
  return `${result.encrypted}:${result.iv}:${result.tag}`;
}

/**
 * Decrypt user credentials or sensitive settings
 */
export function decryptCredentials<T = Record<string, any>>(encryptedCredentials: string): T {
  const [encrypted, iv, tag] = encryptedCredentials.split(':');
  if (!encrypted || !iv || !tag) {
    throw new Error('Invalid encrypted credentials format');
  }
  
  return encryptionManager.decryptObject<T>({ encrypted, iv, tag });
}

/**
 * Generate a secure session token
 */
export function generateSessionToken(): string {
  return encryptionManager.generateToken(32);
}

/**
 * Generate a secure API key
 */
export function generateApiKey(): string {
  return encryptionManager.generateToken(48);
}

/**
 * Hash a password or sensitive value
 */
export function hashValue(value: string): string {
  return encryptionManager.hash(value);
}

/**
 * Verify a value against its hash
 */
export function verifyValue(value: string, hash: string): boolean {
  return encryptionManager.verifyHash(value, hash);
}

// Export the encryption manager for advanced use cases
export { EncryptionManager, encryptionManager };
export type { EncryptionResult, DecryptionInput };