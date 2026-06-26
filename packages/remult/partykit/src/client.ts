import type {
	SubscriptionClient,
	SubscriptionClientConnection,
	Unsubscribe
} from 'remult';
import { resolveRoomIdFromChannel } from './channel.js';

// Message protocol types
export interface RemultPartyMessage {
	type:
		| 'subscribe'
		| 'unsubscribe'
		| 'data'
		| 'error'
		| 'connected'
		| 'disconnected'
		| 'remult:subscribe'
		| 'remult:unsubscribe'
		| 'signal'
		| 'ping';
	channel: string;
	payload?: unknown;
	data?: unknown;
	id?: string;
	error?: string;
}

export interface RemultPartySubscriptionClientOptions {
	getSocketUrl: (roomName: string) => string;
	resolveRoomId?: (channel: string) => string;
}

type MessageHandler = (message: unknown) => void;
type ErrorHandler = (err: unknown) => void;

const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30_000;

/** Contract for a room-level WebSocket pool. */
interface PoolEntry {
	subscribe(
		channel: string,
		onMessage: MessageHandler,
		onError: ErrorHandler
	): Unsubscribe;
	publish(channel: string, payload: unknown): void;
	dispose(): void;
}

/**
 * Build a single WebSocket pool for one room.
 * Keeps the underlying WS open across async boundaries, re-subscribes
 * active channels after reconnect, and tears down when refcount hits zero.
 */
function createPoolEntry(
	roomId: string,
	options: RemultPartySubscriptionClientOptions,
	onReconnect: () => void,
	onDispose: () => void
): PoolEntry {
	// Subscribe ack tracking — miniflare can drop early subscribe frames
	const _acked = new Set<string>();
	const _retryTimers = new Map<string, ReturnType<typeof setTimeout>>();

	const subscribeChannel = (channel: string) => {
		send({ type: 'remult:subscribe', channel });
		if (_retryTimers.has(channel)) clearTimeout(_retryTimers.get(channel)!);
		_retryTimers.set(
			channel,
			setTimeout(() => {
				_retryTimers.delete(channel);
				if (!_acked.has(channel) && !disposed) {
					send({ type: 'remult:subscribe', channel });
					_retryTimers.set(
						channel,
						setTimeout(() => {
							_retryTimers.delete(channel);
							if (!_acked.has(channel) && !disposed) {
								console.warn(
									'[remult-partykit] subscribe not acked for',
									channel
								);
							}
						}, 800)
					);
				}
			}, 800)
		);
	};

	let ws: WebSocket | null = null;
	const active = new Map<string, Set<MessageHandler>>();
	const errorHandlers = new Map<string, Set<ErrorHandler>>();
	let refs = 0;
	let disposed = false;
	let reconnectAttempt = 0;
	let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	let disposeTimer: ReturnType<typeof setTimeout> | null = null;
	let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
	const DISPOSE_GRACE_MS = 5000;
	const PING_INTERVAL_MS = 50_000;

	const startHeartbeat = () => {
		stopHeartbeat();
		heartbeatTimer = setInterval(() => {
			const sock = ws;
			if (sock && sock.readyState === WebSocket.OPEN) {
				try {
					sock.send('ping');
				} catch {
					/* ignore */
				}
			}
		}, PING_INTERVAL_MS);
	};

	const stopHeartbeat = () => {
		if (heartbeatTimer) {
			clearInterval(heartbeatTimer);
			heartbeatTimer = null;
		}
	};

	const connect = () => {
		if (disposed) return;
		const url = options.getSocketUrl(roomId);
		const sock = new WebSocket(url);
		sock.addEventListener('message', handleMessage);
		sock.addEventListener('open', handleOpen);
		sock.addEventListener('close', handleClose);
		sock.addEventListener('error', handleError);
		ws = sock;
	};

	const handleMessage = (event: MessageEvent) => {
		startHeartbeat();
		try {
			const msg = JSON.parse(event.data as string) as RemultPartyMessage;
			if (msg.channel && msg.type === 'data') {
				const handlers = active.get(msg.channel);
				if (!handlers) return;
				const data = msg.data !== undefined ? msg.data : msg.payload;
				for (const handler of handlers) handler(data);
			} else if (msg.channel && msg.type === 'connected') {
				_acked.add(msg.channel);
				const t = _retryTimers.get(msg.channel);
				if (t) {
					clearTimeout(t);
					_retryTimers.delete(msg.channel);
				}
			} else if (msg.channel && msg.type === 'error') {
				const handlers = errorHandlers.get(msg.channel);
				if (!handlers) return;
				for (const handler of handlers) handler(msg.error || 'unknown error');
			}
		} catch {
			/* ignore malformed frames */
		}
	};

	const handleOpen = () => {
		reconnectAttempt = 0;
		for (const channel of active.keys()) {
			subscribeChannel(channel);
		}
		startHeartbeat();
	};

	const handleClose = (_event: CloseEvent) => {
		ws = null;
		stopHeartbeat();
		if (disposed) return;
		onReconnect();
		scheduleReconnect();
	};

	const handleError = () => {
		// Browser fires `error` before `close` — reconnect lives in close handler
	};

	const scheduleReconnect = () => {
		if (reconnectTimer || disposed) return;
		const delay = Math.min(
			RECONNECT_BASE_MS * 2 ** reconnectAttempt,
			RECONNECT_MAX_MS
		);
		reconnectTimer = setTimeout(() => {
			reconnectTimer = null;
			reconnectAttempt++;
			connect();
		}, delay);
	};

	const send = (msg: RemultPartyMessage) => {
		startHeartbeat();
		const sock = ws;
		if (!sock || sock.readyState !== WebSocket.OPEN) return;
		try {
			sock.send(JSON.stringify(msg));
		} catch {
			/* WS entered bad state */
		}
	};

	const subscribe: PoolEntry['subscribe'] = (channel, onMessage, onError) => {
		if (disposeTimer) {
			clearTimeout(disposeTimer);
			disposeTimer = null;
		}
		refs++;

		let msgSet = active.get(channel);
		if (!msgSet) {
			msgSet = new Set();
			active.set(channel, msgSet);
		}
		msgSet.add(onMessage);

		let errSet = errorHandlers.get(channel);
		if (!errSet) {
			errSet = new Set();
			errorHandlers.set(channel, errSet);
		}
		errSet.add(onError);

		subscribeChannel(channel);
		if (!ws || ws.readyState > WebSocket.OPEN) {
			scheduleReconnect();
		}

		return () => {
			refs--;
			const msgs = active.get(channel);
			if (msgs) {
				msgs.delete(onMessage);
				if (msgs.size === 0) {
					active.delete(channel);
					send({ type: 'remult:unsubscribe', channel });
				}
			}
			const errs = errorHandlers.get(channel);
			if (errs) {
				errs.delete(onError);
				if (errs.size === 0) errorHandlers.delete(channel);
			}
			if (refs <= 0) {
				disposeTimer = setTimeout(() => {
					if (refs <= 0) dispose();
				}, DISPOSE_GRACE_MS);
			}
		};
	};

	const publish: PoolEntry['publish'] = (channel, payload) => {
		send({ type: 'data', channel, payload, data: payload });
	};

	const dispose = () => {
		if (disposed) return;
		disposed = true;
		stopHeartbeat();
		if (reconnectTimer) {
			clearTimeout(reconnectTimer);
			reconnectTimer = null;
		}
		if (ws) {
			ws.removeEventListener('message', handleMessage);
			ws.removeEventListener('open', handleOpen);
			ws.removeEventListener('close', handleClose);
			ws.removeEventListener('error', handleError);
			try {
				ws.close();
			} catch {
				/* ignore */
			}
			ws = null;
		}
		active.clear();
		errorHandlers.clear();
		onDispose();
	};

	connect();
	return { subscribe, publish, dispose };
}

/**
 * SubscriptionClient with connection pooling per room (DO partition).
 * Each room gets a single WS pool with transparent reconnect.
 */
export class RemultPartySubscriptionClient implements SubscriptionClient {
	private readonly pools = new Map<string, PoolEntry>();

	constructor(private readonly options: RemultPartySubscriptionClientOptions) {}

	async openConnection(
		onReconnect: () => void
	): Promise<SubscriptionClientConnection> {
		return {
			subscribe: async (
				channel: string,
				onMessage: MessageHandler,
				onError: ErrorHandler
			): Promise<Unsubscribe> => {
				const roomId = (this.options.resolveRoomId ?? resolveRoomIdFromChannel)(
					channel
				);
				let pool = this.pools.get(roomId);
				if (!pool) {
					pool = createPoolEntry(roomId, this.options, onReconnect, () =>
						this.pools.delete(roomId)
					);
					this.pools.set(roomId, pool);
				}
				return pool.subscribe(channel, onMessage, onError);
			},
			close: () => {
				for (const pool of this.pools.values()) pool.dispose();
				this.pools.clear();
			}
		};
	}

	/** Publish a message to a channel via the WebSocket pool. */
	publish(channel: string, payload: unknown): void {
		const roomId = (this.options.resolveRoomId ?? resolveRoomIdFromChannel)(
			channel
		);
		const pool = this.pools.get(roomId);
		if (pool) pool.publish(channel, payload);
	}
}
