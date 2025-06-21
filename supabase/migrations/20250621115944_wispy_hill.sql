/*
  # Fix Missing Database Schema

  1. Create missing tables and columns
    - Create `notifications` table if not exists
    - Add `comments_disabled` column to posts table
    - Fix `expires_at` column type in stories table

  2. Security
    - Enable RLS on all tables
    - Add proper policies

  3. Functions
    - Fix cleanup_expired_story_photos function
*/

-- Create notifications table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type text NOT NULL,
  content text NOT NULL,
  reference_id uuid,
  read boolean DEFAULT false,
  deleted_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS on notifications table
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist to avoid conflicts
DROP POLICY IF EXISTS "Users can read own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can insert own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can delete own notifications" ON public.notifications;
DROP POLICY IF EXISTS "System can insert notifications for any user" ON public.notifications;

-- Create RLS policies for notifications
CREATE POLICY "Users can read own notifications"
  ON public.notifications FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own notifications"
  ON public.notifications FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own notifications"
  ON public.notifications FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own notifications"
  ON public.notifications FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "System can insert notifications for any user"
  ON public.notifications FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON public.notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON public.notifications(read);
CREATE INDEX IF NOT EXISTS idx_notifications_deleted_at ON public.notifications(deleted_at);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON public.notifications(type);

-- Set replica identity for realtime
ALTER TABLE public.notifications REPLICA IDENTITY FULL;

-- Add comments_disabled column to posts table if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'posts' AND column_name = 'comments_disabled'
  ) THEN
    ALTER TABLE public.posts ADD COLUMN comments_disabled boolean DEFAULT false;
  END IF;
END $$;

-- Add index for comments_disabled
CREATE INDEX IF NOT EXISTS idx_posts_comments_disabled ON public.posts(comments_disabled);

-- Fix expires_at column type in stories table if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'stories'
  ) THEN
    -- Check if expires_at column exists and fix its type
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'stories' AND column_name = 'expires_at'
    ) THEN
      -- Drop and recreate the column with correct type
      ALTER TABLE public.stories DROP COLUMN IF EXISTS expires_at;
      ALTER TABLE public.stories ADD COLUMN expires_at timestamptz DEFAULT (now() + interval '24 hours');
    END IF;
  END IF;
END $$;

-- Create or replace cleanup_expired_story_photos function with correct types
CREATE OR REPLACE FUNCTION cleanup_expired_story_photos()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Delete expired stories (older than 24 hours)
  -- Use proper timestamp comparison
  DELETE FROM public.stories 
  WHERE expires_at < NOW();
END $$;

-- Create or replace increment_story_views function
CREATE OR REPLACE FUNCTION increment_story_views(story_uuid uuid, viewer_uuid uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_count integer;
BEGIN
  -- Update the views count
  UPDATE public.stories 
  SET views_count = views_count + 1 
  WHERE id = story_uuid
  RETURNING views_count INTO new_count;
  
  -- Return the new count
  RETURN COALESCE(new_count, 0);
END $$;

-- Add theme preference columns to profiles if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'theme_preference'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN theme_preference text DEFAULT 'light';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'color_theme'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN color_theme text DEFAULT 'green';
  END IF;
END $$;

-- Add to realtime publication
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  EXCEPTION
    WHEN duplicate_object THEN
      NULL; -- Table already in publication
  END;
END $$;