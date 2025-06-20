import React, { createContext, useContext } from 'react';
import { useFirebaseNotifications } from '@/hooks/use-firebase-notifications';

interface FirebaseNotificationContextType {
  isSupported: boolean;
  permission: NotificationPermission;
  token: string | null;
  isInitialized: boolean;
  requestPermission: () => Promise<boolean>;
}

const FirebaseNotificationContext = createContext<FirebaseNotificationContextType | null>(null);

export function useFirebaseNotificationContext() {
  const context = useContext(FirebaseNotificationContext);
  if (!context) {
    throw new Error('useFirebaseNotificationContext must be used within FirebaseNotificationProvider');
  }
  return context;
}

interface FirebaseNotificationProviderProps {
  children: React.ReactNode;
}

export function FirebaseNotificationProvider({ children }: FirebaseNotificationProviderProps) {
  const firebaseNotifications = useFirebaseNotifications();

  return (
    <FirebaseNotificationContext.Provider value={firebaseNotifications}>
      {children}
    </FirebaseNotificationContext.Provider>
  );
}