DROP POLICY "Users can view their own engineers" ON engineers;
CREATE POLICY "Users can view their own engineers" ON engineers FOR SELECT USING (
  auth.uid() = user_id OR auth.uid() = auth_user_id
);