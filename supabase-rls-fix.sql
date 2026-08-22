-- ============================================================
-- RLS Policies for Aura Rental - Allow anonymous access
-- ============================================================
-- Run this SQL in Supabase Dashboard > SQL Editor
-- Project: mmiygzcljqayrfomxkkk

-- Orders table - allow all operations for anon role
DROP POLICY IF EXISTS "anon_select_orders" ON orders;
CREATE POLICY "anon_select_orders" ON orders FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "anon_insert_orders" ON orders;
CREATE POLICY "anon_insert_orders" ON orders FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_orders" ON orders;
CREATE POLICY "anon_update_orders" ON orders FOR UPDATE TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_orders" ON orders;
CREATE POLICY "anon_delete_orders" ON orders FOR DELETE TO anon USING (true);

-- Dresses table - allow all operations for anon role
DROP POLICY IF EXISTS "anon_select_dresses" ON dresses;
CREATE POLICY "anon_select_dresses" ON dresses FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "anon_insert_dresses" ON dresses;
CREATE POLICY "anon_insert_dresses" ON dresses FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_dresses" ON dresses;
CREATE POLICY "anon_update_dresses" ON dresses FOR UPDATE TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_dresses" ON dresses;
CREATE POLICY "anon_delete_dresses" ON dresses FOR DELETE TO anon USING (true);

-- Accessories table - allow all operations for anon role
DROP POLICY IF EXISTS "anon_select_accessories" ON accessories;
CREATE POLICY "anon_select_accessories" ON accessories FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "anon_insert_accessories" ON accessories;
CREATE POLICY "anon_insert_accessories" ON accessories FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_accessories" ON accessories;
CREATE POLICY "anon_update_accessories" ON accessories FOR UPDATE TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_accessories" ON accessories;
CREATE POLICY "anon_delete_accessories" ON accessories FOR DELETE TO anon USING (true);

-- Verify the policies were created
SELECT 'Policies created successfully!' AS result;
SELECT policyname, tablename, cmd FROM pg_policies
WHERE schemaname = 'public'
AND tablename IN ('orders', 'dresses', 'accessories')
ORDER BY tablename, policyname;
