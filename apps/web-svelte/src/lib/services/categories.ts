import { supabase } from '$lib/supabase';
import type { Category } from '$lib/types';

export async function fetchCategories(): Promise<Category[]> {
	const { data, error } = await supabase
		.from('categories')
		.select('id, name, type, user_id, created_at, updated_at')
		.order('name');

	if (error) throw error;
	return data as Category[];
}
