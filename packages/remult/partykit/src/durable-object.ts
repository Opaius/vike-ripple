/// <reference types="@cloudflare/workers-types" />

import type { Connection, WSMessage } from 'partyserver';
import { Server } from 'partyserver';
import type { RemultPartyMessage } from './client.js';
import type { RemultPartyServerOptions } from './server.js';

export interface ConnectionState {
	channels: string[];
}

/**
 * Cloudflare Durable Object class for Remult real-time sync.
 *
 * Uses partyserver with hibernation for production stability. Subscription
 * state is stored per-connection via setState(), which survives DO eviction.
 */
export class RemultPartyRoom<
	Env extends Cloudflare.Env = any
> extends Server<Env> {
	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		this.ctx.setWebSocketAutoResponse(
			new WebSocketRequestResponsePair(
				'ping',
				'{"type":"pong","channel":"system"}'
			)
		);
	}

	protected options = this.getOptions();
	private sharded = false;
	private brothers: string[] = [];
	private brotherConnections = new Map<string, number>();

	protected getOptions(): RemultPartyServerOptions {
		return {
			resolveRoomId: (channel: string) => {
				if (channel.includes('?')) {
					const params = new URLSearchParams(channel.split('?')[1]);
					return (
						params.get('roomId') ||
						params.get('readerId') ||
						params.get('userId') ||
						'global'
					);
				}
				return 'global';
			},
			validateSubscription: (channel: string, roomName: string) => {
				if (roomName === 'global') return true;
				if (channel.includes('?')) {
					const params = new URLSearchParams(channel.split('?')[1]);
					const partition =
						params.get('roomId') ||
						params.get('readerId') ||
						params.get('userId');
					return !partition || partition === roomName;
				}
				return true;
			}
		};
	}

	override async onStart() {
		const storedSharded = await this.ctx.storage.get<boolean>('sharded');
		this.sharded = storedSharded || false;
		const storedBrothers = await this.ctx.storage.get<string[]>('brothers');
		this.brothers = storedBrothers || [];
		const storedConnections =
			(await this.ctx.storage.get<Record<string, number>>(
				'brotherConnections'
			)) || {};
		for (const b of this.brothers) {
			this.brotherConnections.set(b, storedConnections[b] ?? 0);
		}
		console.log(
			`[RemultPartyRoom] Started ${this.name} - sharded: ${this.sharded}, brothers: ${this.brothers.join(', ')}`
		);
	}

	override async onConnect(connection: Connection) {
		connection.setState({ channels: [] });
		console.log('[RemultPartyRoom] onConnect', connection.id);
		connection.send(
			JSON.stringify({
				type: 'connected',
				channel: 'system',
				payload: { clientId: connection.id }
			} satisfies RemultPartyMessage)
		);

		const name = this.name || '';
		if (name.includes(':shard-')) {
			this.reportToFather();
		}
	}

	override async onMessage(connection: Connection, message: WSMessage) {
		try {
			const text = message.toString();
			if (text === 'ping') {
				connection.send('{"type":"pong","channel":"system"}');
				return;
			}
			const data = JSON.parse(text) as RemultPartyMessage;
			const state = connection.state as ConnectionState | undefined;
			const name = this.name || '';
			const isBrother = name.includes(':shard-');

			switch (data.type) {
				case 'subscribe':
				case 'remult:subscribe':
					await this.subscribeClient(connection, state, data.channel);
					break;

				case 'unsubscribe':
				case 'remult:unsubscribe':
					this.unsubscribeClient(connection, state, data.channel);
					break;

				case 'data':
					this.broadcastToChannel(
						data.channel,
						{
							type: 'data',
							channel: data.channel,
							payload: data.payload ?? data.data,
							data: data.data ?? data.payload,
							id: data.id
						},
						connection.id
					);
					if (isBrother) {
						this.forwardDataToFather(data);
					}
					break;

				case 'signal':
					if (data.id) {
						const recipient = this.getConnection(data.id);
						if (recipient) {
							recipient.send(
								JSON.stringify({
									type: 'signal',
									channel: data.channel,
									payload: data.payload ?? data.data,
									id: connection.id
								} satisfies RemultPartyMessage)
							);
						} else if (isBrother) {
							this.forwardSignalToFather(connection.id, data);
						}
					}
					break;

				case 'ping':
					// Heartbeat keep-alive
					break;

				default:
					connection.send(
						JSON.stringify({
							type: 'error',
							channel: data.channel,
							error: `Unknown message type: ${data.type}`
						} satisfies RemultPartyMessage)
					);
			}
		} catch (_error) {
			connection.send(
				JSON.stringify({
					type: 'error',
					channel: 'system',
					error: 'Invalid message format'
				} satisfies RemultPartyMessage)
			);
		}
	}

	override async onClose(connection: Connection) {
		console.log('[RemultPartyRoom] onClose', connection.id);
		const state = connection.state as ConnectionState | undefined;
		if (state) {
			connection.setState({ ...state, channels: [] });
		}

		const name = this.name || '';
		if (name.includes(':shard-')) {
			this.reportToFather();
		}
	}

	private async subscribeClient(
		connection: Connection,
		_state: ConnectionState | undefined,
		channel: string
	) {
		if (this.options?.validateSubscription) {
			const allowed = await this.options.validateSubscription(
				channel,
				this.name
			);
			if (!allowed) {
				connection.send(
					JSON.stringify({
						type: 'error',
						channel,
						error: 'Unauthorized channel subscription'
					} satisfies RemultPartyMessage)
				);
				return;
			}
		}

		const currentState = connection.state as ConnectionState | undefined;
		const newState = {
			channels: currentState?.channels ? [...currentState.channels] : []
		};
		if (!newState.channels.includes(channel)) {
			newState.channels.push(channel);
		}
		connection.setState(newState);
		console.log(
			'[RemultPartyRoom] subscribe',
			connection.id,
			'channel:',
			channel
		);

		connection.send(
			JSON.stringify({
				type: 'connected',
				channel,
				payload: { subscribed: true },
				data: { subscribed: true }
			} satisfies RemultPartyMessage)
		);
	}

	private unsubscribeClient(
		connection: Connection,
		_state: ConnectionState | undefined,
		channel: string
	) {
		const currentState = connection.state as ConnectionState | undefined;
		if (currentState?.channels) {
			const newState = {
				channels: currentState.channels.filter((c) => c !== channel)
			};
			connection.setState(newState);
		}
	}

	private broadcastToChannel(
		channel: string,
		message: RemultPartyMessage,
		excludeClientId?: string
	) {
		let sent = 0;
		const connections = [...this.getConnections()];
		for (const conn of connections) {
			if (conn.id === excludeClientId) continue;
			const state = conn.state as ConnectionState | undefined;
			if (state?.channels.includes(channel)) {
				try {
					conn.send(JSON.stringify(message));
					sent++;
				} catch (err) {
					console.error('[RemultPartyRoom] Send failed:', err);
				}
			}
		}
		console.log(
			'[RemultPartyRoom] broadcast channel:',
			channel,
			'connections:',
			connections.length,
			'sent:',
			sent
		);
	}

	private getMaxConnections(): number {
		if ((this.env as any)?.MAX_CONNECTIONS_PER_SHARD) {
			const val = parseInt((this.env as any).MAX_CONNECTIONS_PER_SHARD, 10);
			if (!Number.isNaN(val)) return val;
		}
		return 100;
	}

	private async chooseBrother(): Promise<string> {
		if (this.brothers.length === 0) {
			this.brothers = [`${this.name}:shard-1`, `${this.name}:shard-2`];
			await this.ctx.storage.put('brothers', this.brothers);
			const storedConnections: Record<string, number> = {};
			for (const b of this.brothers) {
				this.brotherConnections.set(b, 0);
				storedConnections[b] = 0;
			}
			await this.ctx.storage.put('brotherConnections', storedConnections);
		}

		let minConn = Infinity;
		let chosen = this.brothers[0];
		for (const b of this.brothers) {
			const count = this.brotherConnections.get(b) ?? 0;
			if (count < minConn) {
				minConn = count;
				chosen = b;
			}
		}

		if (minConn >= this.getMaxConnections()) {
			const nextIdx = this.brothers.length + 1;
			const newBrother = `${this.name}:shard-${nextIdx}`;
			this.brothers.push(newBrother);
			await this.ctx.storage.put('brothers', this.brothers);
			const storedConnections =
				(await this.ctx.storage.get<Record<string, number>>(
					'brotherConnections'
				)) || {};
			storedConnections[newBrother] = 0;
			await this.ctx.storage.put('brotherConnections', storedConnections);
			this.brotherConnections.set(newBrother, 0);
			chosen = newBrother;
		}

		return chosen;
	}

	private reportToFather() {
		const parts = this.name.split(':shard-');
		if (parts.length <= 1) return;
		const fatherName = parts[0];
		const fatherId = (this.env as any).RemultPartyRoom.idFromName(fatherName);
		const fatherStub = (this.env as any).RemultPartyRoom.get(fatherId);
		this.ctx.waitUntil(
			fatherStub
				.fetch('http://dummy/shard-report', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({
						shardName: this.name,
						connections: [...this.getConnections()].length
					})
				})
				.catch((err: any) => {
					console.error('[RemultPartyRoom] Failed to report to father:', err);
				})
		);
	}

	private forwardDataToFather(data: RemultPartyMessage) {
		const parts = this.name.split(':shard-');
		if (parts.length <= 1) return;
		const fatherName = parts[0];
		const fatherId = (this.env as any).RemultPartyRoom.idFromName(fatherName);
		const fatherStub = (this.env as any).RemultPartyRoom.get(fatherId);
		this.ctx.waitUntil(
			fatherStub
				.fetch(
					`http://dummy/publish?excludeShard=${encodeURIComponent(this.name)}`,
					{
						method: 'POST',
						headers: { 'content-type': 'application/json' },
						body: JSON.stringify({
							channel: data.channel,
							data: data.payload ?? data.data
						})
					}
				)
				.catch((err: any) => {
					console.error(
						'[RemultPartyRoom] Failed to forward data to father:',
						err
					);
				})
		);
	}

	private forwardSignalToFather(senderId: string, data: RemultPartyMessage) {
		const parts = this.name.split(':shard-');
		if (parts.length <= 1) return;
		const fatherName = parts[0];
		const fatherId = (this.env as any).RemultPartyRoom.idFromName(fatherName);
		const fatherStub = (this.env as any).RemultPartyRoom.get(fatherId);
		this.ctx.waitUntil(
			fatherStub
				.fetch('http://dummy/signal-route', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({
						recipientId: data.id,
						senderId,
						channel: data.channel,
						payload: data.payload ?? data.data
					})
				})
				.catch((err: any) => {
					console.error(
						'[RemultPartyRoom] Failed to forward signal to father:',
						err
					);
				})
		);
	}

	private async handlePublishRequest(request: Request): Promise<Response> {
		try {
			const url = new URL(request.url);
			const excludeShard = url.searchParams.get('excludeShard') || undefined;
			const body = (await request.json()) as { channel: string; data: unknown };
			if (body.channel && body.data !== undefined) {
				console.log(
					`[RemultPartyRoom] /publish on ${this.name} channel: ${body.channel} (exclude: ${excludeShard})`
				);

				this.broadcastToChannel(body.channel, {
					type: 'data',
					channel: body.channel,
					payload: body.data,
					data: body.data
				});

				const isBrother = this.name.includes(':shard-');
				if (!isBrother && this.sharded) {
					for (const brotherName of this.brothers) {
						if (brotherName === excludeShard) continue;
						const brotherId = (this.env as any).RemultPartyRoom.idFromName(
							brotherName
						);
						const brotherStub = (this.env as any).RemultPartyRoom.get(
							brotherId
						);
						this.ctx.waitUntil(
							brotherStub
								.fetch(
									`http://dummy/publish?excludeShard=${encodeURIComponent(excludeShard || '')}`,
									{
										method: 'POST',
										headers: { 'content-type': 'application/json' },
										body: JSON.stringify(body)
									}
								)
								.catch((err: any) => {
									console.error(
										`[RemultPartyRoom] Failed to forward publish to brother ${brotherName}:`,
										err
									);
								})
						);
					}
				}

				return new Response('OK', { status: 200 });
			}
		} catch (err) {
			console.error(`[RemultPartyRoom] /publish error on ${this.name}:`, err);
			return new Response(String(err), { status: 400 });
		}
		return new Response('Invalid request', { status: 400 });
	}

	private async handleShardReportRequest(request: Request): Promise<Response> {
		try {
			const body = (await request.json()) as {
				shardName: string;
				connections: number;
			};
			if (body.shardName && typeof body.connections === 'number') {
				this.brotherConnections.set(body.shardName, body.connections);
				const storedConnections =
					(await this.ctx.storage.get<Record<string, number>>(
						'brotherConnections'
					)) || {};
				storedConnections[body.shardName] = body.connections;
				await this.ctx.storage.put('brotherConnections', storedConnections);
				console.log(
					`[RemultPartyRoom] Shard ${body.shardName} reported ${body.connections} connections`
				);
				return new Response('OK', { status: 200 });
			}
		} catch (err) {
			console.error('[RemultPartyRoom] /shard-report error:', err);
			return new Response(String(err), { status: 400 });
		}
		return new Response('Invalid request', { status: 400 });
	}

	private async handleSignalRouteRequest(request: Request): Promise<Response> {
		try {
			const body = (await request.json()) as {
				recipientId: string;
				senderId: string;
				channel: string;
				payload: unknown;
			};
			if (body.recipientId && body.senderId) {
				const recipient = this.getConnection(body.recipientId);
				if (recipient) {
					recipient.send(
						JSON.stringify({
							type: 'signal',
							channel: body.channel,
							payload: body.payload,
							id: body.senderId
						} satisfies RemultPartyMessage)
					);
					return new Response('OK', { status: 200 });
				}

				const isBrother = this.name.includes(':shard-');
				if (!isBrother) {
					for (const brotherName of this.brothers) {
						const brotherId = (this.env as any).RemultPartyRoom.idFromName(
							brotherName
						);
						const brotherStub = (this.env as any).RemultPartyRoom.get(
							brotherId
						);
						this.ctx.waitUntil(
							brotherStub
								.fetch('http://dummy/signal-route', {
									method: 'POST',
									headers: { 'content-type': 'application/json' },
									body: JSON.stringify(body)
								})
								.catch((err: any) => {
									console.error(
										`[RemultPartyRoom] Failed forwarding signal to brother ${brotherName}:`,
										err
									);
								})
						);
					}
				}
				return new Response('OK', { status: 200 });
			}
		} catch (err) {
			console.error('[RemultPartyRoom] /signal-route error:', err);
			return new Response(String(err), { status: 400 });
		}
		return new Response('Invalid request', { status: 400 });
	}

	override async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);
		const upgradeHeader = request.headers.get('Upgrade');
		const isWS = upgradeHeader && upgradeHeader.toLowerCase() === 'websocket';
		const name = this.name || '';
		const isBrother = name.includes(':shard-');

		if (isWS) {
			if (isBrother) {
				return super.fetch(request);
			}

			if (!this.sharded) {
				const activeConns = [...this.getConnections()].length;
				if (activeConns >= this.getMaxConnections()) {
					this.sharded = true;
					await this.ctx.storage.put('sharded', true);

					const conns = [...this.getConnections()];
					for (const conn of conns) {
						try {
							conn.close(1001, 'Sharding active');
						} catch (e) {
							console.error('[RemultPartyRoom] Close err:', e);
						}
					}
				}
			}

			if (this.sharded) {
				const brotherName = await this.chooseBrother();
				console.log(
					`[RemultPartyRoom] Routing WebSocket to brother: ${brotherName}`
				);
				const brotherId = (this.env as any).RemultPartyRoom.idFromName(
					brotherName
				);
				const brotherStub = (this.env as any).RemultPartyRoom.get(brotherId);
				return brotherStub.fetch(request);
			}

			return super.fetch(request);
		}

		if (url.pathname === '/publish') {
			return this.handlePublishRequest(request);
		}
		if (url.pathname === '/shard-report') {
			return this.handleShardReportRequest(request);
		}
		if (url.pathname === '/signal-route') {
			return this.handleSignalRouteRequest(request);
		}

		return super.fetch(request);
	}
}

/**
 * Cross-isolate live query storage. The api-server's default InMemoryLiveQueryStorage
 * is per-isolate, so a `repo.save()` in isolate A wouldn't see live queries
 * registered in isolate B. We back the storage with a single global DO whose
 * state lives across all isolates.
 */
export interface StoredLiveQuery {
	entityKey: string;
	id: string;
	data: {
		requestJson: unknown;
		findOptionsJson: unknown;
		lastIds: unknown[];
	};
	lastUsed: string;
}

const FIVE_MIN_MS = 5 * 60 * 1000;

export class RemultLiveQueryStorageRoom {
	constructor(
		private state: DurableObjectState,
		_env: unknown
	) {
		this.state.blockConcurrencyWhile(async () => {
			this.state.storage.sql.exec(`
				CREATE TABLE IF NOT EXISTS live_queries (
					id TEXT PRIMARY KEY,
					entityKey TEXT,
					requestJson TEXT,
					findOptionsJson TEXT,
					lastIds TEXT,
					lastUsed TEXT
				)
			`);
			this.state.storage.sql.exec(`
				CREATE INDEX IF NOT EXISTS idx_entityKey_lastUsed ON live_queries(entityKey, lastUsed)
			`);
		});
	}

	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);

		if (url.pathname === '/add' && request.method === 'POST') {
			try {
				const body = (await request.json()) as Omit<
					StoredLiveQuery,
					'lastUsed'
				>;
				const now = new Date().toISOString();
				this.state.storage.sql.exec(
					`INSERT OR REPLACE INTO live_queries (id, entityKey, requestJson, findOptionsJson, lastIds, lastUsed)
					 VALUES (?, ?, ?, ?, ?, ?)`,
					body.id,
					body.entityKey,
					JSON.stringify(body.data.requestJson),
					JSON.stringify(body.data.findOptionsJson),
					JSON.stringify(body.data.lastIds),
					now
				);
				return new Response('OK');
			} catch (err) {
				console.error('[RemultLiveQueryStorageRoom] /add error:', err);
				return new Response(String(err), { status: 400 });
			}
		}

		if (url.pathname === '/remove' && request.method === 'POST') {
			try {
				const body = (await request.json()) as { id: string };
				this.state.storage.sql.exec(
					`DELETE FROM live_queries WHERE id = ?`,
					body.id
				);
				return new Response('OK');
			} catch (err) {
				console.error('[RemultLiveQueryStorageRoom] /remove error:', err);
				return new Response(String(err), { status: 400 });
			}
		}

		if (url.pathname === '/list' && request.method === 'GET') {
			const entityKey = url.searchParams.get('entityKey');
			if (!entityKey)
				return new Response('entityKey required', { status: 400 });
			const cutoff = new Date(Date.now() - FIVE_MIN_MS).toISOString();
			try {
				const cursor = this.state.storage.sql.exec(
					`SELECT id, entityKey, requestJson, findOptionsJson, lastIds, lastUsed 
					 FROM live_queries 
					 WHERE entityKey = ? AND lastUsed >= ?`,
					entityKey,
					cutoff
				);
				const result: StoredLiveQuery[] = [];
				for (const row of cursor) {
					result.push({
						id: row.id as string,
						entityKey: row.entityKey as string,
						data: {
							requestJson: JSON.parse(row.requestJson as string),
							findOptionsJson: JSON.parse(row.findOptionsJson as string),
							lastIds: JSON.parse(row.lastIds as string)
						},
						lastUsed: row.lastUsed as string
					});
				}
				return Response.json(result);
			} catch (err) {
				console.error('[RemultLiveQueryStorageRoom] /list error:', err);
				return new Response(String(err), { status: 500 });
			}
		}

		if (url.pathname === '/setData' && request.method === 'POST') {
			try {
				const body = (await request.json()) as {
					id: string;
					data: StoredLiveQuery['data'];
				};
				const now = new Date().toISOString();
				this.state.storage.sql.exec(
					`UPDATE live_queries 
					 SET requestJson = ?, findOptionsJson = ?, lastIds = ?, lastUsed = ?
					 WHERE id = ?`,
					JSON.stringify(body.data.requestJson),
					JSON.stringify(body.data.findOptionsJson),
					JSON.stringify(body.data.lastIds),
					now,
					body.id
				);
				return new Response('OK');
			} catch (err) {
				console.error('[RemultLiveQueryStorageRoom] /setData error:', err);
				return new Response(String(err), { status: 400 });
			}
		}

		if (url.pathname === '/keepAlive' && request.method === 'POST') {
			try {
				const body = (await request.json()) as { ids: string[] };
				const unknown: string[] = [];
				const now = new Date().toISOString();
				for (const id of body.ids) {
					const cursor = this.state.storage.sql.exec(
						`SELECT 1 FROM live_queries WHERE id = ?`,
						id
					);
					const row = cursor.next().value;
					if (row) {
						this.state.storage.sql.exec(
							`UPDATE live_queries SET lastUsed = ? WHERE id = ?`,
							now,
							id
						);
					} else {
						unknown.push(id);
					}
				}
				return Response.json(unknown);
			} catch (err) {
				console.error('[RemultLiveQueryStorageRoom] /keepAlive error:', err);
				return new Response(String(err), { status: 400 });
			}
		}

		return new Response('Not Found', { status: 404 });
	}
}

export { resolveRoomIdFromChannel } from './channel.js';
