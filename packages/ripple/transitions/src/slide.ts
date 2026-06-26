import { MotionTimingContext } from './motion.js';
import type { TransitionOptions } from './types.js';

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

function getNaturalSize(
	el: HTMLElement,
	isY: boolean
): { size: number; paddingStart: string; paddingEnd: string } {
	const originalStyle = el.style.cssText;
	const prop = isY ? 'height' : 'width';
	const padStart = isY ? 'paddingTop' : 'paddingLeft';
	const padEnd = isY ? 'paddingBottom' : 'paddingRight';

	// Temporarily clear styles to measure natural size
	el.style[prop as any] = '';
	el.style.overflow = '';
	el.style[padStart as any] = '';
	el.style[padEnd as any] = '';

	const size = isY ? el.offsetHeight : el.offsetWidth;
	const computed = getComputedStyle(el);
	const paddingStartVal = computed[padStart as any];
	const paddingEndVal = computed[padEnd as any];

	el.style.cssText = originalStyle;

	return { size, paddingStart: paddingStartVal, paddingEnd: paddingEndVal };
}

function getCurrentSlideState(
	el: HTMLElement,
	isY: boolean,
	withFade: boolean
) {
	const cs = getComputedStyle(el);
	const prop = isY ? 'height' : 'width';
	const padStart = isY ? 'paddingTop' : 'paddingLeft';
	const padEnd = isY ? 'paddingBottom' : 'paddingRight';

	const state: Record<string, any> = {
		[prop]: cs[prop as any],
		[padStart]: cs[padStart as any],
		[padEnd]: cs[padEnd as any],
		overflow: 'hidden'
	};
	if (withFade) {
		state.opacity = parseFloat(cs.opacity || '1');
	}
	return state;
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
export function slide(
	options: TransitionOptions & { fade?: boolean; axis?: 'x' | 'y' } = {}
) {
	const { fade: withFade = true, axis = 'y', ...transitionOpts } = options;
	const isY = axis === 'y';
	const prop = isY ? 'height' : 'width';
	const padStart = isY ? 'paddingTop' : 'paddingLeft';
	const padEnd = isY ? 'paddingBottom' : 'paddingRight';

	return (el: HTMLElement) => {
		if (!el) return;

		const transition = withTiming(transitionOpts);
		const { delay = 0, duration = 300, easing = 'ease-in-out' } = transition;

		const enterFn = (target: HTMLElement) => {
			const prevExit = (target as any).__ripple_exit_anim;
			let startState: Record<string, any>;
			let adjDuration = duration;

			if (prevExit && prevExit.playState !== 'finished') {
				// Interrupted exit: read current state and calculate progress
				const progress = prevExit.currentTime
					? Math.max(0, Math.min(1, Number(prevExit.currentTime) / duration))
					: 0.5;
				adjDuration = Math.max(50, duration * progress);

				startState = getCurrentSlideState(target, isY, withFade);
				prevExit.cancel();
				delete (target as any).__ripple_exit_anim;
			} else {
				// Normal enter starts at 0
				startState = {
					[prop]: '0px',
					[padStart]: '0px',
					[padEnd]: '0px',
					overflow: 'hidden'
				};
				if (withFade) {
					startState.opacity = 0;
				}
			}

			const { size, paddingStart, paddingEnd } = getNaturalSize(target, isY);
			const endState: Record<string, any> = {
				[prop]: `${size}px`,
				[padStart]: paddingStart,
				[padEnd]: paddingEnd,
				overflow: 'hidden'
			};
			if (withFade) {
				endState.opacity = 1;
			}

			const prevAnim = (target as any).__ripple_anim;
			if (prevAnim && prevAnim.playState !== 'finished') {
				prevAnim.cancel();
			}

			applyStyles(target, startState);
			const mountAnim = target.animate([startState, endState], {
				delay,
				duration: adjDuration,
				easing,
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
						target.style[prop as any] = '';
						target.style.overflow = '';
						target.style[padStart as any] = '';
						target.style[padEnd as any] = '';
						if (withFade) target.style.opacity = '';
						delete (target as any).__ripple_anim;
					}
				})
				.catch(() => {});

			return mountAnim.finished;
		};

		const exitFn = (target: HTMLElement) => {
			const prevAnim = (target as any).__ripple_anim;
			let startState: Record<string, any>;
			let adjDuration = duration;

			if (prevAnim && prevAnim.playState !== 'finished') {
				// Interrupted enter: read current state and calculate progress
				const progress = prevAnim.currentTime
					? Math.max(0, Math.min(1, Number(prevAnim.currentTime) / duration))
					: 0.5;
				adjDuration = Math.max(50, duration * progress);

				startState = getCurrentSlideState(target, isY, withFade);
				prevAnim.cancel();
				delete (target as any).__ripple_anim;
			} else {
				// Normal exit starts at current natural size
				const { size, paddingStart, paddingEnd } = getNaturalSize(target, isY);
				startState = {
					[prop]: `${size}px`,
					[padStart]: paddingStart,
					[padEnd]: paddingEnd,
					overflow: 'hidden'
				};
				if (withFade) {
					startState.opacity = 1;
				}
			}

			const endState: Record<string, any> = {
				[prop]: '0px',
				[padStart]: '0px',
				[padEnd]: '0px',
				overflow: 'hidden'
			};
			if (withFade) {
				endState.opacity = 0;
			}

			const prevExit = (target as any).__ripple_exit_anim;
			if (prevExit && prevExit.playState !== 'finished') {
				prevExit.cancel();
			}

			applyStyles(target, startState);
			const exitAnim = target.animate([startState, endState], {
				delay,
				duration: adjDuration,
				easing,
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
		};

		// Register handlers
		(el as any).__ripple_enter = enterFn;
		(el as any).__ripple_exit = exitFn;

		// Run enter immediately
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
