# Key Wrapping Migration — Tasks

- [ ] **1. Frontend: crypto.js** — Add `generateKeyPair`, `deriveWrappingKey`, `wrapPrivateKey`, `unwrapPrivateKey`, escrow functions
- [ ] **2. Backend: schema.prisma** — Add `wrappedPrivateKey` and `securityEscrowKey` columns to User
- [ ] **3. Backend: Run migration** — `npx prisma migrate dev`
- [ ] **4. Backend: auth.schemas.js** — Update validation schemas
- [ ] **5. Backend: auth.service.js** — Update register, login, resetPassword, verifySecurityQuestion
- [ ] **6. Backend: auth.controller.js** — Update login response, resetPassword request
- [ ] **7. Backend: users.service.js** — Include `wrappedPrivateKey` in `getMe()`
- [ ] **8. Frontend: useAuthStore.js** — Update register, login, initializeAuth with key wrapping
- [ ] **9. Frontend: SecurityQuestionRecovery.jsx** — Use escrow key for recovery, re-wrap with new password
- [ ] **10. Verification** — Test login, register, password reset, old user migration
