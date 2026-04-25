import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number, currency = 'PLN'): string {
	return new Intl.NumberFormat('pl-PL', { style: 'currency', currency }).format(amount);
}

export function formatDate(date: string): string {
	return new Intl.DateTimeFormat('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(date));
}

export function getMonthBounds(year: number, month: number): { start: string; end: string } {
	const start = new Date(year, month - 1, 1);
	const end = new Date(year, month, 1);
	return {
		start: start.toISOString(),
		end: end.toISOString()
	};
}

export function monthName(month: number): string {
	return new Intl.DateTimeFormat('pl-PL', { month: 'long' }).format(new Date(2000, month - 1, 1));
}
