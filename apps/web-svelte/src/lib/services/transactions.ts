import { supabase } from '$lib/supabase';
import type { MonthlySummary, Transaction, TransactionType, TransactionWithCategory } from '$lib/types';
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

export interface CreateTransactionInput {
	amount: number;
	type: TransactionType;
	description: string;
	date: string;
	category_id: string;
	status?: Transaction['status'];
	is_recurring?: boolean;
	recurring_day?: number | null;
	shopping_list_id?: string | null;
}

export async function createTransaction(input: CreateTransactionInput): Promise<Transaction> {
	const { data: { user } } = await supabase.auth.getUser();
	if (!user) throw new Error('not_authenticated');

	const { data, error } = await supabase
		.from('transactions')
		.insert({
			...input,
			user_id: user.id,
			amount: Math.abs(input.amount),
			status: input.status ?? 'paid',
			is_recurring: input.is_recurring ?? false
		})
		.select()
		.single();

	if (error) throw error;
	return data as Transaction;
}

export async function updateTransaction(
	id: string,
	updates: Partial<CreateTransactionInput>
): Promise<Transaction> {
	const payload: Partial<CreateTransactionInput & { amount: number }> = { ...updates };
	if (updates.amount !== undefined) payload.amount = Math.abs(updates.amount);

	const { data, error } = await supabase
		.from('transactions')
		.update(payload)
		.eq('id', id)
		.select()
		.single();

	if (error) throw error;
	return data as Transaction;
}

export async function deleteTransaction(id: string): Promise<void> {
	const { error } = await supabase.from('transactions').delete().eq('id', id);
	if (error) throw error;
}
