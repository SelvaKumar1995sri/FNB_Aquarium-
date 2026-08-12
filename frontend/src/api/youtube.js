const YOUTUBE_ID_PATTERN = /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([A-Za-z0-9_-]{11})/;

export function extractYoutubeVideoId(url) {
  const match = YOUTUBE_ID_PATTERN.exec(url);
  return match ? match[1] : "";
}
