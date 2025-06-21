import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

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

// Image loading utility
export const loadImage = (src: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(src);
    img.onerror = reject;
    img.src = src;
  });
};

// Simple cache utilities using localStorage as fallback
export const cacheData = async (storeName: string, data: any) => {
  try {
    localStorage.setItem(`cache_${storeName}`, JSON.stringify(data));
  } catch (error) {
    console.warn('Failed to cache data:', error);
  }
};

export const getCachedData = async (storeName: string, id: string) => {
  try {
    const cached = localStorage.getItem(`cache_${storeName}`);
    return cached ? JSON.parse(cached) : null;
  } catch (error) {
    console.warn('Failed to get cached data:', error);
    return null;
  }
};