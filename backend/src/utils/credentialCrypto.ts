import crypto from 'crypto';

function encryptionKey() {
  const value = process.env.NETEASE_COOKIE_ENCRYPTION_KEY || '';
  if (!/^[a-fA-F0-9]{64}$/.test(value)) {
    throw new Error('请配置 64 位十六进制的 NETEASE_COOKIE_ENCRYPTION_KEY');
  }
  return Buffer.from(value, 'hex');
}

export function encryptCredential(cookie: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(cookie, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), ciphertext.toString('base64')].join('.');
}

export function decryptCredential(envelope: string) {
  const [version, iv, tag, ciphertext] = envelope.split('.');
  if (version !== 'v1' || !iv || !tag || !ciphertext) throw new Error('网易云授权数据无法读取');
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    throw new Error('网易云授权数据无法解密，请检查加密密钥');
  }
}
