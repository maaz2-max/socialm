import React, { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { 
  Users, 
  Plus, 
  Search, 
  MessageSquare, 
  Crown, 
  UserPlus, 
  Check, 
  X,
  Settings,
  Globe,
  Lock,
  Calendar,
  Hash
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';
import { useNavigate } from 'react-router-dom';

interface Community {
  id: string;
  name: string;
  description: string;
  avatar: string | null;
  admin_id: string;
  is_private: boolean;
  member_count: number;
  created_at: string;
  admin_profile?: {
    name: string;
    username: string;
  };
  user_status?: 'accepted' | 'pending' | 'rejected' | null;
}

interface JoinRequest {
  id: string;
  community_id: string;
  user_id: string;
  status: string;
  created_at: string;
  profiles: {
    name: string;
    username: string;
    avatar: string | null;
  };
  communities: {
    name: string;
  };
}

export function Communities() {
  const [communities, setCommunities] = useState<Community[]>([]);
  const [myCommunities, setMyCommunities] = useState<Community[]>([]);
  const [joinRequests, setJoinRequests] = useState<JoinRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [createForm, setCreateForm] = useState({
    name: '',
    description: '',
    is_private: false
  });
  const [creating, setCreating] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    fetchCurrentUser();
  }, []);

  useEffect(() => {
    if (currentUser) {
      fetchCommunities();
      fetchMyCommunities();
      fetchJoinRequests();
      
      // Set up real-time subscriptions
      const communitiesChannel = supabase
        .channel('communities-realtime')
        .on('postgres_changes', 
          { event: '*', schema: 'public', table: 'communities' }, 
          () => {
            fetchCommunities();
            fetchMyCommunities();
          }
        )
        .on('postgres_changes', 
          { event: '*', schema: 'public', table: 'community_members' }, 
          () => {
            fetchCommunities();
            fetchMyCommunities();
            fetchJoinRequests();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(communitiesChannel);
      };
    }
  }, [currentUser]);

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

  const fetchCommunities = async () => {
    try {
      setLoading(true);

      // Fetch all communities (public and private that user has access to)
      const { data: allCommunities, error: communitiesError } = await supabase
        .from('communities')
        .select(`
          *,
          admin_profile:profiles!communities_admin_id_fkey(name, username)
        `)
        .order('created_at', { ascending: false });

      if (communitiesError) throw communitiesError;

      // Filter communities based on privacy and user access
      const accessibleCommunities = [];
      
      for (const community of allCommunities || []) {
        // Always show public communities
        if (!community.is_private) {
          accessibleCommunities.push(community);
        } else {
          // For private communities, check if user is a member or admin
          const { data: membership } = await supabase
            .from('community_members')
            .select('status')
            .eq('community_id', community.id)
            .eq('user_id', currentUser.id)
            .single();

          // Show private community if user is admin or has any membership status
          if (community.admin_id === currentUser.id || membership) {
            accessibleCommunities.push(community);
          }
        }
      }

      // Get user's membership status for each accessible community
      const communitiesWithStatus = await Promise.all(
        accessibleCommunities.map(async (community) => {
          const { data: membership } = await supabase
            .from('community_members')
            .select('status')
            .eq('community_id', community.id)
            .eq('user_id', currentUser.id)
            .single();

          return {
            ...community,
            user_status: membership?.status || null
          };
        })
      );

      setCommunities(communitiesWithStatus);
    } catch (error) {
      console.error('Error fetching communities:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to load communities'
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchMyCommunities = async () => {
    try {
      const { data, error } = await supabase
        .from('community_members')
        .select(`
          communities (
            *,
            admin_profile:profiles!communities_admin_id_fkey(name, username)
          )
        `)
        .eq('user_id', currentUser.id)
        .eq('status', 'accepted');

      if (error) throw error;

      const myCommunitiesList = data?.map(item => ({
        ...item.communities,
        user_status: 'accepted' as const
      })) || [];

      setMyCommunities(myCommunitiesList);
    } catch (error) {
      console.error('Error fetching my communities:', error);
    }
  };

  const fetchJoinRequests = async () => {
    try {
      // Get communities where current user is admin
      const { data: adminCommunities } = await supabase
        .from('communities')
        .select('id')
        .eq('admin_id', currentUser.id);

      if (!adminCommunities || adminCommunities.length === 0) {
        setJoinRequests([]);
        return;
      }

      // Fetch join requests for those communities
      const { data, error } = await supabase
        .from('community_members')
        .select(`
          *,
          profiles (name, username, avatar),
          communities (name)
        `)
        .eq('status', 'pending')
        .in('community_id', adminCommunities.map(c => c.id));

      if (error) throw error;
      setJoinRequests(data || []);
    } catch (error) {
      console.error('Error fetching join requests:', error);
    }
  };

  const createCommunity = async () => {
    if (!createForm.name.trim()) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Community name is required'
      });
      return;
    }

    try {
      setCreating(true);

      // Check if community name already exists
      const { data: existingCommunity } = await supabase
        .from('communities')
        .select('id')
        .eq('name', createForm.name.trim())
        .single();

      if (existingCommunity) {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: 'A community with this name already exists'
        });
        return;
      }

      const { data, error } = await supabase
        .from('communities')
        .insert({
          name: createForm.name.trim(),
          description: createForm.description.trim() || null,
          admin_id: currentUser.id,
          is_private: createForm.is_private
        })
        .select()
        .single();

      if (error) {
        console.error('Community creation error:', error);
        throw error;
      }

      toast({
        title: 'Community created!',
        description: `${createForm.name} has been created successfully`
      });

      setCreateForm({ name: '', description: '', is_private: false });
      setShowCreateDialog(false);
      
      // Refresh all data
      await Promise.all([
        fetchCommunities(),
        fetchMyCommunities(),
        fetchJoinRequests()
      ]);
    } catch (error) {
      console.error('Error creating community:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'Failed to create community'
      });
    } finally {
      setCreating(false);
    }
  };

  const joinCommunity = async (communityId: string) => {
    try {
      const { error } = await supabase
        .from('community_members')
        .insert({
          community_id: communityId,
          user_id: currentUser.id,
          status: 'pending'
        });

      if (error) {
        if (error.code === '23505') {
          toast({
            variant: 'destructive',
            title: 'Already requested',
            description: 'You have already sent a join request to this community'
          });
        } else {
          throw error;
        }
      } else {
        toast({
          title: 'Join request sent!',
          description: 'Your request to join the community has been sent'
        });
        fetchCommunities();
      }
    } catch (error) {
      console.error('Error joining community:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to send join request'
      });
    }
  };

  const handleJoinRequest = async (requestId: string, action: 'accept' | 'reject') => {
    try {
      const { error } = await supabase
        .from('community_members')
        .update({ 
          status: action === 'accept' ? 'accepted' : 'rejected',
          joined_at: action === 'accept' ? new Date().toISOString() : null
        })
        .eq('id', requestId);

      if (error) throw error;

      toast({
        title: `Request ${action}ed`,
        description: `The join request has been ${action}ed`
      });

      // Refresh all data
      await Promise.all([
        fetchJoinRequests(),
        fetchCommunities(),
        fetchMyCommunities()
      ]);
    } catch (error) {
      console.error('Error handling join request:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: `Failed to ${action} request`
      });
    }
  };

  const openCommunityChat = (community: Community) => {
    navigate(`/communities/${community.id}/chat`);
  };

  const filteredCommunities = communities.filter(community =>
    community.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    community.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const CommunityCard = ({ community, showJoinButton = true }: { community: Community; showJoinButton?: boolean }) => (
    <Card className="hover:shadow-md transition-all duration-200 hover-scale">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <Avatar className="w-12 h-12 border-2 border-social-green">
            {community.avatar ? (
              <AvatarImage src={community.avatar} alt={community.name} />
            ) : (
              <AvatarFallback className="bg-social-dark-green text-white font-pixelated text-sm">
                <Hash className="h-6 w-6" />
              </AvatarFallback>
            )}
          </Avatar>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-pixelated text-sm font-medium truncate">{community.name}</h3>
              {community.is_private ? (
                <Lock className="h-3 w-3 text-muted-foreground" />
              ) : (
                <Globe className="h-3 w-3 text-muted-foreground" />
              )}
              {community.admin_id === currentUser?.id && (
                <Crown className="h-3 w-3 text-yellow-500" />
              )}
            </div>
            
            {community.description && (
              <p className="font-pixelated text-xs text-muted-foreground mb-2 line-clamp-2">
                {community.description}
              </p>
            )}
            
            <div className="flex items-center gap-4 text-xs text-muted-foreground font-pixelated">
              <div className="flex items-center gap-1">
                <Users className="h-3 w-3" />
                <span>{community.member_count} members</span>
              </div>
              <div className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                <span>{formatDistanceToNow(new Date(community.created_at), { addSuffix: true })}</span>
              </div>
            </div>
            
            {community.admin_profile && (
              <p className="font-pixelated text-xs text-muted-foreground mt-1">
                Admin: {community.admin_profile.name}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1">
            {community.user_status === 'accepted' && (
              <Button
                onClick={() => openCommunityChat(community)}
                size="sm"
                className="bg-social-green hover:bg-social-light-green text-white font-pixelated text-xs h-6"
              >
                <MessageSquare className="h-3 w-3 mr-1" />
                Chat
              </Button>
            )}
            
            {showJoinButton && !community.user_status && community.admin_id !== currentUser?.id && (
              <Button
                onClick={() => joinCommunity(community.id)}
                size="sm"
                className="bg-social-blue hover:bg-social-blue/90 text-white font-pixelated text-xs h-6"
              >
                <UserPlus className="h-3 w-3 mr-1" />
                Join
              </Button>
            )}
            
            {community.user_status === 'pending' && (
              <Badge variant="secondary" className="text-xs font-pixelated">
                Pending
              </Badge>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );

  if (loading) {
    return (
      <DashboardLayout>
        <div className="max-w-4xl mx-auto p-3">
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <Card key={i} className="animate-pulse">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-full bg-muted" />
                    <div className="flex-1">
                      <div className="h-4 w-3/4 bg-muted rounded mb-2" />
                      <div className="h-3 w-1/2 bg-muted rounded" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto relative h-[calc(100vh-60px)] animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b bg-background sticky top-0 z-10 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <Users className="h-6 w-6 text-primary" />
            <div>
              <h1 className="font-pixelated text-lg font-medium">Communities</h1>
              <p className="font-pixelated text-xs text-muted-foreground">
                Join communities and chat with like-minded people
              </p>
            </div>
          </div>
          
          <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
            <DialogTrigger asChild>
              <Button className="bg-social-green hover:bg-social-light-green text-white font-pixelated text-xs">
                <Plus className="h-4 w-4 mr-2" />
                Create Community
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md mx-auto">
              <DialogHeader>
                <DialogTitle className="font-pixelated text-lg social-gradient bg-clip-text text-transparent">
                  Create New Community
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name" className="font-pixelated text-sm">Community Name</Label>
                  <Input
                    id="name"
                    placeholder="Enter community name"
                    value={createForm.name}
                    onChange={(e) => setCreateForm(prev => ({ ...prev, name: e.target.value }))}
                    className="font-pixelated text-sm"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="description" className="font-pixelated text-sm">Description (Optional)</Label>
                  <Textarea
                    id="description"
                    placeholder="Describe your community"
                    value={createForm.description}
                    onChange={(e) => setCreateForm(prev => ({ ...prev, description: e.target.value }))}
                    className="font-pixelated text-sm min-h-[80px]"
                  />
                </div>
                
                <div className="flex items-center space-x-2">
                  <Switch
                    id="private"
                    checked={createForm.is_private}
                    onCheckedChange={(checked) => setCreateForm(prev => ({ ...prev, is_private: checked }))}
                  />
                  <Label htmlFor="private" className="font-pixelated text-sm">
                    Private Community
                  </Label>
                </div>
                
                <div className="bg-muted/50 p-3 rounded-lg">
                  <p className="font-pixelated text-xs text-muted-foreground">
                    {createForm.is_private 
                      ? "🔒 Private: Only members can see and join this community"
                      : "🌍 Public: Anyone can discover and request to join this community"
                    }
                  </p>
                </div>
                
                <div className="flex gap-2 pt-2">
                  <Button
                    onClick={() => setShowCreateDialog(false)}
                    variant="outline"
                    className="flex-1 font-pixelated text-sm"
                    disabled={creating}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={createCommunity}
                    className="flex-1 bg-social-green hover:bg-social-light-green text-white font-pixelated text-sm"
                    disabled={creating || !createForm.name.trim()}
                  >
                    {creating ? 'Creating...' : 'Create'}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Content */}
        <Tabs defaultValue="discover" className="h-[calc(100vh-120px)]">
          <TabsList className="grid w-full grid-cols-3 mx-4 mt-4">
            <TabsTrigger value="discover" className="font-pixelated text-xs">
              Discover
            </TabsTrigger>
            <TabsTrigger value="my-communities" className="font-pixelated text-xs relative">
              My Communities
              {myCommunities.length > 0 && (
                <Badge variant="secondary" className="ml-2 h-4 w-4 p-0 text-xs">
                  {myCommunities.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="requests" className="font-pixelated text-xs relative">
              Requests
              {joinRequests.length > 0 && (
                <Badge variant="destructive" className="ml-2 h-4 w-4 p-0 text-xs animate-pulse">
                  {joinRequests.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="discover" className="h-[calc(100%-60px)] mt-4">
            <div className="px-4">
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search communities..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 font-pixelated text-sm"
                />
              </div>
            </div>
            
            <ScrollArea className="h-[calc(100%-80px)] px-4 scroll-container">
              {filteredCommunities.length > 0 ? (
                <div className="space-y-3 pb-4">
                  {filteredCommunities.map((community) => (
                    <CommunityCard key={community.id} community={community} />
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center py-12">
                  <Users className="h-16 w-16 text-muted-foreground mb-4 opacity-50" />
                  <h2 className="font-pixelated text-sm font-medium mb-2">
                    {searchQuery ? 'No communities found' : 'No communities yet'}
                  </h2>
                  <p className="font-pixelated text-xs text-muted-foreground max-w-sm leading-relaxed">
                    {searchQuery 
                      ? 'Try adjusting your search terms'
                      : 'Be the first to create a community and start building your network!'
                    }
                  </p>
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="my-communities" className="h-[calc(100%-60px)] mt-4">
            <ScrollArea className="h-full px-4 scroll-container">
              {myCommunities.length > 0 ? (
                <div className="space-y-3 pb-4">
                  {myCommunities.map((community) => (
                    <CommunityCard key={community.id} community={community} showJoinButton={false} />
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center py-12">
                  <MessageSquare className="h-16 w-16 text-muted-foreground mb-4 opacity-50" />
                  <h2 className="font-pixelated text-sm font-medium mb-2">No communities joined</h2>
                  <p className="font-pixelated text-xs text-muted-foreground max-w-sm leading-relaxed">
                    Join communities to start chatting with people who share your interests!
                  </p>
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="requests" className="h-[calc(100%-60px)] mt-4">
            <ScrollArea className="h-full px-4 scroll-container">
              {joinRequests.length > 0 ? (
                <div className="space-y-3 pb-4">
                  {joinRequests.map((request) => (
                    <Card key={request.id} className="hover:shadow-md transition-all duration-200">
                      <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                          <Avatar className="w-10 h-10">
                            {request.profiles.avatar ? (
                              <AvatarImage src={request.profiles.avatar} alt={request.profiles.name} />
                            ) : (
                              <AvatarFallback className="bg-social-dark-green text-white font-pixelated text-xs">
                                {request.profiles.name.substring(0, 2).toUpperCase()}
                              </AvatarFallback>
                            )}
                          </Avatar>
                          
                          <div className="flex-1 min-w-0">
                            <p className="font-pixelated text-sm font-medium">
                              {request.profiles.name}
                            </p>
                            <p className="font-pixelated text-xs text-muted-foreground">
                              wants to join <strong>{request.communities.name}</strong>
                            </p>
                            <p className="font-pixelated text-xs text-muted-foreground">
                              {formatDistanceToNow(new Date(request.created_at), { addSuffix: true })}
                            </p>
                          </div>
                          
                          <div className="flex gap-1">
                            <Button
                              onClick={() => handleJoinRequest(request.id, 'accept')}
                              size="sm"
                              className="bg-social-green hover:bg-social-light-green text-white font-pixelated text-xs h-6"
                            >
                              <Check className="h-3 w-3" />
                            </Button>
                            <Button
                              onClick={() => handleJoinRequest(request.id, 'reject')}
                              size="sm"
                              variant="destructive"
                              className="font-pixelated text-xs h-6"
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center py-12">
                  <UserPlus className="h-16 w-16 text-muted-foreground mb-4 opacity-50" />
                  <h2 className="font-pixelated text-sm font-medium mb-2">No join requests</h2>
                  <p className="font-pixelated text-xs text-muted-foreground max-w-sm leading-relaxed">
                    When people request to join your communities, they'll appear here for approval.
                  </p>
                </div>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}

export default Communities;