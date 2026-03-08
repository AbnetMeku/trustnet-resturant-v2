import axios from "axios";
import { describe, expect, it, vi } from "vitest";

import { clearOrderHistoryRange } from "./order_history";

const { mockClient } = vi.hoisted(() => ({
  mockClient: {
    delete: vi.fn(),
  },
}));

vi.mock("axios", () => {
  return {
    default: {
      create: vi.fn(() => mockClient),
    },
  };
});

describe("clearOrderHistoryRange", () => {
  it("sends the selected range in the delete request body", async () => {
    mockClient.delete.mockResolvedValue({
      data: {
        message: "Order history cleared successfully.",
      },
    });

    const payload = await clearOrderHistoryRange("token-1", {
      start_date: "2026-03-01",
      end_date: "2026-03-03",
    });

    expect(axios.create).toHaveBeenCalledTimes(1);
    expect(mockClient.delete).toHaveBeenCalledWith("/order-history/clear-range", {
      data: {
        start_date: "2026-03-01",
        end_date: "2026-03-03",
      },
      headers: { Authorization: "Bearer token-1" },
    });
    expect(payload.message).toBe("Order history cleared successfully.");
  });
});
