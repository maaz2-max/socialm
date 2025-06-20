import { useEffect, useState, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';

interface FirebaseNotificationState {
  isSupported: boolean;
  permission: NotificationPermission;
  token: string | null;
  isInitialized: boolean;
}

export function useFirebaseNotifications() {
  const [state, setState] = useState<FirebaseNotificationState>({
    isSupported: false,
    permission: 'default',
    token: null,
    isInitialized: true
  });
  const { toast } = useToast();

  // Initialize Firebase notifications (disabled)
  const initialize = useCallback(async () => {
    try {
      const isSupported = false; // Disabled Firebase
      
      setState(prev => ({
        ...prev,
        isSupported: false,
        isInitialized: true
      }));

    } catch (error) {
      console.error('Firebase notifications disabled:', error);
      setState(prev => ({ ...prev, isInitialized: true }));
    }
  }, []);

  // Request notification permission (fallback to browser notifications)
  const requestPermission = useCallback(async () => {
    try {
      if ('Notification' in window) {
        const permission = await Notification.requestPermission();
        setState(prev => ({ ...prev, permission }));
        
        if (permission === 'granted') {
          toast({
            title: 'Browser notifications enabled!',
            description: 'You will now receive browser notifications.',
            duration: 5000,
          });
          return true;
        }
      }
      
      toast({
        variant: 'destructive',
        title: 'Notifications not available',
        description: 'Your browser does not support notifications.',
        duration: 5000,
      });
      return false;
    } catch (error) {
      console.error('Error requesting notification permission:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to enable notifications.',
        duration: 5000,
      });
      return false;
    }
  }, [toast]);

  // Initialize on mount
  useEffect(() => {
    initialize();
  }, [initialize]);

  return {
    ...state,
    requestPermission,
    initialize
  };
}