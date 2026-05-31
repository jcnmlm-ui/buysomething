import { createClient } from '@supabase/supabase-js';

// 與後台 admin.html / 前台相同的 Supabase 專案（anon key 為公開金鑰，可放前端）
const SUPABASE_URL = 'https://tukzmdtkhdxdpbnvkjzz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR1a3ptZHRraGR4ZHBibnZranp6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzMzcyMDQsImV4cCI6MjA5NDkxMzIwNH0.g-wtAQ259b8h9qdiQTUF6Vuoxjm5K1MPJLqkZmFfBjA';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
