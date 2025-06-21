import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Plus, Circle } from 'lucide-react';
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
  viewed?: boolean;
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
      // First cleanup expired photos - with error handling
      try {
        await supabase.rpc('cleanup_expired_story_photos');
      } catch (error) {
        console.warn('Cleanup function not available or failed:', error);
        // Continue without cleanup if function doesn't exist
      }

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
        // Ensure profile data exists and is properly structured
        const profileData = story.profiles || {
          name: 'Unknown User',
          username: 'unknown',
          avatar: null
        };

        const storyWithProfile = {
          ...story,
          profiles: profileData
        };

        if (!acc[story.user_id] || new Date(story.created_at) > new Date(acc[story.user_id].created_at)) {
          acc[story.user_id] = storyWithProfile;
        }
        return acc;
      }, {});

      const storiesArray = Object.values(groupedStories || []);

      // Fetch viewed stories if user is logged in
      if (currentUser && storiesArray.length > 0) {
        const storyIds = storiesArray.map(s => s.id);
        
        try {
          const { data: viewData } = await supabase
            .from('story_views')
            .select('story_id')
            .eq('viewer_id', currentUser.id)
            .in('story_id', storyIds);

          const viewedIds = new Set(viewData?.map(v => v.story_id) || []);
          setViewedStories(viewedIds);

          // Mark stories as viewed
          const storiesWithViewStatus = storiesArray.map(story => ({
            ...story,
            viewed: viewedIds.has(story.id)
          }));

          setStories(storiesWithViewStatus);
        } catch (viewError) {
          console.warn('Failed to fetch viewed stories:', viewError);
          setStories(storiesArray);
        }
      } else {
        setStories(storiesArray);
      }
    } catch (error) {
      console.error('Error fetching stories:', error);
      setStories([]);
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  const getCurrentUser = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single();
        
        setCurrentUser(data);
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
      fetchStories();
      
      // Set up realtime subscription
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
            fetchStories();
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
    
    // Mark story as viewed
    if (story.user_id !== currentUser?.id && !viewedStories.has(story.id)) {
      try {
        // Optimistic update
        setStories(prevStories => 
          prevStories.map(s => 
            s.id === story.id 
              ? { ...s, views_count: s.views_count + 1, viewed: true }
              : s
          )
        );
        
        setViewedStories(prev => new Set([...prev, story.id]));

        // Background database updates with error handling
        try {
          await Promise.all([
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
          ]);
        } catch (error) {
          console.warn('Failed to update story views:', error);
          // Continue without updating views if functions don't exist
        }
        
      } catch (error) {
        console.error('Error tracking story view:', error);
      }
    }
  }, [currentUser?.id, viewedStories]);

  const userStory = useMemo(() => {
    return stories.find(story => story.user_id === currentUser?.id);
  }, [stories, currentUser?.id]);

  // Enhanced sorting logic for other stories
  const sortedOtherStories = useMemo(() => {
    const otherStories = stories.filter(story => story.user_id !== currentUser?.id);
    
    // Sort stories: unviewed first (by most recent), then viewed (by most recent)
    return otherStories.sort((a, b) => {
      // First priority: unviewed stories come before viewed stories
      if (!a.viewed && b.viewed) return -1;
      if (a.viewed && !b.viewed) return 1;
      
      // Second priority: within each group (viewed/unviewed), sort by most recent first
      const dateA = new Date(a.created_at).getTime();
      const dateB = new Date(b.created_at).getTime();
      return dateB - dateA; // Most recent first
    });
  }, [stories, currentUser?.id]);

  const handleAddStory = useCallback(() => {
    setShowAddDialog(true);
  }, []);

  const handleStoryAdded = useCallback(() => {
    fetchStories();
  }, [fetchStories]);

  if (loading) {
    return (
      <div className="flex gap-2 p-3 overflow-x-auto story-container">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex flex-col items-center gap-1 min-w-[60px] story-item">
            <div className="w-12 h-12 rounded-full bg-muted story-shimmer" />
            <div className="w-8 h-2 bg-muted rounded story-shimmer" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <>
      <div className="flex gap-2 p-3 overflow-x-auto bg-background border-b story-container">
        {/* Add Story Button */}
        <div className="flex flex-col items-center gap-1 min-w-[60px] story-item">
          <div className="relative story-avatar-container">
            <Avatar className={`w-12 h-12 border-2 cursor-pointer transition-all duration-300 story-avatar ${
              userStory 
                ? 'story-border-own hover:scale-105' 
                : 'story-border-add hover:scale-105'
            }`}>
              {currentUser?.avatar ? (
                <AvatarImage 
                  src={currentUser.avatar} 
                  alt={currentUser.name} 
                  className="story-image"
                  onError={(e) => {
                    console.warn('Current user avatar failed to load');
                    e.currentTarget.style.display = 'none';
                  }}
                />
              ) : (
                <AvatarFallback className="story-fallback">
                  {currentUser?.name?.substring(0, 2).toUpperCase() || 'U'}
                </AvatarFallback>
              )}
            </Avatar>
            <Button
              size="icon"
              onClick={handleAddStory}
              className="story-add-btn absolute -bottom-1 -right-1 h-5 w-5 rounded-full bg-social-green hover:bg-social-light-green text-white transition-all duration-300 hover:scale-110"
            >
              <Plus className="h-2 w-2" />
            </Button>
          </div>
          <span className="story-label text-xs font-pixelated text-center">
            {userStory ? 'Your Story' : 'Add Story'}
          </span>
        </div>

        {/* User's own story (if exists) - Always show first after add button */}
        {userStory && (
          <div
            className="flex flex-col items-center gap-1 min-w-[60px] cursor-pointer group story-item"
            onClick={() => handleStoryClick(userStory)}
          >
            <div className="relative story-avatar-container">
              <Avatar className="w-12 h-12 border-2 story-border-own transition-all duration-300 group-hover:scale-105 story-avatar">
                {userStory.profiles?.avatar ? (
                  <AvatarImage 
                    src={userStory.profiles.avatar} 
                    alt={userStory.profiles.name} 
                    className="story-image"
                    onError={(e) => {
                      console.warn('User story avatar failed to load');
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                ) : (
                  <AvatarFallback className="story-fallback">
                    {userStory.profiles?.name?.substring(0, 2).toUpperCase() || 'U'}
                  </AvatarFallback>
                )}
              </Avatar>
            </div>
            <span className="story-label text-xs font-pixelated text-center truncate max-w-[60px]">
              You
            </span>
          </div>
        )}

        {/* Other Stories - Sorted by viewed status and recency */}
        {sortedOtherStories.map((story, index) => (
          <div
            key={story.id}
            className="flex flex-col items-center gap-1 min-w-[60px] cursor-pointer group story-item"
            onClick={() => handleStoryClick(story)}
            style={{ 
              animationDelay: `${index * 0.1}s`,
              opacity: story.viewed ? 0.7 : 1 
            }}
          >
            <div className="relative story-avatar-container">
              <Avatar className={`w-12 h-12 border-2 hover:scale-105 transition-all duration-300 group-hover:shadow-lg story-avatar ${
                story.viewed ? 'story-border-viewed' : 'story-border-unviewed'
              }`}>
                {story.profiles?.avatar ? (
                  <AvatarImage 
                    src={story.profiles.avatar} 
                    alt={story.profiles.name} 
                    className="story-image"
                    onError={(e) => {
                      console.warn('Story avatar failed to load for user:', story.profiles?.name);
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                ) : (
                  <AvatarFallback className="story-fallback">
                    {story.profiles?.name?.substring(0, 2).toUpperCase() || 'U'}
                  </AvatarFallback>
                )}
              </Avatar>
              
              {/* Simple dot indicators - No animations */}
              <div className="absolute -top-1 -right-1">
                {!story.viewed ? (
                  <Circle className="h-3 w-3 fill-social-green text-social-green" />
                ) : (
                  <Circle className="h-3 w-3 fill-gray-400 text-gray-400 opacity-60" />
                )}
              </div>
            </div>
            <span className={`story-label text-xs font-pixelated text-center truncate max-w-[60px] ${
              story.viewed ? 'text-muted-foreground' : 'text-foreground'
            }`}>
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