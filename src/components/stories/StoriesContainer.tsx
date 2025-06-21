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

      const storiesArray = Object.values(groupedStories || {});
      
      // Check which stories have been viewed by current user
      if (currentUser) {
        const { data: viewData } = await supabase
          .from('story_views')
          .select('story_id')
          .eq('viewer_id', currentUser.id)
          .in('story_id', storiesArray.map(s => s.id));

        const viewedIds = new Set(viewData?.map(v => v.story_id) || []);
        setViewedStories(viewedIds);

        // Mark stories as viewed
        const storiesWithViewStatus = storiesArray.map(story => ({
          ...story,
          viewed: viewedIds.has(story.id)
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
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [currentUser, fetchStories]);

  const handleStoryClick = useCallback(async (story: Story) => {
    setSelectedStory(story);
    
    // Mark story as viewed using the new function
    if (story.user_id !== currentUser?.id && !viewedStories.has(story.id)) {
      try {
        const { data, error } = await supabase.rpc('increment_story_views', {
          story_uuid: story.id,
          viewer_uuid: currentUser?.id
        });
        
        if (error) {
          console.error('Error tracking story view:', error);
        } else {
          // Update local state with new view count and mark as viewed
          setStories(prevStories => 
            prevStories.map(s => 
              s.id === story.id 
                ? { ...s, views_count: data || s.views_count + 1, viewed: true }
                : s
            )
          );
          
          // Add to viewed stories set
          setViewedStories(prev => new Set([...prev, story.id]));

          // Record the view in story_views table
          await supabase
            .from('story_views')
            .insert({
              story_id: story.id,
              viewer_id: currentUser?.id
            });
        }
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
    fetchStories();
  }, [fetchStories]);

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
                <AvatarImage src={currentUser.avatar} alt={currentUser.name} className="story-image" />
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
                {userStory.profiles.avatar ? (
                  <AvatarImage src={userStory.profiles.avatar} alt={userStory.profiles.name} className="story-image" />
                ) : (
                  <AvatarFallback className="bg-social-dark-green text-white font-pixelated text-sm story-fallback">
                    {userStory.profiles.name.substring(0, 2).toUpperCase()}
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
                {story.profiles.avatar ? (
                  <AvatarImage src={story.profiles.avatar} alt={story.profiles.name} className="story-image" />
                ) : (
                  <AvatarFallback className="bg-social-dark-green text-white font-pixelated text-sm story-fallback">
                    {story.profiles.name.substring(0, 2).toUpperCase()}
                  </AvatarFallback>
                )}
              </Avatar>
              {!story.viewed && (
                <div className="absolute inset-0 rounded-full story-glow animate-pulse" />
              )}
            </div>
            <span className="text-xs font-pixelated text-center truncate max-w-[70px] story-label">
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