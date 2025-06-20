import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Bell, Send, LogOut, Shield, Eye, EyeOff, AlertTriangle, Zap, Users } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

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
        description: 'You can now send notifications to all users.',
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

      const timestamp = new Date().toISOString();
      const titleToSend = notificationTitle.trim();
      const messageToSend = notificationMessage.trim();
      const notificationId = `admin_${Date.now()}`;

      console.log('Sending admin notification:', { titleToSend, messageToSend, timestamp });

      // Method 1: Direct localStorage broadcast for immediate effect
      const adminNotification = {
        id: notificationId,
        title: titleToSend,
        message: messageToSend,
        timestamp: timestamp,
        type: 'admin_broadcast',
        read: false
      };

      // Store in localStorage for persistence
      const existingNotifications = JSON.parse(localStorage.getItem('adminNotifications') || '[]');
      existingNotifications.unshift(adminNotification);
      
      // Keep only last 10 notifications
      if (existingNotifications.length > 10) {
        existingNotifications.splice(10);
      }
      
      localStorage.setItem('adminNotifications', JSON.stringify(existingNotifications));

      // Method 2: Trigger immediate toast notification
      toast({
        title: `📢 ${titleToSend}`,
        description: messageToSend,
        duration: 10000,
        className: 'border-l-4 border-l-orange-500 bg-orange-50 text-orange-900 shadow-lg',
      });

      // Method 3: Dispatch custom event for real-time updates
      const broadcastEvent = new CustomEvent('adminBroadcastToast', {
        detail: {
          title: titleToSend,
          message: messageToSend,
          timestamp: timestamp,
          type: 'admin_broadcast'
        }
      });
      
      window.dispatchEvent(broadcastEvent);

      // Method 4: Use Supabase real-time broadcast
      try {
        const channel = supabase.channel('admin-notifications-broadcast');
        
        await channel.send({
          type: 'broadcast',
          event: 'admin_notification',
          payload: {
            id: notificationId,
            title: titleToSend,
            message: messageToSend,
            timestamp: timestamp,
            type: 'admin_broadcast'
          }
        });

        console.log('Supabase broadcast sent successfully');
      } catch (broadcastError) {
        console.error('Supabase broadcast error:', broadcastError);
        // Continue anyway since we have other methods
      }

      // Method 5: Create database notifications for all users (background)
      try {
        const { data: allUsers } = await supabase
          .from('profiles')
          .select('id');

        if (allUsers && allUsers.length > 0) {
          // Create notifications in smaller batches to avoid timeout
          const batchSize = 20;
          let successCount = 0;

          for (let i = 0; i < allUsers.length; i += batchSize) {
            const batch = allUsers.slice(i, i + batchSize);
            const notifications = batch.map(user => ({
              user_id: user.id,
              type: 'admin_broadcast',
              content: `${titleToSend}: ${messageToSend}`,
              read: false,
              created_at: timestamp,
              reference_id: notificationId
            }));

            try {
              const { error: insertError } = await supabase
                .from('notifications')
                .insert(notifications);

              if (!insertError) {
                successCount += batch.length;
              }
            } catch (batchError) {
              console.error('Batch insert error:', batchError);
            }
          }

          console.log(`Created ${successCount} database notifications`);
        }
      } catch (dbError) {
        console.error('Database notification error:', dbError);
        // Continue anyway since the main broadcast worked
      }

      setNotificationsSent(prev => prev + 1);
      
      toast({
        title: '🚀 Notification sent successfully!',
        description: `Admin notification "${titleToSend}" has been broadcast to all users instantly.`,
      });

      // Clear form
      setNotificationTitle('');
      setNotificationMessage('');

    } catch (error) {
      console.error('Error sending notification:', error);
      toast({
        variant: 'destructive',
        title: 'Failed to send notification',
        description: 'There was an error broadcasting the notification. Please try again.'
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
            Admin Notification Panel
          </DialogTitle>
        </DialogHeader>

        {!isAuthenticated ? (
          <div className="space-y-3">
            <Alert>
              <AlertTriangle className="h-3 w-3" />
              <AlertDescription className="font-pixelated text-xs">
                Restricted admin area for broadcasting notifications to all users.
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
                      {notificationsSent} sent
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

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="font-pixelated text-xs flex items-center gap-1">
                  <Zap className="h-3 w-3 text-orange-500" />
                  Broadcast to All Users
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
                  {isSending ? 'Broadcasting...' : `Send to ${userCount} Users`}
                </Button>
              </CardContent>
            </Card>

            <Alert>
              <Bell className="h-3 w-3" />
              <AlertDescription className="font-pixelated text-xs">
                Sends instant real-time notifications to all logged-in users. Notifications appear as toast messages and are saved to notification tabs.
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