import React, { useState, useEffect } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { 
  Home, 
  Users, 
  MessageSquare, 
  Bell, 
  User,
  Menu,
  LogOut
} from 'lucide-react';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useEnhancedNotifications } from '@/hooks/use-enhanced-notifications';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

interface MobileTab {
  path: string;
  label: string;
  icon: React.ReactNode;
}

export function MobileHeader() {
  const location = useLocation();
  const [user, setUser] = useState<any>(null);
  const [open, setOpen] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const { unreadCount } = useEnhancedNotifications();
  const { toast } = useToast();
  
  useEffect(() => {
    async function getUserProfile() {
      try {
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (!authUser) return;
        
        const { data } = await supabase
          .from('profiles')
          .select('name, username, avatar')
          .eq('id', authUser.id)
          .single();
          
        if (data) {
          setUser({
            id: authUser.id,
            name: data.name || 'User',
            username: data.username || 'guest',
            avatar: data.avatar || '',
          });
        }
      } catch (error) {
        console.error('Error fetching user profile:', error);
      }
    }
    
    getUserProfile();
  }, []);

  const handleLogout = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      
      if (error) throw error;
      
      window.location.href = '/login';
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error signing out",
        description: error.message,
      });
    }
  };

  const handleTabClick = (path: string) => {
    if (path === '/dashboard') {
      if (location.pathname === '/dashboard') {
        // If already on dashboard, scroll to top using multiple methods
        console.log('Attempting to scroll to top from mobile nav');
        
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
        window.location.href = path;
      }
    } else {
      // Navigate to other routes normally
      window.location.href = path;
    }
  };

  const tabs: MobileTab[] = [
    { path: '/dashboard', label: 'Home', icon: <Home className="h-5 w-5" /> },
    { path: '/friends', label: 'Friends', icon: <Users className="h-5 w-5" /> },
    { path: '/messages', label: 'Messages', icon: <MessageSquare className="h-5 w-5" /> },
    { 
      path: '/notifications', 
      label: 'Notifications', 
      icon: (
        <div className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge 
              variant="destructive" 
              className="absolute -top-2 -right-2 h-4 w-4 p-0 text-xs flex items-center justify-center animate-pulse"
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </Badge>
          )}
        </div>
      )
    },
    { path: '/profile', label: 'Profile', icon: <User className="h-5 w-5" /> },
  ];

  const isActive = (path: string) => location.pathname === path;

  return (
    <>
      <header className="fixed top-0 left-0 w-full z-50 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="container mx-auto px-3 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="icon" className="lg:hidden h-8 w-8 hover-scale">
                  <Menu className="h-4 w-4" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="p-0 w-72 flex flex-col h-full animate-in slide-in-from-left-2 duration-300">
                {/* Header */}
                <div className="flex items-center justify-center p-4 border-b shrink-0 bg-gradient-to-r from-social-light-green to-social-blue">
                  <img 
                    src="/lovable-uploads/d215e62c-d97d-4600-a98e-68acbeba47d0.png" 
                    alt="SocialChat" 
                    className="h-8 w-auto mr-2"
                  />
                  <h2 className="font-pixelated text-lg text-white">
                    Menu
                  </h2>
                </div>

                {/* User info section */}
                <div className="p-4 border-b shrink-0">
                  <div className="flex items-center gap-3 mb-4">
                    <Avatar className="h-10 w-10">
                      {user?.avatar ? (
                        <AvatarImage src={user.avatar} alt={user?.name} />
                      ) : (
                        <AvatarFallback className="bg-social-dark-green text-white font-pixelated text-sm">
                          {user?.name ? user.name.substring(0, 2).toUpperCase() : 'GU'}
                        </AvatarFallback>
                      )}
                    </Avatar>
                    <div className="flex-1">
                      <h3 className="font-pixelated text-sm">{user?.name || 'Guest'}</h3>
                      <p className="text-xs text-muted-foreground font-pixelated">@{user?.username || 'guest'}</p>
                    </div>
                  </div>
                </div>
                
                {/* Navigation section */}
                <div className="p-4 flex-1">
                  <h4 className="text-sm font-pixelated mb-3">Main Navigation</h4>
                  <div className="space-y-2">
                    {tabs.map((tab) => (
                      <div
                        key={tab.path}
                        onClick={() => {
                          setOpen(false);
                          handleTabClick(tab.path);
                        }}
                        className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-pixelated transition-all duration-200 hover-scale cursor-pointer ${
                          isActive(tab.path) 
                            ? 'bg-social-dark-green text-white shadow-md'
                            : 'hover:bg-muted/50'
                        }`}
                      >
                        {tab.icon}
                        <span>{tab.label}</span>
                        {tab.path === '/notifications' && unreadCount > 0 && (
                          <Badge variant="secondary" className="ml-auto h-4 px-2 text-xs">
                            {unreadCount}
                          </Badge>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Footer with logout */}
                <div className="p-4 border-t mt-auto shrink-0">
                  <Button 
                    variant="ghost" 
                    className="w-full justify-start text-destructive hover:text-destructive hover:bg-destructive/10 font-pixelated hover-scale"
                    onClick={() => {
                      setOpen(false);
                      setShowLogoutConfirm(true);
                    }}
                  >
                    <LogOut className="h-4 w-4 mr-2" />
                    <span>Sign Out</span>
                  </Button>
                </div>
              </SheetContent>
            </Sheet>
            
            <div 
              onClick={() => handleTabClick('/dashboard')}
              className="flex items-center gap-2 cursor-pointer"
            >
              <img 
                src="/lovable-uploads/d215e62c-d97d-4600-a98e-68acbeba47d0.png" 
                alt="SocialChat" 
                className="h-8 w-auto"
              />
              <h1 className="font-pixelated text-base">
                <span className="social-gradient bg-clip-text text-transparent">SocialChat</span>
              </h1>
            </div>
          </div>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="p-0 h-8 w-8 rounded-full hover-scale relative">
                <Avatar className="h-8 w-8">
                  {user?.avatar ? (
                    <AvatarImage src={user.avatar} alt={user?.name} />
                  ) : (
                    <AvatarFallback className="bg-social-dark-green text-white font-pixelated text-xs">
                      {user?.name ? user.name.substring(0, 2).toUpperCase() : 'GU'}
                    </AvatarFallback>
                  )}
                </Avatar>
                {unreadCount > 0 && (
                  <Badge 
                    variant="destructive" 
                    className="absolute -top-1 -right-1 h-4 w-4 p-0 text-xs flex items-center justify-center animate-pulse"
                  >
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </Badge>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 animate-in slide-in-from-top-2 duration-200">
              <DropdownMenuLabel className="font-pixelated">My Account</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <Link to="/profile">
                <DropdownMenuItem className="font-pixelated hover-scale">
                  <User className="mr-2 h-4 w-4" />
                  Profile
                </DropdownMenuItem>
              </Link>
              <Link to="/notifications">
                <DropdownMenuItem className="font-pixelated hover-scale">
                  <div className="flex items-center w-full">
                    <Bell className="mr-2 h-4 w-4" />
                    Notifications
                    {unreadCount > 0 && (
                      <Badge variant="destructive" className="ml-auto h-4 px-2 text-xs">
                        {unreadCount}
                      </Badge>
                    )}
                  </div>
                </DropdownMenuItem>
              </Link>
              <DropdownMenuSeparator />
              <DropdownMenuItem 
                onClick={() => setShowLogoutConfirm(true)} 
                className="text-destructive font-pixelated hover-scale"
              >
                <LogOut className="mr-2 h-4 w-4" />
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        
        {/* Bottom Navigation - Icons Only */}
        <nav className="grid grid-cols-5 border-t bg-background">
          {tabs.map((tab) => (
            <div
              key={tab.path} 
              onClick={() => handleTabClick(tab.path)}
              className={`flex flex-col items-center justify-center py-2 font-pixelated transition-all duration-200 hover-scale relative cursor-pointer ${
                isActive(tab.path) 
                  ? 'text-white bg-social-dark-green shadow-md' 
                  : 'text-muted-foreground hover:bg-muted/50'
              }`}
            >
              {tab.icon}
            </div>
          ))}
        </nav>
      </header>

      {/* Logout Confirmation Dialog */}
      <AlertDialog open={showLogoutConfirm} onOpenChange={setShowLogoutConfirm}>
        <AlertDialogContent className="animate-in zoom-in-95 duration-200">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-pixelated">Sign Out</AlertDialogTitle>
            <AlertDialogDescription className="font-pixelated">
              Are you sure you want to sign out? You'll need to log in again to access your account.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="font-pixelated">Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleLogout}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 font-pixelated"
            >
              Sign Out
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}