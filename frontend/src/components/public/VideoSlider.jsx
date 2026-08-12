import { motion } from "framer-motion";
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
          <motion.div
            key={video.id}
            layout
            transition={{ duration: 0.5, ease: "easeInOut" }}
            className={`relative flex-shrink-0 rounded-lg overflow-hidden ${
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
          </motion.div>
        );
      })}
    </div>
  );
}
