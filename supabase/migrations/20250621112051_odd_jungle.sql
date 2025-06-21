-- Add comments_disabled column to posts table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'posts' AND column_name = 'comments_disabled'
  ) THEN
    ALTER TABLE posts ADD COLUMN comments_disabled boolean DEFAULT false;
  END IF;
END $$;

-- Add index for comments_disabled
CREATE INDEX IF NOT EXISTS idx_posts_comments_disabled ON posts(comments_disabled);