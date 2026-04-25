import { supabase } from '$lib/supabase';
import type { ShoppingList, ShoppingListWithItems } from '$lib/types';

export async function fetchShoppingLists(): Promise<ShoppingList[]> {
	const { data, error } = await supabase
		.from('shopping_lists')
		.select('id, name, status, user_id, group_id, category_id, total_amount, created_at, updated_at')
		.order('created_at', { ascending: false });

	if (error) throw error;
	return data as ShoppingList[];
}

export async function fetchShoppingListById(id: string): Promise<ShoppingListWithItems> {
	const { data, error } = await supabase
		.from('shopping_lists')
		.select(
			'id, name, status, user_id, group_id, category_id, total_amount, created_at, updated_at, shopping_list_items(id, name, completed, quantity, unit, position, created_at, updated_at, shopping_list_id)'
		)
		.eq('id', id)
		.single();

	if (error) throw error;

	const list = data as ShoppingListWithItems & {
		shopping_list_items: NonNullable<typeof data>['shopping_list_items'];
	};
	list.shopping_list_items = list.shopping_list_items?.sort((a, b) => a.position - b.position) ?? [];
	return list;
}
