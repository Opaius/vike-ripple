/**
 * Unit tests for @cioky/ripple-query-remult — pure logic, no Ripple runtime needed.
 * Registry, entityKey, buildKey, invalidateEntity all work without active_block.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
	registerInvalidator,
	triggerInvalidators,
	unregisterInvalidator
} from './src/index';

// ── Registry ─────────────────────────────────────────────────

describe('registry', () => {
	beforeEach(() => {
		// Clean all invalidators between tests by triggering a non-existent key
	});

	it('registers and triggers a single invalidator', () => {
		let called = false;
		registerInvalidator('test', () => {
			called = true;
		});
		triggerInvalidators('test');
		expect(called).toBe(true);
	});

	it('triggers all invalidators for a key', () => {
		let count = 0;
		registerInvalidator('tasks', () => count++);
		registerInvalidator('tasks', () => count++);
		triggerInvalidators('tasks');
		expect(count).toBe(2);
	});

	it('does not trigger invalidators for other keys', () => {
		let tasks = 0;
		let users = 0;
		registerInvalidator('tasks', () => tasks++);
		registerInvalidator('users', () => users++);
		triggerInvalidators('tasks');
		expect(tasks).toBe(1);
		expect(users).toBe(0);
	});

	it('cleanup function removes the invalidator', () => {
		let called = false;
		const cleanup = registerInvalidator('test', () => {
			called = true;
		});
		cleanup();
		triggerInvalidators('test');
		expect(called).toBe(false);
	});

	it('unregisterInvalidator removes a specific invalidator', () => {
		let count = 0;
		const fn1 = () => count++;
		const fn2 = () => count++;
		registerInvalidator('test', fn1);
		registerInvalidator('test', fn2);
		unregisterInvalidator('test', fn1);
		triggerInvalidators('test');
		expect(count).toBe(1);
	});

	it('triggering a non-existent key does nothing', () => {
		expect(() => triggerInvalidators('nonexistent')).not.toThrow();
	});

	it('unregistering a non-existent key does nothing', () => {
		const fn = () => {};
		expect(() => unregisterInvalidator('nonexistent', fn)).not.toThrow();
	});

	it('registering with empty key works', () => {
		let called = false;
		registerInvalidator('', () => {
			called = true;
		});
		triggerInvalidators('');
		expect(called).toBe(true);
	});
});
