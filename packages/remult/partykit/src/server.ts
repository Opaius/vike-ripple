/// <reference types="@cloudflare/workers-types" />
import type { SubscriptionServer } from 'remult'

export interface RemultPartyServerOptions {
	/**
	 * Resolves room name from subscription channel.
	 */
	resolveRoomId: (channel: string) => string

	/**
	 * Validates if connection to room can subscribe to channel.
	 * Returns true if allowed, false otherwise.
	 */
	validateSubscription?: (channel: string, roomName: string) => boolean | Promise<boolean>
}

/**
 * Server-side SubscriptionServer implementation that delegates to DO namespace.
 * This class has zero runtime dependencies on partyserver or cloudflare:workers,
 * making it completely safe for SvelteKit Node.js builds.
 */
export class RemultPartySubscriptionServer implements SubscriptionServer {
	constructor(
		private binding: DurableObjectNamespace,
		private options: RemultPartyServerOptions
	) {}

	async publishMessage<T>(channel: string, message: T): Promise<void> {
		try {
			const room = this.options.resolveRoomId(channel)
			console.log('[RemultPartySubscriptionServer] publish channel:', channel, 'room:', room)
			const doId = this.binding.idFromName(room)
			const stub = this.binding.get(doId)
			const resp = await stub.fetch('http://dummy/publish', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ channel, data: message })
			})
			console.log('[RemultPartySubscriptionServer] publish resp:', resp.status)
		} catch (e) {
			console.error('[RemultPartySubscriptionServer] publish error:', e)
		}
	}
}
