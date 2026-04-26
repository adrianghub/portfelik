import { supabase } from '$lib/supabase';
import type { Category, TransactionType } from '$lib/types';

export async function fetchCategories(): Promise<Category[]> {
	const { data, error } = await supabase
		.from('categories')
		.select('id, name, type, user_id, created_at, updated_at')
		.order('name');

	if (error) throw error;
	return data as Category[];
}

export async function createCategory(input: { name: string; type: TransactionType }): Promise<Category> {
	const { data, error } = await supabase
		.from('categories')
		.insert(input)
		.select()
		.single();

	if (error) throw error;
	return data as Category;
}

export async function updateCategory(
	id: string,
	updates: Partial<{ name: string; type: TransactionType }>
): Promise<Category> {
	const { data, error } = await supabase
		.from('categories')
		.update(updates)
		.eq('id', id)
		.select()
		.single();

	if (error) throw error;
	return data as Category;
}

export async function deleteCategory(id: string): Promise<void> {
	const { error } = await supabase.from('categories').delete().eq('id', id);
	if (error) throw error;
}
