import crypto from 'crypto';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const DEFAULT_STEP_SECONDS = 30;
const DEFAULT_DIGITS = 6;

function normalizeBase32(secret: string): string {
  return secret.replace(/[^A-Z2-7]/gi, '').toUpperCase();
}

function padCounter(counter: number): Buffer {
  const buffer = Buffer.alloc(8);
  buffer.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  buffer.writeUInt32BE(counter >>> 0, 4);
  return buffer;
}

export class TOTPService {
  private static encryptionKey = crypto
    .createHash('sha256')
    .update(process.env.ADULT_TOTP_SECRET_KEY || process.env.SESSION_SECRET || process.env.ADMIN_SECRET_KEY || 'xandeflix-local-adult-totp')
    .digest();

  public static generateSecret(byteLength = 20): string {
    const bytes = crypto.randomBytes(byteLength);
    let bits = 0;
    let value = 0;
    let output = '';

    for (const byte of bytes) {
      value = (value << 8) | byte;
      bits += 8;

      while (bits >= 5) {
        output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
        bits -= 5;
      }
    }

    if (bits > 0) {
      output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
    }

    return output;
  }

  public static encryptSecret(secret: string): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    const encrypted = Buffer.concat([cipher.update(secret, 'utf-8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`;
  }

  public static decryptSecret(encryptedSecret: string): string {
    const [ivValue, tagValue, payloadValue] = encryptedSecret.split('.');
    if (!ivValue || !tagValue || !payloadValue) {
      throw new Error('Segredo TOTP invalido.');
    }

    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      this.encryptionKey,
      Buffer.from(ivValue, 'base64url'),
    );
    decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));

    return Buffer.concat([
      decipher.update(Buffer.from(payloadValue, 'base64url')),
      decipher.final(),
    ]).toString('utf-8');
  }

  public static buildOtpAuthUri(accountName: string, secret: string, issuer = 'Xandeflix Adulto'): string {
    const label = encodeURIComponent(`${issuer}:${accountName}`);
    return `otpauth://totp/${label}?secret=${encodeURIComponent(secret)}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${DEFAULT_DIGITS}&period=${DEFAULT_STEP_SECONDS}`;
  }

  private static decodeBase32(secret: string): Buffer {
    const normalized = normalizeBase32(secret);
    let bits = 0;
    let value = 0;
    const bytes: number[] = [];

    for (const char of normalized) {
      const index = BASE32_ALPHABET.indexOf(char);
      if (index === -1) {
        continue;
      }

      value = (value << 5) | index;
      bits += 5;

      if (bits >= 8) {
        bytes.push((value >>> (bits - 8)) & 0xff);
        bits -= 8;
      }
    }

    return Buffer.from(bytes);
  }

  public static generateCode(secret: string, timestamp = Date.now()): string {
    const decodedSecret = this.decodeBase32(secret);
    const counter = Math.floor(timestamp / 1000 / DEFAULT_STEP_SECONDS);
    const hmac = crypto.createHmac('sha1', decodedSecret).update(padCounter(counter)).digest();
    const offset = hmac[hmac.length - 1] & 0x0f;
    const binary =
      ((hmac[offset] & 0x7f) << 24) |
      ((hmac[offset + 1] & 0xff) << 16) |
      ((hmac[offset + 2] & 0xff) << 8) |
      (hmac[offset + 3] & 0xff);

    return String(binary % 10 ** DEFAULT_DIGITS).padStart(DEFAULT_DIGITS, '0');
  }

  public static verifyCode(encryptedSecret: string, code: string, window = 1): boolean {
    const normalizedCode = (code || '').replace(/\D/g, '');
    if (normalizedCode.length !== DEFAULT_DIGITS) {
      return false;
    }

    let secret = '';

    try {
      secret = this.decryptSecret(encryptedSecret);
    } catch {
      return false;
    }

    const now = Date.now();
    for (let offset = -window; offset <= window; offset += 1) {
      const candidate = this.generateCode(secret, now + offset * DEFAULT_STEP_SECONDS * 1000);
      if (candidate === normalizedCode) {
        return true;
      }
    }

    return false;
  }
}
