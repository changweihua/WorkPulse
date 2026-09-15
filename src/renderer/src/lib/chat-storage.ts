/**
 * ChatStorage - IndexedDB persistence layer for chat conversations.
 * Replaces localStorage for chat data with structured storage.
 *
 * Features:
 * - Async API (non-blocking)
 * - Structured object storage
 * - Larger capacity (~50MB+ vs 5MB localStorage limit)
 * - Stable snapshot filtering (only completed messages)
 * - Local-first recovery strategy
 * - Read-only cache degradation
 */

// ─── Types ────────────────────────────────────────────────────────────────
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  reasoning?: string;
  tokenUsage?: { input: number; output: number; total: number };
  timestamp: number;
}

export interface Conversation {
  id: string;
  title: string;
  modelId: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
  revision?: number;
}

export interface ModelConfig {
  id: string;
  name: string;
  baseURL: string;
  model: string;
  token: string;
  headers: string;
  temperature: number;
  max_tokens: number;
  top_p: number;
}

export interface Snapshot {
  id: string;
  type: 'conversation' | 'config';
  data: Conversation | ModelConfig;
  updatedAt: number;
  version: number;
}

// ─── Stable Snapshot Filtering ─────────────────────────────────────────────
// Only store completed messages (not streaming/pending ones)
function filterCompletedMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.filter((msg) => {
    // Exclude streaming messages (id === 'streaming')
    if (msg.id === 'streaming') return false;
    // Exclude empty assistant messages
    if (msg.role === 'assistant' && !msg.content?.trim()) return false;
    return true;
  });
}

// ─── Capacity Limits ──────────────────────────────────────────────────────
const MAX_MESSAGES_PER_CONVERSATION = 200;
const MAX_CONVERSATIONS = 50;

function trimMessages(messages: ChatMessage[]): ChatMessage[] {
  if (messages.length > MAX_MESSAGES_PER_CONVERSATION) {
    return messages.slice(-MAX_MESSAGES_PER_CONVERSATION);
  }
  return messages;
}

// ─── Multi-Tab Sync (BroadcastChannel) ────────────────────────────────────
type SyncEvent = { type: 'conversation-updated' | 'conversation-deleted' | 'config-updated'; id: string };
let syncChannel: BroadcastChannel | null = null;
let syncListeners: Array<(event: SyncEvent) => void> = [];

function getSyncChannel(): BroadcastChannel {
  if (!syncChannel) {
    syncChannel = new BroadcastChannel('workpulse-chat-sync');
    syncChannel.onmessage = (event: MessageEvent<SyncEvent>) => {
      syncListeners.forEach((fn) => fn(event.data));
    };
  }
  return syncChannel;
}

function broadcastSync(event: SyncEvent): void {
  try {
    getSyncChannel().postMessage(event);
  } catch { /* BroadcastChannel not supported */ }
}

export function onSyncEvent(listener: (event: SyncEvent) => void): () => void {
  syncListeners.push(listener);
  getSyncChannel();
  return () => {
    syncListeners = syncListeners.filter((fn) => fn !== listener);
  };
}

// ─── Database Setup ────────────────────────────────────────────────────────
const DB_NAME = 'workpulse-chat';
const DB_VERSION = 1;
const STORE_SNAPSHOTS = 'snapshots';
const STORE_CONFIGS = 'configs';
const STORE_CONVERSATIONS = 'conversations';

let dbInstance: IDBDatabase | null = null;
let dbPromise: Promise<IDBDatabase> | null = null;

function openDatabase(): Promise<IDBDatabase> {
  if (dbInstance) {
    return Promise.resolve(dbInstance);
  }

  if (dbPromise) {
    return dbPromise;
  }

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Snapshots store - for conversations and configs
      if (!db.objectStoreNames.contains(STORE_SNAPSHOTS)) {
        const snapshotStore = db.createObjectStore(STORE_SNAPSHOTS, { keyPath: 'id' });
        snapshotStore.createIndex('type', 'type', { unique: false });
        snapshotStore.createIndex('updatedAt', 'updatedAt', { unique: false });
      }

      // Configs store - for model configurations (tokens stripped)
      if (!db.objectStoreNames.contains(STORE_CONFIGS)) {
        const configStore = db.createObjectStore(STORE_CONFIGS, { keyPath: 'id' });
        configStore.createIndex('name', 'name', { unique: false });
      }

      // Conversations store - for full conversation data
      if (!db.objectStoreNames.contains(STORE_CONVERSATIONS)) {
        const convStore = db.createObjectStore(STORE_CONVERSATIONS, { keyPath: 'id' });
        convStore.createIndex('updatedAt', 'updatedAt', { unique: false });
        convStore.createIndex('title', 'title', { unique: false });
      }
    };

    request.onsuccess = (event) => {
      dbInstance = (event.target as IDBOpenDBRequest).result;

      dbInstance.onclose = () => {
        console.warn('[chat-storage] DB connection closed unexpectedly');
        dbInstance = null;
      };
      dbInstance.onversionchange = () => {
        console.warn('[chat-storage] DB version change detected, closing connection');
        dbInstance?.close();
        dbInstance = null;
      };

      dbPromise = null;
      resolve(dbInstance);
    };

    request.onerror = (event) => {
      dbPromise = null;
      reject((event.target as IDBOpenDBRequest).error);
    };
  });

  return dbPromise;
}

// ─── Conversation CRUD ─────────────────────────────────────────────────────

/**
 * Save a conversation to IndexedDB (stable snapshot).
 * Only stores completed messages, filters out streaming ones.
 * Applies capacity trimming to keep storage bounded.
 */
export async function saveConversation(conversation: Conversation): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CONVERSATIONS, 'readwrite');
    const store = tx.objectStore(STORE_CONVERSATIONS);

    const filteredConversation: Conversation = {
      ...conversation,
      messages: trimMessages(filterCompletedMessages(conversation.messages)),
      updatedAt: Date.now(),
    };

    const request = store.put(filteredConversation);

    request.onsuccess = () => {
      broadcastSync({ type: 'conversation-updated', id: conversation.id });
      resolve();
    };
    request.onerror = (event) => reject((event.target as IDBRequest).error);
  });
}

/**
 * Save a conversation with revision check (optimistic locking).
 * Won't overwrite a newer revision written by another tab.
 * Returns true if saved, false if rejected (another tab is newer).
 */
export async function saveConversationSafe(conversation: Conversation): Promise<boolean> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CONVERSATIONS, 'readwrite');
    const store = tx.objectStore(STORE_CONVERSATIONS);

    const getRequest = store.get(conversation.id);
    getRequest.onsuccess = () => {
      const existing = getRequest.result as Conversation | undefined;
      const currentRevision = existing?.revision ?? 0;

      // Reject if existing is newer (another tab wrote first)
      if (existing?.revision != null && existing.revision > (conversation.revision ?? 0)) {
        resolve(false);
        return;
      }

      const newRevision = currentRevision + 1;
      const updated: Conversation = {
        ...conversation,
        messages: trimMessages(filterCompletedMessages(conversation.messages)),
        updatedAt: Date.now(),
        revision: newRevision,
      };

      const putRequest = store.put(updated);
      putRequest.onsuccess = () => {
        broadcastSync({ type: 'conversation-updated', id: conversation.id });
        resolve(true);
      };
      putRequest.onerror = (event) => reject((event.target as IDBRequest).error);
    };
    getRequest.onerror = (event) => reject((event.target as IDBRequest).error);
  });
}

/**
 * Get a conversation from IndexedDB.
 */
export async function getConversation(id: string): Promise<Conversation | null> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CONVERSATIONS, 'readonly');
    const store = tx.objectStore(STORE_CONVERSATIONS);
    const request = store.get(id);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = (event) => reject((event.target as IDBRequest).error);
  });
}

/**
 * Get all conversations from IndexedDB.
 * Sorted by updatedAt descending (most recent first).
 */
export async function getAllConversations(): Promise<Conversation[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CONVERSATIONS, 'readonly');
    const store = tx.objectStore(STORE_CONVERSATIONS);
    const index = store.index('updatedAt');
    const request = index.openCursor(null, 'prev'); // Reverse order

    const conversations: Conversation[] = [];

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor) {
        conversations.push(cursor.value);
        cursor.continue();
      } else {
        resolve(conversations);
      }
    };

    request.onerror = (event) => reject((event.target as IDBRequest).error);
  });
}

/**
 * Delete a conversation from IndexedDB.
 */
export async function deleteConversation(id: string): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CONVERSATIONS, 'readwrite');
    const store = tx.objectStore(STORE_CONVERSATIONS);
    const request = store.delete(id);

    request.onsuccess = () => {
      broadcastSync({ type: 'conversation-deleted', id });
      resolve();
    };
    request.onerror = (event) => reject((event.target as IDBRequest).error);
  });
}

/**
 * Batch save multiple conversations (for migration/sync).
 * Enforces capacity limits on both message count and conversation count.
 */
export async function saveConversationsBatch(conversations: Conversation[]): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CONVERSATIONS, 'readwrite');
    const store = tx.objectStore(STORE_CONVERSATIONS);

    const sorted = [...conversations]
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
      .slice(0, MAX_CONVERSATIONS);

    for (const conv of sorted) {
      const filtered: Conversation = {
        ...conv,
        messages: trimMessages(filterCompletedMessages(conv.messages)),
        updatedAt: Date.now(),
      };
      store.put(filtered);
    }

    tx.oncomplete = () => resolve();
    tx.onerror = (event) => reject((event.target as IDBTransaction).error);
  });
}

// ─── Config CRUD ───────────────────────────────────────────────────────────

/**
 * Save a model config to IndexedDB.
 * Tokens are stripped for security (stored separately via IPC).
 */
export async function saveConfig(config: ModelConfig): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CONFIGS, 'readwrite');
    const store = tx.objectStore(STORE_CONFIGS);

    // Strip token for local storage (security)
    const stripped = { ...config, token: '' };
    const request = store.put(stripped);

    request.onsuccess = () => resolve();
    request.onerror = (event) => reject((event.target as IDBRequest).error);
  });
}

/**
 * Get a config from IndexedDB (token is empty string).
 */
export async function getConfig(id: string): Promise<ModelConfig | null> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CONFIGS, 'readonly');
    const store = tx.objectStore(STORE_CONFIGS);
    const request = store.get(id);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = (event) => reject((event.target as IDBRequest).error);
  });
}

/**
 * Get all configs from IndexedDB (tokens are empty strings).
 */
export async function getAllConfigs(): Promise<ModelConfig[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CONFIGS, 'readonly');
    const store = tx.objectStore(STORE_CONFIGS);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result || []);
    request.onerror = (event) => reject((event.target as IDBRequest).error);
  });
}

/**
 * Delete a config from IndexedDB.
 */
export async function deleteConfig(id: string): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CONFIGS, 'readwrite');
    const store = tx.objectStore(STORE_CONFIGS);
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = (event) => reject((event.target as IDBRequest).error);
  });
}

// ─── Local-First Recovery ──────────────────────────────────────────────────

/**
 * Recover chat data using local-first strategy:
 * 1. Read from IndexedDB (fast, offline)
 * 2. If empty, attempt to migrate from localStorage
 * 3. Return recovered data
 */
export async function recoverConversations(prefix: string = 'chat'): Promise<Conversation[]> {
  // Step 1: Try IndexedDB first
  const indexedDBConversations = await getAllConversations();

  if (indexedDBConversations.length > 0) {
    return indexedDBConversations;
  }

  // Step 2: Migrate from localStorage if IndexedDB is empty
  try {
    const localStorageKey = prefix === 'chatPanel' ? 'chatPanelConversations' : 'chatConversations';
    const saved = localStorage.getItem(localStorageKey);

    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Migrate to IndexedDB
        await saveConversationsBatch(parsed);
        return parsed;
      }
    }
  } catch (error) {
    console.warn('localStorage migration failed:', error);
  }

  return [];
}

/**
 * Recover model configs using local-first strategy.
 * Note: Tokens are not stored in IndexedDB (security).
 */
export async function recoverConfigs(prefix: string = 'chat'): Promise<ModelConfig[]> {
  // Step 1: Try IndexedDB first
  const indexedDBConfigs = await getAllConfigs();

  if (indexedDBConfigs.length > 0) {
    return indexedDBConfigs;
  }

  // Step 2: Migrate from localStorage if IndexedDB is empty
  try {
    const localStorageKey = prefix === 'chatPanel' ? 'chatPanelModelConfigs' : 'chatModelConfigs';
    const saved = localStorage.getItem(localStorageKey);

    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Migrate to IndexedDB
        for (const config of parsed) {
          await saveConfig(config);
        }
        return parsed;
      }
    }
  } catch (error) {
    console.warn('localStorage migration failed:', error);
  }

  return [];
}

// ─── Read-Only Cache Degradation ───────────────────────────────────────────

/**
 * Cache status tracker for read-only degradation.
 */
let isOnline = true;
let lastSyncTime = 0;

/**
 * Mark the cache as read-only (server unavailable).
 */
export function markReadOnly(): void {
  isOnline = false;
}

/**
 * Mark the cache as writable (server available).
 */
export function markWritable(): void {
  isOnline = true;
  lastSyncTime = Date.now();
}

/**
 * Check if writes are allowed.
 */
export function canWrite(): boolean {
  return isOnline;
}

/**
 * Get cache status for UI display.
 */
export function getCacheStatus(): {
  isOnline: boolean;
  lastSyncTime: number;
  canWrite: boolean;
} {
  return {
    isOnline,
    lastSyncTime,
    canWrite: isOnline,
  };
}

// ─── Migration Helpers ─────────────────────────────────────────────────────

/**
 * Clear all IndexedDB data (for debugging/reset).
 */
export async function clearAll(): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_SNAPSHOTS, STORE_CONFIGS, STORE_CONVERSATIONS], 'readwrite');
    tx.objectStore(STORE_SNAPSHOTS).clear();
    tx.objectStore(STORE_CONFIGS).clear();
    tx.objectStore(STORE_CONVERSATIONS).clear();

    tx.oncomplete = () => resolve();
    tx.onerror = (event) => reject((event.target as IDBTransaction).error);
  });
}

/**
 * Get storage stats for debugging.
 */
export async function getStorageStats(): Promise<{
  conversations: number;
  configs: number;
  estimatedSize: string;
}> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_CONVERSATIONS, STORE_CONFIGS], 'readonly');
    const convStore = tx.objectStore(STORE_CONVERSATIONS);
    const configStore = tx.objectStore(STORE_CONFIGS);

    const convCount = convStore.count();
    const configCount = configStore.count();

    let totalSize = 0;

    convStore.openCursor().onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor) {
        totalSize += JSON.stringify(cursor.value).length;
        cursor.continue();
      } else {
        configStore.openCursor().onsuccess = (event) => {
          const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
          if (cursor) {
            totalSize += JSON.stringify(cursor.value).length;
            cursor.continue();
          } else {
            resolve({
              conversations: convCount.result,
              configs: configCount.result,
              estimatedSize: `${(totalSize / 1024).toFixed(1)} KB`,
            });
          }
        };
      }
    };

    tx.onerror = (event) => reject((event.target as IDBTransaction).error);
  });
}
