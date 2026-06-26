export interface TransitionOptions {
	delay?: number;
	duration?: number;
	easing?: string;
	type?: 'tween' | 'spring';
	/** Spring physics (only when type='spring') */
	stiffness?: number;
	damping?: number;
	mass?: number;
}

export interface MotionTiming {
	delay: number;
	duration: number;
	type: 'tween' | 'spring';
	stiffness: number;
	damping: number;
	mass: number;
	easing?: string;
}

export interface MotionConfig {
	initial?: Keyframe | Record<string, any>;
	animate?: Keyframe | Record<string, any>;
	exit?: Keyframe | Record<string, any>;
	transition?: TransitionOptions;
}

export interface LayoutOptions extends TransitionOptions {}

export interface GestureConfig {
	hover?: Record<string, any>;
	tap?: Record<string, any>;
	focus?: Record<string, any>;
	transition?: TransitionOptions;
}

export interface SvelteTransitionConfig {
	delay?: number;
	duration?: number;
	easing?: (t: number) => number;
	css?: (t: number, u: number) => string;
	tick?: (t: number, u: number) => void;
}

export type SvelteTransitionFn = (
	node: HTMLElement,
	params?: any
) => SvelteTransitionConfig;
