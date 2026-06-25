import { track, tick, effect, Context, type Children } from 'ripple';
import { type MotionTiming } from './types.js';
import { MotionTimingContext } from './motion.js';

export function MotionProvider(props: {
    children: Children;
    type?: 'tween' | 'spring';
    duration?: number;
    stiffness?: number;
    damping?: number;
    mass?: number;
    easing?: string;
}) @{
    let parent: MotionTiming | null = null;
    try {
        parent = MotionTimingContext.get();
    } catch {}
    const merged: MotionTiming = {
        delay: 0,
        duration: props.duration ?? parent?.duration ?? 300,
        type: props.type ?? parent?.type ?? 'tween',
        stiffness: props.stiffness ?? parent?.stiffness ?? 300,
        damping: props.damping ?? parent?.damping ?? 30,
        mass: props.mass ?? parent?.mass ?? 1,
        easing: props.easing ?? parent?.easing,
    };
    try {
        MotionTimingContext.set(merged);
    } catch {}

    <div style="display:contents">{props.children}</div>
}

function getTargets(wrap: HTMLElement): HTMLElement[] {
    const targets: HTMLElement[] = [];
    const elements = wrap.querySelectorAll('*');
    for (let i = 0; i < elements.length; i++) {
        const el = elements[i] as HTMLElement;
        if ((el as any).__ripple_exit) {
            targets.push(el);
        }
    }
    if (targets.length === 0) {
        let child = wrap.firstElementChild;
        while (child) {
            targets.push(child as HTMLElement);
            child = child.nextElementSibling;
        }
    }
    if (targets.length === 0) {
        targets.push(wrap);
    }
    return targets;
}

export function Transition(props: {
    show: boolean;
    children: Children;
    onEnter?: (el: HTMLElement) => void;
    onLeave?: (el: HTMLElement) => Promise<any> | void;
    mode?: 'sync' | 'popLayout';
}) @{
    const mode = props.mode ?? 'sync';
    let &[renderChild] = track(props.show);
    let wrap: HTMLDivElement | undefined;
    let activeExitCleanup: (() => void) | null = null;

    effect(() => {
        if (props.show) {
            renderChild = true;
            if (activeExitCleanup) {
                activeExitCleanup();
                activeExitCleanup = null;
            }
            tick().then(() => {
                if (wrap) {
                    const targets = getTargets(wrap);
                    for (const target of targets) {
                        if (props.onEnter) {
                            props.onEnter(target);
                        } else if ((target as any).__ripple_enter) {
                            if ((target as any).__ripple_mounted) {
                                delete (target as any).__ripple_mounted;
                            } else {
                                (target as any).__ripple_enter(target);
                            }
                        }
                    }
                }
            });
        } else {
            if (wrap) {
                const targets = getTargets(wrap);
                const exitPromises = targets.map(target => {
                    const exitFn = props.onLeave || (target as any).__ripple_exit;
                    if (exitFn) {
                        return Promise.resolve(exitFn(target)).catch(() => {});
                    }
                    return Promise.resolve();
                });

                if (mode === 'popLayout' && wrap.parentElement) {
                    const parent = wrap.parentElement;
                    const parentBefore = parent.offsetHeight;
                    const parentRect = parent.getBoundingClientRect();
                    const oldPosition = parent.style.position;
                    const oldOverflow = parent.style.overflow;
                    const oldHeight = parent.style.height;

                    if (!oldPosition || oldPosition === 'static') {
                        parent.style.position = 'relative';
                    }
                    parent.style.overflow = 'hidden';

                    const restores: Array<() => void> = [];
                    for (const target of targets) {
                        const rect = target.getBoundingClientRect();
                        const left = rect.left - parentRect.left;
                        const top = rect.top - parentRect.top;

                        const origPosition = target.style.position;
                        const origLeft = target.style.left;
                        const origTop = target.style.top;
                        const origWidth = target.style.width;
                        const origHeight = target.style.height;
                        const origMargin = target.style.margin;
                        const origPointerEvents = target.style.pointerEvents;

                        target.style.position = 'absolute';
                        target.style.left = `${left}px`;
                        target.style.top = `${top}px`;
                        target.style.width = `${rect.width}px`;
                        target.style.height = `${rect.height}px`;
                        target.style.margin = '0';
                        target.style.pointerEvents = 'none';

                        restores.push(() => {
                            target.style.position = origPosition;
                            target.style.left = origLeft;
                            target.style.top = origTop;
                            target.style.width = origWidth;
                            target.style.height = origHeight;
                            target.style.margin = origMargin;
                            target.style.pointerEvents = origPointerEvents;
                        });
                    }

                    void parent.offsetHeight;
                    const parentAfter = parent.offsetHeight;
                    parent.style.height = `${parentBefore}px`;

                    const parentAnim = parent.animate([
                        { height: `${parentBefore}px` },
                        { height: `${parentAfter}px` }
                    ], { duration: 200, easing: 'ease-in-out', fill: 'both' });
                    const cleanup = () => {
                        parentAnim.cancel();
                        parent.style.position = oldPosition;
                        parent.style.overflow = oldOverflow;
                        parent.style.height = oldHeight;
                        for (const restore of restores) restore();
                    };
                    activeExitCleanup = cleanup;

                    Promise.all([
                        Promise.all(exitPromises),
                        parentAnim.finished.catch(() => {})
                    ]).then(() => {
                        if (activeExitCleanup === cleanup) {
                            cleanup();
                            activeExitCleanup = null;
                            if (!props.show) renderChild = false;
                        }
                    });
                } else {
                    const cleanup = () => {};
                    activeExitCleanup = cleanup;
                    Promise.all(exitPromises).then(() => {
                        if (activeExitCleanup === cleanup) {
                            activeExitCleanup = null;
                            if (!props.show) renderChild = false;
                        }
                    });
                }
            } else {
                renderChild = false;
            }
        }
    });

    @if (renderChild) {
        <div ref={wrap}>
            {props.children}
        </div>
    }
}

interface ExitingItem {
    id: number;
    children: Children;
    style: string;
}

export function Presence(props: {
    children: Children;
    mode?: 'sync' | 'wait';
}) @{
    const mode = props.mode ?? 'sync';
    let &[live] = track<Children | undefined>(undefined);
    let &[exitingItems] = track<ExitingItem[]>([]);
    let prevChildren: Children | undefined;
    let liveRef: HTMLDivElement | undefined;
    let nextExitId = 1;
    const exitingRefs = new Map<number, HTMLDivElement>();

    effect(() => {
        const newChildren = props.children;

        if (prevChildren !== undefined && newChildren !== prevChildren) {
            if (liveRef && liveRef.parentElement) {
                const parent = liveRef.parentElement;
                const parentRect = parent.getBoundingClientRect();
                const childEl = liveRef.firstElementChild as HTMLElement || liveRef;
                const childRect = childEl.getBoundingClientRect();
                const left = childRect.left - parentRect.left;
                const top = childRect.top - parentRect.top;

                const itemId = nextExitId++;
                const newItem: ExitingItem = {
                    id: itemId,
                    children: prevChildren,
                    style: `position:absolute;left:${left}px;top:${top}px;width:${childRect.width}px;height:${childRect.height}px;pointer-events:none`
                };

                exitingItems = [...exitingItems, newItem];

                tick().then(() => {
                    const wrapper = exitingRefs.get(itemId);
                    if (wrapper) {
                        const target = wrapper.firstElementChild as HTMLElement || wrapper;
                        target.getAnimations().forEach(a => a.cancel());
                        const exitFn = (target as any).__ripple_exit;
                        if (exitFn) {
                            Promise.resolve(exitFn(target)).catch(() => {}).then(() => {
                                exitingItems = exitingItems.filter(x => x.id !== itemId);
                                exitingRefs.delete(itemId);
                                if (mode === 'wait' && exitingItems.length === 0) {
                                    live = props.children;
                                }
                            });
                        } else {
                            exitingItems = exitingItems.filter(x => x.id !== itemId);
                            exitingRefs.delete(itemId);
                            if (mode === 'wait' && exitingItems.length === 0) {
                                live = props.children;
                            }
                        }
                    }
                });
            }

            if (mode === 'wait') {
                live = undefined;
            } else {
                live = newChildren;
            }
        } else if (prevChildren === undefined) {
            live = newChildren;
        }

        prevChildren = newChildren;
    });

    const hasExiting = exitingItems.length > 0;

    <div style={hasExiting && live ? 'position:relative' : ''}>
        <div ref={liveRef} style="display:contents">
            {live}
        </div>
        @for (const item of exitingItems; key item.id) {
            <div ref={(el) => { if (el) exitingRefs.set(item.id, el as HTMLDivElement); }} style={item.style}>
                {item.children}
            </div>
        }
    </div>
}
