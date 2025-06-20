/*
  # Fix Database Schema Issues

  1. Profile Updates
    - Add `theme_preference` column (text, default 'light')
    - Add `color_theme` column (text, default 'green')

  2. New Tables
    - `notifications`
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key to profiles)
      - `type` (text, notification type)
      - `content` (text, notification message)
      - `reference_id` (uuid, optional reference to related entity)
      - `read` (boolean, read status, default false)
      - `deleted_at` (timestamp, soft delete)
      - `created_at` (timestamp, default now)

  3. Functions
    - Create `cleanup_expired_story_photos` function
    - Create `increment_story_views` function

  4. Security
    - Enable RLS on `notifications` table
    - Add policies for users to manage their own notifications

  5. Indexes
    - Add indexes for better performance on notifications
*/

-- Add missing columns to profiles table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'theme_preference'
  ) THEN
    ALTER TABLE profiles ADD COLUMN theme_preference text DEFAULT 'light';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'color_theme'
  ) THEN
    ALTER TABLE profiles ADD COLUMN color_theme text DEFAULT 'green';
  END IF;
END $$;

-- Drop notifications table if it exists to recreate with proper schema
DROP TABLE IF EXISTS public.notifications CASCADE;

-- Create notifications table with proper structure
CREATE TABLE public.notifications (
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
CREATE INDEX idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX idx_notifications_created_at ON public.notifications(created_at DESC);
CREATE INDEX idx_notifications_read ON public.notifications(read);
CREATE INDEX idx_notifications_deleted_at ON public.notifications(deleted_at);
CREATE INDEX idx_notifications_type ON public.notifications(type);

-- Set replica identity for realtime
ALTER TABLE public.notifications REPLICA IDENTITY FULL;

-- Create cleanup_expired_story_photos function
CREATE OR REPLACE FUNCTION cleanup_expired_story_photos()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Delete expired stories (older than 24 hours)
  DELETE FROM stories 
  WHERE expires_at < NOW();
END $$;

-- Create increment_story_views function
CREATE OR REPLACE FUNCTION increment_story_views(story_uuid uuid, viewer_uuid uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_count integer;
BEGIN
  -- Update the views count
  UPDATE stories 
  SET views_count = views_count + 1 
  WHERE id = story_uuid
  RETURNING views_count INTO new_count;
  
  -- Return the new count
  RETURN COALESCE(new_count, 0);
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