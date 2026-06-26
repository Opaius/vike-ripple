import vike from '@vikejs/hono';
import { Hono } from 'hono';
import { SqlDatabase } from 'remult';
import { D1BindingClient, D1DataProvider } from 'remult/remult-d1';
import { remultApi } from 'remult/remult-hono';

const app = new Hono<{ Variables: { user: unknown; session: unknown } }>();
let db: D1Database;

app.use('/api/*', async (c, next) => {
	db = (c.env as Cloudflare.Env).DB;
	await next();
});

app.route(
	'/api',
	remultApi({
		dataProvider: async () =>
			new SqlDatabase(new D1DataProvider(new D1BindingClient(db))),
		entities: [],
		getUser: async () => undefined
	})
);

app.use('/party/*', async (c) => {
	const env = c.env as Cloudflare.Env;
	const ns = env.REMULT_ROOM;
	return ns.get(ns.idFromName('global')).fetch(c.req.raw);
});

vike(app, []);

export { app };
