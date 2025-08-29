import axios from "axios";
const BASE_URL = "http://localhost:5000/api";

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
