import axios from "axios";

const API_URL = "http://localhost:5000";

// ---------------- Orders ----------------
export const fetchOrders = async (token, filters = {}) => {
  const params = new URLSearchParams(filters);
  const res = await axios.get(`${API_URL}/orders?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data;
};

export const fetchOrder = async (token, orderId) => {
  const res = await axios.get(`${API_URL}/orders/${orderId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data;
};

export const createOrder = async (token, table_id, items) => {
  const res = await axios.post(
    `${API_URL}/orders/`,
    { table_id, items },
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return res.data;
};

export const updateOrderStatus = async (token, orderId, status) => {
  const res = await axios.put(
    `${API_URL}/orders/${orderId}`,
    { status },
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return res.data;
};

export const deleteOrder = async (token, orderId) => {
  const res = await axios.delete(`${API_URL}/orders/${orderId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data;
};

// ---------------- Order Items ----------------
export const addOrderItems = async (token, orderId, items) => {
  const res = await axios.post(
    `${API_URL}/orders/${orderId}/items`,
    { items },
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return res.data;
};

export const updateOrderItem = async (token, orderId, itemId, updates) => {
  const res = await axios.put(
    `${API_URL}/orders/${orderId}/items/${itemId}`,
    updates,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return res.data;
};

export const deleteOrderItem = async (token, orderId, itemId) => {
  const res = await axios.delete(
    `${API_URL}/orders/${orderId}/items/${itemId}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return res.data;
};
