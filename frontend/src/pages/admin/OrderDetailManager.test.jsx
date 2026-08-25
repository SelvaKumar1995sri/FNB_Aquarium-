import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { apiClient } from "../../api/client";
import OrderDetailManager from "./OrderDetailManager";

vi.mock("../../api/client", () => ({
  apiClient: { get: vi.fn(), patch: vi.fn() },
}));

const PLACED_ORDER = {
  id: 42,
  status: "placed",
  total_amount: "200.00",
  created_at: "2026-08-01T10:00:00Z",
  customer_name: "Asha",
  customer_email: "asha@example.com",
  address: {
    full_name: "Priya", phone: "1234567890", line1: "1 Rd", line2: "",
    city: "City", state: "State", pincode: "500001",
  },
  porter_name: "", porter_phone: "", courier_name: "", courier_tracking_number: "",
  items: [{ id: 1, product: 1, product_name: "Tank", unit_price: "100.00", quantity: 2 }],
};

function renderDetail(orderId = "42") {
  return render(
    <MemoryRouter initialEntries={[`/admin/orders/${orderId}`]}>
      <Routes>
        <Route path="/admin/orders/:id" element={<OrderDetailManager />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("OrderDetailManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => cleanup());

  it("loads and displays the order", async () => {
    apiClient.get.mockResolvedValueOnce({ data: PLACED_ORDER });

    renderDetail();

    expect(await screen.findByText("Order #42")).toBeTruthy();
    expect(screen.getByText(/Asha/)).toBeTruthy();
  });

  it("shows only the valid next statuses for a placed order", async () => {
    apiClient.get.mockResolvedValueOnce({ data: PLACED_ORDER });

    renderDetail();
    await screen.findByText("Order #42");

    const options = screen.getAllByRole("option").map((option) => option.textContent);
    expect(options).toContain("Packed");
    expect(options).toContain("Cancelled");
    expect(options).not.toContain("Delivered");
    expect(options).not.toContain("Transported");
  });

  it("submits a simple transition without a tracking form", async () => {
    const updatedOrder = { ...PLACED_ORDER, status: "packed" };
    apiClient.get.mockResolvedValueOnce({ data: PLACED_ORDER });
    apiClient.patch.mockResolvedValueOnce({ data: updatedOrder });
    apiClient.get.mockResolvedValueOnce({ data: updatedOrder }); // reload after a successful PATCH

    renderDetail();
    await screen.findByText("Order #42");

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "packed" } });
    fireEvent.click(screen.getByRole("button", { name: /update status/i }));

    await waitFor(() =>
      expect(apiClient.patch).toHaveBeenCalledWith("/admin/orders/42/", { status: "packed" })
    );
  });

  it("shows the tracking form when transported is selected, and submits porter details", async () => {
    const packedOrder = { ...PLACED_ORDER, status: "packed" };
    const updatedOrder = { ...packedOrder, status: "transported" };
    apiClient.get.mockResolvedValueOnce({ data: packedOrder });
    apiClient.patch.mockResolvedValueOnce({ data: updatedOrder });
    apiClient.get.mockResolvedValueOnce({ data: updatedOrder }); // reload after a successful PATCH

    renderDetail();
    await screen.findByText("Order #42");

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "transported" } });

    const porterNameInput = await screen.findByPlaceholderText("Porter name");
    fireEvent.change(porterNameInput, { target: { value: "Ravi" } });
    fireEvent.change(screen.getByPlaceholderText("Porter phone"), { target: { value: "9999999999" } });
    fireEvent.click(screen.getByRole("button", { name: /update status/i }));

    await waitFor(() =>
      expect(apiClient.patch).toHaveBeenCalledWith("/admin/orders/42/", {
        status: "transported", porter_name: "Ravi", porter_phone: "9999999999",
      })
    );
  });

  it("submits courier details when the courier option is selected", async () => {
    const packedOrder = { ...PLACED_ORDER, status: "packed" };
    const updatedOrder = { ...packedOrder, status: "transported" };
    apiClient.get.mockResolvedValueOnce({ data: packedOrder });
    apiClient.patch.mockResolvedValueOnce({ data: updatedOrder });
    apiClient.get.mockResolvedValueOnce({ data: updatedOrder }); // reload after a successful PATCH

    renderDetail();
    await screen.findByText("Order #42");

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "transported" } });
    fireEvent.click(await screen.findByLabelText("Courier"));
    fireEvent.change(screen.getByPlaceholderText("Courier name"), { target: { value: "BlueDart" } });
    fireEvent.change(screen.getByPlaceholderText("Tracking number"), { target: { value: "BD123" } });
    fireEvent.click(screen.getByRole("button", { name: /update status/i }));

    await waitFor(() =>
      expect(apiClient.patch).toHaveBeenCalledWith("/admin/orders/42/", {
        status: "transported", courier_name: "BlueDart", courier_tracking_number: "BD123",
      })
    );
  });

  it("shows an error message when the update fails", async () => {
    apiClient.get.mockResolvedValueOnce({ data: PLACED_ORDER });
    apiClient.patch.mockRejectedValueOnce({
      response: { data: { status: "Cannot move an order from 'placed' to 'delivered'." } },
    });

    renderDetail();
    await screen.findByText("Order #42");

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "packed" } });
    fireEvent.click(screen.getByRole("button", { name: /update status/i }));

    expect(await screen.findByText("Cannot move an order from 'placed' to 'delivered'.")).toBeTruthy();
  });

  it("hides the transition form for a delivered order", async () => {
    apiClient.get.mockResolvedValueOnce({ data: { ...PLACED_ORDER, status: "delivered" } });

    renderDetail();
    await screen.findByText("Order #42");

    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("shows a screenshot upload field when delivered is selected", async () => {
    const transportedOrder = { ...PLACED_ORDER, status: "transported", courier_name: "BlueDart", courier_tracking_number: "BD123" };
    apiClient.get.mockResolvedValueOnce({ data: transportedOrder });

    renderDetail();
    await screen.findByText("Order #42");

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "delivered" } });

    expect(await screen.findByLabelText(/delivery proof screenshot/i)).toBeTruthy();
  });

  it("blocks submitting delivered without a screenshot attached", async () => {
    const transportedOrder = { ...PLACED_ORDER, status: "transported", courier_name: "BlueDart", courier_tracking_number: "BD123" };
    apiClient.get.mockResolvedValueOnce({ data: transportedOrder });

    renderDetail();
    await screen.findByText("Order #42");

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "delivered" } });
    await screen.findByLabelText(/delivery proof screenshot/i);
    fireEvent.click(screen.getByRole("button", { name: /update status/i }));

    expect(await screen.findByText(/attach a delivery proof screenshot/i)).toBeTruthy();
    expect(apiClient.patch).not.toHaveBeenCalled();
  });

  it("submits the delivery proof screenshot as multipart form data", async () => {
    const transportedOrder = { ...PLACED_ORDER, status: "transported", courier_name: "BlueDart", courier_tracking_number: "BD123" };
    const deliveredOrder = { ...transportedOrder, status: "delivered" };
    apiClient.get.mockResolvedValueOnce({ data: transportedOrder });
    apiClient.patch.mockResolvedValueOnce({ data: deliveredOrder });
    apiClient.get.mockResolvedValueOnce({ data: deliveredOrder }); // reload after a successful PATCH

    renderDetail();
    await screen.findByText("Order #42");

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "delivered" } });
    const file = new File(["contents"], "proof.png", { type: "image/png" });
    const fileInput = await screen.findByLabelText(/delivery proof screenshot/i);
    fireEvent.change(fileInput, { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: /update status/i }));

    await waitFor(() => expect(apiClient.patch).toHaveBeenCalledWith("/admin/orders/42/", expect.anything()));
    const [, body] = apiClient.patch.mock.calls[0];
    expect(body instanceof FormData).toBe(true);
    expect(body.get("status")).toBe("delivered");
    expect(body.get("delivery_proof")).toBe(file);
  });
});
