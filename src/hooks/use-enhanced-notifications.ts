import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { NotificationService } from '@/config/firebase';

interface NotificationData {
  id: string;
  type: string;
  content: string;
  reference_id?: string;
  read: boolean;
  created_at: string;
  user_id: string;
}

export function useEnhancedNotifications() {
  const [notifications, setNotifications] = useState<NotificationData[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isGranted, setIsGranted] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const channelsRef = useRef<any[]>([]);
  const { toast } = useToast();

  // Initialize user and permissions
  useEffect(() => {
    const initializeNotifications = async () => {
      try {
        // Get current user
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          setCurrentUser(user);
          
          // Check notification permission
          if ('Notification' in window) {
            setIsGranted(Notification.permission === 'granted');
          }
          
          // Load initial notifications
          await fetchNotifications(user.id);
        }
      } catch (error) {
        console.error('Error initializing notifications:', error);
      }
    };

    initializeNotifications();

    // Listen for online/offline status
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Fetch notifications from database
  const fetchNotifications = useCallback(async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        console.error('Error fetching notifications:', error);
        return;
      }

      setNotifications(data || []);
      setUnreadCount(data?.filter(n => !n.read).length || 0);
    } catch (error) {
      console.error('Error fetching notifications:', error);
    }
  }, []);

  // Create notification in database
  const createNotification = useCallback(async (
    userId: string, 
    type: string, 
    content: string, 
    referenceId?: string
  ) => {
    try {
      const { data, error } = await supabase
        .from('notifications')
        .insert({
          user_id: userId,
          type,
          content,
          reference_id: referenceId,
          read: false
        })
        .select()
        .single();

      if (error) throw error;

      // Show browser notification if permission granted
      if (Notification.permission === 'granted') {
        new Notification(getNotificationTitle(type), {
          body: content,
          icon: '/lovable-uploads/d215e62c-d97d-4600-a98e-68acbeba47d0.png',
          tag: type,
          requireInteraction: false
        });
      }

      return data;
    } catch (error) {
      console.error('Error creating notification:', error);
      return null;
    }
  }, []);

  // Send browser notification (fallback)
  const sendBrowserNotification = useCallback((title: string, options?: NotificationOptions) => {
    if (!isGranted || !('Notification' in window)) return null;

    try {
      const notification = new Notification(title, {
        ...options,
        icon: '/lovable-uploads/d215e62c-d97d-4600-a98e-68acbeba47d0.png',
        badge: '/lovable-uploads/d215e62c-d97d-4600-a98e-68acbeba47d0.png',
        requireInteraction: false,
        silent: false,
        tag: options?.tag || 'socialchat'
      });

      notification.onclick = () => {
        window.focus();
        notification.close();
      };

      setTimeout(() => notification.close(), 5000);
      return notification;
    } catch (error) {
      console.error('Error showing notification:', error);
      return null;
    }
  }, [isGranted]);

  // Mark notification as read
  const markAsRead = useCallback(async (notificationId: string) => {
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ read: true })
        .eq('id', notificationId);

      if (error) throw error;

      setNotifications(prev =>
        prev.map(n => n.id === notificationId ? { ...n, read: true } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  }, []);

  // Mark all as read
  const markAllAsRead = useCallback(async () => {
    if (!currentUser) return;

    try {
      const { error } = await supabase
        .from('notifications')
        .update({ read: true })
        .eq('user_id', currentUser.id)
        .eq('read', false);

      if (error) throw error;

      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch (error) {
      console.error('Error marking all as read:', error);
    }
  }, [currentUser]);

  // Delete notification
  const deleteNotification = useCallback(async (notificationId: string) => {
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', notificationId);

      if (error) throw error;

      setNotifications(prev => prev.filter(n => n.id !== notificationId));
    } catch (error) {
      console.error('Error deleting notification:', error);
    }
  }, []);

  // Clear all notifications
  const clearAllNotifications = useCallback(async () => {
    if (!currentUser) return;

    try {
      const { error } = await supabase
        .from('notifications')
        .update({ deleted_at: new Date().toISOString() })
        .eq('user_id', currentUser.id)
        .is('deleted_at', null);

      if (error) throw error;

      setNotifications([]);
      setUnreadCount(0);
    } catch (error) {
      console.error('Error clearing notifications:', error);
    }
  }, [currentUser]);

  // Setup real-time subscriptions
  useEffect(() => {
    if (!currentUser) return;

    const setupRealtimeSubscriptions = () => {
      // Cleanup existing channels
      channelsRef.current.forEach(channel => {
        supabase.removeChannel(channel);
      });
      channelsRef.current = [];

      // Notifications subscription
      const notificationsChannel = supabase
        .channel(`notifications-${currentUser.id}`)
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${currentUser.id}`
        }, async (payload) => {
          const newNotification = payload.new as NotificationData;
          
          // Add to state
          setNotifications(prev => [newNotification, ...prev]);
          setUnreadCount(prev => prev + 1);

          // Show browser notification
          sendBrowserNotification(getNotificationTitle(newNotification.type), {
            body: newNotification.content,
            tag: newNotification.type,
            data: { id: newNotification.id, type: newNotification.type }
          });

          // Show toast
          toast({
            title: getNotificationTitle(newNotification.type),
            description: newNotification.content,
            duration: 4000
          });
        })
        .on('postgres_changes', {
          event: 'UPDATE',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${currentUser.id}`
        }, (payload) => {
          const updatedNotification = payload.new as NotificationData;
          setNotifications(prev =>
            prev.map(n => n.id === updatedNotification.id ? updatedNotification : n)
          );
        })
        .subscribe();

      // Messages subscription for instant notifications
      const messagesChannel = supabase
        .channel(`messages-${currentUser.id}`)
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `receiver_id=eq.${currentUser.id}`
        }, async (payload) => {
          const message = payload.new;
          
          // Get sender info
          const { data: sender } = await supabase
            .from('profiles')
            .select('name, username')
            .eq('id', message.sender_id)
            .single();

          if (sender) {
            // Create notification
            await createNotification(
              currentUser.id,
              'message',
              `${sender.name} sent you a message`,
              message.id
            );
          }
        })
        .subscribe();

      // Friend requests subscription
      const friendsChannel = supabase
        .channel(`friends-${currentUser.id}`)
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'friends',
          filter: `receiver_id=eq.${currentUser.id}`
        }, async (payload) => {
          const friendship = payload.new;
          
          // Get sender info
          const { data: sender } = await supabase
            .from('profiles')
            .select('name, username')
            .eq('id', friendship.sender_id)
            .single();

          if (sender) {
            // Create notification
            await createNotification(
              currentUser.id,
              'friend_request',
              `${sender.name} sent you a friend request`,
              friendship.id
            );
          }
        })
        .on('postgres_changes', {
          event: 'UPDATE',
          schema: 'public',
          table: 'friends',
          filter: `sender_id=eq.${currentUser.id}`
        }, async (payload) => {
          const friendship = payload.new;
          
          if (friendship.status === 'accepted') {
            // Get receiver info
            const { data: receiver } = await supabase
              .from('profiles')
              .select('name, username')
              .eq('id', friendship.receiver_id)
              .single();

            if (receiver) {
              // Create notification
              await createNotification(
                currentUser.id,
                'friend_accepted',
                `${receiver.name} accepted your friend request`,
                friendship.id
              );
            }
          }
        })
        .subscribe();

      // Likes subscription
      const likesChannel = supabase
        .channel(`likes-${currentUser.id}`)
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'likes'
        }, async (payload) => {
          const like = payload.new;
          
          // Check if this is a like on current user's post
          const { data: post } = await supabase
            .from('posts')
            .select('user_id, content')
            .eq('id', like.post_id)
            .single();

          if (post && post.user_id === currentUser.id && like.user_id !== currentUser.id) {
            // Get liker info
            const { data: liker } = await supabase
              .from('profiles')
              .select('name, username')
              .eq('id', like.user_id)
              .single();

            if (liker) {
              // Create notification
              await createNotification(
                currentUser.id,
                'like',
                `${liker.name} liked your post`,
                like.post_id
              );
            }
          }
        })
        .subscribe();

      // Comments subscription
      const commentsChannel = supabase
        .channel(`comments-${currentUser.id}`)
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'comments'
        }, async (payload) => {
          const comment = payload.new;
          
          // Check if this is a comment on current user's post
          const { data: post } = await supabase
            .from('posts')
            .select('user_id, content')
            .eq('id', comment.post_id)
            .single();

          if (post && post.user_id === currentUser.id && comment.user_id !== currentUser.id) {
            // Get commenter info
            const { data: commenter } = await supabase
              .from('profiles')
              .select('name, username')
              .eq('id', comment.user_id)
              .single();

            if (commenter) {
              // Create notification
              await createNotification(
                currentUser.id,
                'comment',
                `${commenter.name} commented on your post`,
                comment.post_id
              );
            }
          }
        })
        .subscribe();

      // Store channels for cleanup
      channelsRef.current = [
        notificationsChannel,
        messagesChannel,
        friendsChannel,
        likesChannel,
        commentsChannel
      ];
    };

    setupRealtimeSubscriptions();

    // Reconnect on network recovery
    if (isOnline) {
      const reconnectTimer = setTimeout(setupRealtimeSubscriptions, 1000);
      return () => clearTimeout(reconnectTimer);
    }

    return () => {
      channelsRef.current.forEach(channel => {
        supabase.removeChannel(channel);
      });
      channelsRef.current = [];
    };
  }, [currentUser, isOnline, createNotification, sendBrowserNotification, toast]);

  // Request notification permission (browser fallback)
  const requestPermission = useCallback(async () => {
    try {
      const permission = await Notification.requestPermission();
      setIsGranted(permission === 'granted');
      
      if (permission === 'granted') {
        toast({
          title: 'Browser notifications enabled',
          description: 'You will now receive browser notifications',
          duration: 3000
        });

        // Send test notification
        sendBrowserNotification('Notifications Enabled!', {
          body: 'You will now receive browser notifications',
          tag: 'test'
        });
      }
      
      return permission === 'granted';
    } catch (error) {
      console.error('Error requesting permission:', error);
      return false;
    }
  }, [sendBrowserNotification, toast]);

  return {
    notifications,
    unreadCount,
    isGranted,
    isOnline,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    clearAllNotifications,
    requestPermission,
    createNotification,
    fetchNotifications: () => currentUser && fetchNotifications(currentUser.id)
  };
}

// Helper function to get notification titles
function getNotificationTitle(type: string): string {
  switch (type) {
    case 'message':
      return 'New Message';
    case 'friend_request':
      return 'Friend Request';
    case 'friend_accepted':
      return 'Friend Request Accepted';
    case 'like':
      return 'New Like';
    case 'comment':
      return 'New Comment';
    case 'admin_broadcast':
      return 'Admin Announcement';
    default:
      return 'Notification';
  }
}