import {
	RemultLiveQueryStorageRoom,
	RemultPartyRoom,
	resolveRoomIdFromChannel
} from 'remult-partykit/durable-object';
import { app } from './server/hono';

class PubSubRoom extends RemultPartyRoom<Cloudflare.Env> {
	static options = { hibernate: false };
	override options = { resolveRoomId: resolveRoomIdFromChannel };
	override async onError(
		_connection: import('partyserver').Connection,
		error: unknown
	) {
		console.error('PubSubRoom error:', error);
	}
}

export default { fetch: app.fetch };
export { PubSubRoom as RemultPubSubRoom, RemultLiveQueryStorageRoom };
