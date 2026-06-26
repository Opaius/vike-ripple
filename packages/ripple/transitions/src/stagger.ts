export function stagger(
	ref: (el: HTMLElement) => undefined | (() => void),
	options: { amount?: number; index?: number } = {}
) {
	const { amount = 50, index = 0 } = options;
	const delay = index * amount;

	return (el: HTMLElement) => {
		if (!el) return;

		// Override el.animate temporarily to inject delay during initial mount animation
		const origAnimate = el.animate.bind(el);
		el.animate = ((...args: any[]) => {
			const opts: KeyframeAnimationOptions = (args[1] ||
				{}) as KeyframeAnimationOptions;
			opts.delay = (opts.delay || 0) + delay;
			return origAnimate(args[0], opts);
		}) as typeof el.animate;

		const cleanup = ref(el);

		// Restore original animate
		el.animate = origAnimate;

		// Wrap exit handler to inject delay during exit phase
		const origExit = (el as any).__ripple_exit;
		if (origExit) {
			(el as any).__ripple_exit = (target: HTMLElement) => {
				const tOrigAnimate = target.animate.bind(target);
				target.animate = ((...args: any[]) => {
					const opts: KeyframeAnimationOptions = (args[1] ||
						{}) as KeyframeAnimationOptions;
					opts.delay = (opts.delay || 0) + delay;
					return tOrigAnimate(args[0], opts);
				}) as typeof target.animate;

				const exitPromise = origExit(target);
				target.animate = tOrigAnimate;
				return exitPromise;
			};
		}

		// Wrap enter handler to inject delay during enter phase (interruption case)
		const origEnter = (el as any).__ripple_enter;
		if (origEnter) {
			(el as any).__ripple_enter = (target: HTMLElement) => {
				const tOrigAnimate = target.animate.bind(target);
				target.animate = ((...args: any[]) => {
					const opts: KeyframeAnimationOptions = (args[1] ||
						{}) as KeyframeAnimationOptions;
					opts.delay = (opts.delay || 0) + delay;
					return tOrigAnimate(args[0], opts);
				}) as typeof target.animate;

				const enterPromise = origEnter(target);
				target.animate = tOrigAnimate;
				return enterPromise;
			};
		}

		return () => {
			if (typeof cleanup === 'function') {
				cleanup();
			}
		};
	};
}
