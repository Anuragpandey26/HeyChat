# Key Wrapping Encryption Migration

Migrate from deterministic key derivation (keys derived from `username + password`, breaking on password change) to a **key wrapping architecture** where encryption keys are randomly generated once and "wrapped" (encrypted) with a password-derived key. Old messages remain readable after any password change.

## User Review Required

> [!IMPORTANT]
> **Breaking Change for Existing Users:** After this migration, existing users will need to **log out and log back in** once. Their first login with the new code will detect the old system (no `wrappedPrivateKey` in DB) and automatically migrate them — deriving the old key pair from `username + password`, then wrapping it with `nacl.secretbox` and storing the wrapped key on the server. No data loss.

> [!WARNING]
> **Database Migration Required:** A new column `wrappedPrivateKey` is added to the `User` table, and a column `securityEscrowKey` for forgot-password recovery. You'll need to run `npx prisma migrate dev` after the changes.

## Open Questions

> [!IMPORTANT]
> **Security Question Escrow:** The plan includes escrowing a backup of the private key encrypted with the security question answer. This allows password recovery without losing old messages. Is this acceptable, or should forgot-password just lose old messages (simpler)?

---

## Proposed Changes

### Crypto Library (Frontend)

#### [MODIFY] [crypto.js](file:///c:/Users/aN/Desktop/CHATAPP/chat-app-frontend/src/shared/lib/crypto.js)

Replace `deriveKeyPair()` and add key wrapping functions. The file will export:

| Function | Purpose |
|----------|---------|
| `generateKeyPair()` | **NEW** — Generates a random NaCl box key pair (called once at registration) |
| `deriveWrappingKey(username, password)` | **NEW** — Derives a 32-byte `secretbox` key from username + password (used for wrapping) |
| `wrapPrivateKey(privateKeyB64, username, password)` | **NEW** — Encrypts the private key with a password-derived wrapping key using `nacl.secretbox` |
| `unwrapPrivateKey(wrappedB64, username, password)` | **NEW** — Decrypts the wrapped private key |
| `wrapPrivateKeyWithAnswer(privateKeyB64, securityAnswer)` | **NEW** — Wraps the private key with the security question answer (for escrow) |
| `unwrapPrivateKeyWithAnswer(wrappedB64, securityAnswer)` | **NEW** — Unwraps the escrowed key using the security question answer |
| `deriveKeyPair(username, password)` | **KEEP** — Kept temporarily for backward-compatible migration of existing users |
| `encryptMessage(...)` | **UNCHANGED** |
| `decryptMessage(...)` | **UNCHANGED** |

---

### Database Schema

#### [MODIFY] [schema.prisma](file:///c:/Users/aN/Desktop/CHATAPP/chat-app-backend/prisma/schema.prisma)

Add two columns to the `User` model:

```diff
 model User {
   ...
   publicKey            String            @db.Text
+  wrappedPrivateKey    String?           @db.Text
+  securityEscrowKey   String?           @db.Text
   isOnline             Boolean           @default(false)
   ...
 }
```

- `wrappedPrivateKey` — The private key encrypted with the password-derived wrapping key (nullable for migration — old users won't have it until they log in)
- `securityEscrowKey` — The private key encrypted with the security question answer (for forgot-password recovery)

---

### Backend Auth Service

#### [MODIFY] [auth.service.js](file:///c:/Users/aN/Desktop/CHATAPP/chat-app-backend/src/modules/auth/auth.service.js)

**`register()`** — Accept and store `wrappedPrivateKey` + `securityEscrowKey` alongside `publicKey`

**`login()`** — Return `wrappedPrivateKey` in the login response so the frontend can unwrap it

**`resetPassword()`** — Accept a new `wrappedPrivateKey` (re-wrapped with new password). Public key stays the same. Also accept updated `securityEscrowKey`.

**`verifySecurityQuestion()`** — Return `securityEscrowKey` alongside the `recoveryToken` so the frontend can recover the private key

#### [MODIFY] [auth.controller.js](file:///c:/Users/aN/Desktop/CHATAPP/chat-app-backend/src/modules/auth/auth.controller.js)

- **`login`** response: include `wrappedPrivateKey` in the response data
- **`resetPassword`** request: accept `wrappedPrivateKey` and `securityEscrowKey` in the body

#### [MODIFY] [auth.schemas.js](file:///c:/Users/aN/Desktop/CHATAPP/chat-app-backend/src/modules/auth/auth.schemas.js)

- `registerSchema`: add `wrappedPrivateKey` (required) and `securityEscrowKey` (required)
- `recoverResetSchema`: add `wrappedPrivateKey` (required) and `securityEscrowKey` (optional)

---

### Backend Users Service

#### [MODIFY] [users.service.js](file:///c:/Users/aN/Desktop/CHATAPP/chat-app-backend/src/modules/users/users.service.js)

- **`getMe()`**: Include `wrappedPrivateKey` in the select so the frontend can re-unwrap on session restore (`initializeAuth`)

---

### Frontend Auth Store

#### [MODIFY] [useAuthStore.js](file:///c:/Users/aN/Desktop/CHATAPP/chat-app-frontend/src/features/auth/store/useAuthStore.js)

**`register()`**:
1. Call `generateKeyPair()` instead of `deriveKeyPair()`
2. Call `wrapPrivateKey(privateKey, username, password)` to wrap the private key
3. Call `wrapPrivateKeyWithAnswer(privateKey, securityAnswer)` to create the escrow key
4. Send `publicKey`, `wrappedPrivateKey`, and `securityEscrowKey` to the server

**`login()`**:
1. Server returns `wrappedPrivateKey` in response
2. If `wrappedPrivateKey` exists → call `unwrapPrivateKey(wrappedPrivateKey, username, password)` to get the real private key
3. If `wrappedPrivateKey` is `null` (old user, pre-migration) → fall back to `deriveKeyPair()`, then auto-migrate: wrap the key and PATCH the server with the new `wrappedPrivateKey`
4. Store the unwrapped `privateKey` in `sessionStorage` (same as before)

**`initializeAuth()`**:
1. On page reload, fetch `wrappedPrivateKey` from `/users/me`
2. Cannot unwrap without the password → continue using the cached `privateKey` from `sessionStorage` (already there from login)
3. Validate cached publicKey against server's publicKey (same as current)

---

### Frontend Recovery Component

#### [MODIFY] [SecurityQuestionRecovery.jsx](file:///c:/Users/aN/Desktop/CHATAPP/chat-app-frontend/src/features/auth/components/SecurityQuestionRecovery.jsx)

**`handleVerify()`**: After security answer is verified, server now returns `securityEscrowKey`. Use `unwrapPrivateKeyWithAnswer(escrowKey, securityAnswer)` to recover the actual private key.

**`handleReset()`**:
1. Re-wrap the recovered private key with the new password: `wrapPrivateKey(privateKey, username, newPassword)`
2. Re-create the security escrow with the same answer: `wrapPrivateKeyWithAnswer(privateKey, securityAnswer)`
3. Derive the public key from the recovered private key (it's the SAME public key — no change)
4. Send `wrappedPrivateKey` + `securityEscrowKey` to the server (public key stays the same!)
5. **Remove** the old warning about losing old messages ✅

---

### Frontend Register Form

#### [MODIFY] [RegisterForm.jsx](file:///c:/Users/aN/Desktop/CHATAPP/chat-app-frontend/src/features/auth/components/RegisterForm.jsx)

No UI changes needed — just pass `securityQuestionAnswer` to the store's `register()` which handles key generation + wrapping internally.

---

## Flow Diagrams

### Registration (New)
```
User registers with username + password + securityAnswer
  ↓
generateKeyPair()          → { publicKey, privateKey }  (random, ONE TIME)
wrapPrivateKey(privKey, username, password) → wrappedPrivateKey
wrapPrivateKeyWithAnswer(privKey, answer)  → securityEscrowKey
  ↓
Send to server: { publicKey, wrappedPrivateKey, securityEscrowKey }
```

### Login (New)
```
Server returns: { user, wrappedPrivateKey }
  ↓
unwrapPrivateKey(wrappedPrivateKey, username, password) → privateKey
  ↓
sessionStorage.privateKey = privateKey    ← same as before
```

### Password Change (Fixed!)
```
User enters: newPassword
  ↓
unwrapPrivateKey(wrappedPrivateKey, username, oldPassword) → privateKey  (SAME key!)
wrapPrivateKey(privateKey, username, newPassword)          → newWrappedPrivateKey
  ↓
Send to server: { newWrappedPrivateKey }   ← publicKey UNCHANGED
  ↓
Old messages: still decryptable ✅ (same private key, just new wrapping)
```

### Forgot Password Recovery (Fixed!)
```
User verifies security answer → server returns securityEscrowKey
  ↓
unwrapPrivateKeyWithAnswer(securityEscrowKey, answer) → privateKey (SAME key!)
wrapPrivateKey(privateKey, username, newPassword)     → newWrappedPrivateKey
  ↓
Send to server: { newWrappedPrivateKey }   ← publicKey UNCHANGED
  ↓
Old messages: still decryptable ✅
```

---

## Verification Plan

### Manual Verification
1. **New registration** — Register a new user, verify keys are generated and wrapped
2. **Login** — Login, verify messages can be sent and received (E2EE working)
3. **Password reset via security question** — Reset password, login with new password, verify OLD messages are still readable
4. **Old user migration** — Test with existing user (no `wrappedPrivateKey` in DB), login should auto-migrate
5. **Cross-user chat** — After one user resets password, verify the OTHER user can still read old messages from them
