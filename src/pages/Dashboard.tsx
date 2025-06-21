import React, { useState, useRef, useEffect, useCallback } from 'react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { CommunityFeed } from '@/components/dashboard/CommunityFeed';
import { StoriesContainer } from '@/components/stories/StoriesContainer';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Send, Image as ImageIcon, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { ScrollArea } from '@/components/ui/scroll-area';

export function Dashboard() {
  const [postContent, setPostContent] = useState('');
  const [isPosting, setIsPosting] = useState(false);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [feedKey, setFeedKey] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const postBoxRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  // Optimized scroll to top handler
  const handleScrollToTop = useCallback(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
    }
  }, []);

  useEffect(() => {
    // Listen for scroll to top events
    window.addEventListener('scrollToTop', handleScrollToTop);
    (window as any).scrollDashboardToTop = handleScrollToTop;
    
    return () => {
      window.removeEventListener('scrollToTop', handleScrollToTop);
      delete (window as any).scrollDashboardToTop;
    };
  }, [handleScrollToTop]);

  const handleImageSelect = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast({
        variant: 'destructive',
        title: 'Invalid file type',
        description: 'Please select an image file'
      });
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        variant: 'destructive',
        title: 'File too large',
        description: 'Please select an image smaller than 5MB'
      });
      return;
    }

    setSelectedImage(file);
    setImagePreview(URL.createObjectURL(file));
  }, [toast]);

  const removeImage = useCallback(() => {
    if (imagePreview) {
      URL.revokeObjectURL(imagePreview);
    }
    setSelectedImage(null);
    setImagePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [imagePreview]);

  const handlePost = useCallback(async () => {
    if ((!postContent.trim() && !selectedImage) || isPosting) return;

    try {
      setIsPosting(true);
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: 'You must be logged in to post'
        });
        return;
      }

      let imageUrl = null;

      // Upload image if selected
      if (selectedImage) {
        const fileExt = selectedImage.name.split('.').pop();
        const fileName = `${user.id}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
          .from('posts')
          .upload(fileName, selectedImage);

        if (uploadError) throw uploadError;

        const { data } = supabase.storage
          .from('posts')
          .getPublicUrl(fileName);

        imageUrl = data.publicUrl;
      }

      const { error } = await supabase
        .from('posts')
        .insert({
          content: postContent.trim(),
          user_id: user.id,
          image_url: imageUrl
        });

      if (error) throw error;

      setPostContent('');
      removeImage();
      
      // Force feed refresh
      setFeedKey(prev => prev + 1);
      
      toast({
        title: 'Success',
        description: 'Your post has been shared!'
      });
    } catch (error) {
      console.error('Error creating post:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to create post'
      });
    } finally {
      setIsPosting(false);
    }
  }, [postContent, selectedImage, isPosting, toast, removeImage]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handlePost();
    }
  }, [handlePost]);

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto relative h-[calc(100vh-60px)] page-transition">
        {/* Stories Container - Fixed at top with error boundary */}
        <ErrorBoundary
          fallback={
            <div className="p-4 text-center">
              <p className="text-sm text-muted-foreground font-pixelated">
                Stories temporarily unavailable
              </p>
            </div>
          }
        >
          <StoriesContainer />
        </ErrorBoundary>
        
        {/* Scrollable Content Area */}
        <ScrollArea ref={scrollAreaRef} className="h-[calc(100vh-180px)] px-2 scroll-smooth">
          {/* Post Box */}
          <Card ref={postBoxRef} className="mb-4 card-gradient animate-fade-in shadow-lg border-2 border-social-green/10 card-entrance gpu-accelerated">
            <CardContent className="p-4">
              <div className="space-y-4">
                <Textarea
                  placeholder="What's on your mind? Share your thoughts..."
                  value={postContent}
                  onChange={(e) => setPostContent(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="w-full min-h-[80px] max-h-[160px] font-pixelated text-sm resize-none focus:ring-2 focus:ring-social-green/20 transition-all duration-300 input-focus"
                  disabled={isPosting}
                />
                
                {/* Image Preview */}
                {imagePreview && (
                  <div className="relative rounded-lg overflow-hidden border border-social-green/20 animate-fade-in">
                    <img
                      src={imagePreview}
                      alt="Preview"
                      className="max-h-60 w-full object-cover transition-all duration-300 hover:scale-[1.02] gpu-accelerated"
                    />
                    <Button
                      variant="destructive"
                      size="icon"
                      className="absolute top-2 right-2 h-7 w-7 rounded-full shadow-lg hover:scale-105 transition-transform duration-300 btn-hover"
                      onClick={removeImage}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                )}
                
                <div className="flex items-center justify-between gap-3 pt-1">
                  <div className="flex items-center gap-3">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleImageSelect}
                      className="hidden"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-9 font-pixelated text-xs hover:bg-social-green/5 transition-all duration-300 btn-hover micro-bounce"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isPosting}
                    >
                      <ImageIcon className="h-4 w-4 mr-2" />
                      Add Image
                    </Button>
                    <p className="text-xs text-muted-foreground font-pixelated hidden sm:block">
                      Press Enter to post
                    </p>
                  </div>
                  <Button
                    onClick={handlePost}
                    disabled={(!postContent.trim() && !selectedImage) || isPosting}
                    size="sm"
                    className="bg-social-green hover:bg-social-light-green text-white font-pixelated h-9 px-4 transition-all duration-300 btn-hover micro-bounce gpu-accelerated"
                  >
                    <Send className="h-4 w-4 mr-2" />
                    {isPosting ? 'Posting...' : 'Share Post'}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
          
          {/* Community Feed with error boundary */}
          <ErrorBoundary
            fallback={
              <Card className="text-center py-8">
                <CardContent>
                  <p className="font-pixelated text-sm text-muted-foreground">
                    Unable to load posts. Please refresh the page.
                  </p>
                </CardContent>
              </Card>
            }
          >
            <CommunityFeed key={feedKey} />
          </ErrorBoundary>
        </ScrollArea>
      </div>
    </DashboardLayout>
  );
}

export default React.memo(Dashboard);