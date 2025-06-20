import { initializeApp } from 'firebase/app';
import { getDatabase, ref, push, onValue, off } from 'firebase/database';
import { getMessaging, getToken, onMessage, isSupported } from 'firebase/messaging';

const firebaseConfig = {
  apiKey: "AIzaSyAXDc6PR-m2MBa0oklp9ObJggDmnvvn4RQ",
  authDomain: "mzsocialchat.firebaseapp.com",
  databaseURL: "https://mzsocialchat-default-rtdb.firebaseio.com",
  projectId: "mzsocialchat",
  storageBucket: "mzsocialchat.firebasestorage.app",
  messagingSenderId: "1070261752972",
  appId: "1:1070261752972:web:34575b057039e81e0997a9",
  measurementId: "G-RDCJQCQQ62"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase Realtime Database
const database = getDatabase(app);

// Initialize Firebase Cloud Messaging
let messaging: any = null;

const initializeMessaging = async () => {
  try {
    const supported = await isSupported();
    if (supported) {
      messaging = getMessaging(app);
      console.log('Firebase messaging initialized successfully');
    }
  } catch (error) {
    console.log('Firebase messaging not supported:', error);
  }
};

initializeMessaging();

export { app, messaging, database };

// Enhanced notification service for real-time broadcasting
export const NotificationService = {
  // Send admin broadcast notification using Firebase Realtime Database
  async sendAdminBroadcast(title: string, message: string) {
    try {
      console.log('Sending admin broadcast via Firebase Realtime Database:', { title, message });

      const timestamp = Date.now();
      const notificationData = {
        id: `admin_${timestamp}`,
        title: title.trim(),
        message: message.trim(),
        timestamp: new Date().toISOString(),
        type: 'admin_broadcast',
        sender: 'admin'
      };

      // Push to Firebase Realtime Database
      const notificationsRef = ref(database, 'admin_notifications');
      await push(notificationsRef, notificationData);

      console.log('Admin broadcast sent successfully via Firebase Realtime Database');

      return {
        success: true,
        message: 'Admin broadcast sent successfully',
        method: 'firebase_realtime_database',
        timestamp: notificationData.timestamp
      };
    } catch (error) {
      console.error('Error sending admin broadcast:', error);
      return {
        success: false,
        error: error
      };
    }
  },

  // Listen for admin broadcasts from Firebase Realtime Database
  listenForAdminBroadcasts(callback: (notification: any) => void) {
    try {
      const notificationsRef = ref(database, 'admin_notifications');
      
      const listener = onValue(notificationsRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
          // Get the latest notification
          const notifications = Object.values(data) as any[];
          const latestNotification = notifications[notifications.length - 1];
          
          if (latestNotification) {
            console.log('Received admin broadcast from Firebase:', latestNotification);
            callback(latestNotification);
          }
        }
      });

      // Return cleanup function
      return () => {
        off(notificationsRef, 'value', listener);
      };
    } catch (error) {
      console.error('Error setting up admin broadcast listener:', error);
      return () => {}; // Return empty cleanup function
    }
  },

  // Initialize Firebase messaging (optional for push notifications)
  async initialize() {
    try {
      if (!messaging) {
        await initializeMessaging();
      }
      
      if (!messaging) {
        console.log('Firebase messaging not available');
        return false;
      }
      
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        console.log('Notification permission granted');
        
        try {
          const token = await getToken(messaging, {
            vapidKey: 'BKxvxhk6f0JTzuykzAkjBpjA4rZmdn7_VrR2E2dVZ1K5ZGZjYzQzNjE4LTk2YjYtNGE4Yi1hZjE4LWY5ZjE4ZjE4ZjE4Zg'
          });
          
          if (token) {
            console.log('FCM Token:', token);
            localStorage.setItem('fcm_token', token);
            return token;
          }
        } catch (tokenError) {
          console.log('Error getting FCM token:', tokenError);
        }
        
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error initializing notifications:', error);
      return false;
    }
  },

  // Listen for foreground messages
  onMessage(callback: (payload: any) => void) {
    if (!messaging) return () => {};
    
    return onMessage(messaging, (payload) => {
      console.log('Foreground message received:', payload);
      callback(payload);
    });
  }
};

// Request permission and get FCM token
export const requestNotificationPermission = async () => {
  try {
    if (!messaging) {
      await initializeMessaging();
    }
    
    if (!messaging) {
      console.log('Firebase messaging not available');
      return null;
    }
    
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      console.log('Notification permission granted');
      
      try {
        const token = await getToken(messaging, {
          vapidKey: 'BKxvxhk6f0JTzuykzAkjBpjA4rZmdn7_VrR2E2dVZ1K5ZGZjYzQzNjE4LTk2YjYtNGE4Yi1hZjE4LWY5ZjE4ZjE4ZjE4Zg'
        });
        
        if (token) {
          localStorage.setItem('fcm_token', token);
          return token;
        }
      } catch (tokenError) {
        console.log('Error getting FCM token:', tokenError);
      }
      
      return 'permission-granted';
    }
    return null;
  } catch (error) {
    console.error('Error getting notification permission:', error);
    return null;
  }
};