import axios from "axios";

const BASE_URL = "/api/stations/kds";

const getAuthHeader = (token) => ({
  Authorization: `Bearer ${token || localStorage.getItem("station_token")}`,
});

// Fetch all pending orders for this station
export const fetchKDSOrders = async (stationToken) => {
  if (!stationToken) throw new Error("Station token is required");
  try {
    const res = await axios.get(`${BASE_URL}/orders`, {
      headers: getAuthHeader(stationToken),
    });
    return res.data;
  } catch (error) {
    console.error("Failed to fetch KDS orders:", error);
    throw error;
  }
};

/**
 * Mark a specific order item with a new status: "ready" or "void"
 * @param {string} stationToken 
 * @param {number} orderItemId 
 * @param {string} status - "ready" | "void"
 */
export const updateOrderItemStatus = async (stationToken, orderItemId, status = "ready") => {
  if (!stationToken) throw new Error("Station token is required");
  if (!["ready", "void"].includes(status)) throw new Error("Invalid status");

  try {
    const res = await axios.put(
      `${BASE_URL}/orders/${orderItemId}/status`,
      { status }, // send status in request body
      { headers: getAuthHeader(stationToken) }
    );
    return res.data;
  } catch (error) {
    console.error(`Failed to mark item ${orderItemId} as ${status}:`, error);
    throw error;
  }
};

// Fetch ready items (history) for this station — supports filters including date
export const fetchReadyOrdersHistory = async (
  stationToken,
  filters = {} // { waiter_id?: number, table_number?: number, date?: string }
) => {
  if (!stationToken) throw new Error("Station token is required");
  try {
    const query = new URLSearchParams(filters).toString();
    const res = await axios.get(
      `${BASE_URL}/orders/history${query ? `?${query}` : ""}`,
      { headers: getAuthHeader(stationToken) }
    );
    return res.data;
  } catch (error) {
    console.error("Failed to fetch ready orders history:", error);
    throw error;
  }
};