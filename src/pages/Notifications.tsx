import React, { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { OneSignalNotificationBanner } from '@/components/notifications/OneSignalNotificationBanner';
import { useOneSignalNotifications } from '@/hooks/use-onesignal-notifications';
import { 
  Bell, 
  Check, 
  Trash2, 
  User, 
  MessageSquare, 
  Heart, 
  UserPlus, 
  Info, 
  CheckCheck, 
  X,
  Wifi,
  WifiOff,
  UserX,
  Settings
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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

interface Notification {
  id: string;
  type: string;
  content: string;
  reference_id: string | null;
  read: boolean;
  created_at: string;
  user_id: string;
}

export function Notifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInfo, setShowInfo] = useState(false);
  const [showClearDialog, setShowClearDialog] = useState(false);
  const [showNotificationBanner, setShowNotificationBanner] = useState(true);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>('default');
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const { toast } = useToast();
  const { oneSignalUser, requestPermission, unsubscribe } = useOneSignalNotifications();

  const fetchNotifications = async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      setCurrentUser(user);

      // Fetch notifications from database
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching notifications:', error);
        setNotifications([]);
      } else {
        setNotifications(data || []);
      }

    } catch (error) {
      console.error('Error in fetchNotifications:', error);
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async (notificationId: string) => {
    try {
      // Optimistic update for regular notifications
      setNotifications(prev =>
        prev.map(notif =>
          notif.id === notificationId ? { ...notif, read: true } : notif
        )
      );

      const { error } = await supabase
        .from('notifications')
        .update({ read: true })
        .eq('id', notificationId);

      if (error) {
        console.error('Error marking notification as read:', error);
        // Revert optimistic update on error
        setNotifications(prev =>
          prev.map(notif =>
            notif.id === notificationId ? { ...notif, read: false } : notif
          )
        );
      }
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  const markAllAsRead = async () => {
    try {
      if (!currentUser) return;

      // Optimistic update for regular notifications
      const originalNotifications = [...notifications];
      setNotifications(prev =>
        prev.map(notif => ({ ...notif, read: true }))
      );

      const { error } = await supabase
        .from('notifications')
        .update({ read: true })
        .eq('user_id', currentUser.id)
        .eq('read', false);

      if (error) {
        console.error('Error marking all as read:', error);
        // Revert on error
        setNotifications(originalNotifications);
        toast({
          variant: 'destructive',
          title: 'Error',
          description: 'Failed to mark all notifications as read'
        });
      } else {
        toast({
          title: 'All notifications marked as read',
          description: 'Your notifications have been updated',
        });
      }
    } catch (error) {
      console.error('Error marking all as read:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to mark all notifications as read'
      });
    }
  };

  const clearAllNotifications = async () => {
    try {
      if (!currentUser) return;

      // Optimistic update for regular notifications
      const originalNotifications = [...notifications];
      setNotifications([]);
      setShowClearDialog(false);

      const { error } = await supabase
        .from('notifications')
        .update({ deleted_at: new Date().toISOString() })
        .eq('user_id', currentUser.id)
        .is('deleted_at', null);

      if (error) {
        console.error('Error clearing notifications:', error);
        // Revert on error
        setNotifications(originalNotifications);
        setShowClearDialog(false);
        toast({
          variant: 'destructive',
          title: 'Error',
          description: 'Failed to clear notifications'
        });
      } else {
        toast({
          title: 'All notifications cleared',
          description: 'Your notifications have been cleared',
        });
      }
    } catch (error) {
      console.error('Error clearing notifications:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to clear notifications'
      });
    }
  };

  const deleteNotification = async (notificationId: string) => {
    try {
      // Optimistic update for regular notifications
      const originalNotifications = [...notifications];
      setNotifications(prev => prev.filter(notif => notif.id !== notificationId));

      const { error } = await supabase
        .from('notifications')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', notificationId);

      if (error) {
        console.error('Error deleting notification:', error);
        // Revert on error
        setNotifications(originalNotifications);
        toast({
          variant: 'destructive',
          title: 'Error',
          description: 'Failed to delete notification'
        });
      } else {
        toast({
          title: 'Notification deleted',
          description: 'The notification has been removed',
        });
      }
    } catch (error) {
      console.error('Error deleting notification:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to delete notification'
      });
    }
  };

  const handleNotificationToggle = async () => {
    if (oneSignalUser.subscribed) {
      await unsubscribe();
    } else {
      await requestPermission();
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'friend_request':
        return <UserPlus className="h-4 w-4 text-social-blue" />;
      case 'friend_accepted':
        return <User className="h-4 w-4 text-social-green" />;
      case 'friend_rejected':
        return <UserX className="h-4 w-4 text-destructive" />;
      case 'message':
        return <MessageSquare className="h-4 w-4 text-social-green" />;
      case 'like':
        return <Heart className="h-4 w-4 text-social-magenta" />;
      case 'comment':
        return <MessageSquare className="h-4 w-4 text-social-purple" />;
      default:
        return <Bell className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getNotificationColor = (type: string) => {
    switch (type) {
      case 'friend_request':
        return 'border-l-social-blue bg-social-blue/5';
      case 'friend_accepted':
        return 'border-l-social-green bg-social-green/5';
      case 'friend_rejected':
        return 'border-l-destructive bg-destructive/5';
      case 'message':
        return 'border-l-social-green bg-social-green/5';
      case 'like':
        return 'border-l-social-magenta bg-social-magenta/5';
      case 'comment':
        return 'border-l-social-purple bg-social-purple/5';
      default:
        return 'border-l-muted-foreground bg-muted/5';
    }
  };

  useEffect(() => {
    fetchNotifications();
    
    // Check notification permission
    if ('Notification' in window) {
      setNotificationPermission(Notification.permission);
    }

    // Listen for online/offline status
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Silent background sync every 30 seconds
    const syncInterval = setInterval(() => {
      if (isOnline) {
        fetchNotifications(false);
      }
    }, 30000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(syncInterval);
    };
  }, [isOnline, toast]);

  useEffect(() => {
    if (currentUser) {
      // Set up real-time subscription for notifications
      const notificationsChannel = supabase
        .channel('notifications-realtime')
        .on('postgres_changes', 
          { 
            event: '*', 
            schema: 'public', 
            table: 'notifications',
            filter: `user_id=eq.${currentUser.id}`
          }, 
          (payload) => {
            console.log('Notification change:', payload);
            if (payload.eventType === 'INSERT') {
              const newNotification = payload.new as Notification;
              setNotifications(prev => [newNotification, ...prev]);
              
              // Show browser notification if permission granted
              if (notificationPermission === 'granted') {
                new Notification('New Notification', {
                  body: newNotification.content,
                  icon: '/lovable-uploads/d215e62c-d97d-4600-a98e-68acbeba47d0.png'
                });
              }
            } else {
              fetchNotifications(false);
            }
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(notificationsChannel);
      };
    }
  }, [currentUser, notificationPermission]);

  const unreadCount = notifications.filter(n => !n.read).length;

  if (loading) {
    return (
      <DashboardLayout>
        <div className="max-w-2xl mx-auto p-3">
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map(i => (
              <Card key={i} className="animate-pulse">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="h-10 w-10 rounded-full bg-muted" />
                    <div className="flex-1">
                      <div className="h-4 w-3/4 bg-muted rounded mb-2" />
                      <div className="h-3 w-1/2 bg-muted rounded" />
                    </div>
                    <div className="h-6 w-6 bg-muted rounded" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto relative h-[calc(100vh-60px)] animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b bg-background sticky top-0 z-10 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Bell className="h-6 w-6 text-primary" />
              {unreadCount > 0 && (
                <Badge 
                  variant="destructive" 
                  className="absolute -top-2 -right-2 h-5 w-5 p-0 text-xs flex items-center justify-center animate-pulse"
                >
                  {unreadCount > 99 ? '99+' : unreadCount}
                </Badge>
              )}
              {/* Connection status indicator */}
              <div className="absolute -bottom-1 -right-1">
                {isOnline ? (
                  <Wifi className="w-3 h-3 text-social-green" />
                ) : (
                  <WifiOff className="w-3 h-3 text-destructive" />
                )}
              </div>
            </div>
            <div>
              <h1 className="font-pixelated text-lg font-medium">Notifications</h1>
              <p className="font-pixelated text-xs text-muted-foreground">
                {notifications.length} total • {unreadCount} unread • {isOnline ? 'Online' : 'Offline'}
                {oneSignalUser.subscribed && ' • Push enabled'}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Button
              onClick={() => setShowInfo(true)}
              size="icon"
              variant="outline"
              className="h-8 w-8 rounded-full hover-scale"
            >
              <Info className="h-4 w-4" />
            </Button>
            
            {notifications.length > 0 && (
              <>
                {unreadCount > 0 && (
                  <Button
                    onClick={markAllAsRead}
                    size="sm"
                    className="bg-social-green hover:bg-social-light-green text-white font-pixelated text-xs h-8 hover-scale"
                  >
                    <CheckCheck className="h-3 w-3 mr-1" />
                    Mark All Read
                  </Button>
                )}
                <Button
                  onClick={() => setShowClearDialog(true)}
                  size="sm"
                  variant="destructive"
                  className="font-pixelated text-xs h-8 hover-scale"
                >
                  <Trash2 className="h-3 w-3 mr-1" />
                  Clear All
                </Button>
              </>
            )}
          </div>
        </div>

        {/* OneSignal Notification Banner */}
        {showNotificationBanner && !oneSignalUser.subscribed && (
          <OneSignalNotificationBanner onDismiss={() => setShowNotificationBanner(false)} />
        )}

        {/* Push Notification Status */}
        {oneSignalUser.subscribed && (
          <div className="mx-4 mt-4 p-3 bg-social-green/10 border border-social-green/20 rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bell className="h-4 w-4 text-social-green" />
                <div>
                  <p className="font-pixelated text-xs font-medium text-social-green">Push Notifications Active</p>
                  <p className="font-pixelated text-xs text-muted-foreground">You'll receive notifications even when SocialChat is closed</p>
                </div>
              </div>
              <Button
                onClick={handleNotificationToggle}
                size="sm"
                variant="outline"
                className="font-pixelated text-xs"
              >
                <Settings className="h-3 w-3 mr-1" />
                Manage
              </Button>
            </div>
          </div>
        )}

        {/* Content */}
        <ScrollArea className="h-[calc(100vh-140px)] p-4 scroll-container scroll-smooth">
          {notifications.length > 0 ? (
            <div className="space-y-3">
              {notifications.map((notification) => (
                <Card 
                  key={notification.id} 
                  className={`notification-card cursor-pointer transition-all duration-200 hover:shadow-md hover-scale border-l-4 ${
                    !notification.read 
                      ? `${getNotificationColor(notification.type)} shadow-sm notification-unread` 
                      : 'border-l-muted bg-background notification-read'
                  }`}
                  onClick={() => !notification.read && markAsRead(notification.id)}
                >
                  <CardContent className="p-4 card-content">
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 mt-1">
                        {getNotificationIcon(notification.type)}
                      </div>
                      <div className="flex-1 min-w-0 notification-content">
                        <p className={`font-pixelated text-sm leading-relaxed ${
                          !notification.read ? 'font-medium text-foreground' : 'text-muted-foreground'
                        }`}>
                          {notification.content}
                        </p>
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          <p className="font-pixelated text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
                          </p>
                          {!notification.read && (
                            <Badge variant="secondary" className="h-4 px-1 text-xs font-pixelated">
                              New
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {!notification.read && (
                          <Button
                            onClick={(e) => {
                              e.stopPropagation();
                              markAsRead(notification.id);
                            }}
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6 hover:bg-social-green/10"
                          >
                            <Check className="h-3 w-3 text-social-green" />
                          </Button>
                        )}
                        <Button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteNotification(notification.id);
                          }}
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6 hover:bg-destructive/10"
                        >
                          <X className="h-3 w-3 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center py-12">
              <div className="relative mb-6">
                <Bell className="h-20 w-20 text-muted-foreground opacity-50" />
                <div className="absolute -top-2 -right-2 w-6 h-6 bg-social-green rounded-full flex items-center justify-center">
                  <Check className="h-3 w-3 text-white" />
                </div>
              </div>
              <h2 className="font-pixelated text-lg font-medium mb-2">All caught up!</h2>
              <p className="font-pixelated text-sm text-muted-foreground max-w-sm leading-relaxed">
                You don't have any notifications right now. When you receive friend requests, messages, likes, or comments, they'll appear here.
              </p>
              {!oneSignalUser.subscribed && (
                <Button
                  onClick={requestPermission}
                  className="mt-4 bg-social-green hover:bg-social-light-green text-white font-pixelated text-xs"
                >
                  Enable Push Notifications
                </Button>
              )}
            </div>
          )}
        </ScrollArea>

        {/* Info Dialog */}
        <Dialog open={showInfo} onOpenChange={setShowInfo}>
          <DialogContent className="max-w-md mx-auto animate-in zoom-in-95 duration-200">
            <DialogHeader>
              <DialogTitle className="font-pixelated text-lg social-gradient bg-clip-text text-transparent flex items-center gap-2">
                <Bell className="h-5 w-5" />
                Notification Types
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-3">
                <div className="flex items-center gap-3 p-3 bg-social-green/10 rounded-lg">
                  <MessageSquare className="h-4 w-4 text-social-green" />
                  <div>
                    <p className="font-pixelated text-xs font-medium">Messages</p>
                    <p className="font-pixelated text-xs text-muted-foreground">New direct messages from friends</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 bg-social-blue/10 rounded-lg">
                  <UserPlus className="h-4 w-4 text-social-blue" />
                  <div>
                    <p className="font-pixelated text-xs font-medium">Friend Requests</p>
                    <p className="font-pixelated text-xs text-muted-foreground">New friend requests and responses</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 bg-social-magenta/10 rounded-lg">
                  <Heart className="h-4 w-4 text-social-magenta" />
                  <div>
                    <p className="font-pixelated text-xs font-medium">Likes & Comments</p>
                    <p className="font-pixelated text-xs text-muted-foreground">Interactions on your posts</p>
                  </div>
                </div>
              </div>
              
              <div className="bg-muted/50 p-3 rounded-lg">
                <p className="font-pixelated text-xs text-muted-foreground leading-relaxed">
                  <strong>Push Notifications:</strong> Get instant alerts on all devices and browsers, including macOS Safari!
                </p>
              </div>
              
              <Button 
                onClick={() => setShowInfo(false)}
                className="w-full bg-social-green hover:bg-social-light-green text-white font-pixelated text-xs hover-scale"
              >
                Got it!
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Clear All Confirmation Dialog */}
        <AlertDialog open={showClearDialog} onOpenChange={setShowClearDialog}>
          <AlertDialogContent className="max-w-md mx-auto animate-in zoom-in-95 duration-200">
            <AlertDialogHeader>
              <AlertDialogTitle className="font-pixelated text-sm flex items-center gap-2">
                <Trash2 className="h-4 w-4 text-destructive" />
                Clear All Notifications
              </AlertDialogTitle>
              <AlertDialogDescription className="font-pixelated text-xs">
                Are you sure you want to clear all notifications? This action cannot be undone and will remove all {notifications.length} notifications from your list.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="font-pixelated text-xs">Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={clearAllNotifications}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90 font-pixelated text-xs"
              >
                Clear All
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </DashboardLayout>
  );
}

export default Notifications;