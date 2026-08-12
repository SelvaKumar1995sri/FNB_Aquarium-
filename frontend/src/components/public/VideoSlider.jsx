import { useState } from "react";

export default function VideoSlider({ videos }) {
  const [activeIndex, setActiveIndex] = useState(0);

  if (videos.length === 0) return null;

  return (
    <div className="flex justify-center gap-2 h-72 sm:h-80 overflow-x-auto">
      {videos.map((video, index) => {
        const isActive = index === activeIndex;
        return (
          <div
            key={video.id}
            onClick={() => setActiveIndex(index)}
            className={`relative flex-shrink-0 rounded-lg overflow-hidden cursor-pointer transition-all duration-500 ease-in-out ${
              isActive ? "w-56 sm:w-72" : "w-10 sm:w-14"
            }`}
          >
            <img
              src={video.thumbnail_url}
              alt={video.title}
              className="absolute inset-0 w-full h-full object-cover"
            />
            <div className={`absolute inset-0 transition-colors duration-500 ${isActive ? "bg-black/30" : "bg-black/55"}`} />

            {isActive ? (
              <>
                <a
                  href={video.youtube_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(event) => event.stopPropagation()}
                  className="absolute inset-0 flex items-center justify-center"
                >
                  <span className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center text-brand-dark text-xl">
                    ▶
                  </span>
                </a>
                <span className="absolute bottom-3 left-3 right-3 text-white font-semibold text-sm truncate">
                  {video.title}
                </span>
              </>
            ) : (
              <span
                className="absolute inset-0 flex items-center justify-center text-white font-bold text-xs tracking-widest whitespace-nowrap"
                style={{ writingMode: "vertical-rl" }}
              >
                {video.title}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
