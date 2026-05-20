import { supabase } from '@/lib/supabase';

export async function updateProfile(updates: {
  display_name?: string;
}): Promise<void> {
  const { error } = await supabase.auth.updateUser({ data: updates });
  if (error) throw error;
}
