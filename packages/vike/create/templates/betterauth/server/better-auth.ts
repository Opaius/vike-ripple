import { betterAuth } from 'better-auth'
import { remultAdapter } from '@nerdfolio/remult-better-auth'
import { User, Session, Account, Verification } from '../entities/auth'
import type { BetterAuthOptions } from 'better-auth'
import type { ClassType } from 'remult'
import { SqlDatabase, withRemult } from 'remult'
import { D1BindingClient, D1DataProvider } from 'remult/remult-d1'

export function getAuthConfig(db: D1Database, secret: string, url?: string): BetterAuthOptions {
	const dataProvider = new SqlDatabase(new D1DataProvider(new D1BindingClient(db)))

	withRemult(
		async (remult) => {
			const entities = [User, Session, Account, Verification] as ClassType<unknown>[]
			const metadata = entities.map((e) => remult.repo(e).metadata)
			await dataProvider.ensureSchema(metadata)
		},
		{ dataProvider }
	).catch((e: unknown) => console.error('Schema init failed:', e))

	return {
		secret,
		baseURL: url,
		database: remultAdapter({
			authEntities: { User, Session, Account, Verification },
			dataProvider
		}),
		emailAndPassword: { enabled: true }
	}
}

let _auth: ReturnType<typeof betterAuth> | null = null
let _schemaInit: Promise<void> | null = null

async function ensureSchema(db: D1Database) {
	if (!_schemaInit) {
		_schemaInit = (async () => {
			const dp = new SqlDatabase(new D1DataProvider(new D1BindingClient(db)))
			await withRemult(
				async (remult) => {
					const entities = [User, Session, Account, Verification] as ClassType<unknown>[]
					const metadata = entities.map((e) => remult.repo(e).metadata)
					await dp.ensureSchema(metadata)
				},
				{ dataProvider: dp }
			)
		})()
	}
	return _schemaInit
}

export async function getAuth(db: D1Database, secret: string, url?: string) {
	if (!_auth) {
		await ensureSchema(db)
		const dp = new SqlDatabase(new D1DataProvider(new D1BindingClient(db)))
		_auth = betterAuth<BetterAuthOptions>({
			secret,
			baseURL: url,
			database: remultAdapter({
				authEntities: { User, Session, Account, Verification },
				dataProvider: dp
			}),
			emailAndPassword: { enabled: true }
		})
	}
	return _auth
}
