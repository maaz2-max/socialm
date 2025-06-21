import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { openDB } from 'idb';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Initialize IndexedDB
export const initDB = async () => {
  return openDB('socialchat-db', 1, {
    upgrade(db) {
      // Create object stores
      if (!db.objectStoreNames.contains('posts')) {
        db.createObjectStore('posts', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('profiles')) {
        db.createObjectStore('profiles', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('messages')) {
        db.createObjectStore('messages', { keyPath: 'id' });
      }
    },
  });
};

// Cache data in IndexedDB
export const cacheData = async (storeName: string, data: any) => {
  const db = await initDB();
  const tx = db.transaction(storeName, 'readwrite');
  const store = tx.objectStore(storeName);
  await store.put(data);
};

// Get cached data from IndexedDB
export const getCachedData = async (storeName: string, id: string) => {
  const db = await initDB();
  const tx = db.transaction(storeName, 'readonly');
  const store = tx.objectStore(storeName);
  return store.get(id);
};

// Image loading utility
export const loadImage = (src: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(src);
    img.onerror = reject;
    img.src = src;
  });
};

// Debounce utility
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}