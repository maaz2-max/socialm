import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Bell, Send, LogOut, Shield, Eye, EyeOff, AlertTriangle, Zap, Users, CheckCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { NotificationService } from '@/config/firebase';

interface AdminNotificationPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AdminNotificationPanel({ open, onOpenChange }: AdminNotificationPanelProps) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [adminCode, setAdminCode] = useState('');
  const [showCode, setShowCode] = useState(false);
  const [notificationTitle, setNotificationTitle] = useState('');
  const [notificationMessage, setNotificationMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [notificationsSent, setNotificationsSent] = useState(0);
  const [userCount, setUserCount] = useState(0);
  const [lastBroadcastId, setLastBroadcastId] = useState<string | null>(null);
  const { toast } = useToast();

  // Default admin code
  const ADMIN_CODE = 'SOCIALCHAT2025';

  // Get user count
  useEffect(() => {
    const fetchUserCount = async () => {
      try {
        const { count } = await supabase
          .from('profiles')
          .select('*', { count: 'exact', head: true });
        setUserCount(count || 0);
      } catch (error) {
        console.error('Error fetching user count:', error);
      }
    };

    if (isAuthenticated) {
      fetchUserCount();
    }
  }, [isAuthenticated]);

  // Auto logout after 5 minutes of inactivity
  useEffect(() => {
    let logoutTimer: NodeJS.Timeout;
    
    if (isAuthenticated) {
      logoutTimer = setTimeout(() => {
        handleLogout();
        toast({
          title: 'Session expired',
          description: 'You have been automatically logged out for security.',
          variant: 'destructive'
        });
      }, 5 * 60 * 1000); // 5 minutes
    }

    return () => {
      if (logoutTimer) {
        clearTimeout(logoutTimer);
      }
    };
  }, [isAuthenticated, toast]);

  const handleLogin = () => {
    setLoginError('');
    
    if (adminCode === ADMIN_CODE) {
      setIsAuthenticated(true);
      setAdminCode('');
      toast({
        title: 'Admin access granted',
        description: 'You can now send real-time notifications to all users.',
      });
    } else {
      setLoginError('Invalid admin code. Please try again.');
      setAdminCode('');
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setAdminCode('');
    setNotificationTitle('');
    setNotificationMessage('');
    setLoginError('');
    setNotificationsSent(0);
    setLastBroadcastId(null);
  };

  const handleSendNotification = async () => {
    if (!notificationTitle.trim() || !notificationMessage.trim()) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Please fill in both title and message fields.'
      });
      return;
    }

    try {
      setIsSending(true);

      const titleToSend = notificationTitle.trim();
      const messageToSend = notificationMessage.trim();

      console.log('🚀 Admin sending notification via Firebase Realtime Database:', { titleToSend, messageToSend });

      // Send via Firebase Realtime Database for instant broadcasting
      const result = await NotificationService.sendAdminBroadcast(titleToSend, messageToSend);

      if (result.success) {
        setNotificationsSent(prev => prev + 1);
        setLastBroadcastId(result.broadcast_id || null);
        
        toast({
          title: '🚀 Notification broadcast successful!',
          description: `"${titleToSend}" has been sent to all ${userCount} users via Firebase Realtime Database.`,
        });

        // Clear form
        setNotificationTitle('');
        setNotificationMessage('');

        // Show preview notification for admin after a short delay
        setTimeout(() => {
          toast({
            title: `📢 ${titleToSend}`,
            description: messageToSend,
            duration: 8000,
            className: 'border-l-4 border-l-orange-500 bg-orange-50 text-orange-900 shadow-lg',
          });
        }, 1500);

      } else {
        throw new Error(result.error || 'Failed to send notification');
      }
    } catch (error) {
      console.error('❌ Error sending notification:', error);
      toast({
        variant: 'destructive',
        title: 'Failed to send notification',
        description: 'There was an error broadcasting the notification. Please check your connection and try again.'
      });
    } finally {
      setIsSending(false);
    }
  };

  const handleClose = () => {
    handleLogout(); // Always logout when closing
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-sm mx-auto animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-pixelated text-sm flex items-center gap-2">
            <Shield className="h-4 w-4 text-orange-500" />
            Admin Broadcast Panel
          </DialogTitle>
        </DialogHeader>

        {!isAuthenticated ? (
          <div className="space-y-3">
            <Alert>
              <AlertTriangle className="h-3 w-3" />
              <AlertDescription className="font-pixelated text-xs">
                Restricted admin area for real-time broadcasting to all users.
              </AlertDescription>
            </Alert>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="font-pixelated text-xs">Admin Access</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1">
                  <Label htmlFor="adminCode" className="font-pixelated text-xs">Admin Code</Label>
                  <div className="relative">
                    <Input
                      id="adminCode"
                      type={showCode ? 'text' : 'password'}
                      value={adminCode}
                      onChange={(e) => setAdminCode(e.target.value)}
                      className="font-pixelated text-xs h-8 pr-8"
                      placeholder="Enter admin code"
                      onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-8 w-8 hover:bg-transparent"
                      onClick={() => setShowCode(!showCode)}
                    >
                      {showCode ? (
                        <EyeOff className="h-3 w-3 text-muted-foreground" />
                      ) : (
                        <Eye className="h-3 w-3 text-muted-foreground" />
                      )}
                    </Button>
                  </div>
                </div>

                {loginError && (
                  <Alert variant="destructive">
                    <AlertDescription className="font-pixelated text-xs">
                      {loginError}
                    </AlertDescription>
                  </Alert>
                )}

                <Button
                  onClick={handleLogin}
                  className="w-full bg-orange-600 hover:bg-orange-700 text-white font-pixelated text-xs h-8"
                  disabled={!adminCode.trim()}
                >
                  <Shield className="h-3 w-3 mr-1" />
                  Access Admin Panel
                </Button>
              </CardContent>
            </Card>

            <div className="bg-muted/50 p-2 rounded-lg">
              <p className="font-pixelated text-xs text-muted-foreground text-center">
                Admin Code: <strong>SOCIALCHAT2025</strong>
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between p-2 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-center gap-2">
                <Shield className="h-3 w-3 text-green-600" />
                <div>
                  <span className="font-pixelated text-xs text-green-800">Admin Active</span>
                  {notificationsSent > 0 && (
                    <p className="font-pixelated text-xs text-green-600">
                      {notificationsSent} broadcast{notificationsSent > 1 ? 's' : ''} sent
                    </p>
                  )}
                </div>
              </div>
              <Button
                onClick={handleLogout}
                size="sm"
                variant="outline"
                className="font-pixelated text-xs h-6"
              >
                <LogOut className="h-3 w-3 mr-1" />
                Logout
              </Button>
            </div>

            {/* Success indicator for last broadcast */}
            {lastBroadcastId && (
              <div className="flex items-center gap-2 p-2 bg-green-50 border border-green-200 rounded-lg">
                <CheckCircle className="h-3 w-3 text-green-600" />
                <span className="font-pixelated text-xs text-green-800">
                  Last broadcast delivered successfully
                </span>
              </div>
            )}

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="font-pixelated text-xs flex items-center gap-1">
                  <Zap className="h-3 w-3 text-orange-500" />
                  Firebase Realtime Broadcast
                </CardTitle>
                <div className="flex items-center gap-1 text-muted-foreground">
                  <Users className="h-3 w-3" />
                  <span className="font-pixelated text-xs">{userCount} registered users</span>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1">
                  <Label htmlFor="title" className="font-pixelated text-xs">Title</Label>
                  <Input
                    id="title"
                    type="text"
                    value={notificationTitle}
                    onChange={(e) => setNotificationTitle(e.target.value)}
                    className="font-pixelated text-xs h-8"
                    placeholder="Enter notification title"
                    maxLength={50}
                  />
                  <div className="flex justify-end">
                    <p className="font-pixelated text-xs text-muted-foreground">
                      {notificationTitle.length}/50
                    </p>
                  </div>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="message" className="font-pixelated text-xs">Message</Label>
                  <Textarea
                    id="message"
                    value={notificationMessage}
                    onChange={(e) => setNotificationMessage(e.target.value)}
                    className="font-pixelated text-xs min-h-[60px] resize-none"
                    placeholder="Enter notification message"
                    maxLength={200}
                  />
                  <div className="flex justify-end">
                    <p className="font-pixelated text-xs text-muted-foreground">
                      {notificationMessage.length}/200
                    </p>
                  </div>
                </div>

                <Button
                  onClick={handleSendNotification}
                  disabled={!notificationTitle.trim() || !notificationMessage.trim() || isSending}
                  className="w-full bg-social-green hover:bg-social-light-green text-white font-pixelated text-xs h-8"
                >
                  <Send className="h-3 w-3 mr-1" />
                  {isSending ? 'Broadcasting...' : `Broadcast to ${userCount} Users`}
                </Button>
              </CardContent>
            </Card>

            <Alert>
              <Bell className="h-3 w-3" />
              <AlertDescription className="font-pixelated text-xs">
                Uses Firebase Realtime Database for instant broadcasting. Notifications appear immediately as toast messages for all logged-in users.
              </AlertDescription>
            </Alert>

            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-2">
              <p className="font-pixelated text-xs text-yellow-800">
                <strong>Security:</strong> Auto-logout after 5 minutes or page refresh.
              </p>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}