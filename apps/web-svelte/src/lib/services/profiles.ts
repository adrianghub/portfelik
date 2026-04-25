import { supabase } from '$lib/supabase';
import type { Profile } from '$lib/types';

export async function fetchProfile(userId: string): Promise<Profile> {
	const { data, error } = await supabase
		.from('profiles')
		.select('id, email, name, role, created_at, updated_at')
		.eq('id', userId)
		.single();

	if (error) throw error;
	return data as Profile;
}
