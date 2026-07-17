const DEFAULT_ICON = '/icon-192x192.png';

/** Must match notification-sync.ts */
const NOTIFICATION_SYNC_CHANNEL = 'jakstoimy-notifications';
const SW_NOTIFICATION_MESSAGE_TYPE = 'jakstoimy:notification';

// Push-only service worker. No asset/HTML caching: this is a live-data app
// (online-only by product decision), so we never serve stale content. The SW
// exists for web-push delivery and to satisfy PWA installability.
self.addEventListener('install', (event) => {
	event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
			.then(() => self.clients.claim())
	);
});

async function hasFocusedClient() {
	const windowClients = await clients.matchAll({ type: 'window', includeUncontrolled: true });
	// visibility alone is not enough: a visible but unfocused tab would otherwise
	// suppress the OS banner while the client also skips the toast (no focus).
	return windowClients.some((client) => client.focused);
}

function broadcastInvalidate() {
	try {
		const channel = new BroadcastChannel(NOTIFICATION_SYNC_CHANNEL);
		channel.postMessage({ type: 'invalidate' });
		channel.close();
	} catch {
		// BroadcastChannel unavailable in some SW contexts - postMessage still runs.
	}
}

function notifyOpenClients(payload) {
	return clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
		for (const client of windowClients) {
			client.postMessage({
				type: SW_NOTIFICATION_MESSAGE_TYPE,
				payload: {
					title: payload.title,
					body: payload.body,
					notificationId: payload.notificationId,
					data: payload.data ?? {}
				}
			});
		}
	});
}

function obligationTag(data) {
	if (data?.obligationKey) return data.obligationKey;
	if (data?.notificationId) return data.notificationId;
	if (data?.transactionId) return `tx:${data.transactionId}`;
	return 'jakstoimy';
}

function buildActions(data) {
	if (data?.actionable && data?.transactionId) {
		return [{ action: 'mark-paid', title: 'Zapłacone' }];
	}
	return [{ action: 'open', title: 'Otwórz' }];
}

function resolveUrl(data, action) {
	const txId = data?.transactionId;
	if (action === 'mark-paid' && txId) {
		const params = new URLSearchParams({ txId, action: 'settle' });
		if (data?.notificationId) params.set('notificationId', data.notificationId);
		return `/transactions?${params.toString()}`;
	}
	if (txId) return `/transactions?txId=${txId}`;
	if (data?.type === 'group_invitation') return '/settings?tab=groups';
	if (data?.type === 'bank_import_reminder') return '/import';
	if (data?.type === 'transaction_summary') return '/transactions';
	return '/';
}

self.addEventListener('push', (event) => {
	let payload = { title: 'JakStoimy', body: '', data: {} };
	try {
		payload = event.data?.json() ?? payload;
	} catch {
		payload.body = event.data?.text() ?? '';
	}

	const data = payload.data ?? {};
	const notificationId = data.notificationId ?? data.type ?? 'jakstoimy';
	const tag = obligationTag(data);

	event.waitUntil(
		hasFocusedClient().then((focused) => {
			broadcastInvalidate();
			if (focused) {
				return notifyOpenClients({
					title: payload.title,
					body: payload.body,
					notificationId,
					data
				});
			}

			return self.registration.showNotification(payload.title, {
				body: payload.body,
				icon: DEFAULT_ICON,
				badge: DEFAULT_ICON,
				tag,
				renotify: false,
				vibrate: [100, 50, 100],
				data,
				actions: buildActions(data)
			});
		})
	);
});

self.addEventListener('notificationclick', (event) => {
	event.notification.close();

	const data = event.notification.data ?? {};
	const url = resolveUrl(data, event.action);

	event.waitUntil(
		clients
			.matchAll({ type: 'window', includeUncontrolled: true })
			.then((windowClients) => {
				const existing = windowClients.find((c) => c.url.includes(self.location.origin));
				if (existing) {
					existing.focus();
					if (typeof existing.navigate === 'function') {
						return existing.navigate(url);
					}
					existing.postMessage({ type: 'jakstoimy:navigate', url });
					return undefined;
				}
				return clients.openWindow(url);
			})
	);
});
