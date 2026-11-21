# Security Specification — Sturio.io Firestore Rules

## 1. Data Invariants
1. Every document under `/users/{userId}` and its subcollections (`assignments`, `goals`, `timelineEvents`, `savedSolutions`, `revisionItems`, `solvedAssignments`) is strictly owned by `request.auth.uid == userId` with `request.auth.token.email_verified == true`.
2. Every document ID (`userId`, `assignmentId`, `goalId`, `eventId`, `solutionId`, `itemId`, `solvedId`) must pass `isValidId(id)` (`^[a-zA-Z0-9_-]+$`, max 128 chars).
3. All `userId` / `uid` and `createdAt` fields are immutable once created and must match `request.auth.uid` and `request.time`.
4. All strings enforce explicit `.size()` bounds; all lists enforce bounded `.size()` limits; all maps enforce exact key allowlists via `hasAll` and `hasOnly`.
5. No PII (`email`, `phone`, `address`) is stored in Firestore documents; display identity comes from Firebase Auth tokens.
6. Terminal state locking: Once an Assignment's status reaches `'Completed'`, `status` cannot transition backward; updates to `'Completed'` assignments are strictly limited to attachment/question fields (`questionText`, `questionFile`, `handwrittenSolution`, `linkedSolvedAssignmentId`) with `status` unchanged.
7. Attachment safety & size bounds: `questionFile` and `handwrittenSolution` maps require exact keys (`name`, `mimeType`, `dataUrl`, `sizeBytes`), allowlisted MIME types (`image/jpeg`, `image/png`, `image/webp`, `application/pdf`), valid base64 data URL prefixes, and strict size limits (`dataUrl <= 420000` chars).

## 2. The "Dirty Dozen" Adversarial Payloads
1. Unauthenticated read/write on `/users/uid1/assignments/a1` -> `PERMISSION_DENIED`.
2. Cross-user read/write: `uid2` attempting to read or write `/users/uid1/assignments/a1` -> `PERMISSION_DENIED`.
3. Unverified email user (`email_verified: false`) attempting to create `/users/uid1/goals/g1` -> `PERMISSION_DENIED`.
4. Identity spoofing: `uid1` creating `/users/uid1/assignments/a1` with `userId: "uid2"` -> `PERMISSION_DENIED`.
5. Shadow field injection: `uid1` creating a Goal with extra field `isAdmin: true` -> `PERMISSION_DENIED`.
6. Timestamp tampering: `uid1` creating an Assignment with backdated `createdAt` != `request.time` -> `PERMISSION_DENIED`.
7. Oversized ID poisoning: creating `/users/uid1/goals/` with a 500-char ID or invalid characters (`$foo`) -> `PERMISSION_DENIED`.
8. Oversized string DoW attack: creating an Assignment with a 50,000-char `title` -> `PERMISSION_DENIED`.
9. Invalid enum value: creating an Assignment with `status: "Hacked"` -> `PERMISSION_DENIED`.
10. Immutable field mutation: updating `userId` or `createdAt` on an existing Goal -> `PERMISSION_DENIED`.
11. Negative XP / out-of-range progress: updating `UserProfile.xp` to `-500` or `algebraProgress` to `999` -> `PERMISSION_DENIED`.
12. Terminal state bypass: attempting to update `status` on an already `'Completed'` Assignment -> `PERMISSION_DENIED`.
