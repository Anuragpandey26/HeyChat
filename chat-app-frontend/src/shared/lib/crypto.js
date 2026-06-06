import nacl from 'tweetnacl';
import naclUtil from 'tweetnacl-util';

/**
 * Derives a public/private NaCl box keypair deterministically
 * using the username and password as a seed.
 */
export function deriveKeyPair(username, password) {
  const normalizedUser = username.trim().toLowerCase();
  const seed = naclUtil.decodeUTF8(`${normalizedUser}:${password}`);
  const hash = nacl.hash(seed);
  const secretKey = hash.slice(0, nacl.box.secretKeyLength); // First 32 bytes
  const keyPair = nacl.box.keyPair.fromSecretKey(secretKey);

  return {
    publicKey: naclUtil.encodeBase64(keyPair.publicKey),
    privateKey: naclUtil.encodeBase64(keyPair.secretKey),
  };
}

/**
 * Encrypts a message using the recipient's public key and the sender's private key.
 * Nonce is prepended to the returned Base64 string.
 */
export function encryptMessage(plainText, recipientPublicKeyB64, senderPrivateKeyB64) {
  try {
    const nonce = nacl.randomBytes(nacl.box.nonceLength);
    const messageUint8 = naclUtil.decodeUTF8(plainText);
    const recipientPublicKey = naclUtil.decodeBase64(recipientPublicKeyB64);
    const senderPrivateKey = naclUtil.decodeBase64(senderPrivateKeyB64);

    const encrypted = nacl.box(messageUint8, nonce, recipientPublicKey, senderPrivateKey);

    // Combine nonce and encrypted message into one buffer for transmission
    const combined = new Uint8Array(nonce.length + encrypted.length);
    combined.set(nonce);
    combined.set(encrypted, nonce.length);

    return naclUtil.encodeBase64(combined);
  } catch (err) {
    console.error('Encryption failed:', err);
    throw new Error('Encryption failed');
  }
}

/**
 * Decrypts a message using the sender's public key and the recipient's private key.
 */
export function decryptMessage(combinedB64, senderPublicKeyB64, recipientPrivateKeyB64) {
  try {
    if (!combinedB64) return '';
    const combined = naclUtil.decodeBase64(combinedB64);
    if (combined.length < nacl.box.nonceLength) {
      throw new Error('Invalid encrypted payload (too short)');
    }

    const nonce = combined.slice(0, nacl.box.nonceLength);
    const encrypted = combined.slice(nacl.box.nonceLength);

    const senderPublicKey = naclUtil.decodeBase64(senderPublicKeyB64);
    const recipientPrivateKey = naclUtil.decodeBase64(recipientPrivateKeyB64);

    const decrypted = nacl.box.open(encrypted, nonce, senderPublicKey, recipientPrivateKey);
    if (!decrypted) {
      throw new Error('Decryption box opening returned null');
    }

    return naclUtil.encodeUTF8(decrypted);
  } catch (err) {
    console.error('Decryption failed:', err);
    return '[Decryption Error: Key mismatch or tampered payload]';
  }
}
