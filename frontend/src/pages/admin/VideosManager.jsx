import { useEffect, useState } from "react";

import { apiClient } from "../../api/client";
import { describeError } from "../../api/describeError";

export default function VideosManager() {
  const [videos, setVideos] = useState([]);
  const [videosError, setVideosError] = useState(false);
  const [form, setForm] = useState({ title: "", youtube_url: "" });
  const [formError, setFormError] = useState("");

  const load = () =>
    apiClient
      .get("/videos/")
      .then((response) => {
        setVideos(response.data.results);
        setVideosError(false);
      })
      .catch(() => setVideosError(true));

  useEffect(() => {
    load();
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    try {
      await apiClient.post("/videos/", form);
      setForm({ title: "", youtube_url: "" });
      setFormError("");
      load();
    } catch (error) {
      setFormError(describeError(error, "Couldn't save the video — please check the fields and try again."));
    }
  };

  const handleDelete = async (id) => {
    try {
      await apiClient.delete(`/videos/${id}/`);
      setFormError("");
      load();
    } catch (error) {
      setFormError(describeError(error, "Couldn't delete the video — please try again."));
    }
  };

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">Videos</h1>
      <form onSubmit={handleSubmit} className="flex flex-wrap gap-2 mb-6">
        <input required placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="border rounded px-3 py-2" />
        <input required placeholder="YouTube URL" value={form.youtube_url} onChange={(e) => setForm({ ...form, youtube_url: e.target.value })} className="border rounded px-3 py-2 flex-1" />
        <button type="submit" className="bg-brand-forest hover:bg-brand-forest/90 text-white rounded px-4 py-2">Add</button>
      </form>
      {formError && <p className="text-red-600 mb-4">{formError}</p>}
      {videosError && (
        <p className="text-red-600">Couldn't load videos — please try again later.</p>
      )}
      <ul className="grid gap-2">
        {videos.map((video) => (
          <li key={video.id} className="flex items-center gap-3 border-t pt-2">
            <img src={video.thumbnail_url} alt={video.title} className="w-20 h-12 object-cover rounded" />
            <span className="flex-1">{video.title}</span>
            <button onClick={() => handleDelete(video.id)} className="text-red-600">Delete</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
