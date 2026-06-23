# ripple-transitions

Transition and animation library for the **Ripple** UI framework.

## Installation

You can install this package using your preferred package manager:

```bash
bun add ripple-transitions
# or
npm install ripple-transitions
# or
yarn add ripple-transitions
```

Make sure you have `ripple` and `@ripple-ts/vite-plugin` configured in your project.

## Features

- **Presence**: Identity-based transition coordinator. Exiting child elements stay in the DOM until their exit animations complete, and new child elements mount concurrently.
- **Transition**: Show/hide transitions supporting custom handlers and `popLayout` mode.
- **Motion & Gestures**: Standard transitions (`fade`, `rise`, `scale`, `fly`, `blur`, `draw`, `svelteTransition`, `gestures`, `animate`).
- **Layout Animations**: FLIP-based layout animations using `layout()` and `useTransitionList()`.
- **Slide Transitions**: Axis-based height/width accordion slide transitions.
- **Spring Physics**: Physics-based animations with adjustable stiffness, damping, and mass.
- **Stagger**: Injects delays sequentially for lists or grid layouts.

## Usage

### Presence & Transition

```tsx
import { Presence, Transition, fade, slide } from 'ripple-transitions';

export function MyComponent() @{
    let &[show] = track(true);

    <div>
        <button onClick={() => show = !show}>Toggle</button>
        
        <Presence>
            @if (show) {
                <div ref={fade({ duration: 300 })}>
                    Transitions on mount and unmount!
                </div>
            }
        </Presence>
    </div>
}
```

### Layout Transitions

```tsx
import { layout } from 'ripple-transitions';

export function List() @{
    <div ref={layout()}>
        {/* Children animate automatically when they resize or shift positions */}
    </div>
}
```

## License

MIT
