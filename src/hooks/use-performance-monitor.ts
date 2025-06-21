import { useEffect, useCallback, useRef } from 'react';

interface PerformanceMetrics {
  renderTime: number;
  memoryUsage: number;
  networkLatency: number;
  cacheHitRate: number;
}

export function usePerformanceMonitor() {
  const metricsRef = useRef<PerformanceMetrics>({
    renderTime: 0,
    memoryUsage: 0,
    networkLatency: 0,
    cacheHitRate: 0
  });

  const measureRenderTime = useCallback((componentName: string) => {
    const startTime = performance.now();
    
    return () => {
      const endTime = performance.now();
      const renderTime = endTime - startTime;
      metricsRef.current.renderTime = renderTime;
      
      if (renderTime > 16) { // More than one frame
        console.warn(`Slow render detected in ${componentName}: ${renderTime.toFixed(2)}ms`);
      }
    };
  }, []);

  const measureMemoryUsage = useCallback(() => {
    if ('memory' in performance) {
      const memory = (performance as any).memory;
      metricsRef.current.memoryUsage = memory.usedJSHeapSize / 1024 / 1024; // MB
      
      if (memory.usedJSHeapSize > memory.jsHeapSizeLimit * 0.8) {
        console.warn('High memory usage detected');
      }
    }
  }, []);

  const measureNetworkLatency = useCallback(async (url: string) => {
    const startTime = performance.now();
    try {
      await fetch(url, { method: 'HEAD' });
      const endTime = performance.now();
      metricsRef.current.networkLatency = endTime - startTime;
    } catch (error) {
      console.warn('Network latency measurement failed:', error);
    }
  }, []);

  useEffect(() => {
    // Monitor performance every 30 seconds
    const interval = setInterval(() => {
      measureMemoryUsage();
    }, 30000);

    return () => clearInterval(interval);
  }, [measureMemoryUsage]);

  return {
    measureRenderTime,
    measureMemoryUsage,
    measureNetworkLatency,
    getMetrics: () => metricsRef.current
  };
}