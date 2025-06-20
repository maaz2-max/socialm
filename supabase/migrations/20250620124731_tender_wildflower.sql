/*
  # Create Communities Feature

  1. New Tables
    - `communities`
      - `id` (uuid, primary key)
      - `name` (text, community name)
      - `description` (text, community description)
      - `avatar` (text, community avatar URL)
      - `admin_id` (uuid, foreign key to profiles)
      - `is_private` (boolean, private/public community)
      - `member_count` (integer, number of members)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

    - `community_members`
      - `id` (uuid, primary key)
      - `community_id` (uuid, foreign key to communities)
      - `user_id` (uuid, foreign key to profiles)
      - `status` (text, pending/accepted/rejected)
      - `role` (text, admin/member)
      - `joined_at` (timestamp)
      - `created_at` (timestamp)

    - `community_messages`
      - `id` (uuid, primary key)
      - `community_id` (uuid, foreign key to communities)
      - `user_id` (uuid, foreign key to profiles)
      - `content` (text, message content)
      - `message_type` (text, text/image/file)
      - `created_at` (timestamp)

  2. Security
    - Enable RLS on all tables
    - Add policies for community access control
    - Members can only see communities they belong to
    - Only admins can approve/reject join requests

  3. Functions
    - Function to update member count
    - Function to handle join requests
*/

-- Create communities table
CREATE TABLE IF NOT EXISTS communities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  avatar text,
  admin_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  is_private boolean DEFAULT false,
  member_count integer DEFAULT 1,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create community_members table
CREATE TABLE IF NOT EXISTS community_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  role text DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  joined_at timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE(community_id, user_id)
);

-- Create community_messages table
CREATE TABLE IF NOT EXISTS community_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content text NOT NULL,
  message_type text DEFAULT 'text' CHECK (message_type IN ('text', 'image', 'file')),
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE communities ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_messages ENABLE ROW LEVEL SECURITY;

-- RLS Policies for communities
CREATE POLICY "Users can view communities they are members of"
  ON communities FOR SELECT
  TO authenticated
  USING (
    id IN (
      SELECT community_id FROM community_members 
      WHERE user_id = auth.uid() AND status = 'accepted'
    )
    OR admin_id = auth.uid()
  );

CREATE POLICY "Users can view public communities"
  ON communities FOR SELECT
  TO authenticated
  USING (is_private = false);

CREATE POLICY "Users can create communities"
  ON communities FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = admin_id);

CREATE POLICY "Admins can update their communities"
  ON communities FOR UPDATE
  TO authenticated
  USING (auth.uid() = admin_id);

CREATE POLICY "Admins can delete their communities"
  ON communities FOR DELETE
  TO authenticated
  USING (auth.uid() = admin_id);

-- RLS Policies for community_members
CREATE POLICY "Users can view community members"
  ON community_members FOR SELECT
  TO authenticated
  USING (
    community_id IN (
      SELECT community_id FROM community_members 
      WHERE user_id = auth.uid() AND status = 'accepted'
    )
    OR user_id = auth.uid()
  );

CREATE POLICY "Users can join communities"
  ON community_members FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can update member status"
  ON community_members FOR UPDATE
  TO authenticated
  USING (
    community_id IN (
      SELECT id FROM communities WHERE admin_id = auth.uid()
    )
    OR user_id = auth.uid()
  );

CREATE POLICY "Users can leave communities"
  ON community_members FOR DELETE
  TO authenticated
  USING (
    auth.uid() = user_id
    OR community_id IN (
      SELECT id FROM communities WHERE admin_id = auth.uid()
    )
  );

-- RLS Policies for community_messages
CREATE POLICY "Members can view community messages"
  ON community_messages FOR SELECT
  TO authenticated
  USING (
    community_id IN (
      SELECT community_id FROM community_members 
      WHERE user_id = auth.uid() AND status = 'accepted'
    )
  );

CREATE POLICY "Members can send messages"
  ON community_messages FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND community_id IN (
      SELECT community_id FROM community_members 
      WHERE user_id = auth.uid() AND status = 'accepted'
    )
  );

CREATE POLICY "Users can update their own messages"
  ON community_messages FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own messages"
  ON community_messages FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create indexes for performance
CREATE INDEX idx_communities_admin_id ON communities(admin_id);
CREATE INDEX idx_communities_is_private ON communities(is_private);
CREATE INDEX idx_community_members_community_id ON community_members(community_id);
CREATE INDEX idx_community_members_user_id ON community_members(user_id);
CREATE INDEX idx_community_members_status ON community_members(status);
CREATE INDEX idx_community_messages_community_id ON community_messages(community_id);
CREATE INDEX idx_community_messages_created_at ON community_messages(created_at DESC);

-- Function to update member count
CREATE OR REPLACE FUNCTION update_community_member_count()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'accepted' THEN
    UPDATE communities 
    SET member_count = member_count + 1,
        updated_at = now()
    WHERE id = NEW.community_id;
  ELSIF TG_OP = 'UPDATE' AND OLD.status != 'accepted' AND NEW.status = 'accepted' THEN
    UPDATE communities 
    SET member_count = member_count + 1,
        updated_at = now()
    WHERE id = NEW.community_id;
  ELSIF TG_OP = 'UPDATE' AND OLD.status = 'accepted' AND NEW.status != 'accepted' THEN
    UPDATE communities 
    SET member_count = member_count - 1,
        updated_at = now()
    WHERE id = NEW.community_id;
  ELSIF TG_OP = 'DELETE' AND OLD.status = 'accepted' THEN
    UPDATE communities 
    SET member_count = member_count - 1,
        updated_at = now()
    WHERE id = OLD.community_id;
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Create triggers
CREATE TRIGGER trigger_update_member_count
  AFTER INSERT OR UPDATE OR DELETE ON community_members
  FOR EACH ROW EXECUTE FUNCTION update_community_member_count();

-- Function to auto-accept admin as member
CREATE OR REPLACE FUNCTION auto_accept_admin_membership()
RETURNS trigger AS $$
BEGIN
  INSERT INTO community_members (community_id, user_id, status, role, joined_at)
  VALUES (NEW.id, NEW.admin_id, 'accepted', 'admin', now());
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for auto-accepting admin
CREATE TRIGGER trigger_auto_accept_admin
  AFTER INSERT ON communities
  FOR EACH ROW EXECUTE FUNCTION auto_accept_admin_membership();

-- Set replica identity for realtime
ALTER TABLE communities REPLICA IDENTITY FULL;
ALTER TABLE community_members REPLICA IDENTITY FULL;
ALTER TABLE community_messages REPLICA IDENTITY FULL;