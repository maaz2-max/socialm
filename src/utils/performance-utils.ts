// Performance optimization utilities
export class PerformanceUtils {
  private static cache = new Map<string, any>();
  private static observers = new Map<string, IntersectionObserver>();

  // Memoization with TTL
  static memoize<T extends (...args: any[]) => any>(
    fn: T,
    ttl: number = 300000 // 5 minutes default
  ): T {
    const cache = new Map<string, { value: any; timestamp: number }>();
    
    return ((...args: Parameters<T>) => {
      const key = JSON.stringify(args);
      const cached = cache.get(key);
      
      if (cached && Date.now() - cached.timestamp < ttl) {
        return cached.value;
      }
      
      const result = fn(...args);
      cache.set(key, { value: result, timestamp: Date.now() });
      
      // Cleanup old entries
      if (cache.size > 100) {
        const oldestKey = cache.keys().next().value;
        cache.delete(oldestKey);
      }
      
      return result;
    }) as T;
  }

  // Debounce function calls
  static debounce<T extends (...args: any[]) => any>(
    func: T,
    wait: number
  ): T {
    let timeout: NodeJS.Timeout;
    
    return ((...args: Parameters<T>) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => func(...args), wait);
    }) as T;
  }

  // Throttle function calls
  static throttle<T extends (...args: any[]) => any>(
    func: T,
    limit: number
  ): T {
    let inThrottle: boolean;
    
    return ((...args: Parameters<T>) => {
      if (!inThrottle) {
        func(...args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    }) as T;
  }

  // Lazy load images with intersection observer
  static lazyLoadImage(img: HTMLImageElement, src: string): void {
    const observerId = `img-${Math.random().toString(36).substr(2, 9)}`;
    
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const target = entry.target as HTMLImageElement;
            target.src = src;
            target.classList.remove('lazy');
            observer.unobserve(target);
            this.observers.delete(observerId);
          }
        });
      },
      { threshold: 0.1 }
    );
    
    this.observers.set(observerId, observer);
    observer.observe(img);
  }

  // Preload critical resources
  static preloadResource(href: string, as: string): void {
    const link = document.createElement('link');
    link.rel = 'preload';
    link.href = href;
    link.as = as;
    document.head.appendChild(link);
  }

  // Batch DOM updates
  static batchDOMUpdates(updates: (() => void)[]): void {
    requestAnimationFrame(() => {
      updates.forEach(update => update());
    });
  }

  // Memory usage monitoring
  static getMemoryUsage(): { used: number; total: number } | null {
    if ('memory' in performance) {
      const memory = (performance as any).memory;
      return {
        used: Math.round(memory.usedJSHeapSize / 1024 / 1024),
        total: Math.round(memory.totalJSHeapSize / 1024 / 1024)
      };
    }
    return null;
  }

  // Cleanup observers
  static cleanup(): void {
    this.observers.forEach(observer => observer.disconnect());
    this.observers.clear();
    this.cache.clear();
  }
}

// Initialize performance monitoring
if (typeof window !== 'undefined') {
  // Monitor long tasks
  if ('PerformanceObserver' in window) {
    try {
      const observer = new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => {
          if (entry.duration > 50) {
            console.warn(`Long task detected: ${entry.duration}ms`);
          }
        });
      });
      observer.observe({ entryTypes: ['longtask'] });
    } catch (e) {
      // PerformanceObserver not supported
    }
  }

  // Cleanup on page unload
  window.addEventListener('beforeunload', () => {
    PerformanceUtils.cleanup();
  });
}