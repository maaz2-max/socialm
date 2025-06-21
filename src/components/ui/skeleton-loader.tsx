import React from 'react';
import { cn } from '@/lib/utils';

interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'circular' | 'rectangular';
  animation?: 'pulse' | 'wave' | 'none';
  width?: string | number;
  height?: string | number;
}

export function Skeleton({
  className,
  variant = 'rectangular',
  animation = 'pulse',
  width,
  height,
  ...props
}: SkeletonProps) {
  return (
    <div
      className={cn(
        'bg-muted',
        {
          'rounded-full': variant === 'circular',
          'rounded': variant === 'rectangular',
          'rounded-sm': variant === 'text',
          'animate-pulse': animation === 'pulse',
          'animate-wave': animation === 'wave',
        },
        className
      )}
      style={{
        width: variant === 'text' ? '100%' : width,
        height: variant === 'text' ? '1em' : height,
      }}
      {...props}
    />
  );
}

// Predefined skeleton components for common use cases
export function PostSkeleton() {
  return (
    <div className="space-y-3 p-4 border rounded-lg">
      <div className="flex items-center space-x-3">
        <Skeleton variant="circular" width={40} height={40} />
        <div className="space-y-2 flex-1">
          <Skeleton variant="text" width="30%" height={16} />
          <Skeleton variant="text" width="20%" height={12} />
        </div>
      </div>
      <Skeleton variant="text" width="100%" height={16} />
      <Skeleton variant="text" width="80%" height={16} />
      <Skeleton variant="rectangular" width="100%" height={200} />
    </div>
  );
}

export function StorySkeleton() {
  return (
    <div className="flex flex-col items-center space-y-2">
      <Skeleton variant="circular" width={48} height={48} />
      <Skeleton variant="text" width={32} height={12} />
    </div>
  );
}

export function CommentSkeleton() {
  return (
    <div className="flex space-x-2">
      <Skeleton variant="circular" width={24} height={24} />
      <div className="flex-1 space-y-1">
        <Skeleton variant="text" width="25%" height={12} />
        <Skeleton variant="text" width="90%" height={14} />
      </div>
    </div>
  );
}