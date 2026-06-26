import { Allow, Entity, Fields, Relations, Validators } from 'remult';

const Roles = { admin: 'admin' };

@Entity('user', {
	allowApiCrud: Roles.admin,
	allowApiRead: Allow.authenticated
})
export class User {
	@Fields.string({
		required: true,
		minLength: 8,
		maxLength: 40,
		validate: Validators.unique(),
		allowApiUpdate: false
	})
	id!: string;
	@Fields.string({ required: true })
	name = '';
	@Fields.string({})
	email = '';
	@Fields.boolean({})
	emailVerified = false;
	@Fields.string({ required: false })
	image = '';
	@Fields.createdAt({})
	createdAt!: Date;
	@Fields.updatedAt({})
	updatedAt!: Date;
}

@Entity('session', { allowApiCrud: Roles.admin })
export class Session {
	@Fields.string({
		required: true,
		minLength: 8,
		maxLength: 40,
		validate: Validators.unique(),
		allowApiUpdate: false
	})
	id!: string;
	@Fields.date({ required: true })
	expiresAt = new Date();
	@Fields.string({})
	token = '';
	@Fields.createdAt({})
	createdAt!: Date;
	@Fields.updatedAt({ required: true, allowApiUpdate: false })
	updatedAt!: Date;
	@Fields.string({ required: false })
	ipAddress = '';
	@Fields.string({ required: false })
	userAgent = '';
	@Fields.string({ required: true })
	userId = '';
	@Relations.toOne(() => User, 'id')
	user!: User;
}

@Entity('account', { allowApiCrud: Roles.admin })
export class Account {
	@Fields.string({
		required: true,
		minLength: 8,
		maxLength: 40,
		validate: Validators.unique(),
		allowApiUpdate: false
	})
	id!: string;
	@Fields.string({ required: true, allowApiUpdate: false })
	accountId = '';
	@Fields.string({ required: true, allowApiUpdate: false })
	providerId = '';
	@Fields.string({ required: true })
	userId = '';
	@Relations.toOne(() => User, 'id')
	user!: User;
	@Fields.string({ required: false, allowApiUpdate: false })
	accessToken = '';
	@Fields.string({ required: false, allowApiUpdate: false })
	refreshToken = '';
	@Fields.string({ required: false })
	idToken = '';
	@Fields.date({ required: false })
	accessTokenExpiresAt = new Date();
	@Fields.date({ required: false })
	refreshTokenExpiresAt = new Date();
	@Fields.string({ required: false })
	scope = '';
	@Fields.string({ required: false, allowApiUpdate: false })
	password = '';
	@Fields.createdAt({
		required: true,
		defaultValue: () => new Date(),
		allowApiUpdate: false
	})
	createdAt!: Date;
	@Fields.updatedAt({ required: true, allowApiUpdate: false })
	updatedAt!: Date;
}

@Entity('verification', { allowApiCrud: Roles.admin })
export class Verification {
	@Fields.string({
		required: true,
		minLength: 8,
		maxLength: 40,
		validate: Validators.unique(),
		allowApiUpdate: false
	})
	id!: string;
	@Fields.string({ required: true })
	identifier = '';
	@Fields.string({ required: true })
	value = '';
	@Fields.date({ required: true })
	expiresAt = new Date();
	@Fields.createdAt({
		required: true,
		defaultValue: () => new Date(),
		allowApiUpdate: false
	})
	createdAt!: Date;
	@Fields.updatedAt({
		required: true,
		defaultValue: () => new Date(),
		allowApiUpdate: false
	})
	updatedAt!: Date;
}
