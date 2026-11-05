/**
 * Phase 0 Security TDD Spec Runner for Dirty Dozen Payloads
 */

export interface DirtyDozenCase {
  id: number;
  name: string;
  authUid: string | null;
  emailVerified: boolean;
  pathUserId: string;
  pathWorldId: string;
  operation: 'create' | 'update' | 'get' | 'list';
  payload: Record<string, unknown>;
  expected: 'PERMISSION_DENIED';
}

export const DIRTY_DOZEN_CASES: DirtyDozenCase[] = [
  {
    id: 1,
    name: 'Unauthenticated Write',
    authUid: null,
    emailVerified: false,
    pathUserId: 'user_1',
    pathWorldId: 'world_1',
    operation: 'create',
    payload: { ownerId: 'user_1', worldId: 'world_1' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 2,
    name: 'Unverified Email Write',
    authUid: 'user_1',
    emailVerified: false,
    pathUserId: 'user_1',
    pathWorldId: 'world_1',
    operation: 'create',
    payload: { ownerId: 'user_1', worldId: 'world_1' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 3,
    name: 'Cross-User Path Spoofing',
    authUid: 'attacker_1',
    emailVerified: true,
    pathUserId: 'victim_1',
    pathWorldId: 'world_1',
    operation: 'create',
    payload: { ownerId: 'attacker_1', worldId: 'world_1' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 4,
    name: 'Payload OwnerId Spoofing',
    authUid: 'user_1',
    emailVerified: true,
    pathUserId: 'user_1',
    pathWorldId: 'world_1',
    operation: 'create',
    payload: { ownerId: 'victim_1', worldId: 'world_1' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 5,
    name: 'Shadow Field Injection on Create',
    authUid: 'user_1',
    emailVerified: true,
    pathUserId: 'user_1',
    pathWorldId: 'world_1',
    operation: 'create',
    payload: { ownerId: 'user_1', worldId: 'world_1', isAdmin: true },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 6,
    name: 'Shadow Field Injection on Update',
    authUid: 'user_1',
    emailVerified: true,
    pathUserId: 'user_1',
    pathWorldId: 'world_1',
    operation: 'update',
    payload: { ownerId: 'user_1', worldId: 'world_1', ghostField: 'bad' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 7,
    name: 'ID Poisoning Attack',
    authUid: 'user_1',
    emailVerified: true,
    pathUserId: 'user_1',
    pathWorldId: 'invalid$id!@#',
    operation: 'create',
    payload: { ownerId: 'user_1', worldId: 'invalid$id!@#' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 8,
    name: 'Value Poisoning (Oversized worldName)',
    authUid: 'user_1',
    emailVerified: true,
    pathUserId: 'user_1',
    pathWorldId: 'world_1',
    operation: 'create',
    payload: { ownerId: 'user_1', worldId: 'world_1', worldName: 'x'.repeat(200) },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 9,
    name: 'Array Exhaustion on slotOrder',
    authUid: 'user_1',
    emailVerified: true,
    pathUserId: 'user_1',
    pathWorldId: 'world_1',
    operation: 'create',
    payload: { ownerId: 'user_1', worldId: 'world_1', slotOrder: new Array(100).fill('wood') },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 10,
    name: 'Invalid Health Range',
    authUid: 'user_1',
    emailVerified: true,
    pathUserId: 'user_1',
    pathWorldId: 'world_1',
    operation: 'update',
    payload: { ownerId: 'user_1', worldId: 'world_1', health: 99999 },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 11,
    name: 'Temporal Forgery (Invalid Timestamp)',
    authUid: 'user_1',
    emailVerified: true,
    pathUserId: 'user_1',
    pathWorldId: 'world_1',
    operation: 'create',
    payload: { ownerId: 'user_1', worldId: 'world_1', createdAt: 0 },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 12,
    name: 'Immortal Field Mutation (createdAt changed)',
    authUid: 'user_1',
    emailVerified: true,
    pathUserId: 'user_1',
    pathWorldId: 'world_1',
    operation: 'update',
    payload: { ownerId: 'user_1', worldId: 'world_1', createdAt: 'mutated' },
    expected: 'PERMISSION_DENIED',
  },
];
