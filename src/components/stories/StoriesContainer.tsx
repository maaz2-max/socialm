import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { StoryViewer } from './StoryViewer';
import { AddStoryDialog } from './AddStoryDialog';
import { ProfilePictureViewer } from './ProfilePictureViewer';

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
  viewed?: boolean; // Track if current user has viewed this story
}

// Local cache for better performance
const storyCache = new Map();
const profileCache = new Map();
const viewCache = new Map();

const StoriesContainer = React.memo(() => {
  const [stories, setStories] = useState<Story[]>([]);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [selectedStory, setSelectedStory] = useState<Story | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showProfilePicture, setShowProfilePicture] = useState<{
    show: boolean;
    user: any;
    showConfirm: boolean;
  }>({ show: false, user: null, showConfirm: false });
  const [loading, setLoading] = useState(true);
  const [viewedStories, setViewedStories] = useState<Set<string>>(new Set());
  const { toast } = useToast();

  // Optimized batch fetch with caching
  const fetchStoriesOptimized = useCallback(async () => {
    try {
      // Check cache first
      const cacheKey = `stories_${currentUser?.id || 'anonymous'}`;
      const cached = storyCache.get(cacheKey);
      
      if (cached && Date.now() - cached.timestamp < 30000) { // 30 second cache
        setStories(cached.data);
        setLoading(false);
        return;
      }

      // Cleanup expired photos (run in background) - Fixed RPC call
      try {
        await supabase.rpc('cleanup_expired_story_photos');
      } catch (error) {
        console.error('Error cleaning up expired stories:', error);
      }

      // Fetch stories with profiles in single query
      const { data, error } = await supabase
        .from('stories')
        .select(`
          id,
          user_id,
          image_url,
          photo_urls,
          photo_metadata,
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

      // Group stories by user and keep only the latest story per user
      const groupedStories = data?.reduce((acc: Record<string, Story>, story: any) => {
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

      const storiesArray = Object.values(groupedStories || []);
      
      // Batch fetch viewed stories if user is logged in
      if (currentUser && storiesArray.length > 0) {
        const storyIds = storiesArray.map(s => s.id);
        
        // Check cache for viewed stories
        const viewCacheKey = `views_${currentUser.id}`;
        let viewedIds = new Set();
        
        const cachedViews = viewCache.get(viewCacheKey);
        if (cachedViews && Date.now() - cachedViews.timestamp < 60000) { // 1 minute cache
          viewedIds = cachedViews.data;
        } else {
          // Fetch from database
          const { data: viewData } = await supabase
            .from('story_views')
            .select('story_id')
            .eq('viewer_id', currentUser.id)
            .in('story_id', storyIds);

          viewedIds = new Set(viewData?.map(v => v.story_id) || []);
          
          // Cache the results
          viewCache.set(viewCacheKey, {
            data: viewedIds,
            timestamp: Date.now()
          });
        }

        setViewedStories(viewedIds);

        // Mark stories as viewed
        const storiesWithViewStatus = storiesArray.map(story => ({
          ...story,
          viewed: viewedIds.has(story.id)
        }));

        // Cache the results
        storyCache.set(cacheKey, {
          data: storiesWithViewStatus,
          timestamp: Date.now()
        });

        setStories(storiesWithViewStatus);
      } else {
        // Cache the results for anonymous users
        storyCache.set(cacheKey, {
          data: storiesArray,
          timestamp: Date.now()
        });
        
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
  }, [toast, currentUser]);

  const getCurrentUser = useCallback(async () => {
    try {
      // Check cache first
      const cached = profileCache.get('currentUser');
      if (cached && Date.now() - cached.timestamp < 300000) { // 5 minute cache
        setCurrentUser(cached.data);
        return;
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single();
        
        if (profile) {
          // Cache the profile
          profileCache.set('currentUser', {
            data: profile,
            timestamp: Date.now()
          });
          setCurrentUser(profile);
        }
      }
    } catch (error) {
      console.error('Error fetching current user:', error);
    }
  }, []);

  useEffect(() => {
    getCurrentUser();
  }, [getCurrentUser]);

  useEffect(() => {
    if (currentUser) {
      fetchStoriesOptimized();
      
      // Set up optimized realtime subscription
      const channel = supabase
        .channel('stories-realtime-optimized')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'stories'
          },
          (payload) => {
            console.log('Story change detected:', payload);
            
            // Clear relevant caches
            const cacheKey = `stories_${currentUser?.id || 'anonymous'}`;
            storyCache.delete(cacheKey);
            
            // Optimistic update for better performance
            if (payload.eventType === 'INSERT') {
              // Fetch fresh data
              setTimeout(() => fetchStoriesOptimized(), 500);
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
          }
        )
        .subscribe();

      // Background refresh every 2 minutes
      const refreshInterval = setInterval(() => {
        fetchStoriesOptimized();
      }, 120000);

      return () => {
        supabase.removeChannel(channel);
        clearInterval(refreshInterval);
      };
    }
  }, [currentUser, fetchStoriesOptimized]);

  const handleStoryClick = useCallback(async (story: Story) => {
    setSelectedStory(story);
    
    // Mark story as viewed using optimized approach
    if (story.user_id !== currentUser?.id && !viewedStories.has(story.id)) {
      try {
        // Optimistic update first
        setStories(prevStories => 
          prevStories.map(s => 
            s.id === story.id 
              ? { ...s, views_count: s.views_count + 1, viewed: true }
              : s
          )
        );
        
        // Add to viewed stories set
        const newViewedStories = new Set([...viewedStories, story.id]);
        setViewedStories(newViewedStories);
        
        // Update cache
        const viewCacheKey = `views_${currentUser.id}`;
        viewCache.set(viewCacheKey, {
          data: newViewedStories,
          timestamp: Date.now()
        });

        // Background database updates (non-blocking)
        Promise.all([
          supabase.rpc('increment_story_views', {
            story_uuid: story.id,
            viewer_uuid: currentUser?.id
          }),
          supabase
            .from('story_views')
            .insert({
              story_id: story.id,
              viewer_id: currentUser?.id
            })
        ]).catch(error => {
          console.error('Error tracking story view:', error);
          // Revert optimistic update on error
          setStories(prevStories => 
            prevStories.map(s => 
              s.id === story.id 
                ? { ...s, views_count: s.views_count - 1, viewed: false }
                : s
            )
          );
        });
        
      } catch (error) {
        console.error('Error tracking story view:', error);
      }
    }
  }, [currentUser?.id, viewedStories]);

  const userStory = useMemo(() => {
    return stories.find(story => story.user_id === currentUser?.id);
  }, [stories, currentUser?.id]);

  const otherStories = useMemo(() => {
    return stories.filter(story => story.user_id !== currentUser?.id);
  }, [stories, currentUser?.id]);

  const handleAddStory = useCallback(() => {
    setShowAddDialog(true);
  }, []);

  const handleStoryAdded = useCallback(() => {
    // Clear caches and refresh
    const cacheKey = `stories_${currentUser?.id || 'anonymous'}`;
    storyCache.delete(cacheKey);
    fetchStoriesOptimized();
  }, [fetchStoriesOptimized, currentUser]);

  if (loading) {
    return (
      <div className="flex gap-3 p-4 overflow-x-auto">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex flex-col items-center gap-2 min-w-[70px]">
            <div className="w-16 h-16 rounded-full bg-muted animate-pulse story-shimmer" />
            <div className="w-12 h-3 bg-muted rounded animate-pulse" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <>
      <div className="flex gap-3 p-4 overflow-x-auto bg-background border-b story-container">
        {/* Add Story Button */}
        <div className="flex flex-col items-center gap-2 min-w-[70px] story-item">
          <div className="relative story-avatar-container">
            <Avatar className={`w-16 h-16 border-3 cursor-pointer transition-all duration-300 story-avatar ${
              userStory 
                ? 'story-border-own hover:scale-105 hover:shadow-lg' 
                : 'story-border-add hover:scale-105 hover:shadow-lg'
            }`}>
              {currentUser?.avatar ? (
                <AvatarImage 
                  src={currentUser.avatar} 
                  alt={currentUser.name} 
                  className="story-image"
                  loading="eager"
                />
              ) : (
                <AvatarFallback className="bg-social-dark-green text-white font-pixelated text-sm story-fallback">
                  {currentUser?.name?.substring(0, 2).toUpperCase() || 'U'}
                </AvatarFallback>
              )}
            </Avatar>
            <Button
              size="icon"
              onClick={handleAddStory}
              className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full bg-social-green hover:bg-social-light-green text-white transition-all duration-300 hover:scale-110 story-add-btn shadow-lg"
            >
              <Plus className="h-3 w-3" />
            </Button>
          </div>
          <span className="text-xs font-pixelated text-center story-label">
            {userStory ? 'Your Story' : 'Add Story'}
          </span>
        </div>

        {/* User's own story (if exists) */}
        {userStory && (
          <div
            className="flex flex-col items-center gap-2 min-w-[70px] cursor-pointer group story-item"
            onClick={() => handleStoryClick(userStory)}
          >
            <div className="relative story-avatar-container">
              <Avatar className="w-16 h-16 border-3 story-border-own hover:scale-105 transition-all duration-300 group-hover:shadow-lg story-avatar">
                {userStory.profiles?.avatar ? (
                  <AvatarImage 
                    src={userStory.profiles.avatar} 
                    alt={userStory.profiles.name} 
                    className="story-image"
                    loading="eager"
                  />
                ) : (
                  <AvatarFallback className="bg-social-dark-green text-white font-pixelated text-sm story-fallback">
                    {userStory.profiles?.name?.substring(0, 2).toUpperCase() || 'U'}
                  </AvatarFallback>
                )}
              </Avatar>
              <div className="absolute inset-0 rounded-full bg-gradient-to-r from-social-green to-social-blue opacity-10 story-overlay" />
            </div>
            <span className="text-xs font-pixelated text-center truncate max-w-[70px] story-label">
              You
            </span>
          </div>
        )}

        {/* Other Stories */}
        {otherStories.map((story) => (
          <div
            key={story.id}
            className="flex flex-col items-center gap-2 min-w-[70px] cursor-pointer group story-item"
            onClick={() => handleStoryClick(story)}
          >
            <div className="relative story-avatar-container">
              <Avatar className={`w-16 h-16 border-3 hover:scale-105 transition-all duration-300 group-hover:shadow-lg story-avatar ${
                story.viewed ? 'story-border-viewed' : 'story-border-unviewed'
              }`}>
                {story.profiles?.avatar ? (
                  <AvatarImage 
                    src={story.profiles.avatar} 
                    alt={story.profiles.name} 
                    className="story-image"
                    loading="eager"
                  />
                ) : (
                  <AvatarFallback className="bg-social-dark-green text-white font-pixelated text-sm story-fallback">
                    {story.profiles?.name?.substring(0, 2).toUpperCase() || 'U'}
                  </AvatarFallback>
                )}
              </Avatar>
              {!story.viewed && (
                <div className="absolute inset-0 rounded-full story-glow animate-pulse" />
              )}
            </div>
            <span className="text-xs font-pixelated text-center truncate max-w-[70px] story-label">
              {story.profiles?.name?.split(' ')[0] || 'User'}
            </span>
          </div>
        ))}
      </div>

      {/* Story Viewer */}
      {selectedStory && (
        <StoryViewer
          story={selectedStory}
          onClose={() => setSelectedStory(null)}
          currentUserId={currentUser?.id}
          onStoryUpdated={handleStoryAdded}
        />
      )}

      {/* Add Story Dialog */}
      <AddStoryDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        onStoryAdded={handleStoryAdded}
        currentUser={currentUser}
        existingStory={userStory}
      />

      {/* Profile Picture Viewer */}
      <ProfilePictureViewer
        show={showProfilePicture.show}
        showConfirm={showProfilePicture.showConfirm}
        user={showProfilePicture.user}
        onConfirm={() => setShowProfilePicture(prev => ({ 
          show: true, 
          user: prev.user, 
          showConfirm: false 
        }))}
        onClose={() => setShowProfilePicture({ show: false, user: null, showConfirm: false })}
      />
    </>
  );
});

StoriesContainer.displayName = 'StoriesContainer';

export { StoriesContainer };