import { PUBLIC_VAPID_KEY } from '$env/static/public';
import { supabase } from '$lib/supabase';

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
	const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
	const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
	const raw = atob(base64);
	const buffer = new ArrayBuffer(raw.length);
	const view = new Uint8Array(buffer);
	for (let i = 0; i < raw.length; i++) view[i] = raw.charCodeAt(i);
	return view;
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
	if (!('serviceWorker' in navigator)) return null;
	try {
		return await navigator.serviceWorker.register('/sw.js');
	} catch {
		return null;
	}
}

export async function subscribeToPush(userId: string): Promise<void> {
	if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
	if (Notification.permission === 'denied') return;

	const permission = await Notification.requestPermission();
	if (permission !== 'granted') return;

	const registration = await navigator.serviceWorker.ready;

	let subscription = await registration.pushManager.getSubscription();
	if (!subscription) {
		subscription = await registration.pushManager.subscribe({
			userVisibleOnly: true,
			applicationServerKey: urlBase64ToUint8Array(PUBLIC_VAPID_KEY)
		});
	}

	const json = subscription.toJSON();
	if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return;

	await supabase.from('push_subscriptions').upsert(
		{
			user_id: userId,
			endpoint: json.endpoint,
			p256dh: json.keys.p256dh,
			auth: json.keys.auth,
			device_type: /mobile/i.test(navigator.userAgent) ? 'mobile' : 'desktop',
			user_agent: navigator.userAgent.slice(0, 512)
		},
		{ onConflict: 'user_id,endpoint' }
	);
}

export async function unsubscribeFromPush(): Promise<void> {
	if (!('serviceWorker' in navigator)) return;

	const registration = await navigator.serviceWorker.ready;
	const subscription = await registration.pushManager.getSubscription();
	if (!subscription) return;

	const { endpoint } = subscription;
	await subscription.unsubscribe();
	await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint);
}
