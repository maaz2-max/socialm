// Database optimization utilities for better performance
import { supabase } from '@/integrations/supabase/client';

// Enhanced cache management with TTL and automatic cleanup
export class CacheManager {
  private static instance: CacheManager;
  private cache = new Map<string, { data: any; timestamp: number; ttl: number }>();
  private cleanupInterval: NodeJS.Timeout | null = null;
  
  static getInstance(): CacheManager {
    if (!CacheManager.instance) {
      CacheManager.instance = new CacheManager();
      CacheManager.instance.startCleanup();
    }
    return CacheManager.instance;
  }

  private startCleanup(): void {
    // Clean up expired entries every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 300000);
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

  // Get cache statistics
  getStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys())
    };
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.clear();
  }
}

// Enhanced batch operations for better performance
export class BatchOperations {
  private static pendingOperations: Map<string, any[]> = new Map();
  private static timeouts: Map<string, NodeJS.Timeout> = new Map();
  private static maxBatchSize = 50; // Maximum items per batch

  static addToBatch(operation: string, data: any, delay: number = 1000): void {
    if (!this.pendingOperations.has(operation)) {
      this.pendingOperations.set(operation, []);
    }
    
    const batch = this.pendingOperations.get(operation)!;
    batch.push(data);
    
    // Execute immediately if batch is full
    if (batch.length >= this.maxBatchSize) {
      this.executeBatch(operation);
      return;
    }
    
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

    // Clear the batch and timeout
    this.pendingOperations.delete(operation);
    if (this.timeouts.has(operation)) {
      clearTimeout(this.timeouts.get(operation)!);
      this.timeouts.delete(operation);
    }

    try {
      switch (operation) {
        case 'story_views':
          await this.batchInsertStoryViews(batch);
          break;
        case 'notifications':
          await this.batchInsertNotifications(batch);
          break;
        case 'story_view_increments':
          await this.batchIncrementStoryViews(batch);
          break;
        default:
          console.warn(`Unknown batch operation: ${operation}`);
      }
    } catch (error) {
      console.error(`Error executing batch ${operation}:`, error);
      // Re-add failed operations to queue for retry
      if (batch.length < 10) { // Avoid infinite retry loops
        setTimeout(() => {
          batch.forEach(item => this.addToBatch(operation, item, 5000));
        }, 5000);
      }
    }
  }

  private static async batchInsertStoryViews(views: any[]): Promise<void> {
    if (views.length === 0) return;
    
    // Remove duplicates based on story_id and viewer_id
    const uniqueViews = views.filter((view, index, self) => 
      index === self.findIndex(v => v.story_id === view.story_id && v.viewer_id === view.viewer_id)
    );
    
    const { error } = await supabase
      .from('story_views')
      .insert(uniqueViews);
      
    if (error) {
      console.error('Batch story views insert error:', error);
      throw error;
    }
  }

  private static async batchInsertNotifications(notifications: any[]): Promise<void> {
    if (notifications.length === 0) return;
    
    const { error } = await supabase
      .from('notifications')
      .insert(notifications);
      
    if (error) {
      console.error('Batch notifications insert error:', error);
      throw error;
    }
  }

  private static async batchIncrementStoryViews(increments: any[]): Promise<void> {
    if (increments.length === 0) return;
    
    // Group by story_id and sum increments
    const grouped = increments.reduce((acc, item) => {
      acc[item.story_uuid] = (acc[item.story_uuid] || 0) + 1;
      return acc;
    }, {});

    // Execute increments
    for (const [storyId, count] of Object.entries(grouped)) {
      try {
        await supabase.rpc('increment_story_views', {
          story_uuid: storyId,
          viewer_uuid: null // Batch operation doesn't need viewer
        });
      } catch (error) {
        console.warn(`Failed to increment views for story ${storyId}:`, error);
      }
    }
  }

  // Get pending operations count
  static getPendingCount(): number {
    return Array.from(this.pendingOperations.values()).reduce((sum, batch) => sum + batch.length, 0);
  }

  // Force execute all pending batches
  static async flushAll(): Promise<void> {
    const operations = Array.from(this.pendingOperations.keys());
    await Promise.all(operations.map(op => this.executeBatch(op)));
  }
}

// Enhanced optimized query builder with error handling
export class OptimizedQueries {
  private static cache = CacheManager.getInstance();

  static async getStoriesWithProfiles(userId?: string): Promise<any[]> {
    const cacheKey = `stories_with_profiles_${userId || 'anonymous'}`;
    
    // Check cache first
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    try {
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

      const result = data || [];
      
      // Cache the result
      this.cache.set(cacheKey, result, 30000); // 30 seconds
      
      return result;
    } catch (error) {
      console.error('Error fetching stories with profiles:', error);
      return [];
    }
  }

  static async getViewedStories(userId: string, storyIds: string[]): Promise<string[]> {
    if (!userId || storyIds.length === 0) return [];

    const cacheKey = `viewed_stories_${userId}`;
    
    // Check cache first
    const cached = this.cache.get(cacheKey);
    if (cached && cached instanceof Set) {
      return storyIds.filter(id => cached.has(id));
    }

    try {
      const { data, error } = await supabase
        .from('story_views')
        .select('story_id')
        .eq('viewer_id', userId)
        .in('story_id', storyIds);

      if (error) throw error;

      const viewedSet = new Set(data?.map(v => v.story_id) || []);
      
      // Cache the result
      this.cache.set(cacheKey, viewedSet, 60000); // 1 minute
      
      return data?.map(v => v.story_id) || [];
    } catch (error) {
      console.error('Error fetching viewed stories:', error);
      return [];
    }
  }

  static async getUserProfile(userId: string): Promise<any> {
    const cacheKey = `user_profile_${userId}`;
    
    // Check cache first
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) throw error;

      // Cache the result
      this.cache.set(cacheKey, data, 300000); // 5 minutes
      
      return data;
    } catch (error) {
      console.error('Error fetching user profile:', error);
      return null;
    }
  }

  // Batch fetch multiple user profiles
  static async getUserProfiles(userIds: string[]): Promise<any[]> {
    if (userIds.length === 0) return [];

    const cacheKey = `user_profiles_${userIds.sort().join(',')}`;
    
    // Check cache first
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .in('id', userIds);

      if (error) throw error;

      const result = data || [];
      
      // Cache individual profiles
      result.forEach(profile => {
        this.cache.set(`user_profile_${profile.id}`, profile, 300000);
      });
      
      // Cache the batch result
      this.cache.set(cacheKey, result, 300000);
      
      return result;
    } catch (error) {
      console.error('Error fetching user profiles:', error);
      return [];
    }
  }
}

// Enhanced background sync for offline support
export class BackgroundSync {
  private static syncQueue: any[] = [];
  private static isOnline = navigator.onLine;
  private static syncInProgress = false;
  private static maxRetries = 3;

  static init(): void {
    window.addEventListener('online', this.handleOnline.bind(this));
    window.addEventListener('offline', this.handleOffline.bind(this));
    
    // Process queue periodically
    setInterval(() => {
      if (this.isOnline && !this.syncInProgress) {
        this.processQueue();
      }
    }, 30000); // Every 30 seconds
  }

  static addToQueue(operation: any): void {
    this.syncQueue.push({
      ...operation,
      timestamp: Date.now(),
      retries: 0
    });
    
    if (this.isOnline && !this.syncInProgress) {
      this.processQueue();
    }
  }

  private static handleOnline(): void {
    this.isOnline = true;
    console.log('Back online, processing sync queue...');
    this.processQueue();
  }

  private static handleOffline(): void {
    this.isOnline = false;
    console.log('Gone offline, queuing operations...');
  }

  private static async processQueue(): Promise<void> {
    if (!this.isOnline || this.syncQueue.length === 0 || this.syncInProgress) return;

    this.syncInProgress = true;
    const operations = [...this.syncQueue];
    this.syncQueue = [];

    for (const operation of operations) {
      try {
        await this.executeOperation(operation);
      } catch (error) {
        console.error('Background sync error:', error);
        
        // Retry failed operations
        if (operation.retries < this.maxRetries) {
          operation.retries++;
          this.syncQueue.push(operation);
        } else {
          console.error('Max retries reached for operation:', operation);
        }
      }
    }

    this.syncInProgress = false;
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
      case 'notification':
        await supabase
          .from('notifications')
          .insert(operation.data);
        break;
      default:
        console.warn(`Unknown sync operation: ${operation.type}`);
    }
  }

  // Get queue status
  static getQueueStatus(): { pending: number; online: boolean; syncing: boolean } {
    return {
      pending: this.syncQueue.length,
      online: this.isOnline,
      syncing: this.syncInProgress
    };
  }

  // Force sync all pending operations
  static async forcSync(): Promise<void> {
    if (this.isOnline) {
      await this.processQueue();
    }
  }
}

// Enhanced error handling and retry logic
export class ErrorHandler {
  private static retryDelays = [1000, 2000, 5000]; // Progressive delays

  static async withRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    context: string = 'operation'
  ): Promise<T> {
    let lastError: Error;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        console.warn(`${context} failed (attempt ${attempt + 1}/${maxRetries + 1}):`, error);

        if (attempt < maxRetries) {
          const delay = this.retryDelays[Math.min(attempt, this.retryDelays.length - 1)];
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError!;
  }

  static isNetworkError(error: any): boolean {
    return error?.message?.includes('fetch') || 
           error?.message?.includes('network') ||
           error?.code === 'NETWORK_ERROR';
  }

  static isTemporaryError(error: any): boolean {
    const temporaryCodes = ['PGRST301', 'PGRST302', '429', '503', '504'];
    return temporaryCodes.some(code => error?.code?.includes(code));
  }
}

// Initialize background sync
BackgroundSync.init();

// Global cleanup on page unload
window.addEventListener('beforeunload', () => {
  BatchOperations.flushAll();
  BackgroundSync.forcSync();
  CacheManager.getInstance().destroy();
});