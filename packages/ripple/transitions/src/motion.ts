import { Context } from 'ripple';
import { getSpringKeyframes } from './spring.js';
import type {
	GestureConfig,
	MotionConfig,
	MotionTiming,
	SvelteTransitionFn,
	TransitionOptions
} from './types.js';

export const MotionTimingContext = new Context<MotionTiming | null>(null);

export function mergeRefs(
	...callbacks: Array<((el: any) => any) | null | undefined>
) {
	return (el: HTMLElement) => {
		if (!el) return;
		const cleanups = callbacks
			.map((cb) => cb?.(el))
			.filter((c): c is () => void => typeof c === 'function');
		return () => {
			for (const cleanup of cleanups) {
				try {
					cleanup();
				} catch (e) {
					console.error('Error during ref cleanup:', e);
				}
			}
		};
	};
}

function withTiming(options: TransitionOptions = {}): TransitionOptions {
	try {
		const ctx = MotionTimingContext.get();
		if (!ctx) return options;
		return {
			delay: options.delay ?? 0,
			duration: options.duration ?? ctx.duration,
			type: options.type ?? ctx.type,
			stiffness: options.stiffness ?? ctx.stiffness,
			damping: options.damping ?? ctx.damping,
			mass: options.mass ?? ctx.mass,
			easing: options.easing ?? ctx.easing
		};
	} catch {
		return options;
	}
}

function getCurrentState(
	target: HTMLElement,
	keyframe: any
): Record<string, any> {
	const cs = getComputedStyle(target);
	const state: Record<string, any> = {};
	if (keyframe && typeof keyframe === 'object') {
		for (const key of Object.keys(keyframe)) {
			const val = (cs as any)[key];
			if (val !== undefined && val !== '') {
				state[key] = /^\d/.test(val) ? parseFloat(val) : val;
			}
		}
	}
	return state;
}

function logTransition(
	el: HTMLElement,
	phase: string,
	details: Record<string, any>
) {
	if (typeof window === 'undefined') return;
	const isDebugMode =
		(window as any).__ripple_debug || window.location.search.includes('debug');
	if (!isDebugMode) return;

	const name = el.className
		? `.${el.className.split(' ').slice(0, 2).join('.')}`
		: el.tagName.toLowerCase();
	console.log(
		`%c[Ripple Transitions] %c${phase} on %c${name}%c\n` +
			Object.entries(details)
				.map(
					([k, v]) =>
						`   └─ ${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`
				)
				.join('\n'),
		'color: #00ffcc; font-weight: bold;',
		'color: #fff; font-weight: bold;',
		'color: #ffcc00; font-weight: bold;',
		'color: #ccc;'
	);
}
function applyStyles(target: HTMLElement, styles: Record<string, any>) {
	for (const [key, val] of Object.entries(styles)) {
		if (val === undefined || val === null) continue;
		if (key === 'transform' || key === 'opacity' || key === 'overflow') {
			(target.style as any)[key] = String(val);
		} else {
			(target.style as any)[key] =
				typeof val === 'number' ? `${val}px` : String(val);
		}
	}
}
export function motion(config: MotionConfig) {
	const { initial, animate, exit } = config;

	return (el: HTMLElement) => {
		if (!el) return;

		const transition = withTiming(config.transition || {});
		const {
			delay = 0,
			duration = 300,
			easing = 'cubic-bezier(0.25, 1, 0.5, 1)',
			type,
			stiffness = 300,
			damping = 30,
			mass = 1
		} = transition;
		const isSpring = type === 'spring';

		const mountSpring =
			isSpring && initial && animate
				? getSpringKeyframes(initial, animate, {
						delay,
						duration,
						easing,
						type,
						stiffness,
						damping,
						mass
					} as Required<TransitionOptions>)
				: null;

		const exitSpring =
			isSpring && animate && exit
				? getSpringKeyframes(animate, exit, {
						delay,
						duration,
						easing,
						type,
						stiffness,
						damping,
						mass
					} as Required<TransitionOptions>)
				: null;

		// Enter handler (supports interruption)
		const enterFn = (target: HTMLElement) => {
			const prevExitAnim = (target as any).__ripple_exit_anim;
			if (prevExitAnim && prevExitAnim.playState !== 'finished') {
				// Interrupted during exit: read current style, calculate progress, and animate from it
				const progress = prevExitAnim.currentTime
					? Math.max(
							0,
							Math.min(1, Number(prevExitAnim.currentTime) / duration)
						)
					: 0.5;
				const adjDuration = Math.max(50, duration * progress);

				const currentState = getCurrentState(target, animate);
				prevExitAnim.cancel();
				delete (target as any).__ripple_exit_anim;

				if (Object.keys(currentState).length > 0) {
					applyStyles(target, currentState);
					const mountKeyframes = isSpring
						? getSpringKeyframes(currentState, animate, {
								delay,
								duration: adjDuration,
								easing,
								type,
								stiffness,
								damping,
								mass
							} as Required<TransitionOptions>)
						: [currentState, animate ?? {}];

					logTransition(target, 'Enter (Interrupted Exit)', {
						duration: adjDuration,
						delay,
						startState: currentState,
						endState: animate
					});

					const mountAnim = target.animate(mountKeyframes, {
						delay,
						duration: adjDuration,
						easing: isSpring ? 'linear' : easing,
						fill: 'both'
					});
					(target as any).__ripple_anim = mountAnim;
					mountAnim.finished
						.then(() => {
							if ((target as any).__ripple_anim === mountAnim) {
								try {
									mountAnim.commitStyles();
									mountAnim.cancel();
								} catch {}
								target.style.transform = '';
								target.style.opacity = '';
								delete (target as any).__ripple_anim;
							}
						})
						.catch(() => {});

					return mountAnim.finished;
				}
			}

			// Normal enter
			const prevAnim = (target as any).__ripple_anim;
			if (prevAnim && prevAnim.playState !== 'finished') {
				prevAnim.cancel();
			}

			if (initial && animate) {
				applyStyles(target, initial);
				const mountKeyframes = mountSpring ?? [initial, animate];
				logTransition(target, 'Enter (Normal)', {
					duration,
					delay,
					startState: initial,
					endState: animate
				});
				const mountAnim = target.animate(mountKeyframes, {
					delay,
					duration,
					easing: isSpring ? 'linear' : easing,
					fill: 'both'
				});
				(target as any).__ripple_anim = mountAnim;

				mountAnim.finished
					.then(() => {
						if ((target as any).__ripple_anim === mountAnim) {
							try {
								mountAnim.commitStyles();
								mountAnim.cancel();
							} catch {}
							target.style.transform = '';
							target.style.opacity = '';
							delete (target as any).__ripple_anim;
						}
					})
					.catch(() => {});

				return mountAnim.finished;
			}
			return Promise.resolve();
		};

		// Exit handler (supports interruption)
		const exitFn = (target: HTMLElement) => {
			const prevAnim = (target as any).__ripple_anim;
			if (prevAnim && prevAnim.playState !== 'finished') {
				// Interrupted during enter: read current style, calculate progress, and animate from it
				const progress = prevAnim.currentTime
					? Math.max(0, Math.min(1, Number(prevAnim.currentTime) / duration))
					: 0.5;
				const adjDuration = Math.max(50, duration * progress);

				const currentState = getCurrentState(target, exit ?? initial ?? {});
				prevAnim.cancel();
				delete (target as any).__ripple_anim;

				if (Object.keys(currentState).length > 0 && exit) {
					applyStyles(target, currentState);
					const exitKeyframes = isSpring
						? getSpringKeyframes(currentState, exit, {
								delay,
								duration: adjDuration,
								easing,
								type,
								stiffness,
								damping,
								mass
							} as Required<TransitionOptions>)
						: [currentState, exit];

					logTransition(target, 'Exit (Interrupted Enter)', {
						duration: adjDuration,
						delay,
						startState: currentState,
						endState: exit
					});

					const exitAnim = target.animate(exitKeyframes, {
						delay,
						duration: adjDuration,
						easing: isSpring ? 'linear' : easing,
						fill: 'both'
					});
					(target as any).__ripple_exit_anim = exitAnim;
					exitAnim.finished
						.then(() => {
							if ((target as any).__ripple_exit_anim === exitAnim) {
								try {
									exitAnim.commitStyles();
									exitAnim.cancel();
								} catch {}
								delete (target as any).__ripple_exit_anim;
							}
						})
						.catch(() => {});
					return exitAnim.finished;
				}
			}

			// Normal exit
			const prevExitAnim = (target as any).__ripple_exit_anim;
			if (prevExitAnim && prevExitAnim.playState !== 'finished') {
				prevExitAnim.cancel();
			}

			if (animate && exit) {
				applyStyles(target, animate);
				const exitKeyframes = exitSpring ?? [animate, exit];
				logTransition(target, 'Exit (Normal)', {
					duration,
					delay,
					startState: animate,
					endState: exit
				});
				const exitAnim = target.animate(exitKeyframes, {
					delay,
					duration,
					easing: isSpring ? 'linear' : easing,
					fill: 'both'
				});
				(target as any).__ripple_exit_anim = exitAnim;
				exitAnim.finished
					.then(() => {
						if ((target as any).__ripple_exit_anim === exitAnim) {
							try {
								exitAnim.commitStyles();
								exitAnim.cancel();
							} catch {}
							delete (target as any).__ripple_exit_anim;
						}
					})
					.catch(() => {});
				return exitAnim.finished;
			}
			return Promise.resolve();
		};
		// Register handlers on element
		(el as any).__ripple_enter = enterFn;
		(el as any).__ripple_exit = exitFn;

		// Run enter animation immediately on mount
		(el as any).__ripple_mounted = true;
		enterFn(el);

		return () => {
			const a = (el as any).__ripple_anim;
			if (a && a.playState !== 'finished') a.cancel();
			const ea = (el as any).__ripple_exit_anim;
			if (ea && ea.playState !== 'finished') ea.cancel();

			delete (el as any).__ripple_enter;
			delete (el as any).__ripple_exit;
			delete (el as any).__ripple_anim;
			delete (el as any).__ripple_exit_anim;
		};
	};
}

export function fade(options: TransitionOptions = {}) {
	return motion({
		initial: { opacity: 0 },
		animate: { opacity: 1 },
		exit: { opacity: 0 },
		transition: options
	});
}

export function rise(options: TransitionOptions = {}) {
	return motion({
		initial: { opacity: 0, transform: 'translateY(20px)' },
		animate: { opacity: 1, transform: 'translateY(0)' },
		exit: { opacity: 0, transform: 'translateY(20px)' },
		transition: options
	});
}

export function scale(options: TransitionOptions = {}) {
	return motion({
		initial: { opacity: 0, transform: 'scale(0.95)' },
		animate: { opacity: 1, transform: 'scale(1)' },
		exit: { opacity: 0, transform: 'scale(0.95)' },
		transition: options
	});
}

export function fly(
	options: TransitionOptions & {
		x?: number;
		y?: number;
		exitX?: number;
		exitY?: number;
	} = {}
) {
	const { x = 0, y = 0, exitX, exitY, ...transitionOpts } = options;
	return motion({
		initial: { opacity: 0, transform: `translate(${x}px, ${y}px)` },
		animate: { opacity: 1, transform: 'translate(0, 0)' },
		exit: {
			opacity: 0,
			transform: `translate(${exitX ?? x}px, ${exitY ?? y}px)`
		},
		transition: transitionOpts
	});
}

export function blur(options: TransitionOptions & { amount?: number } = {}) {
	const { amount = 5, ...transitionOpts } = options;
	return motion({
		initial: { opacity: 0, filter: `blur(${amount}px)` },
		animate: { opacity: 1, filter: 'blur(0px)' },
		exit: { opacity: 0, filter: `blur(${amount}px)` },
		transition: transitionOpts
	});
}

export function draw(options: TransitionOptions & { speed?: number } = {}) {
	return (el: HTMLElement) => {
		if (!el) return;
		const isSvgPath =
			el instanceof SVGPathElement || el instanceof SVGPolylineElement;
		const length = isSvgPath ? (el as any).getTotalLength() : 0;

		if (isSvgPath) {
			el.style.strokeDasharray = String(length);
		}

		const transition = withTiming(options);
		const duration =
			options.duration ??
			(options.speed && length ? length / options.speed : 800);

		return motion({
			initial: { strokeDashoffset: length, opacity: 0 },
			animate: { strokeDashoffset: 0, opacity: 1 },
			exit: { strokeDashoffset: length, opacity: 0 },
			transition: { ...transition, duration }
		})(el);
	};
}

function parseStyleString(cssText: string): Record<string, string> {
	const styles: Record<string, string> = {};
	const declarations = cssText.split(';');
	for (const decl of declarations) {
		const colon = decl.indexOf(':');
		if (colon === -1) continue;
		const key = decl.slice(0, colon).trim();
		const value = decl.slice(colon + 1).trim();
		if (key && value) {
			styles[key] = value;
		}
	}
	return styles;
}

export function svelteTransition(
	transitionFn: SvelteTransitionFn,
	params?: any
) {
	return (el: HTMLElement) => {
		if (!el) return;
		const config = transitionFn(el, params);
		const delay = config.delay ?? 0;
		const duration = config.duration ?? 400;
		const easingFn = config.easing ?? ((t: number) => t);

		const steps = 30;
		const enterKeyframes: Record<string, any>[] = [];
		const exitKeyframes: Record<string, any>[] = [];

		if (config.css) {
			for (let i = 0; i <= steps; i++) {
				const pct = i / steps;
				const t = easingFn(pct);
				const u = 1 - t;
				const cssText = config.css(t, u);
				const styles = parseStyleString(cssText);
				enterKeyframes.push({ ...styles, offset: pct });
			}
			for (let i = 0; i <= steps; i++) {
				const pct = i / steps;
				const t = easingFn(1 - pct);
				const u = 1 - t;
				const cssText = config.css(t, u);
				const styles = parseStyleString(cssText);
				exitKeyframes.push({ ...styles, offset: pct });
			}
		}

		let enterTickFrame: number | null = null;
		const startEnterTick = () => {
			if (!config.tick) return;
			if (enterTickFrame) cancelAnimationFrame(enterTickFrame);
			let startTime: number | null = null;
			const run = (timestamp: number) => {
				if (!startTime) startTime = timestamp;
				const elapsed = timestamp - startTime;
				const pct = Math.min(1, elapsed / duration);
				const t = easingFn(pct);
				config.tick!(t, 1 - t);
				if (pct < 1) {
					enterTickFrame = requestAnimationFrame(run);
				} else {
					enterTickFrame = null;
				}
			};
			enterTickFrame = requestAnimationFrame(run);
		};

		let exitTickFrame: number | null = null;
		const startExitTick = () => {
			if (!config.tick) return;
			if (exitTickFrame) cancelAnimationFrame(exitTickFrame);
			let startTime: number | null = null;
			const run = (timestamp: number) => {
				if (!startTime) startTime = timestamp;
				const elapsed = timestamp - startTime;
				const pct = Math.min(1, elapsed / duration);
				const t = easingFn(1 - pct);
				config.tick!(t, 1 - t);
				if (pct < 1) {
					exitTickFrame = requestAnimationFrame(run);
				} else {
					exitTickFrame = null;
				}
			};
			exitTickFrame = requestAnimationFrame(run);
		};

		const enterFn = (target: HTMLElement) => {
			const prevExitAnim = (target as any).__ripple_exit_anim;
			if (prevExitAnim) {
				prevExitAnim.cancel();
				delete (target as any).__ripple_exit_anim;
			}
			if (exitTickFrame) {
				cancelAnimationFrame(exitTickFrame);
				exitTickFrame = null;
			}

			startEnterTick();

			if (config.css && enterKeyframes.length > 0) {
				const anim = target.animate(enterKeyframes, {
					delay,
					duration,
					fill: 'both'
				});
				(target as any).__ripple_anim = anim;
				anim.finished
					.then(() => {
						if ((target as any).__ripple_anim === anim) {
							try {
								anim.commitStyles();
								anim.cancel();
							} catch {}
							delete (target as any).__ripple_anim;
						}
					})
					.catch(() => {});
				return anim.finished;
			}
			return Promise.resolve();
		};

		const exitFn = (target: HTMLElement) => {
			const prevAnim = (target as any).__ripple_anim;
			if (prevAnim) {
				prevAnim.cancel();
				delete (target as any).__ripple_anim;
			}
			if (enterTickFrame) {
				cancelAnimationFrame(enterTickFrame);
				enterTickFrame = null;
			}

			startExitTick();

			if (config.css && exitKeyframes.length > 0) {
				const anim = target.animate(exitKeyframes, {
					delay,
					duration,
					fill: 'both'
				});
				(target as any).__ripple_exit_anim = anim;
				anim.finished
					.then(() => {
						if ((target as any).__ripple_exit_anim === anim) {
							try {
								anim.commitStyles();
								anim.cancel();
							} catch {}
							delete (target as any).__ripple_exit_anim;
						}
					})
					.catch(() => {});
				return anim.finished;
			}
			return Promise.resolve();
		};

		(el as any).__ripple_enter = enterFn;
		(el as any).__ripple_exit = exitFn;

		enterFn(el);

		return () => {
			const a = (el as any).__ripple_anim;
			if (a) a.cancel();
			const ea = (el as any).__ripple_exit_anim;
			if (ea) ea.cancel();
			if (enterTickFrame) cancelAnimationFrame(enterTickFrame);
			if (exitTickFrame) cancelAnimationFrame(exitTickFrame);
			delete (el as any).__ripple_enter;
			delete (el as any).__ripple_exit;
			delete (el as any).__ripple_anim;
			delete (el as any).__ripple_exit_anim;
		};
	};
}

export function gestures(config: GestureConfig) {
	return (el: HTMLElement) => {
		if (!el) return;

		const transition = withTiming(config.transition || {});
		const {
			duration = 200,
			easing = 'ease-out',
			type,
			stiffness = 300,
			damping = 30,
			mass = 1
		} = transition;

		const isSpring = type === 'spring';

		let currentHoverAnim: Animation | null = null;
		let currentTapAnim: Animation | null = null;
		let currentFocusAnim: Animation | null = null;

		const getBaseStyles = (targetKeys: string[]) => {
			const cs = getComputedStyle(el);
			const base: Record<string, any> = {};
			for (const key of targetKeys) {
				const val = (cs as any)[key];
				base[key] = val;
			}
			return base;
		};

		const animateTo = (
			targetState: Record<string, any>,
			durationMs: number
		) => {
			const keys = Object.keys(targetState);
			const startState = getBaseStyles(keys);
			const keyframes = isSpring
				? getSpringKeyframes(startState, targetState, {
						delay: 0,
						duration: durationMs,
						easing,
						type,
						stiffness,
						damping,
						mass
					} as Required<TransitionOptions>)
				: [startState, targetState];

			const anim = el.animate(keyframes, {
				duration: durationMs,
				easing: isSpring ? 'linear' : easing,
				fill: 'both'
			});
			anim.finished
				.then(() => {
					try {
						anim.commitStyles();
						anim.cancel();
					} catch {}
				})
				.catch(() => {});
			return anim;
		};

		let isHovered = false;
		const onMouseEnter = () => {
			if (!config.hover) return;
			isHovered = true;
			if (currentHoverAnim) currentHoverAnim.cancel();
			currentHoverAnim = animateTo(config.hover, duration);
		};
		const onMouseLeave = () => {
			if (!config.hover) return;
			isHovered = false;
			if (currentHoverAnim) currentHoverAnim.cancel();
			const keys = Object.keys(config.hover);
			const originalStyles: Record<string, string> = {};
			for (const key of keys) {
				originalStyles[key] = el.style[key as any];
				el.style[key as any] = '';
			}
			const baseState = getBaseStyles(keys);
			for (const key of keys) {
				el.style[key as any] = originalStyles[key];
			}
			currentHoverAnim = animateTo(baseState, duration);
		};

		let isTapped = false;
		const onMouseDown = () => {
			if (!config.tap) return;
			isTapped = true;
			if (currentTapAnim) currentTapAnim.cancel();
			currentTapAnim = animateTo(config.tap, duration * 0.7);
		};
		const onMouseUp = () => {
			if (!config.tap) return;
			if (!isTapped) return;
			isTapped = false;
			if (currentTapAnim) currentTapAnim.cancel();
			const keys = Object.keys(config.tap);
			const originalStyles: Record<string, string> = {};
			for (const key of keys) {
				originalStyles[key] = el.style[key as any];
				el.style[key as any] = '';
			}
			const targetState: Record<string, any> = {};
			const hoverState = config.hover || {};
			const baseState = getBaseStyles(keys);
			for (const key of keys) {
				targetState[key] =
					isHovered && hoverState[key] !== undefined
						? hoverState[key]
						: baseState[key];
			}
			for (const key of keys) {
				el.style[key as any] = originalStyles[key];
			}
			currentTapAnim = animateTo(targetState, duration);
		};

		const onFocus = () => {
			if (!config.focus) return;
			if (currentFocusAnim) currentFocusAnim.cancel();
			currentFocusAnim = animateTo(config.focus, duration);
		};
		const onBlur = () => {
			if (!config.focus) return;
			if (currentFocusAnim) currentFocusAnim.cancel();
			const keys = Object.keys(config.focus);
			const originalStyles: Record<string, string> = {};
			for (const key of keys) {
				originalStyles[key] = el.style[key as any];
				el.style[key as any] = '';
			}
			const baseState = getBaseStyles(keys);
			for (const key of keys) {
				el.style[key as any] = originalStyles[key];
			}
			currentFocusAnim = animateTo(baseState, duration);
		};

		if (config.hover) {
			el.addEventListener('mouseenter', onMouseEnter);
			el.addEventListener('mouseleave', onMouseLeave);
		}
		if (config.tap) {
			el.addEventListener('mousedown', onMouseDown);
			window.addEventListener('mouseup', onMouseUp);
		}
		if (config.focus) {
			el.addEventListener('focus', onFocus);
			el.addEventListener('blur', onBlur);
		}

		return () => {
			if (config.hover) {
				el.removeEventListener('mouseenter', onMouseEnter);
				el.removeEventListener('mouseleave', onMouseLeave);
			}
			if (config.tap) {
				el.removeEventListener('mousedown', onMouseDown);
				window.removeEventListener('mouseup', onMouseUp);
			}
			if (config.focus) {
				el.removeEventListener('focus', onFocus);
				el.removeEventListener('blur', onBlur);
			}
			if (currentHoverAnim) currentHoverAnim.cancel();
			if (currentTapAnim) currentTapAnim.cancel();
			if (currentFocusAnim) currentFocusAnim.cancel();
		};
	};
}

export function animate(config: MotionConfig): (el: HTMLElement) => void;
export function animate(): {
	fade(): any;
	fly(opts?: { x?: number; y?: number }): any;
	scale(s?: number): any;
	rise(y?: number): any;
	blur(amount?: number): any;
	slide(axis?: 'x' | 'y'): any;
	custom(
		init: Record<string, any>,
		anim: Record<string, any>,
		ex: Record<string, any>
	): any;
	delay(ms: number): any;
	duration(ms: number): any;
	easing(e: string): any;
	spring(opts?: { stiffness?: number; damping?: number; mass?: number }): any;
	build(): (el: HTMLElement) => void;
};
export function animate(config?: MotionConfig): any {
	if (config) {
		return motion(config);
	}

	const initial: Record<string, any> = {};
	const animateTarget: Record<string, any> = {};
	const exit: Record<string, any> = {};
	let delay = 0;
	let duration = 300;
	let easing = 'cubic-bezier(0.25, 1, 0.5, 1)';
	const chain = {
		fade() {
			initial.opacity = 0;
			animateTarget.opacity = 1;
			exit.opacity = 0;
			return chain;
		},
		fly(opts: { x?: number; y?: number } = {}) {
			const x = opts.x ?? 0,
				y = opts.y ?? 0;
			initial.opacity = 0;
			animateTarget.opacity = 1;
			exit.opacity = 0;
			initial.transform =
				`${initial.transform ?? ''} translate(${x}px, ${y}px)`.trim();
			animateTarget.transform =
				`${animateTarget.transform ?? ''} translate(0px, 0px)`.trim();
			exit.transform =
				`${exit.transform ?? ''} translate(${x}px, ${y}px)`.trim();
			return chain;
		},
		scale(s = 0.95) {
			initial.opacity = 0;
			animateTarget.opacity = 1;
			exit.opacity = 0;
			initial.transform = `${initial.transform ?? ''} scale(${s})`.trim();
			animateTarget.transform =
				`${animateTarget.transform ?? ''} scale(1)`.trim();
			exit.transform = `${exit.transform ?? ''} scale(${s})`.trim();
			return chain;
		},
		rise(y = 20) {
			initial.opacity = 0;
			animateTarget.opacity = 1;
			exit.opacity = 0;
			initial.transform =
				`${initial.transform ?? ''} translateY(${y}px)`.trim();
			animateTarget.transform =
				`${animateTarget.transform ?? ''} translateY(0px)`.trim();
			exit.transform = `${exit.transform ?? ''} translateY(${y}px)`.trim();
			return chain;
		},
		blur(amount = 5) {
			initial.filter = `${initial.filter ?? ''} blur(${amount}px)`.trim();
			animateTarget.filter = `${animateTarget.filter ?? ''} blur(0px)`.trim();
			exit.filter = `${exit.filter ?? ''} blur(${amount}px)`.trim();
			return chain;
		},
		slide(axis: 'x' | 'y' = 'y') {
			const prop = axis === 'y' ? 'height' : 'width';
			initial[prop] = '0px';
			initial.overflow = 'hidden';
			initial.opacity = 0;

			animateTarget[prop] = 'auto';
			animateTarget.overflow = 'hidden';
			animateTarget.opacity = 1;

			exit[prop] = '0px';
			exit.overflow = 'hidden';
			exit.opacity = 0;
			return chain;
		},
		custom(
			init: Record<string, any>,
			anim: Record<string, any>,
			ex: Record<string, any>
		) {
			Object.assign(initial, init);
			Object.assign(animateTarget, anim);
			Object.assign(exit, ex);
			return chain;
		},
		delay(ms: number) {
			delay = ms;
			return chain;
		},
		duration(ms: number) {
			duration = ms;
			return chain;
		},
		easing(e: string) {
			easing = e;
			return chain;
		},
		spring(opts: { stiffness?: number; damping?: number; mass?: number } = {}) {
			(chain as any)._spring = {
				type: 'spring',
				stiffness: opts.stiffness ?? 300,
				damping: opts.damping ?? 30,
				mass: opts.mass ?? 1
			};
			return chain;
		},
		build() {
			const springOpts = (chain as any)._spring || {};
			return motion({
				initial,
				animate: animateTarget,
				exit,
				transition: {
					delay,
					duration,
					easing,
					...springOpts
				}
			});
		}
	};

	return chain;
}
