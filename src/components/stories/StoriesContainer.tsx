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
  viewed_by_user?: boolean;
}

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

  const fetchStories = useCallback(async () => {
    try {
      // First cleanup expired photos
      await supabase.rpc('cleanup_expired_story_photos');

      const { data, error } = await supabase
        .from('stories')
        .select(`
          *,
          profiles:user_id (
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
          acc[story.user_id] = story;
        }
        return acc;
      }, {});

      const storiesWithViews = Object.values(groupedStories || {});

      // Check which stories have been viewed by current user
      if (currentUser && storiesWithViews.length > 0) {
        const { data: viewData } = await supabase
          .from('story_views')
          .select('story_id')
          .eq('viewer_id', currentUser.id)
          .in('story_id', storiesWithViews.map(s => s.id));

        const viewedStoryIds = new Set(viewData?.map(v => v.story_id) || []);
        setViewedStories(viewedStoryIds);

        // Add viewed status to stories
        const storiesWithViewStatus = storiesWithViews.map(story => ({
          ...story,
          viewed_by_user: viewedStoryIds.has(story.id)
        }));

        setStories(storiesWithViewStatus);
      } else {
        setStories(storiesWithViews);
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
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();
      
      setCurrentUser(profile);
    }
  }, []);

  useEffect(() => {
    getCurrentUser();
  }, [getCurrentUser]);

  useEffect(() => {
    if (currentUser) {
      fetchStories();
      
      // Set up realtime subscription for stories with more granular updates
      const channel = supabase
        .channel('stories-realtime')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'stories'
          },
          (payload) => {
            console.log('Story change detected:', payload);
            // Optimistic update for better performance
            if (payload.eventType === 'INSERT') {
              fetchStories();
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
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'story_views'
          },
          (payload) => {
            if (payload.eventType === 'INSERT' && payload.new.viewer_id === currentUser.id) {
              setViewedStories(prev => new Set([...prev, payload.new.story_id]));
              setStories(prevStories =>
                prevStories.map(story =>
                  story.id === payload.new.story_id
                    ? { ...story, viewed_by_user: true }
                    : story
                )
              );
            }
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [currentUser, fetchStories]);

  const handleStoryClick = useCallback(async (story: Story) => {
    setSelectedStory(story);
    
    // Mark story as viewed using the new function
    if (story.user_id !== currentUser?.id && !story.viewed_by_user) {
      try {
        const { data, error } = await supabase.rpc('increment_story_views', {
          story_uuid: story.id,
          viewer_uuid: currentUser?.id
        });
        
        if (error) {
          console.error('Error tracking story view:', error);
        } else {
          // Update local state immediately
          setViewedStories(prev => new Set([...prev, story.id]));
          setStories(prevStories => 
            prevStories.map(s => 
              s.id === story.id 
                ? { ...s, views_count: data || s.views_count + 1, viewed_by_user: true }
                : s
            )
          );
        }
      } catch (error) {
        console.error('Error tracking story view:', error);
      }
    }
  }, [currentUser?.id]);

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
    fetchStories();
  }, [fetchStories]);

  // Get theme color for story borders based on current theme
  const getThemeColor = () => {
    const root = document.documentElement;
    
    // Check for theme color classes
    if (root.classList.contains('theme-blue')) {
      return '#3b82f6'; // blue-500
    } else if (root.classList.contains('theme-red')) {
      return '#ef4444'; // red-500
    } else if (root.classList.contains('theme-orange')) {
      return '#f97316'; // orange-500
    } else if (root.classList.contains('theme-purple')) {
      return '#a855f7'; // purple-500
    } else {
      // Default green theme
      return 'hsl(142, 76%, 36%)'; // social-green
    }
  };

  const themeColor = getThemeColor();

  // Create gradient for unseen stories
  const createStoryGradient = (color: string) => {
    return `linear-gradient(45deg, ${color}, ${color}dd, ${color}aa)`;
  };

  if (loading) {
    return (
      <div className="flex gap-2 p-3 overflow-x-auto">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex flex-col items-center gap-1 min-w-[60px]">
            <div className="w-12 h-12 rounded-full bg-muted animate-pulse" />
            <div className="w-8 h-2 bg-muted rounded animate-pulse" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <>
      <div className="flex gap-2 p-3 overflow-x-auto bg-background border-b">
        {/* Add Story Button */}
        <div className="flex flex-col items-center gap-1 min-w-[60px]">
          <div className="relative">
            <Avatar 
              className={`w-12 h-12 cursor-pointer transition-all duration-200 hover:scale-105 ${
                userStory 
                  ? userStory.viewed_by_user 
                    ? 'border-2 border-gray-300' 
                    : 'border-0 p-0.5'
                  : 'border-2 border-dashed border-social-green hover:border-social-light-green'
              }`}
              style={{
                background: userStory && !userStory.viewed_by_user 
                  ? createStoryGradient(themeColor)
                  : undefined
              }}
            >
              <div className={`${userStory && !userStory.viewed_by_user ? 'border-2 border-white rounded-full' : ''} w-full h-full`}>
                {currentUser?.avatar ? (
                  <AvatarImage 
                    src={currentUser.avatar} 
                    alt={currentUser.name} 
                    className={userStory && !userStory.viewed_by_user ? 'rounded-full' : ''}
                  />
                ) : (
                  <AvatarFallback className="bg-social-dark-green text-white font-pixelated text-xs">
                    {currentUser?.name?.substring(0, 2).toUpperCase() || 'U'}
                  </AvatarFallback>
                )}
              </div>
            </Avatar>
            <Button
              size="icon"
              onClick={handleAddStory}
              className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full bg-social-green hover:bg-social-light-green text-white transition-all duration-200 hover:scale-110"
            >
              <Plus className="h-2 w-2" />
            </Button>
          </div>
          <span className="text-xs font-pixelated text-center">
            {userStory ? 'Your Story' : 'Add Story'}
          </span>
        </div>

        {/* User's own story (if exists) */}
        {userStory && (
          <div
            className="flex flex-col items-center gap-1 min-w-[60px] cursor-pointer group"
            onClick={() => handleStoryClick(userStory)}
          >
            <div className="relative">
              <Avatar 
                className={`w-12 h-12 transition-all duration-200 group-hover:scale-105 ${
                  userStory.viewed_by_user 
                    ? 'border-2 border-gray-300' 
                    : 'border-0 p-0.5'
                }`}
                style={{
                  background: !userStory.viewed_by_user 
                    ? createStoryGradient(themeColor)
                    : undefined
                }}
              >
                <div className={`${!userStory.viewed_by_user ? 'border-2 border-white rounded-full' : ''} w-full h-full`}>
                  {userStory.profiles.avatar ? (
                    <AvatarImage 
                      src={userStory.profiles.avatar} 
                      alt={userStory.profiles.name}
                      className={!userStory.viewed_by_user ? 'rounded-full' : ''}
                    />
                  ) : (
                    <AvatarFallback className="bg-social-dark-green text-white font-pixelated text-xs">
                      {userStory.profiles.name.substring(0, 2).toUpperCase()}
                    </AvatarFallback>
                  )}
                </div>
              </Avatar>
            </div>
            <span className="text-xs font-pixelated text-center truncate max-w-[60px]">
              You
            </span>
          </div>
        )}

        {/* Other Stories with Instagram-style borders */}
        {otherStories.map((story) => (
          <div
            key={story.id}
            className="flex flex-col items-center gap-1 min-w-[60px] cursor-pointer group"
            onClick={() => handleStoryClick(story)}
          >
            <div className="relative">
              <Avatar 
                className={`w-12 h-12 transition-all duration-200 group-hover:scale-105 ${
                  story.viewed_by_user 
                    ? 'border-2 border-gray-300' 
                    : 'border-0 p-0.5'
                }`}
                style={{
                  background: !story.viewed_by_user 
                    ? createStoryGradient(themeColor)
                    : undefined
                }}
              >
                <div className={`${!story.viewed_by_user ? 'border-2 border-white rounded-full' : ''} w-full h-full`}>
                  {story.profiles.avatar ? (
                    <AvatarImage 
                      src={story.profiles.avatar} 
                      alt={story.profiles.name}
                      className={!story.viewed_by_user ? 'rounded-full' : ''}
                    />
                  ) : (
                    <AvatarFallback className="bg-social-dark-green text-white font-pixelated text-xs">
                      {story.profiles.name.substring(0, 2).toUpperCase()}
                    </AvatarFallback>
                  )}
                </div>
              </Avatar>
            </div>
            <span className="text-xs font-pixelated text-center truncate max-w-[60px]">
              {story.profiles.name.split(' ')[0]}
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