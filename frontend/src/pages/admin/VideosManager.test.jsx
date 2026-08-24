import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { apiClient } from "../../api/client";
import VideosManager from "./VideosManager";

vi.mock("../../api/client", () => ({
  apiClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

const VIDEO = {
  id: 1,
  title: "Tank tour",
  youtube_url: "https://youtu.be/dQw4w9WgXcQ",
  order: 0,
  is_active: true,
  thumbnail_url: "https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
};

function mockInitialLoad(videos = [VIDEO]) {
  apiClient.get.mockImplementation((url) => {
    if (url === "/videos/") return Promise.resolve({ data: { results: videos } });
    return Promise.reject(new Error(`unexpected GET ${url}`));
  });
}

describe("VideosManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInitialLoad();
  });

  afterEach(() => cleanup());

  it("shows the list without a form until 'New Video' is clicked", async () => {
    render(<VideosManager />);
    expect(await screen.findByText("Tank tour")).toBeTruthy();
    expect(screen.queryByPlaceholderText("Title")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /new video/i }));

    expect(screen.getByPlaceholderText("Title")).toBeTruthy();
  });

  it("creates a video and shows a success popup", async () => {
    apiClient.post.mockResolvedValueOnce({ data: {} });
    render(<VideosManager />);
    await screen.findByText("Tank tour");

    fireEvent.click(screen.getByRole("button", { name: /new video/i }));
    fireEvent.change(screen.getByPlaceholderText("Title"), { target: { value: "New video" } });
    fireEvent.change(screen.getByPlaceholderText("YouTube URL"), {
      target: { value: "https://youtu.be/aaaaaaaaaaa" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^add$/i }));

    await waitFor(() => expect(apiClient.post).toHaveBeenCalled());
    expect(await screen.findByText(/video created/i)).toBeTruthy();
    expect(screen.queryByPlaceholderText("Title")).toBeNull();
  });

  it("shows a success popup after deleting", async () => {
    apiClient.delete.mockResolvedValueOnce({ data: {} });
    render(<VideosManager />);
    await screen.findByText("Tank tour");

    fireEvent.click(screen.getByRole("button", { name: /delete/i }));

    await waitFor(() => expect(apiClient.delete).toHaveBeenCalled());
    expect(await screen.findByText(/video deleted/i)).toBeTruthy();
  });

  it("shows a page-level error when deleting fails", async () => {
    apiClient.delete.mockRejectedValueOnce({ response: { data: { detail: "Cannot delete." } } });
    render(<VideosManager />);
    await screen.findByText("Tank tour");

    fireEvent.click(screen.getByRole("button", { name: /delete/i }));

    await waitFor(() => expect(apiClient.delete).toHaveBeenCalled());
    expect(await screen.findByText("Cannot delete.")).toBeTruthy();
    expect(screen.queryByText(/video deleted/i)).toBeNull();
  });
});
