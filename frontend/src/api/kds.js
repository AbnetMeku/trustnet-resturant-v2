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

// Mark a specific order item as ready
export const updateOrderItemStatus = async (stationToken, orderItemId) => {
  if (!stationToken) throw new Error("Station token is required");
  try {
    const res = await axios.put(
      `${BASE_URL}/orders/${orderItemId}/status`,
      {},
      { headers: getAuthHeader(stationToken) }
    );
    return res.data;
  } catch (error) {
    console.error(`Failed to mark item ${orderItemId} ready:`, error);
    throw error;
  }
};

// Fetch all ready items (history) for this station
export const fetchReadyOrdersHistory = async (stationToken) => {
  if (!stationToken) throw new Error("Station token is required");
  try {
    const res = await axios.get(`${BASE_URL}/orders/history`, {
      headers: getAuthHeader(stationToken),
    });
    return res.data;
  } catch (error) {
    console.error("Failed to fetch ready orders history:", error);
    throw error;
  }
};
