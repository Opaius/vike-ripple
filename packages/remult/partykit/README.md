# Remult PartyServer Extension

A highly scalable, cheap, and configurable real-time subscription provider for **Remult** powered by **Cloudflare Durable Objects** and **PartyServer**.

This extension allows you to easily scale Remult live queries across stateful, distributed Durable Object "rooms" based on customizable partition rules (e.g. per-entity, per-room, per-user, or per-region).

---

## Architecture

```
                  ┌───────────────────────┐
                  │ SvelteKit / Client    │
                  └──────────┬────────────┘
                             │
            ┌────────────────┴────────────────┐
            ▼ (WS upgrade)                    ▼ (REST API)
  ┌──────────────────┐               ┌──────────────────┐
  │  PartyProxy      │               │  SvelteKit API   │
  │  (/party/remult) │               │  (/api/messages) │
  └─────────┬────────┘               └────────┬─────────┘
            │ (Forward WS)                    │ (Publish POST)
            ▼                                 ▼
 ┌───────────────────────────────────────────────────────┐
 │ Cloudflare Durable Objects (RemultPartyRoom namespace)│
 │                                                       │
 │  ┌───────────────────┐        ┌───────────────────┐   │
 │  │ DO Room: "general"│        │ DO Room: "vip"    │   │
 │  └───────────────────┘        └───────────────────┘   │
 └───────────────────────────────────────────────────────┘
```

1. **Client Pooling (`RemultPartySubscriptionClient`)**: Standard Remult subscription interface. Automatically manages a connection pool of WebSockets to resolved Durable Object rooms. Dynamically opens and hibernates connection instances based on active subscriptions, reducing overhead.
2. **Server Broadcast (`RemultPartySubscriptionServer`)**: Intercepts Remult backend entity mutations, resolves target rooms, and pushes lightweight HTTP POST publish updates to target stateful DO rooms.
3. **Stateful Rooms (`RemultPartyRoom`)**: Cloudflare Durable Objects inheriting WebSocket connection states, broadcasting messages to room-bound channel subscribers, and enforcing custom security rules.

---

## Installation

Ensure your project has the required dependencies:
```bash
bun add partyserver partysocket remult
```

And wrangler/Durable Object configuration in `wrangler.toml`:
```toml
[[durable_objects.bindings]]
name = "REMULT_ROOM"
class_name = "RemultPubSubRoom"

[[migrations]]
tag = "v1"
new_classes = ["RemultPubSubRoom"]
```

---

## Usage Guide

### 1. Configure the Client
Set up the subscription client in your frontend entrypoint (e.g., `+page.svelte` or `app.ts`):

```typescript
import { remult } from 'remult'
import { RemultPartySubscriptionClient } from '$lib/remult-partyserver'

remult.apiClient.subscriptionClient = new RemultPartySubscriptionClient({
	// Resolve base WS URL for a given Durable Object room name
	getSocketUrl: (roomName) => {
		const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
		return `${protocol}//${window.location.host}/party/remult?room=${roomName}`
	},
	// Resolve target DO room from Remult subscription channel
	resolveRoomId: (channel) => {
		if (channel.includes('?')) {
			const params = new URLSearchParams(channel.split('?')[1])
			return params.get('roomId') || params.get('userId') || 'global'
		}
		return 'global'
	}
})
```

### 2. Configure the API Backend
Wire up the `SubscriptionServer` in your SvelteKit / Worker API handler (e.g. `src/routes/api/[...remult]/+server.ts`):

```typescript
import { RemultPartySubscriptionServer } from '$lib/remult-partyserver/server'

function createSubscriptionServer(env: any) {
	return new RemultPartySubscriptionServer(env.REMULT_ROOM, {
		// Ensure resolved rooms match client-side partition logic
		resolveRoomId: (channel) => {
			if (channel.includes('?')) {
				const params = new URLSearchParams(channel.split('?')[1])
				return params.get('roomId') || params.get('userId') || 'global'
			}
			return 'global'
		}
	})
}
```

### 3. Expose the Durable Object
Define the Durable Object class by extending `RemultPartyRoom` and export it from the Cloudflare Worker entry point (or inject it during post-build step):

```typescript
// src/lib/partykit/server.ts
import { RemultPartyRoom } from '$lib/remult-partyserver/durable-object'

export class RemultPubSubRoom extends RemultPartyRoom {
	protected override getOptions() {
		return {
			resolveRoomId: (channel) => {
				// Custom parse rules
				return 'my-room-name'
			},
			validateSubscription: (channel, roomName) => {
				// Validate if roomName is authorized for this channel subscription
				return true
			}
		}
	}
}
```

### 4. Create the WS Proxy Endpoint
Create a route to forward WebSocket upgrades to Durable Objects (e.g. `src/routes/party/remult/+server.ts`):

```typescript
export async function GET({ request, platform }) {
	const env = platform?.env
	if (!env?.REMULT_ROOM) return new Response('Unavailable', { status: 500 })

	const url = new URL(request.url)
	const room = url.searchParams.get('room') || 'global'
	const doId = env.REMULT_ROOM.idFromName(room)
	const stub = env.REMULT_ROOM.get(doId)

	return stub.fetch(request)
}
```

---

## Configuration API Options

### `resolveRoomId`
* **Type**: `(channel: string) => string`
* **Description**: Extracts the room partition name from the subscription channel URL (e.g. `/api/Message?roomId=room-1`). Used client-side to pool socket connections, and server-side to forward publishes.

### `validateSubscription`
* **Type**: `(channel: string, roomName: string) => boolean | Promise<boolean>`
* **Description**: Security check run inside stateful Durable Objects to prevent clients from listening to unauthorized rooms or channels.

---

## Advanced Partitioning Recipes

### Per-Entity Partitioning
Partition different entities into their own stateful rooms to isolate load:
```typescript
resolveRoomId: (channel) => {
	// channel is formatted like "/api/Tasks?..." or "/api/Messages?..."
	const entityName = channel.split('?')[0].split('/').pop()
	return entityName || 'global'
}
```

### Regional Placement / Jurisdictions
If you need users in Europe to connect to European Durable Objects, use Cloudflare's Durable Object Jurisdictions by passing location hints in your proxy route:
```typescript
const stub = env.REMULT_ROOM.get(doId, {
	jurisdiction: 'eu' // Restricts the DO to EU servers for compliance/latency
})
```
