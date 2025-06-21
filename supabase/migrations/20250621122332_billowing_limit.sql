-- Ensure posts table has all necessary columns with proper defaults
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
    RAISE NOTICE 'Added comments_disabled column to posts table';
  END IF;

  -- Add visibility column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' 
    AND table_name = 'posts' 
    AND column_name = 'visibility'
  ) THEN
    ALTER TABLE public.posts ADD COLUMN visibility text DEFAULT 'public';
    RAISE NOTICE 'Added visibility column to posts table';
  END IF;
END $$;

-- Update any NULL values to proper defaults
UPDATE public.posts SET comments_disabled = false WHERE comments_disabled IS NULL;
UPDATE public.posts SET visibility = 'public' WHERE visibility IS NULL;

-- Add constraints if they don't exist
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
    RAISE NOTICE 'Added visibility constraint to posts table';
  END IF;
END $$;

-- Create indexes for better performance (only if they don't exist)
CREATE INDEX IF NOT EXISTS idx_posts_comments_disabled ON public.posts(comments_disabled);
CREATE INDEX IF NOT EXISTS idx_posts_visibility ON public.posts(visibility);
CREATE INDEX IF NOT EXISTS idx_posts_user_visibility ON public.posts(user_id, visibility);
CREATE INDEX IF NOT EXISTS idx_posts_created_at_desc ON public.posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_user_created ON public.posts(user_id, created_at DESC);

-- Ensure posts table has proper replica identity for realtime
ALTER TABLE public.posts REPLICA IDENTITY FULL;

-- Refresh RLS policies to ensure they work with new columns
-- Drop existing policies first
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

-- Add posts to realtime publication if not already added
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.posts;
  EXCEPTION
    WHEN duplicate_object THEN
      NULL; -- Table already in publication
  END;
END $$;

-- Refresh the schema cache
NOTIFY pgrst, 'reload schema';