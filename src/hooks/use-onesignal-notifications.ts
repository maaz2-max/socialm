import { useEffect, useState, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface OneSignalUser {
  onesignalId: string | null;
  subscribed: boolean;
  permission: 'default' | 'granted' | 'denied';
}

export function useOneSignalNotifications() {
  const [oneSignalUser, setOneSignalUser] = useState<OneSignalUser>({
    onesignalId: null,
    subscribed: false,
    permission: 'default'
  });
  const [isLoading, setIsLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const { toast } = useToast();

  // Get current user
  useEffect(() => {
    const getCurrentUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUser(user);
    };
    getCurrentUser();
  }, []);

  // Initialize OneSignal when available
  useEffect(() => {
    const initializeOneSignal = async () => {
      try {
        // Wait for OneSignal to be available
        if (typeof window !== 'undefined' && window.OneSignalInstance) {
          const OneSignal = window.OneSignalInstance;
          
          // Get current subscription status
          const subscribed = await OneSignal.User.PushSubscription.optedIn;
          const permission = await OneSignal.Notifications.permission;
          const onesignalId = OneSignal.User.onesignalId;
          
          setOneSignalUser({
            onesignalId,
            subscribed,
            permission
          });
          
          console.log('OneSignal initialized:', { subscribed, permission, onesignalId });
        } else {
          // Wait for OneSignal to load
          setTimeout(initializeOneSignal, 1000);
        }
      } catch (error) {
        console.error('Error initializing OneSignal:', error);
      } finally {
        setIsLoading(false);
      }
    };

    initializeOneSignal();

    // Listen for subscription changes
    const handleSubscriptionChange = (event: CustomEvent) => {
      setOneSignalUser(prev => ({
        ...prev,
        subscribed: event.detail.subscribed
      }));
    };

    window.addEventListener('oneSignalSubscriptionChanged', handleSubscriptionChange as EventListener);

    return () => {
      window.removeEventListener('oneSignalSubscriptionChanged', handleSubscriptionChange as EventListener);
    };
  }, []);

  // Request notification permission and subscribe
  const requestPermission = useCallback(async () => {
    try {
      if (!window.OneSignalInstance) {
        throw new Error('OneSignal not initialized');
      }

      const OneSignal = window.OneSignalInstance;
      
      // Request permission
      const permission = await OneSignal.Notifications.requestPermission();
      
      if (permission) {
        // User granted permission, now opt them in
        await OneSignal.User.PushSubscription.optIn();
        
        const onesignalId = OneSignal.User.onesignalId;
        
        setOneSignalUser({
          onesignalId,
          subscribed: true,
          permission: 'granted'
        });

        // Store OneSignal ID in user profile for future use
        if (currentUser && onesignalId) {
          try {
            await supabase
              .from('profiles')
              .update({ onesignal_id: onesignalId })
              .eq('id', currentUser.id);
          } catch (error) {
            console.log('OneSignal ID storage will be added to profile schema later');
          }
        }

        toast({
          title: 'Push notifications enabled!',
          description: 'You will now receive push notifications for messages and activities.',
        });

        return true;
      } else {
        setOneSignalUser(prev => ({
          ...prev,
          permission: 'denied'
        }));

        toast({
          variant: 'destructive',
          title: 'Notifications blocked',
          description: 'Please enable notifications in your browser settings to receive push notifications.',
        });

        return false;
      }
    } catch (error) {
      console.error('Error requesting OneSignal permission:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to enable push notifications. Please try again.',
      });
      return false;
    }
  }, [currentUser, toast]);

  // Unsubscribe from notifications
  const unsubscribe = useCallback(async () => {
    try {
      if (!window.OneSignalInstance) {
        throw new Error('OneSignal not initialized');
      }

      const OneSignal = window.OneSignalInstance;
      await OneSignal.User.PushSubscription.optOut();
      
      setOneSignalUser(prev => ({
        ...prev,
        subscribed: false
      }));

      toast({
        title: 'Push notifications disabled',
        description: 'You will no longer receive push notifications.',
      });

      return true;
    } catch (error) {
      console.error('Error unsubscribing from OneSignal:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to disable push notifications.',
      });
      return false;
    }
  }, [toast]);

  // Send notification to specific user (for future backend integration)
  const sendNotificationToUser = useCallback(async (
    targetUserId: string, 
    title: string, 
    message: string, 
    data?: any
  ) => {
    try {
      // This will be implemented when backend OneSignal integration is added
      console.log('OneSignal notification prepared for backend:', {
        targetUserId,
        title,
        message,
        data,
        timestamp: new Date().toISOString()
      });

      // For now, create in-app notification in Supabase (maintains current functionality)
      await supabase
        .from('notifications')
        .insert({
          user_id: targetUserId,
          type: data?.type || 'message',
          content: message,
          reference_id: data?.reference_id,
          read: false
        });

      return {
        success: true,
        message: 'Notification sent via Supabase and prepared for OneSignal backend'
      };
    } catch (error) {
      console.error('Error sending notification:', error);
      return {
        success: false,
        error: error
      };
    }
  }, []);

  // Add external user ID (link OneSignal ID with your user ID)
  const setExternalUserId = useCallback(async (userId: string) => {
    try {
      if (!window.OneSignalInstance) return;

      const OneSignal = window.OneSignalInstance;
      await OneSignal.login(userId);
      
      console.log('OneSignal external user ID set:', userId);
    } catch (error) {
      console.error('Error setting OneSignal external user ID:', error);
    }
  }, []);

  // Set external user ID when user is available
  useEffect(() => {
    if (currentUser && oneSignalUser.subscribed && !isLoading) {
      setExternalUserId(currentUser.id);
    }
  }, [currentUser, oneSignalUser.subscribed, isLoading, setExternalUserId]);

  return {
    oneSignalUser,
    isLoading,
    requestPermission,
    unsubscribe,
    sendNotificationToUser,
    setExternalUserId
  };
}

// Extend window interface for TypeScript
declare global {
  interface Window {
    OneSignalInstance?: any;
    OneSignalDeferred?: any[];
  }
}