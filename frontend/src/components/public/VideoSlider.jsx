export default function VideoSlider({ videos }) {
  if (videos.length === 0) return null;

  return (
    <div className="flex gap-4 overflow-x-auto snap-x snap-mandatory pb-2">
      {videos.map((video) => (
        <a
          key={video.id}
          href={`https://www.youtube.com/watch?v=${video.video_id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="relative flex-shrink-0 w-64 h-36 snap-start rounded-lg overflow-hidden"
        >
          <img src={video.thumbnail_url} alt={video.title} className="w-full h-full object-cover" />
          <span className="absolute inset-0 flex items-center justify-center bg-black/30">
            <span className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center text-brand-dark text-xl">
              ▶
            </span>
          </span>
          <span className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-sm px-2 py-1 truncate">
            {video.title}
          </span>
        </a>
      ))}
    </div>
  );
}
