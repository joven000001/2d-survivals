# Security Specification (Phase 0: Payload-First Security TDD)

## 1. Data Invariants

1. **Identity & Ownership**: A `WorldSave` document at `/users/{userId}/worldSaves/{worldId}` can only be read, created, updated, or deleted by the authenticated, email-verified user whose `request.auth.uid == userId` and `data.ownerId == userId`.
2. **Path Variable Hardening**: Both `{userId}` and `{worldId}` must match `^[a-zA-Z0-9_\-]+$` with length between 1 and 128 (`isValidId`).
3. **Strict Schema & Anti-Update-Gap**: All writes (`create` and `update`) must pass `isValidWorldSave(incoming(), userId, worldId)`, enforcing exact key allowlists (`hasAll` and `hasOnly`), bounded string lengths, bounded list sizes (`slotOrder.size() <= 36`), bounded map sizes (`modifiedBlocksMap.size() <= 5000`, `inventoryCounts.size() <= 128`), and numeric bounds.
4. **Immutable & Temporal Fields**: `ownerId`, `worldId`, and `createdAt` are immutable on `update`. `createdAt` must equal `request.time` on `create`, and `updatedAt` must equal `request.time` on both `create` and `update`.
5. **Query Enforcer**: `allow list` on `/users/{userId}/worldSaves` strictly verifies `isSignedIn() && isVerified() && request.auth.uid == userId && resource.data.ownerId == request.auth.uid`.

## 2. The "Dirty Dozen" Payloads

1. **Unauthenticated Write**: `auth = null` attempting to create `/users/user_1/worldSaves/world_1` -> `PERMISSION_DENIED`.
2. **Unverified Email Spoof**: `auth = { uid: 'user_1', token: { email_verified: false } }` attempting to write -> `PERMISSION_DENIED`.
3. **Cross-User Identity Spoofing (Path Mismatch)**: `auth.uid = 'attacker_1'` writing to `/users/victim_1/worldSaves/world_1` -> `PERMISSION_DENIED`.
4. **Cross-User Payload Owner Spoofing**: `auth.uid = 'user_1'` writing `ownerId: 'victim_1'` to `/users/user_1/worldSaves/world_1` -> `PERMISSION_DENIED`.
5. **Shadow / Ghost Field Injection on Create**: Payload includes extra key `isAdmin: true` -> `PERMISSION_DENIED`.
6. **Shadow / Ghost Field Injection on Update**: Update modifies `ownerId` or adds `hacked: true` -> `PERMISSION_DENIED`.
7. **ID Poisoning Attack**: Document ID `{worldId}` contains invalid characters (`world/../../etc`) or exceeds 128 chars -> `PERMISSION_DENIED`.
8. **Value Poisoning (Oversized String)**: `worldName` is a 10,000-character string (exceeds `maxLength: 64`) -> `PERMISSION_DENIED`.
9. **Array Exhaustion Attack**: `slotOrder` contains 500 items (exceeds max 36 slots) or non-string first element -> `PERMISSION_DENIED`.
10. **Map Exhaustion Attack**: `modifiedBlocksMap` exceeds 5,000 entries -> `PERMISSION_DENIED`.
11. **Temporal Forgery (Client Timestamp Spoofing)**: `createdAt` or `updatedAt` does not match `request.time` -> `PERMISSION_DENIED`.
12. **Immortal Field Mutation**: `update` attempts to mutate `createdAt`, `ownerId`, or `worldId` -> `PERMISSION_DENIED`.
