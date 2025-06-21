import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useIntersectionObserver } from '@/hooks/use-intersection-observer';
import { cn } from '@/lib/utils';

interface OptimizedImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  alt: string;
  fallbackSrc?: string;
  lazy?: boolean;
  quality?: number;
  priority?: boolean;
  onLoadComplete?: () => void;
}

export function OptimizedImage({
  src,
  alt,
  fallbackSrc,
  lazy = true,
  quality = 75,
  priority = false,
  onLoadComplete,
  className,
  ...props
}: OptimizedImageProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [currentSrc, setCurrentSrc] = useState<string | null>(priority ? src : null);
  const imgRef = useRef<HTMLImageElement>(null);
  
  const { elementRef, isIntersecting } = useIntersectionObserver({
    threshold: 0.1,
    triggerOnce: true
  });

  // Load image when it comes into view (or immediately if priority)
  useEffect(() => {
    if ((isIntersecting || priority) && !currentSrc && !hasError) {
      setCurrentSrc(src);
    }
  }, [isIntersecting, priority, src, currentSrc, hasError]);

  const handleLoad = useCallback(() => {
    setIsLoaded(true);
    onLoadComplete?.();
  }, [onLoadComplete]);

  const handleError = useCallback(() => {
    setHasError(true);
    if (fallbackSrc && currentSrc !== fallbackSrc) {
      setCurrentSrc(fallbackSrc);
      setHasError(false);
    }
  }, [fallbackSrc, currentSrc]);

  // Preload critical images
  useEffect(() => {
    if (priority && src) {
      const link = document.createElement('link');
      link.rel = 'preload';
      link.as = 'image';
      link.href = src;
      document.head.appendChild(link);
      
      return () => {
        document.head.removeChild(link);
      };
    }
  }, [priority, src]);

  return (
    <div
      ref={elementRef}
      className={cn(
        'relative overflow-hidden',
        !isLoaded && 'bg-muted animate-pulse',
        className
      )}
    >
      {currentSrc && (
        <img
          ref={imgRef}
          src={currentSrc}
          alt={alt}
          onLoad={handleLoad}
          onError={handleError}
          className={cn(
            'transition-opacity duration-300',
            isLoaded ? 'opacity-100' : 'opacity-0',
            className
          )}
          loading={lazy && !priority ? 'lazy' : 'eager'}
          decoding="async"
          {...props}
        />
      )}
      
      {!isLoaded && !hasError && (
        <div className="absolute inset-0 bg-gradient-to-r from-muted via-muted-foreground/10 to-muted animate-pulse" />
      )}
      
      {hasError && !fallbackSrc && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted text-muted-foreground text-xs">
          Failed to load
        </div>
      )}
    </div>
  );
}