import { supabase } from '$lib/supabase';
import type { UserGroup } from '$lib/types';

export async function fetchUserGroups(): Promise<UserGroup[]> {
	const { data, error } = await supabase
		.from('user_groups')
		.select('id, name, owner_id, created_at, updated_at')
		.order('name');

	if (error) throw error;
	return data as UserGroup[];
}
