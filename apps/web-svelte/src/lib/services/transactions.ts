import { supabase } from '$lib/supabase';
import type { MonthlySummary, TransactionWithCategory } from '$lib/types';
import { getMonthBounds } from '$lib/utils';

export async function fetchTransactions(
	year: number,
	month: number,
	categoryId?: string
): Promise<TransactionWithCategory[]> {
	const { start, end } = getMonthBounds(year, month);

	let query = supabase
		.from('transactions_with_category')
		.select('*')
		.gte('date', start)
		.lt('date', end)
		.order('date', { ascending: false });

	if (categoryId) {
		query = query.eq('category_id', categoryId);
	}

	const { data, error } = await query;
	if (error) throw error;
	return data as TransactionWithCategory[];
}

export async function fetchMonthlySummary(year: number, month: number): Promise<MonthlySummary> {
	const { data, error } = await supabase.rpc('get_monthly_summary', {
		p_year: year,
		p_month: month
	});

	if (error) throw error;
	return data as unknown as MonthlySummary;
}
