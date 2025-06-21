import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Plus, Circle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { StoryViewer } from './StoryViewer';
import { AddStoryDialog } from './AddStoryDialog';
import { ProfilePictureViewer } from './ProfilePictureViewer';
import { OptimizedImage } from '@/components/ui/optimized-image';
import { useOptimizedStories } from '@/hooks/use-optimized-stories';
import { usePerformanceMonitor } from '@/hooks/use-performance-monitor';
import { StorySkeleton } from '@/components/ui/skeleton-loader';

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

// Memoized story item component for better performance
const StoryItem = React.memo(({ 
  story, 
  isCurrentUser, 
  onClick,
  isAddButton = false,
  onAddClick
}: {
  story?: Story;
  isCurrentUser?: boolean;
  onClick?: () => void;
  isAddButton?: boolean;
  onAddClick?: () => void;
}) => {
  if (isAddButton) {
    return (
      <div className="flex flex-col items-center gap-1 min-w-[60px] story-item">
        <div className="relative story-avatar-container">
          <Avatar className="w-12 h-12 border-2 story-border-add cursor-pointer transition-all duration-300 hover:scale-105 story-avatar">
            {story?.profiles?.avatar ? (
              <OptimizedImage 
                src={story.profiles.avatar} 
                alt={story.profiles.name || 'User'} 
                className="story-image"
                lazy={false}
                priority={true}
              />
            ) : (
              <AvatarFallback className="story-fallback">
                {story?.profiles?.name?.substring(0, 2).toUpperCase() || 'U'}
              </AvatarFallback>
            )}
          </Avatar>
          <Button
            size="icon"
            onClick={onAddClick}
            className="story-add-btn absolute -bottom-1 -right-1 h-5 w-5 rounded-full bg-social-green hover:bg-social-light-green text-white transition-all duration-300 hover:scale-110"
          >
            <Plus className="h-2 w-2" />
          </Button>
        </div>
        <span className="story-label text-xs font-pixelated text-center">
          {isCurrentUser ? 'Your Story' : 'Add Story'}
        </span>
      </div>
    );
  }

  if (!story) return null;

  return (
    <div
      className="flex flex-col items-center gap-1 min-w-[60px] cursor-pointer group story-item"
      onClick={onClick}
    >
      <div className="relative story-avatar-container">
        <Avatar className={`w-12 h-12 border-2 transition-all duration-300 group-hover:scale-105 story-avatar ${
          isCurrentUser 
            ? 'story-border-own' 
            : story.viewed 
              ? 'story-border-viewed' 
              : 'story-border-unviewed'
        }`}>
          {story.profiles?.avatar ? (
            <OptimizedImage 
              src={story.profiles.avatar} 
              alt={story.profiles.name || 'User'} 
              className="story-image"
              lazy={true}
            />
          ) : (
            <AvatarFallback className="story-fallback">
              {story.profiles?.name?.substring(0, 2).toUpperCase() || 'U'}
            </AvatarFallback>
          )}
        </Avatar>
        
        {/* Simple dot indicators - No animations */}
        {!isCurrentUser && (
          <div className="absolute -top-1 -right-1">
            {!story.viewed ? (
              <Circle className="h-3 w-3 fill-social-green text-social-green" />
            ) : (
              <Circle className="h-3 w-3 fill-gray-400 text-gray-400 opacity-60" />
            )}
          </div>
        )}
      </div>
      <span className={`story-label text-xs font-pixelated text-center truncate max-w-[60px] ${
        !isCurrentUser && story.viewed ? 'text-muted-foreground' : 'text-foreground'
      }`}>
        {isCurrentUser 
          ? 'You' 
          : story.profiles?.name?.split(' ')[0] || 'User'}
      </span>
    </div>
  );
});

StoryItem.displayName = 'StoryItem';

const OptimizedStoriesContainer = React.memo(() => {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [selectedStory, setSelectedStory] = useState<Story | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showProfilePicture, setShowProfilePicture] = useState<{
    show: boolean;
    user: any;
    showConfirm: boolean;
  }>({ show: false, user: null, showConfirm: false });
  const { toast } = useToast();
  const { measureRenderTime } = usePerformanceMonitor();

  // Get current user
  useEffect(() => {
    const getCurrentUser = async () => {
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
    };
    
    getCurrentUser();
  }, []);

  // Use optimized stories hook
  const { 
    stories, 
    loading, 
    error, 
    markStoryAsViewed,
    refreshStories
  } = useOptimizedStories(currentUser);

  // Performance monitoring
  useEffect(() => {
    const cleanup = measureRenderTime('StoriesContainer');
    return cleanup;
  }, [measureRenderTime]);

  const handleStoryClick = useCallback((story: Story) => {
    setSelectedStory(story);
    
    // Mark story as viewed
    if (story.user_id !== currentUser?.id && !story.viewed) {
      markStoryAsViewed(story.id);
    }
  }, [currentUser, markStoryAsViewed]);

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
    refreshStories();
  }, [refreshStories]);

  if (loading) {
    return (
      <div className="flex gap-2 p-3 overflow-x-auto story-container">
        {[...Array(5)].map((_, i) => (
          <StorySkeleton key={i} />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex justify-center items-center p-3 border-b">
        <p className="text-xs text-muted-foreground font-pixelated">
          Unable to load stories. Please try again later.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="flex gap-2 p-3 overflow-x-auto bg-background border-b story-container">
        {/* Add Story Button */}
        <StoryItem
          story={userStory}
          isCurrentUser={true}
          isAddButton={true}
          onAddClick={handleAddStory}
        />

        {/* User's own story (if exists) */}
        {userStory && (
          <StoryItem
            story={userStory}
            isCurrentUser={true}
            onClick={() => handleStoryClick(userStory)}
          />
        )}

        {/* Other Stories - Sorted by viewed status and recency */}
        {sortedOtherStories.map((story) => (
          <StoryItem
            key={story.id}
            story={story}
            onClick={() => handleStoryClick(story)}
          />
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

OptimizedStoriesContainer.displayName = 'OptimizedStoriesContainer';

export { OptimizedStoriesContainer };