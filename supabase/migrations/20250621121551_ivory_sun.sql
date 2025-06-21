/*
  # Fix Posts Schema and Add Missing Columns

  1. Schema Updates
    - Add `comments_disabled` column to posts table
    - Add `visibility` column to posts table
    - Update existing posts with default values

  2. Security
    - Update RLS policies for posts
    - Ensure proper access control

  3. Indexes
    - Add performance indexes
*/

-- Add missing columns to posts table
DO $$
BEGIN
  -- Add comments_disabled column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' 
    AND table_name = 'posts' 
    AND column_name = 'comments_disabled'
  ) THEN
    ALTER TABLE public.posts ADD COLUMN comments_disabled boolean DEFAULT false;
  END IF;

  -- Add visibility column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' 
    AND table_name = 'posts' 
    AND column_name = 'visibility'
  ) THEN
    ALTER TABLE public.posts ADD COLUMN visibility text DEFAULT 'public';
  END IF;
END $$;

-- Update any NULL values
UPDATE public.posts SET comments_disabled = false WHERE comments_disabled IS NULL;
UPDATE public.posts SET visibility = 'public' WHERE visibility IS NULL;

-- Add constraints
DO $$
BEGIN
  -- Add visibility constraint if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_schema = 'public'
    AND table_name = 'posts'
    AND constraint_name = 'posts_visibility_check'
  ) THEN
    ALTER TABLE public.posts ADD CONSTRAINT posts_visibility_check 
      CHECK (visibility IN ('public', 'friends'));
  END IF;
END $$;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_posts_comments_disabled ON public.posts(comments_disabled);
CREATE INDEX IF NOT EXISTS idx_posts_visibility ON public.posts(visibility);
CREATE INDEX IF NOT EXISTS idx_posts_user_visibility ON public.posts(user_id, visibility);
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON public.posts(created_at DESC);

-- Ensure posts table has proper replica identity for realtime
ALTER TABLE public.posts REPLICA IDENTITY FULL;

-- Drop and recreate RLS policies for posts
DROP POLICY IF EXISTS "Users can view own posts" ON public.posts;
DROP POLICY IF EXISTS "Anyone can view public posts" ON public.posts;
DROP POLICY IF EXISTS "Users can view friends posts from friends" ON public.posts;
DROP POLICY IF EXISTS "Users can insert own posts" ON public.posts;
DROP POLICY IF EXISTS "Users can update own posts" ON public.posts;
DROP POLICY IF EXISTS "Users can delete own posts" ON public.posts;

-- Create comprehensive RLS policies for posts
CREATE POLICY "Users can view own posts"
  ON public.posts FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Anyone can view public posts"
  ON public.posts FOR SELECT
  TO authenticated
  USING (visibility = 'public');

CREATE POLICY "Users can view friends posts from friends"
  ON public.posts FOR SELECT
  TO authenticated
  USING (
    visibility = 'friends'
    AND EXISTS (
      SELECT 1 FROM public.friends
      WHERE status = 'accepted'
      AND (
        (sender_id = auth.uid() AND receiver_id = posts.user_id)
        OR
        (sender_id = posts.user_id AND receiver_id = auth.uid())
      )
    )
  );

CREATE POLICY "Users can insert own posts"
  ON public.posts FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own posts"
  ON public.posts FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own posts"
  ON public.posts FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);