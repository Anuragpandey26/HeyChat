import nacl from 'tweetnacl';
import naclUtil from 'tweetnacl-util';

// ============================================================
// KEY GENERATION
// ============================================================

/**
 * Generates a random NaCl box key pair.
 * Called ONCE at registration. The keys never change after this.
 */
export function generateKeyPair() {
  const keyPair = nacl.box.keyPair();
  return {
    publicKey: naclUtil.encodeBase64(keyPair.publicKey),
    privateKey: naclUtil.encodeBase64(keyPair.secretKey),
  };
}

/**
 * LEGACY — Derives a keypair deterministically from username + password.
 * Kept ONLY for backward-compatible migration of existing users.
 * New registrations should use generateKeyPair() instead.
 */
export function deriveKeyPair(username, password) {
  const normalizedUser = username.trim().toLowerCase();
  const seed = naclUtil.decodeUTF8(`${normalizedUser}:${password}`);
  const hash = nacl.hash(seed);
  const secretKey = hash.slice(0, nacl.box.secretKeyLength);
  const keyPair = nacl.box.keyPair.fromSecretKey(secretKey);

  return {
    publicKey: naclUtil.encodeBase64(keyPair.publicKey),
    privateKey: naclUtil.encodeBase64(keyPair.secretKey),
  };
}

// ============================================================
// KEY WRAPPING (password-based)
// ============================================================

/**
 * Derives a 32-byte NaCl secretbox key from username + password.
 * Used to wrap/unwrap the private key — NOT for message encryption.
 */
export function deriveWrappingKey(username, password) {
  const normalizedUser = username.trim().toLowerCase();
  const seed = naclUtil.decodeUTF8(`heychat-wrap:${normalizedUser}:${password}`);
  const hash = nacl.hash(seed); // SHA-512 → 64 bytes
  return hash.slice(0, nacl.secretbox.keyLength); // First 32 bytes
}

/**
 * Wraps (encrypts) the private key using a password-derived secretbox key.
 * Returns a Base64 string containing [nonce | ciphertext].
 */
export function wrapPrivateKey(privateKeyB64, username, password) {
  try {
    const wrappingKey = deriveWrappingKey(username, password);
    const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
    const privateKeyBytes = naclUtil.decodeBase64(privateKeyB64);

    const encrypted = nacl.secretbox(privateKeyBytes, nonce, wrappingKey);

    const combined = new Uint8Array(nonce.length + encrypted.length);
    combined.set(nonce);
    combined.set(encrypted, nonce.length);

    return naclUtil.encodeBase64(combined);
  } catch (err) {
    console.error('Key wrapping failed:', err);
    throw new Error('Failed to wrap private key');
  }
}

/**
 * Unwraps (decrypts) the private key using a password-derived secretbox key.
 * Returns the Base64-encoded private key.
 */
export function unwrapPrivateKey(wrappedB64, username, password) {
  try {
    const wrappingKey = deriveWrappingKey(username, password);
    const combined = naclUtil.decodeBase64(wrappedB64);

    if (combined.length < nacl.secretbox.nonceLength) {
      throw new Error('Invalid wrapped key (too short)');
    }

    const nonce = combined.slice(0, nacl.secretbox.nonceLength);
    const encrypted = combined.slice(nacl.secretbox.nonceLength);

    const decrypted = nacl.secretbox.open(encrypted, nonce, wrappingKey);
    if (!decrypted) {
      throw new Error('Key unwrapping failed — wrong password or corrupted data');
    }

    return naclUtil.encodeBase64(decrypted);
  } catch (err) {
    console.error('Key unwrapping failed:', err);
    throw new Error('Failed to unwrap private key');
  }
}

// ============================================================
// KEY ESCROW (security-question-based, for forgot-password)
// ============================================================

/**
 * Derives a 32-byte secretbox key from the security question answer.
 */
function deriveEscrowKey(securityAnswer) {
  const normalized = securityAnswer.trim().toLowerCase();
  const seed = naclUtil.decodeUTF8(`heychat-escrow:${normalized}`);
  const hash = nacl.hash(seed);
  return hash.slice(0, nacl.secretbox.keyLength);
}

/**
 * Wraps the private key with the security question answer for escrow backup.
 */
export function wrapPrivateKeyWithAnswer(privateKeyB64, securityAnswer) {
  try {
    const escrowKey = deriveEscrowKey(securityAnswer);
    const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
    const privateKeyBytes = naclUtil.decodeBase64(privateKeyB64);

    const encrypted = nacl.secretbox(privateKeyBytes, nonce, escrowKey);

    const combined = new Uint8Array(nonce.length + encrypted.length);
    combined.set(nonce);
    combined.set(encrypted, nonce.length);

    return naclUtil.encodeBase64(combined);
  } catch (err) {
    console.error('Escrow wrapping failed:', err);
    throw new Error('Failed to create escrow key');
  }
}

/**
 * Unwraps the private key using the security question answer.
 */
export function unwrapPrivateKeyWithAnswer(wrappedB64, securityAnswer) {
  try {
    const escrowKey = deriveEscrowKey(securityAnswer);
    const combined = naclUtil.decodeBase64(wrappedB64);

    if (combined.length < nacl.secretbox.nonceLength) {
      throw new Error('Invalid escrow key (too short)');
    }

    const nonce = combined.slice(0, nacl.secretbox.nonceLength);
    const encrypted = combined.slice(nacl.secretbox.nonceLength);

    const decrypted = nacl.secretbox.open(encrypted, nonce, escrowKey);
    if (!decrypted) {
      throw new Error('Escrow unwrapping failed — wrong security answer');
    }

    return naclUtil.encodeBase64(decrypted);
  } catch (err) {
    console.error('Escrow unwrapping failed:', err);
    throw new Error('Failed to recover key from escrow');
  }
}

// ============================================================
// UTILITY — Reconstruct public key from private key
// ============================================================

/**
 * Derives the public key from a private key (for verification).
 */
export function publicKeyFromPrivate(privateKeyB64) {
  const secretKey = naclUtil.decodeBase64(privateKeyB64);
  const keyPair = nacl.box.keyPair.fromSecretKey(secretKey);
  return naclUtil.encodeBase64(keyPair.publicKey);
}

// ============================================================
// MESSAGE ENCRYPTION / DECRYPTION (unchanged)
// ============================================================

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
