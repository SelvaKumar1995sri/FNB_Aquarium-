import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { apiClient } from "../../api/client";
import NotifyMeButton from "./NotifyMeButton";

vi.mock("../../api/client", () => ({
  apiClient: { post: vi.fn() },
}));

const mockNavigate = vi.fn();
vi.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
}));

let mockAuthState = { isAuthenticated: true };
vi.mock("../../context/AuthContext", () => ({
  useAuth: () => mockAuthState,
}));

const PRODUCT = { id: 1, stock_alert_subscribed: false };

describe("NotifyMeButton", () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthState = { isAuthenticated: true };
  });

  it("shows 'You'll be notified' and is disabled when already subscribed", () => {
    render(<NotifyMeButton product={{ ...PRODUCT, stock_alert_subscribed: true }} />);
    expect(screen.getByText("You'll be notified").disabled).toBe(true);
  });

  it("redirects to /login when clicked while logged out", () => {
    mockAuthState = { isAuthenticated: false };
    render(<NotifyMeButton product={PRODUCT} />);

    fireEvent.click(screen.getByText("Notify Me"));

    expect(mockNavigate).toHaveBeenCalledWith("/login");
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it("subscribes and flips to the notified state when clicked while logged in", async () => {
    apiClient.post.mockResolvedValueOnce({ status: 204 });
    render(<NotifyMeButton product={PRODUCT} />);

    fireEvent.click(screen.getByText("Notify Me"));

    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith("/notifications/stock-alerts/", { product: 1 }));
    await waitFor(() => expect(screen.getByText("You'll be notified")).toBeTruthy());
  });

  it("stays in the idle state if the subscribe call fails", async () => {
    apiClient.post.mockRejectedValueOnce(new Error("network"));
    render(<NotifyMeButton product={PRODUCT} />);

    fireEvent.click(screen.getByText("Notify Me"));

    await waitFor(() => expect(apiClient.post).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText("Notify Me")).toBeTruthy());
  });
});
