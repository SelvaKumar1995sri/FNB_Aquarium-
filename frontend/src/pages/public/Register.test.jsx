import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { apiClient } from "../../api/client";
import { AuthProvider } from "../../context/AuthContext";
import CustomerGuard from "../../components/public/CustomerGuard";
import AccountAddresses from "./AccountAddresses";
import Register from "./Register";

vi.mock("../../api/client", () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    interceptors: {
      request: { use: vi.fn(() => 1), eject: vi.fn() },
      response: { use: vi.fn(() => 1), eject: vi.fn() },
    },
  },
}));

function Home() {
  return <div>HOME PAGE MARKER</div>;
}

describe("Register", () => {
  it("redirects to home after registering and adding the first address", async () => {
    apiClient.post.mockImplementation((url) => {
      if (url === "/auth/register/") {
        return Promise.resolve({ data: { access: "acc-token", refresh: "ref-token" } });
      }
      if (url === "/addresses/") {
        return Promise.resolve({ data: {} });
      }
      throw new Error("unexpected post " + url);
    });
    apiClient.get.mockImplementation((url) => {
      if (url === "/accounts/me/") {
        return Promise.resolve({ data: { id: 1, is_staff: false, name: "Test" } });
      }
      if (url === "/addresses/") {
        return Promise.resolve({ data: { results: [] } });
      }
      throw new Error("unexpected get " + url);
    });

    render(
      <MemoryRouter initialEntries={["/register"]}>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/register" element={<Register />} />
            <Route path="/account" element={<CustomerGuard />}>
              <Route path="addresses" element={<AccountAddresses />} />
            </Route>
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );

    fireEvent.change(screen.getByPlaceholderText("Full name"), { target: { value: "Test User" } });
    fireEvent.change(screen.getByPlaceholderText("Email address"), { target: { value: "test@example.com" } });
    fireEvent.change(screen.getByPlaceholderText("Phone number"), { target: { value: "1234567890" } });
    fireEvent.change(screen.getByPlaceholderText("Password"), { target: { value: "pass1234" } });
    fireEvent.change(screen.getByPlaceholderText("Confirm password"), { target: { value: "pass1234" } });
    fireEvent.click(screen.getByText("Create account"));

    await waitFor(() => screen.getByText("Add a new address"));

    fireEvent.change(screen.getByPlaceholderText("Full name"), { target: { value: "Test User" } });
    fireEvent.change(screen.getByPlaceholderText("Phone"), { target: { value: "1234567890" } });
    fireEvent.change(screen.getByPlaceholderText("Address line 1"), { target: { value: "1 Main St" } });
    fireEvent.change(screen.getByPlaceholderText("City"), { target: { value: "City" } });
    fireEvent.change(screen.getByPlaceholderText("State"), { target: { value: "State" } });
    fireEvent.change(screen.getByPlaceholderText("Pincode"), { target: { value: "500001" } });
    fireEvent.click(screen.getByText("Add address"));

    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith("/addresses/", expect.anything()));

    await waitFor(() => expect(screen.getByText("HOME PAGE MARKER")).toBeTruthy());
  });
});
