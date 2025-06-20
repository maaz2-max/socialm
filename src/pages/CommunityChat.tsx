import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  ArrowLeft, 
  Send, 
  Users, 
  Crown, 
  Hash, 
  Settings,
  UserMinus,
  Shield
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';

interface Community {
  id: string;
  name: string;
  description: string;
  avatar: string | null;
  admin_id: string;
  is_private: boolean;
  member_count: number;
  created_at: string;
}

interface Message {
  id: string;
  community_id: string;
  user_id: string;
  content: string;
  message_type: string;
  created_at: string;
  profiles: {
    name: string;
    username: string;
    avatar: string | null;
  };
}

interface Member {
  id: string;
  user_id: string;
  role: string;
  joined_at: string;
  profiles: {
    name: string;
    username: string;
    avatar: string | null;
  };
}

export function CommunityChat() {
  const { communityId } = useParams<{ communityId: string }>();
  const navigate = useNavigate();
  const [community, setCommunity] = useState<Community | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchCurrentUser();
  }, []);

  useEffect(() => {
    if (currentUser && communityId) {
      checkMembership();
    }
  }, [currentUser, communityId]);

  useEffect(() => {
    if (community && currentUser) {
      fetchMessages();
      fetchMembers();
      
      // Set up real-time subscriptions
      const messagesChannel = supabase
        .channel(`community-messages-${communityId}`)
        .on('postgres_changes', 
          { 
            event: 'INSERT', 
            schema: 'public', 
            table: 'community_messages',
            filter: `community_id=eq.${communityId}`
          }, 
          async (payload) => {
            const newMessage = payload.new as Message;
            
            // Fetch user profile for the new message
            const { data: profile } = await supabase
              .from('profiles')
              .select('name, username, avatar')
              .eq('id', newMessage.user_id)
              .single();
            
            if (profile) {
              setMessages(prev => [...prev, {
                ...newMessage,
                profiles: profile
              }]);
              scrollToBottom();
            }
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(messagesChannel);
      };
    }
  }, [community, currentUser, communityId]);

  const fetchCurrentUser = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single();
        
        setCurrentUser({ ...user, ...profile });
      }
    } catch (error) {
      console.error('Error fetching current user:', error);
    }
  };

  const checkMembership = async () => {
    try {
      // Check if user is a member of this community
      const { data: membership, error: membershipError } = await supabase
        .from('community_members')
        .select('status, role')
        .eq('community_id', communityId)
        .eq('user_id', currentUser.id)
        .eq('status', 'accepted')
        .single();

      if (membershipError || !membership) {
        toast({
          variant: 'destructive',
          title: 'Access denied',
          description: 'You are not a member of this community'
        });
        navigate('/communities');
        return;
      }

      // Fetch community details
      const { data: communityData, error: communityError } = await supabase
        .from('communities')
        .select('*')
        .eq('id', communityId)
        .single();

      if (communityError || !communityData) {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: 'Community not found'
        });
        navigate('/communities');
        return;
      }

      setCommunity(communityData);
      setLoading(false);
    } catch (error) {
      console.error('Error checking membership:', error);
      navigate('/communities');
    }
  };

  const fetchMessages = async () => {
    try {
      const { data, error } = await supabase
        .from('community_messages')
        .select(`
          *,
          profiles (name, username, avatar)
        `)
        .eq('community_id', communityId)
        .order('created_at', { ascending: true })
        .limit(100);

      if (error) throw error;
      setMessages(data || []);
      setTimeout(scrollToBottom, 100);
    } catch (error) {
      console.error('Error fetching messages:', error);
    }
  };

  const fetchMembers = async () => {
    try {
      const { data, error } = await supabase
        .from('community_members')
        .select(`
          *,
          profiles (name, username, avatar)
        `)
        .eq('community_id', communityId)
        .eq('status', 'accepted')
        .order('joined_at', { ascending: true });

      if (error) throw error;
      setMembers(data || []);
    } catch (error) {
      console.error('Error fetching members:', error);
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || sendingMessage) return;

    try {
      setSendingMessage(true);

      const { error } = await supabase
        .from('community_messages')
        .insert({
          community_id: communityId,
          user_id: currentUser.id,
          content: newMessage.trim(),
          message_type: 'text'
        });

      if (error) throw error;

      setNewMessage('');
    } catch (error) {
      console.error('Error sending message:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to send message'
      });
    } finally {
      setSendingMessage(false);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const formatMessageTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

    if (diffInHours < 24) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
  };

  const isAdmin = community?.admin_id === currentUser?.id;

  if (loading) {
    return (
      <DashboardLayout>
        <div className="max-w-4xl mx-auto p-4">
          <div className="animate-pulse space-y-4">
            <div className="h-16 bg-muted rounded-lg" />
            <div className="h-96 bg-muted rounded-lg" />
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (!community) {
    return (
      <DashboardLayout>
        <div className="max-w-4xl mx-auto p-4 text-center">
          <h2 className="font-pixelated text-lg mb-2">Community not found</h2>
          <Button onClick={() => navigate('/communities')} className="font-pixelated">
            Back to Communities
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto h-[calc(100vh-60px)] flex flex-col">
        {/* Header */}
        <Card className="rounded-b-none border-b-0">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => navigate('/communities')}
                  className="h-8 w-8"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                
                <Avatar className="w-10 h-10 border-2 border-social-green">
                  {community.avatar ? (
                    <AvatarImage src={community.avatar} alt={community.name} />
                  ) : (
                    <AvatarFallback className="bg-social-dark-green text-white font-pixelated">
                      <Hash className="h-5 w-5" />
                    </AvatarFallback>
                  )}
                </Avatar>
                
                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="font-pixelated text-lg font-medium">{community.name}</h1>
                    {isAdmin && <Crown className="h-4 w-4 text-yellow-500" />}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground font-pixelated">
                    <Users className="h-3 w-3" />
                    <span>{community.member_count} members</span>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowMembers(!showMembers)}
                  className="font-pixelated text-xs"
                >
                  <Users className="h-3 w-3 mr-1" />
                  Members
                </Button>
                {isAdmin && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="font-pixelated text-xs"
                  >
                    <Settings className="h-3 w-3 mr-1" />
                    Settings
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
        </Card>

        <div className="flex flex-1 min-h-0">
          {/* Chat Area */}
          <div className="flex-1 flex flex-col">
            {/* Messages */}
            <Card className="flex-1 rounded-none border-x-0 border-t-0">
              <CardContent className="p-0 h-full">
                <ScrollArea className="h-full p-4">
                  <div className="space-y-4">
                    {messages.map((message) => (
                      <div key={message.id} className="flex gap-3">
                        <Avatar className="w-8 h-8 mt-1">
                          {message.profiles.avatar ? (
                            <AvatarImage src={message.profiles.avatar} alt={message.profiles.name} />
                          ) : (
                            <AvatarFallback className="bg-social-dark-green text-white font-pixelated text-xs">
                              {message.profiles.name.substring(0, 2).toUpperCase()}
                            </AvatarFallback>
                          )}
                        </Avatar>
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-pixelated text-sm font-medium">
                              {message.profiles.name}
                            </span>
                            {community.admin_id === message.user_id && (
                              <Crown className="h-3 w-3 text-yellow-500" />
                            )}
                            <span className="font-pixelated text-xs text-muted-foreground">
                              {formatMessageTime(message.created_at)}
                            </span>
                          </div>
                          <p className="font-pixelated text-sm leading-relaxed whitespace-pre-wrap">
                            {message.content}
                          </p>
                        </div>
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            {/* Message Input */}
            <Card className="rounded-t-none border-t-0">
              <CardContent className="p-4">
                <div className="flex gap-2">
                  <Textarea
                    placeholder={`Message #${community.name.toLowerCase()}`}
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        sendMessage();
                      }
                    }}
                    className="min-h-[60px] max-h-[120px] resize-none font-pixelated text-sm"
                    disabled={sendingMessage}
                  />
                  <Button
                    onClick={sendMessage}
                    disabled={!newMessage.trim() || sendingMessage}
                    className="bg-social-green hover:bg-social-light-green text-white self-end h-[60px] w-12"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground font-pixelated mt-2">
                  Press Enter to send, Shift + Enter for new line
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Members Sidebar */}
          {showMembers && (
            <Card className="w-64 rounded-l-none border-l-0">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-pixelated text-sm font-medium">Members</h3>
                  <Badge variant="secondary" className="font-pixelated text-xs">
                    {members.length}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[calc(100vh-200px)]">
                  <div className="p-4 space-y-2">
                    {members.map((member) => (
                      <div key={member.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted/50">
                        <Avatar className="w-6 h-6">
                          {member.profiles.avatar ? (
                            <AvatarImage src={member.profiles.avatar} alt={member.profiles.name} />
                          ) : (
                            <AvatarFallback className="bg-social-dark-green text-white font-pixelated text-xs">
                              {member.profiles.name.substring(0, 2).toUpperCase()}
                            </AvatarFallback>
                          )}
                        </Avatar>
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1">
                            <p className="font-pixelated text-xs font-medium truncate">
                              {member.profiles.name}
                            </p>
                            {member.role === 'admin' && (
                              <Crown className="h-3 w-3 text-yellow-500" />
                            )}
                          </div>
                          <p className="font-pixelated text-xs text-muted-foreground truncate">
                            @{member.profiles.username}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}

export default CommunityChat;