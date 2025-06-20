// Firebase configuration (disabled for now)
export const firebaseConfig = {
  // Firebase is disabled - using browser notifications instead
};

// Notification service using browser notifications
export class NotificationService {
  static async initialize() {
    console.log('Firebase notifications disabled - using browser notifications');
    return true;
  }

  static onMessage(callback: (payload: any) => void) {
    // Listen for custom events instead of Firebase
    const handleCustomMessage = (event: CustomEvent) => {
      callback(event.detail);
    };
    
    window.addEventListener('customNotification', handleCustomMessage as EventListener);
    
    return () => {
      window.removeEventListener('customNotification', handleCustomMessage as EventListener);
    };
  }
}

export const requestNotificationPermission = async () => {
  try {
    if ('Notification' in window) {
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    }
    return false;
  } catch (error) {
    console.error('Error requesting notification permission:', error);
    return false;
  }
};