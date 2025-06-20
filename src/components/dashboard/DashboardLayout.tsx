import React from 'react';
import { MobileHeader } from './MobileHeader';
import { useIsMobile } from '@/hooks/use-mobile';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useLocation, useNavigate } from 'react-router-dom';
import { Home, Users, Bell, MessageSquare, User } from 'lucide-react';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const isMobile = useIsMobile();
  const location = useLocation();
  const navigate = useNavigate();
  const currentPath = location.pathname;

  const getRouteFromPath = (path: string) => {
    if (path === '/') return 'dashboard';
    if (path.startsWith('/profile/')) return 'profile';
    return path.split('/')[1];
  };

  const currentRoute = getRouteFromPath(currentPath);

  const handleTabClick = (route: string) => {
    if (route === 'dashboard') {
      if (currentPath === '/dashboard') {
        // If already on dashboard, scroll to top using multiple methods
        console.log('Attempting to scroll to top from desktop nav');
        
        // Method 1: Custom event
        const event = new CustomEvent('scrollToTop');
        window.dispatchEvent(event);
        
        // Method 2: Direct function call (fallback)
        setTimeout(() => {
          if ((window as any).scrollDashboardToTop) {
            (window as any).scrollDashboardToTop();
          }
        }, 100);
        
        // Method 3: Direct DOM manipulation (last resort)
        setTimeout(() => {
          const scrollArea = document.querySelector('[data-radix-scroll-area-viewport]');
          if (scrollArea) {
            scrollArea.scrollTo({ top: 0, behavior: 'smooth' });
          }
        }, 200);
      } else {
        // Navigate to dashboard
        navigate('/dashboard');
      }
    } else {
      // Navigate to other routes normally
      navigate(`/${route}`);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col w-full">
      <div className="dev-banner text-xs font-pixelated">
        This project is still under development by Mohammed Maaz A. Please share your feedback!
      </div>
      <MobileHeader />
      <div className="flex flex-1 w-full">
        <div className="flex-1 w-full">
          {!isMobile && (
            <div className="border-b sticky top-0 bg-background z-10 px-2 pt-2">
              <Tabs value={currentRoute} className="w-full mb-2">
                <TabsList className="nav-tabs w-fit overflow-x-auto">
                  <TabsTrigger 
                    value="dashboard" 
                    onClick={() => handleTabClick('dashboard')}
                    className={`nav-tab ${currentRoute === 'dashboard' ? 'active' : ''} font-pixelated p-2`}
                  >
                    <Home className="h-4 w-4" />
                  </TabsTrigger>
                  <TabsTrigger 
                    value="friends" 
                    onClick={() => handleTabClick('friends')}
                    className={`nav-tab ${currentRoute === 'friends' ? 'active' : ''} font-pixelated p-2`}
                  >
                    <Users className="h-4 w-4" />
                  </TabsTrigger>
                  <TabsTrigger 
                    value="messages" 
                    onClick={() => handleTabClick('messages')}
                    className={`nav-tab ${currentRoute === 'messages' ? 'active' : ''} font-pixelated p-2`}
                  >
                    <MessageSquare className="h-4 w-4" />
                  </TabsTrigger>
                  <TabsTrigger 
                    value="notifications" 
                    onClick={() => handleTabClick('notifications')}
                    className={`nav-tab ${currentRoute === 'notifications' ? 'active' : ''} font-pixelated p-2`}
                  >
                    <Bell className="h-4 w-4" />
                  </TabsTrigger>
                  <TabsTrigger 
                    value="profile" 
                    onClick={() => handleTabClick('profile')}
                    className={`nav-tab ${currentRoute === 'profile' ? 'active' : ''} font-pixelated p-2`}
                  >
                    <User className="h-4 w-4" />
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          )}
          <main className={`w-full ${isMobile ? 'pt-16 pb-16' : 'p-2'} overflow-x-hidden`}>
            <div className="w-full max-w-full overflow-hidden h-full">
              {children}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}