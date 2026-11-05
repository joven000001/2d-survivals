import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import {
  doc,
  getDoc,
  getDocFromServer,
  initializeFirestore,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import type { ItemType } from './game/blocks';
import type { SerializedInventory } from './game/inventory';
import type { TileType } from './game/types';

const app = initializeApp(firebaseConfig);
export const db = initializeFirestore(
  app,
  {
    experimentalForceLongPolling: true,
  },
  firebaseConfig.firestoreDatabaseId
);
export const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
void testConnection();

export function sanitizeFirestoreId(raw: string): string {
  const cleaned = String(raw || 'default')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 128);
  return cleaned.length > 0 ? cleaned : 'default';
}

export interface CloudWorldSnapshot {
  worldId: string;
  worldName: string;
  seed: number;
  playerX: number;
  playerY: number;
  health: number;
  food: number;
  stamina: number;
  day: number;
  time: number;
  inventory: SerializedInventory;
  modifiedBlocks: Array<[string, number]>;
}

export async function signInWithFirebaseGoogle(): Promise<User | null> {
  const credential = await signInWithPopup(auth, googleProvider);
  return credential.user;
}

export async function signOutFirebase(): Promise<void> {
  await signOut(auth);
}

export { onAuthStateChanged, type User };

export async function saveWorldToCloud(snapshot: CloudWorldSnapshot): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified) return;

  const userId = sanitizeFirestoreId(user.uid);
  const worldId = sanitizeFirestoreId(snapshot.worldId);
  const path = `users/${userId}/worldSaves/${worldId}`;
  const docRef = doc(db, 'users', userId, 'worldSaves', worldId);

  const safeWorldName = String(snapshot.worldName || 'World').trim().slice(0, 64) || 'World';
  const safeHealth = Math.max(0, Math.min(100, Number.isFinite(snapshot.health) ? Math.round(snapshot.health) : 100));
  const safeFood = Math.max(0, Math.min(100, Number.isFinite(snapshot.food) ? Math.round(snapshot.food) : 100));
  const safeStamina = Math.max(0, Math.min(100, Number.isFinite(snapshot.stamina) ? Math.round(snapshot.stamina) : 100));
  const safeDay = Math.max(1, Number.isFinite(snapshot.day) ? Math.floor(snapshot.day) : 1);
  const safeTime = Math.max(0, Math.min(1, Number.isFinite(snapshot.time) ? snapshot.time : 0.44));
  const safeActiveSlot = 0;

  const inventoryCounts: Record<string, number> = {};
  const countEntries = Object.entries(snapshot.inventory.counts || {}).slice(0, 128);
  for (const [k, v] of countEntries) {
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0) {
      inventoryCounts[k] = Math.floor(v);
    }
  }

  const combinedSlots = [
    ...(Array.isArray(snapshot.inventory.hotbarTypes) ? snapshot.inventory.hotbarTypes : []),
    ...(Array.isArray(snapshot.inventory.inventoryTypes) ? snapshot.inventory.inventoryTypes : []),
  ];
  const slotOrder = combinedSlots
    .filter((item): item is ItemType => typeof item === 'string' && item.length > 0 && item.length <= 64)
    .slice(0, 36);

  const modifiedBlocksMap: Record<string, number> = {};
  const blockEntries = (Array.isArray(snapshot.modifiedBlocks) ? snapshot.modifiedBlocks : []).slice(-5000);
  for (const [coordKey, tileVal] of blockEntries) {
    if (typeof coordKey === 'string' && typeof tileVal === 'number' && Number.isFinite(tileVal)) {
      modifiedBlocksMap[coordKey] = Math.floor(tileVal);
    }
  }

  let existsAlready = false;
  try {
    const existingSnap = await getDoc(docRef);
    existsAlready = existingSnap.exists();
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }

  if (!existsAlready) {
    try {
      await setDoc(docRef, {
        ownerId: userId,
        worldId,
        worldName: safeWorldName,
        seed: Number.isFinite(snapshot.seed) ? snapshot.seed : 932248,
        playerX: Number.isFinite(snapshot.playerX) ? Math.round(snapshot.playerX * 10) / 10 : 0,
        playerY: Number.isFinite(snapshot.playerY) ? Math.round(snapshot.playerY * 10) / 10 : 0,
        health: safeHealth,
        food: safeFood,
        stamina: safeStamina,
        day: safeDay,
        time: safeTime,
        inventoryCounts,
        slotOrder,
        activeSlot: safeActiveSlot,
        modifiedBlocksMap,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  } else {
    try {
      await updateDoc(docRef, {
        worldName: safeWorldName,
        seed: Number.isFinite(snapshot.seed) ? snapshot.seed : 932248,
        playerX: Number.isFinite(snapshot.playerX) ? Math.round(snapshot.playerX * 10) / 10 : 0,
        playerY: Number.isFinite(snapshot.playerY) ? Math.round(snapshot.playerY * 10) / 10 : 0,
        health: safeHealth,
        food: safeFood,
        stamina: safeStamina,
        day: safeDay,
        time: safeTime,
        inventoryCounts,
        slotOrder,
        activeSlot: safeActiveSlot,
        modifiedBlocksMap,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  }
}

export async function loadWorldFromCloud(worldIdRaw: string): Promise<{
  seed: number;
  playerX: number;
  playerY: number;
  health: number;
  food: number;
  stamina: number;
  day: number;
  time: number;
  inventory: SerializedInventory;
  modifiedBlocks: Array<[string, TileType]>;
} | null> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified) return null;

  const userId = sanitizeFirestoreId(user.uid);
  const worldId = sanitizeFirestoreId(worldIdRaw);
  const path = `users/${userId}/worldSaves/${worldId}`;
  const docRef = doc(db, 'users', userId, 'worldSaves', worldId);

  try {
    const snap = await getDoc(docRef);
    if (!snap.exists()) return null;
    const data = snap.data();
    const modifiedBlocks: Array<[string, TileType]> = [];
    if (data.modifiedBlocksMap && typeof data.modifiedBlocksMap === 'object') {
      for (const [k, v] of Object.entries(data.modifiedBlocksMap as Record<string, unknown>)) {
        if (typeof v === 'number' && Number.isFinite(v)) {
          modifiedBlocks.push([k, v as TileType]);
        }
      }
    }
    const savedOrder = Array.isArray(data.slotOrder)
      ? (data.slotOrder.filter((item): item is ItemType => typeof item === 'string') as ItemType[])
      : [];
    const hotbarTypes: Array<ItemType | null> = ['sword', null, null, null, null, null, null, null];
    const inventoryTypes: Array<ItemType | null> = Array(49).fill(null);
    let hIdx = 1;
    let invIdx = 0;
    for (const item of savedOrder) {
      if (item === 'sword') continue;
      if (hIdx < 8) {
        hotbarTypes[hIdx++] = item;
      } else if (invIdx < 49) {
        inventoryTypes[invIdx++] = item;
      }
    }
    return {
      seed: typeof data.seed === 'number' ? data.seed : 932248,
      playerX: typeof data.playerX === 'number' ? data.playerX : 0,
      playerY: typeof data.playerY === 'number' ? data.playerY : 0,
      health: typeof data.health === 'number' ? data.health : 100,
      food: typeof data.food === 'number' ? data.food : 100,
      stamina: typeof data.stamina === 'number' ? data.stamina : 100,
      day: typeof data.day === 'number' ? data.day : 1,
      time: typeof data.time === 'number' ? data.time : 0.44,
      inventory: {
        counts: (data.inventoryCounts as any) || {},
        hotbarTypes,
        inventoryTypes,
      },
      modifiedBlocks,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}
