import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { loginUser } from '@/utils/authUtils';
import { supabase } from '@/integrations/supabase/client';
import { Eye, EyeOff, Mail, Clock } from 'lucide-react';

export function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState('');
  const [forgotPasswordLoading, setForgotPasswordLoading] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email.trim()) {
      setError('Please enter your email address');
      return;
    }

    if (!password.trim()) {
      setError('Please enter your password');
      return;
    }

    if (!email.includes('@')) {
      setError('Please enter a valid email address');
      return;
    }

    try {
      setLoading(true);
      await loginUser(email.trim(), password);
      
      toast({
        title: 'Welcome back!',
        description: 'You have been successfully logged in.',
      });
      
      navigate('/dashboard');
    } catch (error: any) {
      console.error('Login error:', error);
      
      // Provide specific error messages
      if (error.message?.includes('Invalid login credentials')) {
        setError('Invalid email or password. Please check your credentials and try again.');
      } else if (error.message?.includes('Email not confirmed')) {
        setError('Please check your email and click the confirmation link before logging in.');
      } else if (error.message?.includes('Too many requests')) {
        setError('Too many login attempts. Please wait a few minutes and try again.');
      } else if (error.message?.includes('User not found')) {
        setError('No account found with this email address. Please sign up first.');
      } else {
        setError('Login failed. Please check your email and password and try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    try {
      setGoogleLoading(true);
      setError('');

      // Show coming soon message
      toast({
        title: 'Coming Soon!',
        description: 'Google Sign-In integration is coming soon. Please use email/password for now.',
        duration: 5000,
      });

    } catch (error: any) {
      console.error('Google login error:', error);
      setError('Google login failed. Please try again.');
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!forgotPasswordEmail.trim()) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Please enter your email address'
      });
      return;
    }

    if (!forgotPasswordEmail.includes('@')) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Please enter a valid email address'
      });
      return;
    }

    try {
      setForgotPasswordLoading(true);
      
      const { error } = await supabase.auth.resetPasswordForEmail(forgotPasswordEmail.trim(), {
        redirectTo: `${window.location.origin}/reset-password`
      });

      if (error) throw error;

      toast({
        title: 'Password reset email sent!',
        description: 'Please check your email for further instructions. If you don\'t receive an email, contact support@socialchat.site'
      });
      
      setShowForgotPassword(false);
      setForgotPasswordEmail('');
    } catch (error: any) {
      console.error('Password reset error:', error);
      toast({
        variant: 'destructive',
        title: 'Password reset failed',
        description: 'Unable to send password reset email. For security reasons, password changing is disabled. Please contact support@socialchat.site for assistance.'
      });
    } finally {
      setForgotPasswordLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl font-bold text-center font-pixelated social-gradient bg-clip-text text-transparent">
          Welcome Back
        </CardTitle>
        <p className="text-center text-muted-foreground font-pixelated text-sm">
          Sign in to your SocialChat account
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertDescription className="font-pixelated text-sm">
              {error}
            </AlertDescription>
          </Alert>
        )}

        {/* Google Login Button */}
        <Button
          onClick={handleGoogleLogin}
          disabled={googleLoading || loading}
          variant="outline"
          className="w-full font-pixelated text-sm h-10 border-2 hover:bg-gray-50 transition-colors relative"
        >
          {googleLoading ? (
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" />
              Connecting...
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Continue with Google
              <div className="absolute top-1 right-1">
                <Clock className="h-3 w-3 text-orange-500" />
              </div>
            </div>
          )}
        </Button>

        {/* Coming Soon Badge for Google */}
        <div className="text-center">
          <span className="inline-flex items-center gap-1 px-2 py-1 bg-orange-100 text-orange-800 rounded-full text-xs font-pixelated">
            <Clock className="h-3 w-3" />
            Google Sign-In Coming Soon
          </span>
        </div>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground font-pixelated">
              Or continue with email
            </span>
          </div>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email" className="font-pixelated">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="font-pixelated"
              disabled={loading || googleLoading}
              autoComplete="email"
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="password" className="font-pixelated">Password</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="font-pixelated pr-10"
                disabled={loading || googleLoading}
                autoComplete="current-password"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                onClick={() => setShowPassword(!showPassword)}
                disabled={loading || googleLoading}
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <Eye className="h-4 w-4 text-muted-foreground" />
                )}
              </Button>
            </div>
          </div>

          <div className="flex justify-end">
            <Dialog open={showForgotPassword} onOpenChange={setShowForgotPassword}>
              <DialogTrigger asChild>
                <Button variant="link" className="px-0 font-pixelated text-sm text-primary">
                  Forgot password?
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle className="font-pixelated text-lg">Reset Password</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleForgotPassword} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="forgot-email" className="font-pixelated">Email Address</Label>
                    <Input
                      id="forgot-email"
                      type="email"
                      placeholder="Enter your email"
                      value={forgotPasswordEmail}
                      onChange={(e) => setForgotPasswordEmail(e.target.value)}
                      className="font-pixelated"
                      disabled={forgotPasswordLoading}
                    />
                  </div>
                  <div className="bg-muted p-3 rounded-lg">
                    <p className="text-sm font-pixelated text-muted-foreground">
                      For security reasons, password changing is disabled. If you need assistance, please contact{' '}
                      <a href="mailto:support@socialchat.site" className="text-primary underline">
                        support@socialchat.site
                      </a>
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setShowForgotPassword(false)}
                      disabled={forgotPasswordLoading}
                      className="flex-1 font-pixelated"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      disabled={forgotPasswordLoading || !forgotPasswordEmail.trim()}
                      className="flex-1 font-pixelated"
                    >
                      {forgotPasswordLoading ? 'Sending...' : 'Send Reset Email'}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>
          
          <Button 
            type="submit" 
            className="w-full btn-gradient font-pixelated"
            disabled={loading || googleLoading}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </Button>
        </form>
        
        <div className="text-center">
          <p className="text-sm text-muted-foreground font-pixelated">
            Don't have an account?{' '}
            <Link to="/register" className="text-primary hover:underline font-medium">
              Sign up
            </Link>
          </p>
        </div>
      </CardContent>
    </Card>
  );
}