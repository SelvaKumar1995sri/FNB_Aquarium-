# Video Slider Click-Fix and Smooth Slide Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the home page video slider so clicking a side thumbnail brings it to center and clicking the center thumbnail opens its YouTube URL, and make the center-change (by click or drag) animate as a real slide instead of an instant snap.

**Architecture:** All changes are confined to `frontend/src/components/public/VideoSlider.jsx`. The click bug is a pointer-capture timing issue (fixed by deferring `setPointerCapture` until a real drag is detected) plus swapping non-interactive wrapper elements for a real `<button>`/`<a>` per tile. The slide animation is added via Framer Motion's `layout` prop, which measures each tile's position/size before and after a reorder and animates the delta.

**Tech Stack:** React 19, Tailwind CSS v4, Vite, Vitest. New: `framer-motion` (runtime dependency), `jsdom` + `@testing-library/react` (test-only, to enable component-level tests — this project currently only unit-tests plain functions).

## Global Constraints

- No backend/API changes (per spec §6).
- No new UI controls beyond what exists today — no arrows/dots (per spec §6).
- Keep `DRAG_THRESHOLD` (50) and `MOVE_THRESHOLD` (10) values unchanged (per spec §6).
- Existing Tailwind responsive width classes (`w-10 sm:w-14` / `w-56 sm:w-72`) must keep working at both breakpoints (per spec §7).

---

### Task 1: Fix the pointer-capture bug (click-to-center and open-video)

**Files:**
- Modify: `frontend/vite.config.js` (add jsdom test environment)
- Modify: `frontend/package.json` (add `jsdom`, `@testing-library/react` devDependencies)
- Modify: `frontend/src/components/public/VideoSlider.jsx`
- Create: `frontend/src/components/public/VideoSlider.test.jsx`

**Interfaces:**
- Produces: `VideoSlider({ videos })` unchanged prop signature. Internal: side tiles render as `<button type="button">`, the center tile renders as `<a href={video.youtube_url} target="_blank">`. Both are covered later by Task 2's `motion.div` wrapper (that task consumes this task's DOM structure as-is).

- [ ] **Step 1: Install the test-only dependencies**

Run:
```bash
cd frontend
npm install --save-dev jsdom@^30.0.1 @testing-library/react@^16.3.2
```

- [ ] **Step 2: Point Vitest at jsdom**

Modify `frontend/vite.config.js` to:

```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
  },
})
```

- [ ] **Step 3: Write the failing tests**

Create `frontend/src/components/public/VideoSlider.test.jsx`:

```jsx
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import VideoSlider from "./VideoSlider";

const videos = [
  { id: 1, title: "Video 1", thumbnail_url: "/1.jpg", youtube_url: "https://youtube.com/watch?v=1" },
  { id: 2, title: "Video 2", thumbnail_url: "/2.jpg", youtube_url: "https://youtube.com/watch?v=2" },
  { id: 3, title: "Video 3", thumbnail_url: "/3.jpg", youtube_url: "https://youtube.com/watch?v=3" },
];

beforeEach(() => {
  Element.prototype.setPointerCapture = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
  delete Element.prototype.setPointerCapture;
});

function renderSlider() {
  const { container } = render(<VideoSlider videos={videos} />);
  return container.firstChild;
}

describe("VideoSlider", () => {
  it("renders one link for the active tile and one button per inactive tile", () => {
    renderSlider();
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.getAllByRole("button")).toHaveLength(videos.length - 1);
  });

  it("does not capture the pointer on a plain click with no movement", () => {
    const root = renderSlider();
    fireEvent.pointerDown(root, { clientX: 100, pointerId: 1 });
    fireEvent.pointerUp(root, { clientX: 100, pointerId: 1 });
    expect(Element.prototype.setPointerCapture).not.toHaveBeenCalled();
  });

  it("captures the pointer once, only after real dragging crosses the move threshold", () => {
    const root = renderSlider();
    fireEvent.pointerDown(root, { clientX: 100, pointerId: 1 });
    fireEvent.pointerMove(root, { clientX: 80, pointerId: 1 });
    expect(Element.prototype.setPointerCapture).toHaveBeenCalledTimes(1);
    fireEvent.pointerMove(root, { clientX: 60, pointerId: 1 });
    expect(Element.prototype.setPointerCapture).toHaveBeenCalledTimes(1);
  });

  it("clicking an inactive thumbnail brings it to center with the correct video", () => {
    renderSlider();
    const buttons = screen.getAllByRole("button");
    fireEvent.click(buttons[1]);
    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toBe(videos[1].youtube_url);
    expect(link.textContent).toContain("Video 2");
  });

  it("does not block navigation when the active tile receives a genuine tap", () => {
    renderSlider();
    const link = screen.getByRole("link");
    const notPrevented = fireEvent.click(link);
    expect(notPrevented).toBe(true);
  });

  it("blocks navigation when a click follows an in-place drag on the active tile", () => {
    const root = renderSlider();
    fireEvent.pointerDown(root, { clientX: 100, pointerId: 1 });
    fireEvent.pointerMove(root, { clientX: 80, pointerId: 1 });
    fireEvent.pointerUp(root, { clientX: 80, pointerId: 1 });
    const link = screen.getByRole("link");
    const notPrevented = fireEvent.click(link);
    expect(notPrevented).toBe(false);
  });

  it("ignores a phantom click on an inactive tile that follows a completed drag", () => {
    const root = renderSlider();
    fireEvent.pointerDown(root, { clientX: 100, pointerId: 1 });
    fireEvent.pointerMove(root, { clientX: 40, pointerId: 1 });
    fireEvent.pointerUp(root, { clientX: 40, pointerId: 1 });
    const activeHrefAfterDrag = screen.getByRole("link").getAttribute("href");
    expect(activeHrefAfterDrag).toBe(videos[1].youtube_url);

    const buttonsAfterDrag = screen.getAllByRole("button");
    fireEvent.click(buttonsAfterDrag[0]);
    expect(screen.getByRole("link").getAttribute("href")).toBe(activeHrefAfterDrag);
  });
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/components/public/VideoSlider.test.jsx`
Expected: multiple FAILs — no elements found with role "button" (current inactive tiles are plain `<div>`/`<span>`, not buttons), and `setPointerCapture` called on a plain click with no movement.

- [ ] **Step 5: Implement the fix**

Replace `frontend/src/components/public/VideoSlider.jsx` with:

```jsx
import { useRef, useState } from "react";

const DRAG_THRESHOLD = 50;
const MOVE_THRESHOLD = 10;

export default function VideoSlider({ videos }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const dragState = useRef({ startX: 0, dragging: false, moved: false });

  if (videos.length === 0) return null;

  const count = videos.length;
  const middle = Math.floor(count / 2);
  const displayOrder = Array.from({ length: count }, (_, position) => {
    const sourceIndex = (activeIndex - middle + position + count * 10) % count;
    return { video: videos[sourceIndex], sourceIndex, position };
  });

  const goTo = (index) => setActiveIndex(((index % count) + count) % count);
  const next = () => goTo(activeIndex + 1);
  const prev = () => goTo(activeIndex - 1);

  const handlePointerDown = (event) => {
    dragState.current = { startX: event.clientX, dragging: true, moved: false };
  };

  const handlePointerMove = (event) => {
    if (!dragState.current.dragging) return;
    const delta = event.clientX - dragState.current.startX;
    if (!dragState.current.moved && Math.abs(delta) > MOVE_THRESHOLD) {
      dragState.current.moved = true;
      event.currentTarget.setPointerCapture(event.pointerId);
    }
  };

  const handlePointerUp = (event) => {
    if (!dragState.current.dragging) return;
    const delta = event.clientX - dragState.current.startX;
    dragState.current.dragging = false;
    if (delta <= -DRAG_THRESHOLD) next();
    else if (delta >= DRAG_THRESHOLD) prev();
  };

  return (
    <div
      className="flex justify-center gap-2 h-72 sm:h-80 overflow-hidden select-none cursor-grab active:cursor-grabbing"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {displayOrder.map(({ video, sourceIndex, position }) => {
        const isActive = position === middle;

        const handleInactiveClick = () => {
          if (dragState.current.moved) {
            dragState.current.moved = false;
            return;
          }
          goTo(sourceIndex);
        };

        const handleActiveClick = (event) => {
          if (dragState.current.moved) {
            event.preventDefault();
            dragState.current.moved = false;
          }
        };

        return (
          <div
            key={video.id}
            className={`relative flex-shrink-0 rounded-lg overflow-hidden transition-all duration-500 ease-in-out ${
              isActive ? "w-56 sm:w-72" : "w-10 sm:w-14"
            }`}
          >
            <img
              src={video.thumbnail_url}
              alt={video.title}
              draggable={false}
              className="absolute inset-0 w-full h-full object-cover"
            />
            <div className={`absolute inset-0 transition-colors duration-500 ${isActive ? "bg-black/30" : "bg-black/55"}`} />

            {isActive ? (
              <a
                href={video.youtube_url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={handleActiveClick}
                className="absolute inset-0 flex items-center justify-center cursor-pointer"
              >
                <span className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center text-brand-dark text-xl">
                  ▶
                </span>
                <span className="absolute bottom-3 left-3 right-3 text-white font-semibold text-sm truncate">
                  {video.title}
                </span>
              </a>
            ) : (
              <button
                type="button"
                onClick={handleInactiveClick}
                className="absolute inset-0 flex items-center justify-center text-white font-bold text-xs tracking-widest whitespace-nowrap bg-transparent border-0 cursor-pointer"
                style={{ writingMode: "vertical-rl" }}
              >
                {video.title}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/public/VideoSlider.test.jsx`
Expected: all 7 tests PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/vite.config.js frontend/package.json frontend/package-lock.json frontend/src/components/public/VideoSlider.jsx frontend/src/components/public/VideoSlider.test.jsx
git commit -m "fix: defer pointer capture so clicking a video tile works again"
```

---

### Task 2: Add the smooth slide animation

**Files:**
- Modify: `frontend/package.json` (add `framer-motion` dependency)
- Modify: `frontend/src/components/public/VideoSlider.jsx`

**Interfaces:**
- Consumes: the tile markup from Task 1 (the `<button>`/`<a>` per tile, unchanged here).
- Produces: same `VideoSlider({ videos })` signature; no new exports.

- [ ] **Step 1: Install framer-motion**

Run:
```bash
cd frontend
npm install framer-motion@^13.1.0
```

- [ ] **Step 2: Write a failing regression test for the wrapper swap**

Add to `frontend/src/components/public/VideoSlider.test.jsx`, inside the existing `describe("VideoSlider", ...)` block:

```jsx
  it("still renders one tile per video after the layout-animation wrapper is added", () => {
    renderSlider();
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.getAllByRole("button")).toHaveLength(videos.length - 1);
  });
```

(This duplicates the structural assertion from Task 1's first test — its purpose here is to fail loudly if the upcoming `motion.div` swap breaks rendering, e.g. from a bad import.)

- [ ] **Step 3: Run tests to verify current state passes (baseline)**

Run: `cd frontend && npx vitest run src/components/public/VideoSlider.test.jsx`
Expected: all tests PASS (this confirms the baseline before the animation change, since the new test asserts the same thing Task 1 already implemented).

- [ ] **Step 4: Wrap each tile in `motion.div` with `layout`**

In `frontend/src/components/public/VideoSlider.jsx`:

Add the import at the top:
```jsx
import { motion } from "framer-motion";
import { useRef, useState } from "react";
```

Replace the tile wrapper (the `<div key={video.id} className={...}>` opening/closing tags only — inner content stays the same) with:

```jsx
          <motion.div
            key={video.id}
            layout
            transition={{ duration: 0.5, ease: "easeInOut" }}
            className={`relative flex-shrink-0 rounded-lg overflow-hidden ${
              isActive ? "w-56 sm:w-72" : "w-10 sm:w-14"
            }`}
          >
```
```jsx
          </motion.div>
```

(Note the `transition-all duration-500 ease-in-out` classes are dropped from `className` — Framer Motion's `layout` animation now drives both size and position together; the background-color transition classes on the inner overlay `<div>` are untouched.)

- [ ] **Step 5: Run the tests to verify they still pass**

Run: `cd frontend && npx vitest run src/components/public/VideoSlider.test.jsx`
Expected: all 8 tests PASS.

- [ ] **Step 6: Manually verify the animation and full acceptance criteria in the browser**

Run: `cd frontend && npm run dev`, open the home page, and check:
- Dragging left and dragging right both visibly slide the tiles (not an instant snap), in both directions.
- Clicking any side thumbnail slides it smoothly to center.
- Clicking the center thumbnail opens its `youtube_url` in a new browser tab.
- A drag that ends without a real tap doesn't trigger a click/navigation.
- Resize the window across the `sm` breakpoint (640px) — mobile (`w-10`/`w-56`) and desktop (`sm:w-14`/`sm:w-72`) widths still render and animate correctly.

- [ ] **Step 7: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/src/components/public/VideoSlider.jsx frontend/src/components/public/VideoSlider.test.jsx
git commit -m "feat: animate video slider reorder as a smooth slide"
```
