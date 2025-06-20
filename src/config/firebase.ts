import { initializeApp } from 'firebase/app';
import { getDatabase, ref, push, onValue, off, serverTimestamp, query, orderByChild, limitToLast } from 'firebase/database';
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
      console.log('🚀 Sending admin broadcast via Firebase Realtime Database:', { title, message });

      const timestamp = Date.now();
      const notificationData = {
        id: `admin_${timestamp}`,
        title: title.trim(),
        message: message.trim(),
        timestamp: serverTimestamp(),
        created_at: new Date().toISOString(),
        type: 'admin_broadcast',
        sender: 'admin',
        broadcast_id: `broadcast_${timestamp}`,
        priority: 'high'
      };

      // Push to Firebase Realtime Database under 'admin_broadcasts' path
      const broadcastsRef = ref(database, 'admin_broadcasts');
      const newBroadcastRef = await push(broadcastsRef, notificationData);

      console.log('✅ Admin broadcast sent successfully via Firebase Realtime Database with ID:', newBroadcastRef.key);

      return {
        success: true,
        message: 'Admin broadcast sent successfully',
        method: 'firebase_realtime_database',
        broadcast_id: newBroadcastRef.key,
        timestamp: notificationData.created_at
      };
    } catch (error) {
      console.error('❌ Error sending admin broadcast:', error);
      return {
        success: false,
        error: error
      };
    }
  },

  // Listen for admin broadcasts from Firebase Realtime Database
  listenForAdminBroadcasts(callback: (notification: any) => void) {
    try {
      console.log('🔄 Setting up Firebase Realtime Database listener for admin broadcasts...');
      
      // Listen to the last 10 broadcasts, ordered by timestamp
      const broadcastsRef = ref(database, 'admin_broadcasts');
      const broadcastsQuery = query(broadcastsRef, orderByChild('created_at'), limitToLast(10));
      
      // Track last processed broadcast to avoid duplicates
      let lastProcessedTimestamp = localStorage.getItem('lastAdminBroadcastTimestamp') || '0';
      
      const listener = onValue(broadcastsQuery, (snapshot) => {
        const data = snapshot.val();
        console.log('📡 Firebase admin broadcast data received:', data);
        
        if (data) {
          // Get all broadcasts and sort by timestamp
          const broadcasts = Object.entries(data).map(([key, value]: [string, any]) => ({
            key,
            ...value
          }));
          
          // Sort by created_at timestamp (newest first)
          broadcasts.sort((a, b) => {
            const timeA = new Date(a.created_at || 0).getTime();
            const timeB = new Date(b.created_at || 0).getTime();
            return timeB - timeA;
          });
          
          // Process only new broadcasts
          broadcasts.forEach(broadcast => {
            const broadcastTime = new Date(broadcast.created_at || 0).getTime().toString();
            
            if (broadcastTime > lastProcessedTimestamp) {
              console.log('🔔 Processing new admin broadcast:', broadcast);
              
              // Update last processed timestamp
              lastProcessedTimestamp = broadcastTime;
              localStorage.setItem('lastAdminBroadcastTimestamp', lastProcessedTimestamp);
              
              // Call the callback with the new broadcast
              callback({
                id: broadcast.id || broadcast.key,
                title: broadcast.title,
                message: broadcast.message,
                timestamp: broadcast.created_at,
                type: broadcast.type,
                broadcast_id: broadcast.broadcast_id,
                priority: broadcast.priority
              });
            }
          });
        }
      }, (error) => {
        console.error('❌ Firebase admin broadcast listener error:', error);
      });

      console.log('✅ Firebase Realtime Database admin broadcast listener set up successfully');

      // Return cleanup function
      return () => {
        console.log('🧹 Cleaning up Firebase admin broadcast listener');
        off(broadcastsRef, 'value', listener);
      };
    } catch (error) {
      console.error('❌ Error setting up admin broadcast listener:', error);
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