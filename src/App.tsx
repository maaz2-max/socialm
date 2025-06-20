import { useState, useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Session } from "@supabase/supabase-js";
import { LoadingScreen } from "@/components/ui/loading-screen";
import { useTheme } from "@/hooks/use-theme";
import { FirebaseNotificationProvider } from "@/components/notifications/FirebaseNotificationProvider";
import { useToast } from "@/hooks/use-toast";

// Pages
import Index from "./pages/Index";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import Friends from "./pages/Friends";
import Messages from "./pages/Messages";
import Notifications from "./pages/Notifications";
import Profile from "./pages/Profile";
import Settings from "./pages/Settings";
import NotFound from "./pages/NotFound";

// Components
import { AuthGuard } from "./components/common/AuthGuard";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      cacheTime: 1000 * 60 * 30,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const App = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const { theme, colorTheme, setTheme, setColorTheme } = useTheme();
  const { toast } = useToast();
  
  useEffect(() => {
    // Apply theme immediately on mount
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark', 'win95', 'modern');
    root.classList.add(theme);

    // Apply color theme
    root.classList.remove('theme-green', 'theme-blue', 'theme-red', 'theme-orange', 'theme-purple');
    if (colorTheme !== 'green') {
      root.classList.add(`theme-${colorTheme}`);
    }

    const faviconLink = document.querySelector("link[rel*='icon']") || document.createElement('link');
    faviconLink.setAttribute('rel', 'shortcut icon');
    faviconLink.setAttribute('href', '/lovable-uploads/d215e62c-d97d-4600-a98e-68acbeba47d0.png');
    document.head.appendChild(faviconLink);
    
    document.title = "SocialChat - Connect with Friends";
  }, [theme, colorTheme, setTheme, setColorTheme]);

  // Listen for admin broadcast notifications (ONLY for authenticated users)
  useEffect(() => {
    if (!session) return; // Only listen when user is logged in

    console.log('Setting up admin notification listeners for authenticated user');

    const handleAdminBroadcastToast = (event: CustomEvent) => {
      const { title, message } = event.detail;
      
      console.log('Received admin broadcast toast:', { title, message });
      
      // Show toast notification for authenticated users only
      toast({
        title: `📢 ${title}`,
        description: message,
        duration: 10000,
        className: 'border-l-4 border-l-orange-500 bg-orange-50 text-orange-900 shadow-lg',
      });
    };

    // Listen for Supabase real-time admin broadcasts
    const adminChannel = supabase.channel('admin-notifications-broadcast');
    
    adminChannel.on('broadcast', { event: 'admin_notification' }, (payload) => {
      console.log('Received Supabase admin broadcast:', payload);
      
      const { title, message, timestamp } = payload.payload;
      
      // Show toast notification
      toast({
        title: `📢 ${title}`,
        description: message,
        duration: 10000,
        className: 'border-l-4 border-l-orange-500 bg-orange-50 text-orange-900 shadow-lg',
      });

      // Store in localStorage for notifications page
      const storedNotifications = JSON.parse(localStorage.getItem('adminNotifications') || '[]');
      const newNotification = {
        id: payload.payload.id || Date.now().toString(),
        title,
        message,
        timestamp,
        type: 'admin_broadcast',
        read: false
      };
      
      storedNotifications.unshift(newNotification);
      
      // Keep only last 10 admin notifications
      if (storedNotifications.length > 10) {
        storedNotifications.splice(10);
      }
      
      localStorage.setItem('adminNotifications', JSON.stringify(storedNotifications));

      // Trigger custom event for notifications page
      window.dispatchEvent(new CustomEvent('adminBroadcastToast', {
        detail: { title, message, timestamp }
      }));
    });

    adminChannel.subscribe((status) => {
      console.log('Admin channel subscription status:', status);
    });

    // Also listen for custom events (fallback)
    window.addEventListener('adminBroadcastToast', handleAdminBroadcastToast as EventListener);

    return () => {
      console.log('Cleaning up admin notification listeners');
      supabase.removeChannel(adminChannel);
      window.removeEventListener('adminBroadcastToast', handleAdminBroadcastToast as EventListener);
    };
  }, [toast, session]); // Only run when session exists
  
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('Auth state changed:', event, session?.user?.id);
        
        if (event === 'SIGNED_OUT') {
          setSession(null);
          setLoading(false);
          localStorage.clear();
          sessionStorage.clear();
        } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          setSession(session);
          setLoading(false);
        } else if (event === 'INITIAL_SESSION') {
          setSession(session);
          setLoading(false);
        } else {
          setSession(session);
          setLoading(false);
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      console.log('Initial session check:', session?.user?.id);
      setSession(session);
      // Add a small delay to show the loading animation
      setTimeout(() => setLoading(false), 1500);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);
  
  if (loading) {
    return <LoadingScreen />;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <FirebaseNotificationProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              {/* Public Routes */}
              <Route 
                path="/" 
                element={session ? <Navigate to="/dashboard" replace /> : <Index />} 
              />
              <Route 
                path="/login" 
                element={session ? <Navigate to="/dashboard" replace /> : <Login />} 
              />
              <Route 
                path="/register" 
                element={session ? <Navigate to="/dashboard" replace /> : <Register />} 
              />
              
              {/* Protected Routes */}
              <Route 
                path="/dashboard" 
                element={
                  <AuthGuard>
                    <Dashboard />
                  </AuthGuard>
                } 
              />
              <Route 
                path="/friends" 
                element={
                  <AuthGuard>
                    <Friends />
                  </AuthGuard>
                } 
              />
              <Route 
                path="/messages" 
                element={
                  <AuthGuard>
                    <Messages />
                  </AuthGuard>
                } 
              />
              <Route 
                path="/notifications" 
                element={
                  <AuthGuard>
                    <Notifications />
                  </AuthGuard>
                } 
              />
              <Route 
                path="/profile" 
                element={
                  <AuthGuard>
                    <Profile />
                  </AuthGuard>
                } 
              />
              <Route 
                path="/settings" 
                element={
                  <AuthGuard>
                    <Settings />
                  </AuthGuard>
                } 
              />
              
              {/* 404 Route */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </FirebaseNotificationProvider>
    </QueryClientProvider>
  );
};

export default App;