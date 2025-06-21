import React, { useMemo } from 'react';
import { useVirtualScroll } from '@/hooks/use-virtual-scroll';
import { cn } from '@/lib/utils';

interface VirtualListProps<T> {
  items: T[];
  itemHeight: number;
  height: number;
  renderItem: (item: T, index: number) => React.ReactNode;
  className?: string;
  overscan?: number;
}

export function VirtualList<T>({
  items,
  itemHeight,
  height,
  renderItem,
  className,
  overscan = 5
}: VirtualListProps<T>) {
  const {
    visibleItems,
    totalHeight,
    offsetY,
    handleScroll,
    visibleRange
  } = useVirtualScroll(items, {
    itemHeight,
    containerHeight: height,
    overscan
  });

  const renderedItems = useMemo(() => {
    return visibleItems.map((item, index) => {
      const actualIndex = visibleRange.startIndex + index;
      return (
        <div
          key={actualIndex}
          style={{
            height: itemHeight,
            transform: `translateY(${actualIndex * itemHeight}px)`,
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0
          }}
        >
          {renderItem(item, actualIndex)}
        </div>
      );
    });
  }, [visibleItems, visibleRange.startIndex, itemHeight, renderItem]);

  return (
    <div
      className={cn('relative overflow-auto', className)}
      style={{ height }}
      onScroll={handleScroll}
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        <div style={{ transform: `translateY(${offsetY}px)` }}>
          {renderedItems}
        </div>
      </div>
    </div>
  );
}