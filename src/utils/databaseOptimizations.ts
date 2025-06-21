// Database optimization utilities for better performance
import { supabase } from '@/integrations/supabase/client';

// Cache management
export class CacheManager {
  private static instance: CacheManager;
  private cache = new Map<string, { data: any; timestamp: number; ttl: number }>();
  
  static getInstance(): CacheManager {
    if (!CacheManager.instance) {
      CacheManager.instance = new CacheManager();
    }
    return CacheManager.instance;
  }

  set(key: string, data: any, ttl: number = 300000): void { // 5 minutes default
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl
    });
  }

  get(key: string): any | null {
    const item = this.cache.get(key);
    if (!item) return null;
    
    if (Date.now() - item.timestamp > item.ttl) {
      this.cache.delete(key);
      return null;
    }
    
    return item.data;
  }

  delete(key: string): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  // Clean expired entries
  cleanup(): void {
    const now = Date.now();
    for (const [key, item] of this.cache.entries()) {
      if (now - item.timestamp > item.ttl) {
        this.cache.delete(key);
      }
    }
  }
}

// Batch operations for better performance
export class BatchOperations {
  private static pendingOperations: Map<string, any[]> = new Map();
  private static timeouts: Map<string, NodeJS.Timeout> = new Map();

  static addToBatch(operation: string, data: any, delay: number = 1000): void {
    if (!this.pendingOperations.has(operation)) {
      this.pendingOperations.set(operation, []);
    }
    
    this.pendingOperations.get(operation)!.push(data);
    
    // Clear existing timeout
    if (this.timeouts.has(operation)) {
      clearTimeout(this.timeouts.get(operation)!);
    }
    
    // Set new timeout
    this.timeouts.set(operation, setTimeout(() => {
      this.executeBatch(operation);
    }, delay));
  }

  private static async executeBatch(operation: string): Promise<void> {
    const batch = this.pendingOperations.get(operation);
    if (!batch || batch.length === 0) return;

    try {
      switch (operation) {
        case 'story_views':
          await this.batchInsertStoryViews(batch);
          break;
        case 'notifications':
          await this.batchInsertNotifications(batch);
          break;
        default:
          console.warn(`Unknown batch operation: ${operation}`);
      }
    } catch (error) {
      console.error(`Error executing batch ${operation}:`, error);
    } finally {
      this.pendingOperations.delete(operation);
      this.timeouts.delete(operation);
    }
  }

  private static async batchInsertStoryViews(views: any[]): Promise<void> {
    if (views.length === 0) return;
    
    const { error } = await supabase
      .from('story_views')
      .insert(views);
      
    if (error) {
      console.error('Batch story views insert error:', error);
    }
  }

  private static async batchInsertNotifications(notifications: any[]): Promise<void> {
    if (notifications.length === 0) return;
    
    const { error } = await supabase
      .from('notifications')
      .insert(notifications);
      
    if (error) {
      console.error('Batch notifications insert error:', error);
    }
  }
}

// Optimized query builder
export class OptimizedQueries {
  static async getStoriesWithProfiles(userId?: string): Promise<any[]> {
    const cache = CacheManager.getInstance();
    const cacheKey = `stories_with_profiles_${userId || 'anonymous'}`;
    
    // Check cache first
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    const { data, error } = await supabase
      .from('stories')
      .select(`
        id,
        user_id,
        image_url,
        photo_urls,
        created_at,
        expires_at,
        views_count,
        profiles:user_id!inner (
          name,
          username,
          avatar
        )
      `)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Cache the result
    cache.set(cacheKey, data || [], 30000); // 30 seconds
    
    return data || [];
  }

  static async getViewedStories(userId: string, storyIds: string[]): Promise<string[]> {
    if (!userId || storyIds.length === 0) return [];

    const cache = CacheManager.getInstance();
    const cacheKey = `viewed_stories_${userId}`;
    
    // Check cache first
    const cached = cache.get(cacheKey);
    if (cached) {
      return storyIds.filter(id => cached.has(id));
    }

    const { data, error } = await supabase
      .from('story_views')
      .select('story_id')
      .eq('viewer_id', userId)
      .in('story_id', storyIds);

    if (error) throw error;

    const viewedSet = new Set(data?.map(v => v.story_id) || []);
    
    // Cache the result
    cache.set(cacheKey, viewedSet, 60000); // 1 minute
    
    return data?.map(v => v.story_id) || [];
  }

  static async getUserProfile(userId: string): Promise<any> {
    const cache = CacheManager.getInstance();
    const cacheKey = `user_profile_${userId}`;
    
    // Check cache first
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) throw error;

    // Cache the result
    cache.set(cacheKey, data, 300000); // 5 minutes
    
    return data;
  }
}

// Background sync for offline support
export class BackgroundSync {
  private static syncQueue: any[] = [];
  private static isOnline = navigator.onLine;

  static init(): void {
    window.addEventListener('online', this.handleOnline.bind(this));
    window.addEventListener('offline', this.handleOffline.bind(this));
  }

  static addToQueue(operation: any): void {
    this.syncQueue.push({
      ...operation,
      timestamp: Date.now()
    });
    
    if (this.isOnline) {
      this.processQueue();
    }
  }

  private static handleOnline(): void {
    this.isOnline = true;
    this.processQueue();
  }

  private static handleOffline(): void {
    this.isOnline = false;
  }

  private static async processQueue(): Promise<void> {
    if (!this.isOnline || this.syncQueue.length === 0) return;

    const operations = [...this.syncQueue];
    this.syncQueue = [];

    for (const operation of operations) {
      try {
        await this.executeOperation(operation);
      } catch (error) {
        console.error('Background sync error:', error);
        // Re-add failed operations to queue
        this.syncQueue.push(operation);
      }
    }
  }

  private static async executeOperation(operation: any): Promise<void> {
    switch (operation.type) {
      case 'story_view':
        await supabase
          .from('story_views')
          .insert(operation.data);
        break;
      case 'increment_views':
        await supabase.rpc('increment_story_views', operation.data);
        break;
      default:
        console.warn(`Unknown sync operation: ${operation.type}`);
    }
  }
}

// Initialize background sync
BackgroundSync.init();

// Cleanup cache every 10 minutes
setInterval(() => {
  CacheManager.getInstance().cleanup();
}, 600000);