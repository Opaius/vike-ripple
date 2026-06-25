import { SubscriptionChannel, remult, isBackend } from 'remult'
import type { Unsubscribe } from 'remult'
import type { RemultPartySubscriptionClient } from './client.js'

const ROOM_PARAM_KEYS = ['roomId', 'readerId', 'userId'] as const
const LIVE_QUERY_USER_PREFIX = 'users:'
const LIVE_QUERY_QUERY_MARKER = ':queries:'

function roomFromParam(key: (typeof ROOM_PARAM_KEYS)[number], value: string): string {
	switch (key) {
		case 'userId': return `user:${value}`
		case 'readerId': return `reader:${value}`
		case 'roomId': return `room:${value}`
	}
}

export function extractLiveQueryUserId(channel: string): string | null {
	if (!channel.startsWith(LIVE_QUERY_USER_PREFIX)) return null
	const markerIndex = channel.indexOf(LIVE_QUERY_QUERY_MARKER, LIVE_QUERY_USER_PREFIX.length)
	if (markerIndex === -1) return null
	return channel.slice(LIVE_QUERY_USER_PREFIX.length, markerIndex) || null
}

export function resolveRoomIdFromChannel(channel: string): string {
	const liveQueryUserId = extractLiveQueryUserId(channel)
	if (liveQueryUserId) return `user:${liveQueryUserId}`
	const queryIndex = channel.indexOf('?')
	if (queryIndex === -1) return 'global'
	const params = new URLSearchParams(channel.slice(queryIndex + 1))
	for (const key of ROOM_PARAM_KEYS) {
		const roomId = params.get(key)
		if (roomId) return roomFromParam(key, roomId)
	}
	return 'global'
}

export function channelTargetsRoom(channel: string, roomName: string): boolean {
	return resolveRoomIdFromChannel(channel) === roomName
}

function getClient(): RemultPartySubscriptionClient | undefined {
	return (remult as any)?.apiClient?.subscriptionClient as RemultPartySubscriptionClient | undefined
}

// Module-level dedup: one pool subscription per channel key, ever.
// This survives SSR→client boundary and prevents double WS connections
// even if Channel.subscribe() is called multiple times.
const _subLocks = new Map<string, Promise<Unsubscribe>>()

/**
 * A real-time pub/sub channel.
 *
 * Subscribe and publish work on both client and server.
 * Client-side uses the WebSocket pool directly (one WS per room).
 * Server-side uses Remult's subscription server.
 */
export class Channel<T = unknown> {
	readonly channelKey: string

	constructor(channelKey: string) {
		this.channelKey = channelKey
	}

	subscribe(next: (message: T) => void): Promise<Unsubscribe> {
		if (!isBackend()) {
			const c = getClient()
			if (c?.publish) {
				// Module-level dedup: one promise per channel key
				if (!_subLocks.has(this.channelKey)) {
					_subLocks.set(
						this.channelKey,
						c.openConnection(() => {}).then(conn =>
							conn.subscribe(this.channelKey, (msg: unknown) => next(msg as T), () => {})
						)
					)
				}
				return _subLocks.get(this.channelKey)!
			}
		}
		return new SubscriptionChannel<T>(this.channelKey).subscribe(next)
	}

	publish(message: T): void {
		if (!isBackend()) {
			const c = getClient()
			if (c?.publish) {
				c.publish(this.channelKey, message)
				return
			}
			console.warn('[remult-partykit] No subscription client for publish.')
			return
		}
		new SubscriptionChannel<T>(this.channelKey).publish(message)
	}
}
