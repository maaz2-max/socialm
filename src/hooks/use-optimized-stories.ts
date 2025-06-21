import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { CacheManager, OptimizedQueries, BatchOperations, BackgroundSync } from '@/utils/databaseOptimizations';
import { useToast } from '@/hooks/use-toast';

interface Story {
  id: string;
  user_id: string;
  image_url: string | null;
  photo_urls: string[] | null;
  photo_metadata: any[] | null;
  created_at: string;
  expires_at: string;
  views_count: number;
  profiles: {
    name: string;
    username: string;
    avatar: string | null;
  };
  viewed?: boolean;
}

export function useOptimizedStories(currentUser: any) {
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewedStories, setViewedStories] = useState<Set<string>>(new Set());
  const { toast } = useToast();
  const cache = CacheManager.getInstance();

  const fetchStories = useCallback(async () => {
    try {
      // Get stories with profiles
      const storiesData = await OptimizedQueries.getStoriesWithProfiles(currentUser?.id);
      
      // Group by user (keep latest story per user)
      const groupedStories = storiesData.reduce((acc: Record<string, Story>, story: any) => {
        if (!acc[story.user_id] || new Date(story.created_at) > new Date(acc[story.user_id].created_at)) {
          acc[story.user_id] = {
            ...story,
            profiles: story.profiles || {
              name: 'Unknown User',
              username: 'unknown',
              avatar: null
            }
          };
        }
        return acc;
      }, {});

      const storiesArray = Object.values(groupedStories);
      
      // Get viewed stories if user is logged in
      if (currentUser && storiesArray.length > 0) {
        const storyIds = storiesArray.map(s => s.id);
        const viewedIds = await OptimizedQueries.getViewedStories(currentUser.id, storyIds);
        const viewedSet = new Set(viewedIds);
        
        setViewedStories(viewedSet);
        
        // Mark stories as viewed
        const storiesWithViewStatus = storiesArray.map(story => ({
          ...story,
          viewed: viewedSet.has(story.id)
        }));
        
        setStories(storiesWithViewStatus);
      } else {
        setStories(storiesArray);
      }
    } catch (error) {
      console.error('Error fetching stories:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to load stories',
      });
    } finally {
      setLoading(false);
    }
  }, [currentUser, toast]);

  const markStoryAsViewed = useCallback(async (storyId: string) => {
    if (!currentUser || viewedStories.has(storyId)) return;

    // Optimistic update
    setStories(prevStories => 
      prevStories.map(s => 
        s.id === storyId 
          ? { ...s, views_count: s.views_count + 1, viewed: true }
          : s
      )
    );
    
    const newViewedStories = new Set([...viewedStories, storyId]);
    setViewedStories(newViewedStories);
    
    // Update cache
    cache.set(`viewed_stories_${currentUser.id}`, newViewedStories, 60000);

    // Background database updates
    BackgroundSync.addToQueue({
      type: 'story_view',
      data: {
        story_id: storyId,
        viewer_id: currentUser.id
      }
    });

    BackgroundSync.addToQueue({
      type: 'increment_views',
      data: {
        story_uuid: storyId,
        viewer_uuid: currentUser.id
      }
    });
  }, [currentUser, viewedStories, cache]);

  const refreshStories = useCallback(() => {
    // Clear cache and refetch
    cache.delete(`stories_with_profiles_${currentUser?.id || 'anonymous'}`);
    cache.delete(`viewed_stories_${currentUser?.id}`);
    fetchStories();
  }, [fetchStories, cache, currentUser]);

  useEffect(() => {
    fetchStories();
    
    // Set up realtime subscription
    const channel = supabase
      .channel('stories-optimized')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'stories'
      }, (payload) => {
        console.log('Story change detected:', payload);
        
        // Clear cache and refresh
        cache.delete(`stories_with_profiles_${currentUser?.id || 'anonymous'}`);
        
        if (payload.eventType === 'INSERT') {
          setTimeout(fetchStories, 500);
        } else if (payload.eventType === 'UPDATE') {
          setStories(prevStories => 
            prevStories.map(story => 
              story.id === payload.new.id 
                ? { ...story, ...payload.new }
                : story
            )
          );
        } else if (payload.eventType === 'DELETE') {
          setStories(prevStories => 
            prevStories.filter(story => story.id !== payload.old.id)
          );
        }
      })
      .subscribe();

    // Background refresh every 2 minutes
    const refreshInterval = setInterval(fetchStories, 120000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(refreshInterval);
    };
  }, [fetchStories, cache, currentUser]);

  return {
    stories,
    loading,
    viewedStories,
    markStoryAsViewed,
    refreshStories
  };
}