-- Allow anon role to update orders (needed for soft delete)
-- This is required for BYPASS_AUTH mode to work
DROP POLICY IF EXISTS "Allow anon to update orders" ON orders;
CREATE POLICY "Allow anon to update orders" ON orders
  FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

-- Also allow anon to delete via soft-delete (update deleted_at)
DROP POLICY IF EXISTS "Allow anon to soft delete orders" ON orders;
CREATE POLICY "Allow anon to soft delete orders" ON orders
  FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

-- Allow anon to read orders
DROP POLICY IF EXISTS "Allow anon to read orders" ON orders;
CREATE POLICY "Allow anon to read orders" ON orders
  FOR SELECT
  TO anon
  USING (true);

-- Allow anon to insert orders
DROP POLICY IF EXISTS "Allow anon to insert orders" ON orders;
CREATE POLICY "Allow anon to insert orders" ON orders
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- Allow anon to delete order_dresses
DROP POLICY IF EXISTS "Allow anon to delete order_dresses" ON order_dresses;
CREATE POLICY "Allow anon to delete order_dresses" ON order_dresses
  FOR DELETE
  TO anon
  USING (true);

-- Allow anon to delete order_accessories
DROP POLICY IF EXISTS "Allow anon to delete order_accessories" ON order_accessories;
CREATE POLICY "Allow anon to delete order_accessories" ON order_accessories
  FOR DELETE
  TO anon
  USING (true);
