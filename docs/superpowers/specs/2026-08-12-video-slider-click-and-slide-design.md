# Home Page Video Slider — Click-to-Center, Smooth Slide, Fix Broken Clicks

Date: 2026-08-12
Status: Approved for planning

## 1. Overview

The home page "Watch Us in Action" video slider (`frontend/src/components/public/VideoSlider.jsx`) lets a user drag/swipe to change which video is centered. Two things need to change:

1. **Bug fix**: clicking a side thumbnail (to bring it to center) and clicking the center thumbnail (to open its YouTube URL) currently do nothing — only drag/swipe works.
2. **Enhancement**: when the center video changes (by click or drag), the thumbnails should visibly slide into place instead of snapping instantly.

## 2. Root cause of the click bug

`handlePointerDown` calls `event.currentTarget.setPointerCapture(event.pointerId)` unconditionally on every press, including plain taps. Per the Pointer Events spec, once an element captures the pointer, all subsequent pointer events *and their mouse-compatibility events* (`mouseup`, `click`) are retargeted to the capturing element — regardless of what's actually under the cursor. This breaks:

- the side-thumbnail `onClick` (never reaches the tapped tile, so `goTo(sourceIndex)` never runs)
- the center tile's `<a href={video.youtube_url}>` (the click that should navigate gets redirected to the container, so it never opens)

Drag/swipe is unaffected because `handlePointerMove`/`handlePointerUp` already live on the same container that captures the pointer.

**Fix**: only call `setPointerCapture` once real dragging is detected — i.e. move the call into `handlePointerMove`, gated on the existing `MOVE_THRESHOLD` check, firing once per gesture (when `moved` flips from `false` to `true`). Plain taps then never trigger capture, so click/navigation on descendant elements works normally; genuine drags still get captured for reliable tracking.

## 3. Smooth slide

Currently, changing `activeIndex` reorders the rendered array (`displayOrder`), so React reconciles by `key={video.id}` but each tile's *position* changes with no transition — only `width`/background-color are CSS-transitioned, so tiles resize in place without visibly moving. Both drag directions are equally un-animated for position; the "one direction looks smoother" impression comes from this same missing position-transform, not a separate bug — fixing this resolves it for both directions uniformly.

**Fix**: add `framer-motion` as a new dependency. Wrap each tile in `motion.div` with the `layout` prop and an explicit `transition={{ duration: 0.5, ease: "easeInOut" }}`. Framer Motion measures each tile's position/size before and after a reorder (keyed by `video.id`) and animates the delta via transform — giving a real slide instead of a snap, with no manual position math needed and no change to the existing Tailwind responsive width classes.

Remove the now-redundant `transition-all` Tailwind class for width (Framer Motion drives size/position together); keep the existing background-color transition classes as-is since they're unrelated to layout.

## 4. Click behavior

- **Side (inactive) tile**: wrap its content in a `<button type="button">` covering the full tile (`absolute inset-0`), `onClick` calls `goTo(sourceIndex)` — same logic as today, just moved onto a real interactive element instead of a plain `<div onClick>`.
- **Center (active) tile**: already rendered as an `<a href={video.youtube_url} target="_blank" rel="noopener noreferrer">` covering the full tile — this part was already correct in the markup, it just never received the click due to the pointer-capture bug (§2). No structural change needed here beyond the capture fix, other than removing the now-unnecessary `event.stopPropagation()` (no longer needed since the outer container no longer has a competing `onClick`).
- Both elements keep the existing `dragState.current.moved` guard so a drag-release is never misread as a click (for the button, skip the `goTo`; for the anchor, `preventDefault()` and reset the flag).

## 5. Data flow

No changes to state shape (`activeIndex`, `goTo`/`next`/`prev`) or to the `videos` prop/API. Purely a rendering/animation and event-handling fix inside `VideoSlider.jsx`.

## 6. Out of scope

- No backend/API changes.
- No change to the drag/swipe distance thresholds (`DRAG_THRESHOLD`, `MOVE_THRESHOLD`).
- No new UI beyond what exists today (no arrows/dots added).

## 7. Testing

Manual verification in the dev server (no automated test framework for visual animation exists in this project):

- Drag left and drag right both cycle the center video with a visible slide (not a snap), in both directions.
- Clicking any side thumbnail slides it smoothly to center.
- Clicking the center thumbnail opens its `youtube_url` in a new tab.
- A drag gesture that ends without a real tap doesn't accidentally trigger a click/navigation.
- Mobile (`w-10`/`w-56`) and desktop (`sm:w-14`/`sm:w-72`) widths still render correctly through the animation.
