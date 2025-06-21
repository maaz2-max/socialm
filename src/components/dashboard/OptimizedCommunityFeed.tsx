import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Heart, MessageCircle, Send, MoreVertical, Edit, Trash2, ArrowUp, ChevronDown, ChevronUp } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { OptimizedImage } from '@/components/ui/optimized-image';
import { VirtualList } from '@/components/ui/virtual-list';
import { PostSkeleton, CommentSkeleton } from '@/components/ui/skeleton-loader';
import { useIntersectionObserver } from '@/hooks/use-intersection-observer';
import { useDebouncedCallback } from '@/hooks/use-debounced-callback';
import { usePerformanceMonitor } from '@/hooks/use-performance-monitor';
import { PerformanceUtils } from '@/utils/performance-utils';
import { ImageViewer } from '@/components/ui/image-viewer';
import { UserProfileDialog } from '@/components/user/UserProfileDialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useLocation } from 'react-router-dom';

interface Post {
  id: string;
  content: string;
  image_url: string | null;
  created_at: string;
  user_id: string;
  profiles: {
    name: string;
    username: string;
    avatar: string | null;
  };
  likes: { id: string; user_id: string }[];
  comments: {
    id: string;
    content: string;
    created_at: string;
    user_id: string;
    profiles: {
      name: string;
      avatar: string | null;
    };
  }[];
  _count?: {
    likes: number;
    comments: number;
  };
}

interface Comment {
  id: string;
  content: string;
  created_at: string;
  user_id: string;
  profiles: {
    name: string;
    avatar: string | null;
  };
}

// Memoized components for better performance
const MemoizedPostCard = React.memo(({ 
  post, 
  currentUser, 
  onLike, 
  onComment, 
  onEdit, 
  onDelete, 
  onDeleteComment,
  onUserClick,
  onImageClick,
  commentInputs,
  setCommentInputs,
  submittingComments,
  editingPost,
  setEditingPost,
  editContent,
  setEditContent,
  expandedComments,
  toggleComments,
  showCommentBox,
  toggleCommentBox,
  likingPosts
}: any) => {
  const { measureRenderTime } = usePerformanceMonitor();
  const { elementRef, isIntersecting } = useIntersectionObserver({
    threshold: 0.1,
    triggerOnce: true
  });

  useEffect(() => {
    const cleanup = measureRenderTime('PostCard');
    return cleanup;
  }, [measureRenderTime]);

  const isLiked = post.likes.some((like: any) => like.user_id === currentUser?.id);
  const isOwner = post.user_id === currentUser?.id;
  const hasComments = post.comments && post.comments.length > 0;
  const commentsExpanded = expandedComments[post.id];
  const commentBoxVisible = showCommentBox[post.id];

  if (!isIntersecting) {
    return (
      <div ref={elementRef} className="h-64">
        <PostSkeleton />
      </div>
    );
  }

  return (
    <Card 
      ref={elementRef}
      className="card-gradient animate-fade-in shadow-lg hover:shadow-xl transition-all duration-300 card-entrance gpu-accelerated content-visibility-auto"
    >
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Avatar 
              className="h-10 w-10 border-2 border-social-green/20 cursor-pointer hover:scale-105 transition-transform duration-300 story-avatar gpu-accelerated"
              onClick={() => onUserClick(post.user_id, post.profiles?.username)}
            >
              {post.profiles?.avatar ? (
                <OptimizedImage 
                  src={post.profiles.avatar} 
                  alt={post.profiles.name}
                  className="story-image w-full h-full object-cover"
                  lazy={true}
                />
              ) : (
                <AvatarFallback className="bg-social-dark-green text-white font-pixelated text-xs story-fallback">
                  {post.profiles?.name?.substring(0, 2).toUpperCase() || 'U'}
                </AvatarFallback>
              )}
            </Avatar>
            <div>
              <p 
                className="font-pixelated text-xs font-medium cursor-pointer hover:text-social-green transition-colors duration-300"
                onClick={() => onUserClick(post.user_id, post.profiles?.username)}
              >
                {post.profiles?.name}
              </p>
              <p 
                className="font-pixelated text-xs text-muted-foreground cursor-pointer hover:text-social-green transition-colors duration-300"
                onClick={() => onUserClick(post.user_id, post.profiles?.username)}
              >
                @{post.profiles?.username} • {formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}
              </p>
            </div>
          </div>
          
          {isOwner && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-muted/50 btn-hover">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => onEdit(post.id, post.content)}
                  className="font-pixelated text-xs"
                >
                  <Edit className="h-3 w-3 mr-2" />
                  Edit Post
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => onDelete(post.id)}
                  className="font-pixelated text-xs text-destructive"
                >
                  <Trash2 className="h-3 w-3 mr-2" />
                  Delete Post
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </CardHeader>
      
      <CardContent className="pt-0">
        {editingPost === post.id ? (
          <div className="space-y-3">
            <Textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="font-pixelated text-xs input-focus"
              placeholder="Edit your post..."
            />
            <div className="flex gap-2">
              <Button
                onClick={() => onEdit(post.id, editContent)}
                size="sm"
                className="bg-social-green hover:bg-social-light-green text-white font-pixelated text-xs btn-hover"
              >
                Save Changes
              </Button>
              <Button
                onClick={() => setEditingPost(null)}
                size="sm"
                variant="outline"
                className="font-pixelated text-xs btn-hover"
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <>
            <p className="font-pixelated text-xs mb-4 leading-relaxed whitespace-pre-wrap">
              {post.content}
            </p>
            
            {post.image_url && (
              <div className="mb-4">
                <OptimizedImage
                  src={post.image_url}
                  alt="Post image"
                  className="w-full max-h-96 object-cover rounded-lg cursor-pointer hover:opacity-90 transition-all duration-300 hover:scale-[1.02] gpu-accelerated"
                  onClick={() => onImageClick(post.image_url)}
                  lazy={true}
                />
              </div>
            )}
            
            <div className="flex items-center gap-4 pt-3 border-t border-border/50">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onLike(post.id)}
                disabled={likingPosts[post.id]}
                className={`font-pixelated text-xs hover:bg-social-magenta/10 transition-all duration-300 btn-hover micro-bounce ${
                  isLiked ? 'text-social-magenta' : 'text-muted-foreground'
                }`}
              >
                <Heart className={`h-4 w-4 mr-1 transition-all duration-300 ${isLiked ? 'fill-current scale-110' : ''}`} />
                {post._count?.likes || 0}
              </Button>
              
              <Button
                variant="ghost"
                size="sm"
                onClick={() => toggleCommentBox(post.id)}
                className="font-pixelated text-xs text-muted-foreground hover:bg-social-blue/10 transition-all duration-300 btn-hover micro-bounce"
              >
                <MessageCircle className="h-4 w-4 mr-1" />
                {post._count?.comments || 0}
              </Button>

              {hasComments && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => toggleComments(post.id)}
                  className="font-pixelated text-xs text-muted-foreground hover:bg-social-purple/10 transition-all duration-300 btn-hover micro-bounce"
                >
                  {commentsExpanded ? 
                    <ChevronUp className="h-4 w-4 mr-1" /> : 
                    <ChevronDown className="h-4 w-4 mr-1" />
                  }
                  {commentsExpanded ? 'Hide' : 'Show'} Comments
                </Button>
              )}
            </div>
            
            {/* Comments Section - Virtualized for performance */}
            {hasComments && commentsExpanded && (
              <div className="mt-4 space-y-3 border-t border-border/50 pt-4 animate-fade-in scroll-reveal">
                {post.comments.length > 10 ? (
                  <VirtualList
                    items={post.comments}
                    itemHeight={60}
                    height={300}
                    renderItem={(comment: Comment) => (
                      <div className="flex gap-2 p-2">
                        <Avatar 
                          className="h-6 w-6 cursor-pointer hover:scale-105 transition-transform duration-300 story-avatar"
                          onClick={() => onUserClick(comment.user_id, '')}
                        >
                          {comment.profiles?.avatar ? (
                            <OptimizedImage 
                              src={comment.profiles.avatar}
                              alt={comment.profiles.name}
                              className="story-image w-full h-full object-cover"
                              lazy={true}
                            />
                          ) : (
                            <AvatarFallback className="bg-social-dark-green text-white font-pixelated text-xs story-fallback">
                              {comment.profiles?.name?.substring(0, 2).toUpperCase() || 'U'}
                            </AvatarFallback>
                          )}
                        </Avatar>
                        <div className="flex-1 bg-muted/50 rounded-lg p-2 hover:bg-muted/70 transition-colors duration-300">
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <span 
                                className="font-pixelated text-xs font-medium cursor-pointer hover:text-social-green transition-colors duration-300"
                                onClick={() => onUserClick(comment.user_id, '')}
                              >
                                {comment.profiles?.name}
                              </span>
                              <span className="font-pixelated text-xs text-muted-foreground">
                                {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
                              </span>
                            </div>
                            
                            {comment.user_id === currentUser?.id && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => onDeleteComment(comment.id, post.id)}
                                className="h-5 w-5 hover:bg-destructive/10 hover:text-destructive transition-colors duration-300"
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                          <p className="font-pixelated text-xs leading-relaxed">
                            {comment.content}
                          </p>
                        </div>
                      </div>
                    )}
                  />
                ) : (
                  post.comments.map((comment: Comment) => (
                    <div key={comment.id} className="flex gap-2">
                      <Avatar 
                        className="h-6 w-6 cursor-pointer hover:scale-105 transition-transform duration-300 story-avatar"
                        onClick={() => onUserClick(comment.user_id, '')}
                      >
                        {comment.profiles?.avatar ? (
                          <OptimizedImage 
                            src={comment.profiles.avatar}
                            alt={comment.profiles.name}
                            className="story-image w-full h-full object-cover"
                            lazy={true}
                          />
                        ) : (
                          <AvatarFallback className="bg-social-dark-green text-white font-pixelated text-xs story-fallback">
                            {comment.profiles?.name?.substring(0, 2).toUpperCase() || 'U'}
                          </AvatarFallback>
                        )}
                      </Avatar>
                      <div className="flex-1 bg-muted/50 rounded-lg p-2 hover:bg-muted/70 transition-colors duration-300">
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <span 
                              className="font-pixelated text-xs font-medium cursor-pointer hover:text-social-green transition-colors duration-300"
                              onClick={() => onUserClick(comment.user_id, '')}
                            >
                              {comment.profiles?.name}
                            </span>
                            <span className="font-pixelated text-xs text-muted-foreground">
                              {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
                            </span>
                          </div>
                          
                          {comment.user_id === currentUser?.id && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => onDeleteComment(comment.id, post.id)}
                              className="h-5 w-5 hover:bg-destructive/10 hover:text-destructive transition-colors duration-300"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                        <p className="font-pixelated text-xs leading-relaxed">
                          {comment.content}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
            
            {/* Add Comment */}
            {commentBoxVisible && (
              <div className="mt-4 flex gap-2 animate-fade-in">
                <Textarea
                  placeholder="Write a comment..."
                  value={commentInputs[post.id] || ''}
                  onChange={(e) => setCommentInputs(prev => ({ ...prev, [post.id]: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      onComment(post.id);
                    }
                  }}
                  className="flex-1 min-h-[60px] max-h-[120px] font-pixelated text-xs resize-none input-focus"
                  disabled={submittingComments[post.id]}
                />
                <Button
                  onClick={() => onComment(post.id)}
                  disabled={!commentInputs[post.id]?.trim() || submittingComments[post.id]}
                  size="sm"
                  className="bg-social-green hover:bg-social-light-green text-white font-pixelated text-xs self-end btn-hover micro-bounce"
                >
                  <Send className="h-3 w-3" />
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
});

MemoizedPostCard.displayName = 'MemoizedPostCard';

export function OptimizedCommunityFeed() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [commentInputs, setCommentInputs] = useState<{ [key: string]: string }>({});
  const [submittingComments, setSubmittingComments] = useState<{ [key: string]: boolean }>({});
  const [editingPost, setEditingPost] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [deletePostId, setDeletePostId] = useState<string | null>(null);
  const [deleteCommentId, setDeleteCommentId] = useState<string | null>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [likingPosts, setLikingPosts] = useState<{ [key: string]: boolean }>({});
  const [expandedComments, setExpandedComments] = useState<{ [key: string]: boolean }>({});
  const [showCommentBox, setShowCommentBox] = useState<{ [key: string]: boolean }>({});
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [showUserDialog, setShowUserDialog] = useState(false);
  const feedRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const { toast } = useToast();
  const { measureRenderTime } = usePerformanceMonitor();

  const isHomePage = location.pathname === '/dashboard';

  // Memoized functions for better performance
  const toggleComments = useCallback((postId: string) => {
    setExpandedComments(prev => ({
      ...prev,
      [postId]: !prev[postId]
    }));
  }, []);

  const toggleCommentBox = useCallback((postId: string) => {
    setShowCommentBox(prev => ({
      ...prev,
      [postId]: !prev[postId]
    }));
    
    if (!showCommentBox[postId]) {
      setExpandedComments(prev => ({
        ...prev,
        [postId]: true
      }));
    }
  }, [showCommentBox]);

  const handleUserClick = useCallback(async (userId: string, username: string) => {
    try {
      const { data: userProfile, error } = await supabase
        .from('profiles')
        .select('id, name, username, avatar, created_at')
        .eq('id', userId)
        .single();

      if (error) throw error;

      if (userProfile) {
        setSelectedUser(userProfile);
        setShowUserDialog(true);
      }
    } catch (error) {
      console.error('Error fetching user profile:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to load user profile'
      });
    }
  }, [toast]);

  // Optimized fetch with caching
  const fetchPostsOptimized = useMemo(() => 
    PerformanceUtils.memoize(async () => {
      const { data, error } = await supabase
        .from('posts')
        .select(`
          id,
          content,
          image_url,
          created_at,
          user_id,
          profiles:user_id (
            name,
            username,
            avatar
          ),
          likes (
            id,
            user_id
          ),
          comments (
            id,
            content,
            created_at,
            user_id,
            profiles:user_id (
              name,
              avatar
            )
          )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      return data?.map(post => ({
        ...post,
        _count: {
          likes: post.likes?.length || 0,
          comments: post.comments?.length || 0
        }
      })) || [];
    }, 30000), // 30 second cache
    []
  );

  const fetchPosts = useCallback(async () => {
    try {
      setLoading(true);
      const formattedPosts = await fetchPostsOptimized();
      setPosts(formattedPosts);
    } catch (error) {
      console.error('Error fetching posts:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to load posts'
      });
    } finally {
      setLoading(false);
    }
  }, [fetchPostsOptimized, toast]);

  // Debounced background fetch
  const debouncedBackgroundFetch = useDebouncedCallback(async () => {
    try {
      const formattedPosts = await fetchPostsOptimized();
      setPosts(formattedPosts);
    } catch (error) {
      console.error('Background fetch error:', error);
    }
  }, 1000);

  const getCurrentUser = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    setCurrentUser(user);
  }, []);

  // Optimized handlers
  const handleLike = useCallback(async (postId: string) => {
    if (!currentUser || likingPosts[postId]) return;

    try {
      setLikingPosts(prev => ({ ...prev, [postId]: true }));

      const post = posts.find(p => p.id === postId);
      if (!post) return;

      const existingLike = post.likes.find(like => like.user_id === currentUser.id);

      if (existingLike) {
        const { error } = await supabase
          .from('likes')
          .delete()
          .eq('id', existingLike.id);

        if (error) throw error;

        setPosts(prevPosts =>
          prevPosts.map(p =>
            p.id === postId
              ? {
                  ...p,
                  likes: p.likes.filter(like => like.id !== existingLike.id),
                  _count: {
                    ...p._count,
                    likes: (p._count?.likes || 0) - 1
                  }
                }
              : p
          )
        );
      } else {
        const { data, error } = await supabase
          .from('likes')
          .insert({
            post_id: postId,
            user_id: currentUser.id
          })
          .select()
          .single();

        if (error) throw error;

        setPosts(prevPosts =>
          prevPosts.map(p =>
            p.id === postId
              ? {
                  ...p,
                  likes: [...p.likes, { id: data.id, user_id: currentUser.id }],
                  _count: {
                    ...p._count,
                    likes: (p._count?.likes || 0) + 1
                  }
                }
              : p
          )
        );
      }
    } catch (error) {
      console.error('Error toggling like:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to update like'
      });
    } finally {
      setLikingPosts(prev => ({ ...prev, [postId]: false }));
    }
  }, [currentUser, likingPosts, posts, toast]);

  const handleComment = useCallback(async (postId: string) => {
    const content = commentInputs[postId]?.trim();
    if (!content || !currentUser || submittingComments[postId]) return;

    try {
      setSubmittingComments(prev => ({ ...prev, [postId]: true }));

      const { data, error } = await supabase
        .from('comments')
        .insert({
          post_id: postId,
          user_id: currentUser.id,
          content
        })
        .select(`
          id,
          content,
          created_at,
          user_id,
          profiles:user_id (
            name,
            avatar
          )
        `)
        .single();

      if (error) throw error;

      setPosts(prevPosts =>
        prevPosts.map(post =>
          post.id === postId
            ? {
                ...post,
                comments: [...post.comments, data],
                _count: {
                  ...post._count,
                  likes: post._count?.likes || 0,
                  comments: (post._count?.comments || 0) + 1
                }
              }
            : post
        )
      );

      setCommentInputs(prev => ({ ...prev, [postId]: '' }));
      setExpandedComments(prev => ({ ...prev, [postId]: true }));
    } catch (error) {
      console.error('Error adding comment:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to add comment'
      });
    } finally {
      setSubmittingComments(prev => ({ ...prev, [postId]: false }));
    }
  }, [commentInputs, currentUser, submittingComments, toast]);

  const handleEditPost = useCallback(async (postId: string, content?: string) => {
    if (content === undefined) {
      // Start editing
      setEditingPost(postId);
      const post = posts.find(p => p.id === postId);
      setEditContent(post?.content || '');
      return;
    }

    if (!content.trim()) return;

    try {
      const { error } = await supabase
        .from('posts')
        .update({ content: content.trim() })
        .eq('id', postId);

      if (error) throw error;

      setPosts(prevPosts =>
        prevPosts.map(post =>
          post.id === postId
            ? { ...post, content: content.trim() }
            : post
        )
      );

      setEditingPost(null);
      setEditContent('');

      toast({
        title: 'Post updated',
        description: 'Your post has been updated successfully'
      });
    } catch (error) {
      console.error('Error updating post:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to update post'
      });
    }
  }, [posts, toast]);

  const handleDeletePost = useCallback(async (postId: string) => {
    try {
      const { error } = await supabase
        .from('posts')
        .delete()
        .eq('id', postId);

      if (error) throw error;

      setPosts(prevPosts => prevPosts.filter(post => post.id !== postId));
      setDeletePostId(null);

      toast({
        title: 'Post deleted',
        description: 'Your post has been deleted successfully'
      });
    } catch (error) {
      console.error('Error deleting post:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to delete post'
      });
    }
  }, [toast]);

  const handleDeleteComment = useCallback(async (commentId: string, postId: string) => {
    try {
      const { error } = await supabase
        .from('comments')
        .delete()
        .eq('id', commentId);

      if (error) throw error;

      setPosts(prevPosts =>
        prevPosts.map(post =>
          post.id === postId
            ? {
                ...post,
                comments: post.comments.filter(comment => comment.id !== commentId),
                _count: {
                  ...post._count,
                  likes: post._count?.likes || 0,
                  comments: Math.max(0, (post._count?.comments || 0) - 1)
                }
              }
            : post
        )
      );

      setDeleteCommentId(null);

      toast({
        title: 'Comment deleted',
        description: 'Your comment has been deleted successfully'
      });
    } catch (error) {
      console.error('Error deleting comment:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to delete comment'
      });
    }
  }, [toast]);

  const scrollToTop = useCallback(() => {
    if (feedRef.current) {
      feedRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, []);

  const handleScroll = useCallback(
    PerformanceUtils.throttle(() => {
      if (feedRef.current) {
        const { scrollTop } = feedRef.current;
        setShowScrollTop(scrollTop > 300);
      }
    }, 100),
    []
  );

  useEffect(() => {
    const cleanup = measureRenderTime('CommunityFeed');
    getCurrentUser();
    fetchPosts();

    // Set up real-time subscriptions
    const postsChannel = supabase
      .channel('posts-realtime')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'posts' }, 
        () => debouncedBackgroundFetch()
      )
      .subscribe();

    const likesChannel = supabase
      .channel('likes-realtime')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'likes' }, 
        () => debouncedBackgroundFetch()
      )
      .subscribe();

    const commentsChannel = supabase
      .channel('comments-realtime')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'comments' }, 
        () => debouncedBackgroundFetch()
      )
      .subscribe();

    return () => {
      cleanup();
      supabase.removeChannel(postsChannel);
      supabase.removeChannel(likesChannel);
      supabase.removeChannel(commentsChannel);
    };
  }, [getCurrentUser, fetchPosts, debouncedBackgroundFetch, measureRenderTime]);

  useEffect(() => {
    const feedElement = feedRef.current;
    if (feedElement) {
      feedElement.addEventListener('scroll', handleScroll);
      return () => feedElement.removeEventListener('scroll', handleScroll);
    }
  }, [handleScroll]);

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => (
          <PostSkeleton key={i} />
        ))}
      </div>
    );
  }

  return (
    <div ref={feedRef} className="space-y-4 relative scroll-container page-transition">
      {/* Scroll to Top Button */}
      {isHomePage && showScrollTop && (
        <Button
          onClick={scrollToTop}
          size="icon"
          className="fixed bottom-20 right-4 z-50 h-10 w-10 rounded-full bg-social-green hover:bg-social-light-green text-white shadow-lg hover:scale-110 transition-all duration-300 pixel-border pixel-shadow btn-hover gpu-accelerated"
        >
          <ArrowUp className="h-4 w-4" />
        </Button>
      )}

      {posts.length === 0 ? (
        <Card className="text-center py-12 card-entrance">
          <CardContent>
            <MessageCircle className="h-16 w-16 text-muted-foreground mx-auto mb-4 animate-float" />
            <h3 className="font-pixelated text-sm font-medium mb-2">No posts yet</h3>
            <p className="font-pixelated text-xs text-muted-foreground">
              Be the first to share something with the community!
            </p>
          </CardContent>
        </Card>
      ) : (
        posts.map((post, index) => (
          <MemoizedPostCard
            key={post.id}
            post={post}
            currentUser={currentUser}
            onLike={handleLike}
            onComment={handleComment}
            onEdit={handleEditPost}
            onDelete={setDeletePostId}
            onDeleteComment={handleDeleteComment}
            onUserClick={handleUserClick}
            onImageClick={setSelectedImage}
            commentInputs={commentInputs}
            setCommentInputs={setCommentInputs}
            submittingComments={submittingComments}
            editingPost={editingPost}
            setEditingPost={setEditingPost}
            editContent={editContent}
            setEditContent={setEditContent}
            expandedComments={expandedComments}
            toggleComments={toggleComments}
            showCommentBox={showCommentBox}
            toggleCommentBox={toggleCommentBox}
            likingPosts={likingPosts}
          />
        ))
      )}

      {/* Image Viewer */}
      {selectedImage && (
        <ImageViewer
          src={selectedImage}
          alt="Post image"
          isOpen={!!selectedImage}
          onClose={() => setSelectedImage(null)}
        />
      )}

      {/* User Profile Dialog */}
      <UserProfileDialog
        open={showUserDialog}
        onOpenChange={setShowUserDialog}
        user={selectedUser}
      />

      {/* Delete Post Confirmation Dialog */}
      <AlertDialog open={!!deletePostId} onOpenChange={() => setDeletePostId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-pixelated">Delete Post</AlertDialogTitle>
            <AlertDialogDescription className="font-pixelated text-xs">
              Are you sure you want to delete this post? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="font-pixelated text-xs btn-hover">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletePostId && handleDeletePost(deletePostId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 font-pixelated text-xs btn-hover"
            >
              Delete Post
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Comment Confirmation Dialog */}
      <AlertDialog open={!!deleteCommentId} onOpenChange={() => setDeleteCommentId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-pixelated">Delete Comment</AlertDialogTitle>
            <AlertDialogDescription className="font-pixelated text-xs">
              Are you sure you want to delete this comment? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="font-pixelated text-xs btn-hover">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteCommentId) {
                  const postWithComment = posts.find(post => 
                    post.comments.some(comment => comment.id === deleteCommentId)
                  );
                  if (postWithComment) {
                    handleDeleteComment(deleteCommentId, postWithComment.id);
                  }
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 font-pixelated text-xs btn-hover"
            >
              Delete Comment
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}