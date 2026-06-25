# Purpose

This directory contains the custom Remult PartyServer extension. It provides client-side connection pooling, server-side Durable Object request delegation, and stateful Durable Object room implementations for scalable real-time synchronization.

# Ownership

- Owner: Development Team
- Domain: Reusable Real-time sync engine and Remult adapters

# Local Contracts

- **Modularity**: The library is split into client-safe (`client.ts`), server-safe (`server.ts`), and Cloudflare-only (`durable-object.ts`) files to prevent SvelteKit build errors on Node.js runtimes.
- **Protocol compatibility**: Messages exchanged follow the `RemultPartyMessage` protocol format, supporting `remult:subscribe` and `remult:unsubscribe` commands.
- **State Persistence**: Stateful DO metadata registries (like live queries in `RemultLiveQueryStorageRoom`) must use transactional storage (`this.state.storage`) instead of in-memory collections to survive runtime eviction.
- **State Mutation Protection**: Connection state objects must be cloned (`connection.setState({ ...state })`) instead of mutated in-place to trigger runtime updates.
- **DO Lifecycle Robustness**: Class configurations and options must be initialized inline or during `onStart` to be present during hibernation wakeup (which bypasses `onConnect`).
- **Client Error Routing**: The client must explicitly route `type === 'error'` messages to registered error handlers to prevent silent hangs.
- **Automatic Sharding**: When active connections on the Father DO exceed `MAX_CONNECTIONS_PER_SHARD` (configurable via env), it enters sharding mode. The Father DO dynamically spawns and load-balances WebSocket connections across Brother DOs (named `${fatherName}:shard-N`), while fanning out publisher messages and routing peer-to-peer signals.
- **Edge Heartbeat & Auto-Response**: Client connections send a raw string `'ping'` every 50s. The Durable Object uses Cloudflare's `setWebSocketAutoResponse` with `WebSocketRequestResponsePair` to reply at the Cloudflare Edge nodes without waking up the DO isolate, preserving CPU usage and memory limits.
- **Client Close Silencing**: Transient WebSocket close events are never surfaced to client-side channel `onError` subscribers, ensuring they don't break Remult's active query states while the pool automatically handles background reconnection and re-subscription.

# Work Guidance

1. Keep client-safe files free of imports from `partyserver` or `cloudflare:workers`.
2. Any configuration option added to `RemultPartyServerOptions` must be documented in [README.md](file:///home/cioky/Projects/scintilla-poc/src/lib/remult-partyserver/README.md).
3. Do not introduce breaking protocol changes to ensure backward compatibility with standard WebSockets.

# Verification

- **Linting & Typing**: Ensure `bun run check` passes.
- **Testing**: Run `bun run check` and `bun run build` to confirm Node.js build isolation is preserved.
- **Real-world verification**: Execute `bun run scripts/stress-test.js` under `bun run cf:dev` to verify message routing and pool allocation.
