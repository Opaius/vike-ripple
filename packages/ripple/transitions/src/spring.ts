import { type TransitionOptions } from './types.js';

export function springValues(
    from: number,
    to: number,
    options: { stiffness?: number; damping?: number; mass?: number; frames?: number } = {}
): number[] {
    const { stiffness = 300, damping = 30, mass = 1, frames = 60 } = options;
    const omega0 = Math.sqrt(stiffness / mass);
    const zeta = damping / (2 * Math.sqrt(mass * stiffness));
    const omega1 = omega0 * Math.sqrt(Math.max(0, 1 - zeta * zeta));
    const duration = Math.min(2, zeta > 0 ? 3 / (zeta * omega0) : 2);
    const values: number[] = [];
    for (let i = 0; i <= frames; i++) {
        const t = (i / frames) * duration;
        const decay = Math.exp(-zeta * omega0 * t);
        let norm: number;
        if (zeta < 1) {
            norm = 1 - decay * Math.cos(omega1 * t) - (zeta / Math.sqrt(1 - zeta * zeta)) * decay * Math.sin(omega1 * t);
        } else {
            norm = 1 - decay * (1 + omega0 * t);
        }
        values.push(from + (to - from) * norm);
    }
    return values;
}

interface TransformComponents {
    translateX: number;
    translateY: number;
    scaleX: number;
    scaleY: number;
    rotate: number;
}

function parseTransform(val: string): TransformComponents {
    const comps: TransformComponents = {
        translateX: 0,
        translateY: 0,
        scaleX: 1,
        scaleY: 1,
        rotate: 0
    };

    if (!val || val === 'none' || val === 'undefined') {
        return comps;
    }

    if (val.startsWith('matrix')) {
        const nums = val.match(/-?\d*\.?\d+/g)?.map(Number) || [];
        if (nums.length === 6) {
            const [a, b, c, d, tx, ty] = nums;
            comps.translateX = tx;
            comps.translateY = ty;
            comps.scaleX = Math.sqrt(a * a + b * b);
            comps.scaleY = Math.sqrt(c * c + d * d);
            comps.rotate = Math.atan2(b, a) * (180 / Math.PI);
        } else if (nums.length === 16) {
            comps.scaleX = Math.sqrt(nums[0]*nums[0] + nums[1]*nums[1] + nums[2]*nums[2]);
            comps.scaleY = Math.sqrt(nums[4]*nums[4] + nums[5]*nums[5] + nums[6]*nums[6]);
            comps.translateX = nums[12];
            comps.translateY = nums[13];
            comps.rotate = Math.atan2(nums[1], nums[0]) * (180 / Math.PI);
        }
        return comps;
    }

    const translateMatch = val.match(/translate\(\s*(-?\d+\.?\d*)(px)?\s*,\s*(-?\d+\.?\d*)(px)?\s*\)/);
    if (translateMatch) {
        comps.translateX = parseFloat(translateMatch[1]);
        comps.translateY = parseFloat(translateMatch[3]);
    }
    const translateXMatch = val.match(/translateX\(\s*(-?\d+\.?\d*)(px)?\s*\)/);
    if (translateXMatch) comps.translateX = parseFloat(translateXMatch[1]);
    
    const translateYMatch = val.match(/translateY\(\s*(-?\d+\.?\d*)(px)?\s*\)/);
    if (translateYMatch) comps.translateY = parseFloat(translateYMatch[1]);

    const scaleMatch = val.match(/scale\(\s*(-?\d+\.?\d*)\s*\)/);
    if (scaleMatch) {
        const s = parseFloat(scaleMatch[1]);
        comps.scaleX = s;
        comps.scaleY = s;
    }
    const scaleXYMatch = val.match(/scale\(\s*(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)\s*\)/);
    if (scaleXYMatch) {
        comps.scaleX = parseFloat(scaleXYMatch[1]);
        comps.scaleY = parseFloat(scaleXYMatch[2]);
    }

    const rotateMatch = val.match(/rotate\(\s*(-?\d+\.?\d*)(deg|rad)?\s*\)/);
    if (rotateMatch) {
        let r = parseFloat(rotateMatch[1]);
        if (rotateMatch[2] === 'rad') {
            r = r * (180 / Math.PI);
        }
        comps.rotate = r;
    }

    return comps;
}
export function getSpringKeyframes(initial: any, animate: any, options: Required<TransitionOptions>): Keyframe[] {
    const keys = Object.keys(animate);
    const frames = 60;
    const interpolations: Record<string, Array<{ values: number[] } | string>> = {};

    for (const k of keys) {
        let fromVal = String(initial?.[k] ?? animate[k]);
        let toVal = String(animate[k]);

        if (k === 'transform') {
            const fromComps = parseTransform(fromVal);
            const toComps = parseTransform(toVal);
            fromVal = `translate(${fromComps.translateX}px, ${fromComps.translateY}px) scale(${fromComps.scaleX}, ${fromComps.scaleY}) rotate(${fromComps.rotate}deg)`;
            toVal = `translate(${toComps.translateX}px, ${toComps.translateY}px) scale(${toComps.scaleX}, ${toComps.scaleY}) rotate(${toComps.rotate}deg)`;
        }

        const numRegex = /-?\d*\.?\d+/g;
        const fromNums = fromVal.match(numRegex)?.map(Number) || [];
        const toNums = toVal.match(numRegex)?.map(Number) || [];

        if (fromNums.length > 0 && fromNums.length === toNums.length) {
            const parts = toVal.split(numRegex);
            const springData: Array<{ values: number[] } | string> = [];

            for (let idx = 0; idx < fromNums.length; idx++) {
                springData.push(parts[idx]);
                let vals = springValues(fromNums[idx], toNums[idx], {
                    stiffness: options.stiffness,
                    damping: options.damping,
                    mass: options.mass,
                    frames
                });
                if (k === 'opacity') {
                    vals = vals.map(v => Math.max(0, Math.min(1, v)));
                }
                springData.push({ values: vals });
            }
            springData.push(parts[parts.length - 1]);
            interpolations[k] = springData;
        } else {
            interpolations[k] = [toVal];
        }
    }

    const result: Keyframe[] = [];
    for (let i = 0; i <= frames; i++) {
        const kf: Record<string, any> = {};
        for (const k of keys) {
            const data = interpolations[k];
            let str = '';
            for (const item of data) {
                if (typeof item === 'string') {
                    str += item;
                } else {
                    str += item.values[i];
                }
            }
            kf[k] = str;
        }
        result.push(kf);
    }
    return result;
}

