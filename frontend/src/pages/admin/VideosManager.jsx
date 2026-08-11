import { useEffect, useState } from "react";

import { apiClient } from "../../api/client";
import { describeError } from "../../api/describeError";

export default function VideosManager() {
  const [videos, setVideos] = useState([]);
  const [videosError, setVideosError] = useState(false);
  const [form, setForm] = useState({ title: "", youtube_url: "", order: 0, is_active: true });
  const [thumbnailFile, setThumbnailFile] = useState(null);
  const [editingId, setEditingId] = useState(null);
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

  const resetForm = () => {
    setForm({ title: "", youtube_url: "", order: 0, is_active: true });
    setThumbnailFile(null);
    setEditingId(null);
    setFormError("");
  };

  const startEdit = (video) => {
    setForm({
      title: video.title,
      youtube_url: video.youtube_url,
      order: video.order,
      is_active: video.is_active,
    });
    setThumbnailFile(null);
    setEditingId(video.id);
    setFormError("");
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const body = new FormData();
    body.append("title", form.title);
    body.append("youtube_url", form.youtube_url);
    body.append("order", form.order || 0);
    body.append("is_active", form.is_active);
    if (thumbnailFile) body.append("thumbnail", thumbnailFile);

    try {
      if (editingId) {
        await apiClient.patch(`/videos/${editingId}/`, body);
      } else {
        await apiClient.post("/videos/", body);
      }
      resetForm();
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
    <div className="px-4 py-8">
      <h1 className="text-xl font-semibold mb-4">Videos</h1>
      <form onSubmit={handleSubmit} className="flex flex-wrap gap-2 mb-6 items-center">
        <input
          required
          placeholder="Title"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          className="border rounded px-3 py-2"
        />
        <input
          required
          placeholder="YouTube URL"
          value={form.youtube_url}
          onChange={(e) => setForm({ ...form, youtube_url: e.target.value })}
          className="border rounded px-3 py-2 flex-1"
        />
        <input
          type="number"
          placeholder="Order"
          value={form.order}
          onChange={(e) => setForm({ ...form, order: e.target.value })}
          className="border rounded px-3 py-2 w-24"
        />
        <label className="flex items-center gap-1">
          <input
            type="checkbox"
            checked={form.is_active}
            onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
          />
          Active
        </label>
        <input
          type="file"
          accept="image/*"
          onChange={(e) => setThumbnailFile(e.target.files[0] || null)}
          className="border rounded px-3 py-2"
        />
        <button type="submit" className="bg-brand-forest hover:bg-brand-forest/90 text-white rounded px-4 py-2">
          {editingId ? "Save Changes" : "Add"}
        </button>
        {editingId && (
          <button type="button" onClick={resetForm} className="border rounded px-4 py-2">
            Cancel
          </button>
        )}
      </form>
      {formError && <p className="text-red-600 mb-4">{formError}</p>}
      {videosError && (
        <p className="text-red-600">Couldn't load videos — please try again later.</p>
      )}
      <ul className="grid gap-2">
        {videos.map((video) => (
          <li
            key={video.id}
            className={`flex items-center gap-3 border-t pt-2 ${video.is_active ? "" : "opacity-50"}`}
          >
            <img src={video.thumbnail_url} alt={video.title} className="w-20 h-12 object-cover rounded" />
            <span className="flex-1">
              {video.title}
              {!video.is_active && <span className="ml-2 text-xs text-gray-500">(inactive)</span>}
            </span>
            <span className="text-xs text-gray-500">order: {video.order}</span>
            <button onClick={() => startEdit(video)} className="text-blue-600">Edit</button>
            <button onClick={() => handleDelete(video.id)} className="text-red-600">Delete</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
