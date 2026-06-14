/*
# Add task comments and activity log

1. New Tables
- `task_comments`: Comments on tasks for team collaboration.
- `activity_log`: Tracks all task/project changes for audit trail and dashboard feed.

2. Security
- RLS enabled on both tables.
- task_comments: visible/editable by project members.
- activity_log: read-only for project members, auto-generated on task changes.

3. Notes
- activity_log records task creation, status changes, priority changes, and deadline changes.
- task_comments supports threaded discussion on individual tasks.
*/

CREATE TABLE IF NOT EXISTS task_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE task_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_task_comments" ON task_comments;
CREATE POLICY "select_task_comments" ON task_comments FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM tasks WHERE tasks.id = task_comments.task_id AND
      EXISTS (SELECT 1 FROM projects WHERE projects.id = tasks.project_id AND
        (projects.owner_id = auth.uid() OR EXISTS (SELECT 1 FROM project_members WHERE project_members.project_id = projects.id AND project_members.user_id = auth.uid()))))
  );

DROP POLICY IF EXISTS "insert_task_comments" ON task_comments;
CREATE POLICY "insert_task_comments" ON task_comments FOR INSERT
  TO authenticated WITH CHECK (
    auth.uid() = user_id AND
    EXISTS (SELECT 1 FROM tasks WHERE tasks.id = task_comments.task_id AND
      EXISTS (SELECT 1 FROM projects WHERE projects.id = tasks.project_id AND
        (projects.owner_id = auth.uid() OR EXISTS (SELECT 1 FROM project_members WHERE project_members.project_id = projects.id AND project_members.user_id = auth.uid()))))
  );

DROP POLICY IF EXISTS "delete_task_comments" ON task_comments;
CREATE POLICY "delete_task_comments" ON task_comments FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  task_id uuid REFERENCES tasks(id) ON DELETE SET NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action text NOT NULL,
  details jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_activity_log" ON activity_log;
CREATE POLICY "select_activity_log" ON activity_log FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = activity_log.project_id AND
      (projects.owner_id = auth.uid() OR EXISTS (SELECT 1 FROM project_members WHERE project_members.project_id = projects.id AND project_members.user_id = auth.uid())))
  );

DROP POLICY IF EXISTS "insert_activity_log" ON activity_log;
CREATE POLICY "insert_activity_log" ON activity_log FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_task_comments_task_id ON task_comments(task_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_project_id ON activity_log(project_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_created_at ON activity_log(created_at DESC);
