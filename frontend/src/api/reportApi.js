import axios from "axios";
const BASE_URL = "/api";

// --- Sales Summary ---
export const getSalesSummary = async (
  startDate,
  endDate,
  waiterId = null,
  vipOnly = null,
  token = null
) => {
  const authToken = token || localStorage.getItem("auth_token");
  let url = `${BASE_URL}/reports/sales-summary?start_date=${startDate}&end_date=${endDate}`;
  if (waiterId !== null) url += `&waiter_id=${waiterId}`;
  if (vipOnly !== null) url += `&vip_only=${vipOnly}`;

  const res = await axios.get(url, {
    headers: { Authorization: `Bearer ${authToken}` },
  });

  return res.data;
};

// --- Waiter Summary ---
export const getWaiterSummary = async (startDate, endDate, token = null) => {
  const authToken = token || localStorage.getItem("auth_token");
  const url = `${BASE_URL}/reports/waiter-summary?start_date=${startDate}&end_date=${endDate}`;

  const res = await axios.get(url, {
    headers: { Authorization: `Bearer ${authToken}` },
  });

  return res.data;
};

// --- Waiter Detail (for modal) ---
export const getWaiterDetails = async (waiterId, startDate, endDate, token = null) => {
  const authToken = token || localStorage.getItem("auth_token");
  const url = `${BASE_URL}/reports/waiter/${waiterId}/details?start_date=${startDate}&end_date=${endDate}`;

  const res = await axios.get(url, {
    headers: { Authorization: `Bearer ${authToken}` },
  });

  return res.data;
};
