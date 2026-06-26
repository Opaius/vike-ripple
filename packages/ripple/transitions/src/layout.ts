import { track } from 'ripple';
import { getSpringKeyframes } from './spring.js';
import type { LayoutOptions, TransitionOptions } from './types.js';

export function layout(options: LayoutOptions = {}) {
	const {
		duration = 300,
		easing = 'cubic-bezier(0.25, 1, 0.5, 1)',
		type,
		stiffness = 300,
		damping = 30,
		mass = 1
	} = options;
	const isSpring = type === 'spring';

	return (el: HTMLElement) => {
		if (!el) return;

		const getRelativeRect = () => {
			const rect = el.getBoundingClientRect();
			const parent = el.offsetParent || el.parentElement || el;
			const parentRect = parent.getBoundingClientRect();
			return {
				left: rect.left - parentRect.left,
				top: rect.top - parentRect.top,
				width: rect.width,
				height: rect.height
			};
		};

		let prevRect = getRelativeRect();
		let animating = false;
		let initialized = false;

		setTimeout(() => {
			initialized = true;
			prevRect = getRelativeRect();
		}, 150);

		const ro = new ResizeObserver(() => {
			const newRect = getRelativeRect();
			if (!initialized) {
				prevRect = newRect;
				return;
			}
			if (animating) return;
			const dx = prevRect.left - newRect.left;
			const dy = prevRect.top - newRect.top;
			const dw = prevRect.width - newRect.width;
			const dh = prevRect.height - newRect.height;

			if (dx !== 0 || dy !== 0 || dh !== 0 || dw !== 0) {
				animating = true;
				const anims: Promise<any>[] = [];

				if (dh !== 0 || dw !== 0) {
					const oldOverflow = el.style.overflow;
					el.style.overflow = 'hidden';
					const sizeAnim = el.animate(
						[
							{ width: `${prevRect.width}px`, height: `${prevRect.height}px` },
							{ width: `${newRect.width}px`, height: `${newRect.height}px` }
						],
						{ duration, easing }
					);

					anims.push(
						sizeAnim.finished.then(() => {
							el.style.overflow = oldOverflow;
						})
					);
				}

				if (dx !== 0 || dy !== 0) {
					const startState = { transform: `translate(${dx}px, ${dy}px)` };
					const endState = { transform: 'translate(0px, 0px)' };

					const keyframes = isSpring
						? getSpringKeyframes(startState, endState, {
								delay: 0,
								duration,
								easing,
								type,
								stiffness,
								damping,
								mass
							} as Required<TransitionOptions>)
						: [startState, endState];

					const transAnim = el.animate(keyframes, {
						duration,
						easing: isSpring ? 'linear' : easing,
						fill: 'both'
					});

					anims.push(
						transAnim.finished.then(() => {
							try {
								transAnim.commitStyles();
								transAnim.cancel();
							} catch {}
							el.style.transform = '';
						})
					);
				}

				Promise.all(anims).then(() => {
					animating = false;
					prevRect = getRelativeRect();
				});
			} else {
				prevRect = newRect;
			}
		});

		let parent = el.parentElement;
		while (parent && parent !== document.body) {
			ro.observe(parent);
			parent = parent.parentElement;
		}
		ro.observe(el);

		return () => {
			ro.disconnect();
			el.style.transition = '';
			el.style.transform = '';
		};
	};
}

export function useTransitionList<T extends { id: string | number }>(
	initialItems: T[],
	options: LayoutOptions | (() => LayoutOptions) = {}
) {
	const state = track(initialItems);
	const rects = new Map<string | number, DOMRect>();
	const elements = new Map<string | number, HTMLElement>();
	const refCache = new Map<string | number, (el: HTMLElement) => void>();

	const register = (key: string | number) => {
		let cached = refCache.get(key);
		if (!cached) {
			cached = (el: HTMLElement) => {
				if (el) {
					elements.set(key, el);
				} else {
					elements.delete(key);
					rects.delete(key);
					refCache.delete(key);
				}
			};
			refCache.set(key, cached);
		}
		return cached;
	};

	const read = () => {
		for (const [key, el] of elements.entries()) {
			rects.set(key, el.getBoundingClientRect());
		}
	};

	const flip = () => {
		queueMicrotask(() => {
			const resolvedOptions =
				typeof options === 'function' ? options() : options;
			const {
				duration = 300,
				easing = 'cubic-bezier(0.25, 1, 0.5, 1)',
				type,
				stiffness = 300,
				damping = 30,
				mass = 1
			} = resolvedOptions;
			const isSpring = type === 'spring';

			const toAnimate: Array<{ el: HTMLElement; dx: number; dy: number }> = [];
			for (const [key, el] of elements.entries()) {
				const first = rects.get(key);
				if (!first) continue;
				const last = el.getBoundingClientRect();
				const dx = first.left - last.left;
				const dy = first.top - last.top;
				if (dx !== 0 || dy !== 0) {
					el.style.transition = 'none';
					el.style.transform = `translate(${dx}px, ${dy}px)`;
					toAnimate.push({ el, dx, dy });
				}
			}

			if (toAnimate.length > 0) {
				// Force reflow
				toAnimate[0].el.offsetHeight;

				for (const { el, dx, dy } of toAnimate) {
					const startState = { transform: `translate(${dx}px, ${dy}px)` };
					const endState = { transform: 'translate(0px, 0px)' };

					const keyframes = isSpring
						? getSpringKeyframes(startState, endState, {
								delay: 0,
								duration,
								easing,
								type,
								stiffness,
								damping,
								mass
							} as Required<TransitionOptions>)
						: [startState, endState];

					const transAnim = el.animate(keyframes, {
						duration,
						easing: isSpring ? 'linear' : easing,
						fill: 'both'
					});

					transAnim.finished.then(() => {
						try {
							transAnim.commitStyles();
							transAnim.cancel();
						} catch {}
						el.style.transform = '';
					});
				}
			}
		});
	};

	return {
		get items() {
			return state.value;
		},
		set items(v) {
			read();
			state.value = v;
			flip();
		},
		ref: register,
		push(item: T) {
			read();
			state.value = [...state.value, item];
			flip();
		},
		insert(item: T, i: number) {
			read();
			const n = [...state.value];
			n.splice(i, 0, item);
			state.value = n;
			flip();
		},
		shuffle() {
			read();
			const c = [...state.value];
			for (let i = c.length - 1; i > 0; i--) {
				const j = (Math.random() * (i + 1)) | 0;
				[c[i], c[j]] = [c[j], c[i]];
			}
			state.value = c;
			flip();
		},
		async remove(
			id: string | number,
			animateExit?: (el: HTMLElement) => Promise<any> | undefined
		) {
			const el = elements.get(id);
			const exitAnim = el ? (el as any).__ripple_exit || animateExit : null;
			if (el && exitAnim) {
				try {
					await exitAnim(el);
				} catch (e) {
					console.error('Error during exit animation:', e);
				}
			}
			read();
			state.value = state.value.filter((item) => item.id !== id);
			flip();
		}
	};
}
