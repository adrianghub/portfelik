export type TransactionType = 'income' | 'expense';
export type TransactionStatus = 'paid' | 'draft' | 'upcoming' | 'overdue';
export type ShoppingListStatus = 'active' | 'completed';
export type InvitationStatus = 'pending' | 'accepted' | 'rejected' | 'cancelled';
export type UserRole = 'user' | 'admin';

export interface Category {
	id: string;
	name: string;
	type: TransactionType;
	user_id: string | null;
	created_at: string;
	updated_at: string;
}

export interface Transaction {
	id: string;
	amount: number;
	currency: string;
	description: string;
	date: string;
	type: TransactionType;
	status: TransactionStatus;
	category_id: string;
	user_id: string;
	shopping_list_id: string | null;
	is_recurring: boolean;
	recurring_day: number | null;
	created_at: string;
	updated_at: string;
}

export interface TransactionWithCategory extends Transaction {
	category_name: string;
	category_type: TransactionType;
}

export interface CategorySummary {
	category_id: string;
	category_name: string;
	type: TransactionType;
	total: number;
	percentage: number;
	transaction_count: number;
}

export interface MonthlySummary {
	total_income: number;
	total_expenses: number;
	net: number;
	categories: CategorySummary[];
}

export interface Profile {
	id: string;
	email: string;
	name: string | null;
	role: UserRole;
	created_at: string;
	updated_at: string;
}

export interface UserGroup {
	id: string;
	name: string;
	owner_id: string;
	created_at: string;
	updated_at: string;
}

export interface GroupMember {
	group_id: string;
	user_id: string;
	joined_at: string;
}

export interface GroupInvitation {
	id: string;
	group_id: string;
	group_name: string;
	invited_user_email: string;
	invited_user_id: string | null;
	created_by: string;
	status: InvitationStatus;
	created_at: string;
	updated_at: string;
}

export interface ShoppingListItem {
	id: string;
	shopping_list_id: string;
	name: string;
	completed: boolean;
	quantity: number | null;
	unit: string | null;
	position: number;
	created_at: string;
	updated_at: string;
}

export interface ShoppingList {
	id: string;
	name: string;
	status: ShoppingListStatus;
	user_id: string;
	group_id: string | null;
	category_id: string | null;
	total_amount: number | null;
	created_at: string;
	updated_at: string;
}

export interface ShoppingListWithItems extends ShoppingList {
	shopping_list_items: ShoppingListItem[];
}
