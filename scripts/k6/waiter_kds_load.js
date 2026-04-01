import http from "k6/http";
import { check, sleep } from "k6";

const BASE_URL = __ENV.BASE_URL || "http://host.docker.internal:5050";
const WAITER_PIN = __ENV.WAITER_PIN || "1001";
const STATION_PIN = __ENV.STATION_PIN || "1234";
const LOGIN_EVERY = Number(__ENV.LOGIN_EVERY || 5);

const TARGET_LOW = Number(__ENV.TARGET_LOW || 20);
const TARGET_HIGH = Number(__ENV.TARGET_HIGH || 50);
const RAMP = __ENV.RAMP || "30s";
const HOLD = __ENV.HOLD || "2m";
const HOLD_HIGH = __ENV.HOLD_HIGH || HOLD;

export const options = {
  scenarios: {
    waiter_kds: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: RAMP, target: TARGET_LOW },
        { duration: HOLD, target: TARGET_LOW },
        { duration: RAMP, target: TARGET_HIGH },
        { duration: HOLD_HIGH, target: TARGET_HIGH },
        { duration: RAMP, target: 0 },
      ],
      gracefulRampDown: "30s",
    },
  },
};

let waiterToken = null;
let stationToken = null;

function jsonHeaders(token) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function loginWaiter() {
  const res = http.post(
    `${BASE_URL}/api/auth/pin/waiter`,
    JSON.stringify({ pin: WAITER_PIN }),
    { headers: jsonHeaders() }
  );
  const ok = check(res, { "waiter login 200": (r) => r.status === 200 });
  if (!ok) return null;
  return res.json("access_token");
}

function loginStation() {
  const res = http.post(
    `${BASE_URL}/api/auth/pin/station`,
    JSON.stringify({ pin: STATION_PIN }),
    { headers: jsonHeaders() }
  );
  const ok = check(res, { "station login 200": (r) => r.status === 200 });
  if (!ok) return null;
  return res.json("access_token");
}

function pickRandom(list) {
  if (!Array.isArray(list) || list.length === 0) return null;
  const idx = Math.floor(Math.random() * list.length);
  return list[idx];
}

export default function () {
  if (!waiterToken || __ITER % LOGIN_EVERY === 0) {
    waiterToken = loginWaiter();
  }
  if (!stationToken || __ITER % LOGIN_EVERY === 0) {
    stationToken = loginStation();
  }
  if (!waiterToken || !stationToken) {
    sleep(0.5);
    return;
  }

  const today = formatDate(new Date());

  const waiterHeaders = { headers: jsonHeaders(waiterToken) };
  const stationHeaders = { headers: jsonHeaders(stationToken) };

  // Waiter status + core lists
  check(http.get(`${BASE_URL}/api/order-history/waiter/day-close-status`, waiterHeaders), {
    "waiter day status 200": (r) => r.status === 200,
  });

  const tablesRes = http.get(`${BASE_URL}/api/tables`, waiterHeaders);
  check(tablesRes, { "tables 200": (r) => r.status === 200 });
  const tables = tablesRes.status === 200 ? tablesRes.json() : [];

  const menuRes = http.get(`${BASE_URL}/api/menu-items`, waiterHeaders);
  check(menuRes, { "menu items 200": (r) => r.status === 200 });
  const menuItems = menuRes.status === 200 ? menuRes.json() : [];

  const table = pickRandom(tables);
  const menuItem = pickRandom(menuItems);

  if (table && menuItem) {
    const createPayload = {
      table_id: table.id,
      items: [{ menu_item_id: menuItem.id }],
    };

    const createRes = http.post(
      `${BASE_URL}/api/orders/`,
      JSON.stringify(createPayload),
      waiterHeaders
    );

    if (createRes.status === 201) {
      check(createRes, { "create order 201": (r) => r.status === 201 });
      const orderId = createRes.json("id");
      if (orderId) {
        http.post(
          `${BASE_URL}/api/orders/${orderId}/items`,
          JSON.stringify({ items: [{ menu_item_id: menuItem.id }] }),
          waiterHeaders
        );
      }
    } else if (createRes.status === 409) {
      const openRes = http.get(
        `${BASE_URL}/api/orders?table_id=${table.id}&status=open`,
        waiterHeaders
      );
      if (openRes.status === 200) {
        const openOrders = openRes.json();
        const openOrder = pickRandom(openOrders);
        if (openOrder && openOrder.id) {
          http.post(
            `${BASE_URL}/api/orders/${openOrder.id}/items`,
            JSON.stringify({ items: [{ menu_item_id: menuItem.id }] }),
            waiterHeaders
          );
        }
      }
    }
  }

  // Waiter history (read)
  check(
    http.get(
      `${BASE_URL}/api/order-history/raw?date=${today}&page=1&page_size=20`,
      waiterHeaders
    ),
    { "order history raw 200": (r) => r.status === 200 }
  );

  // KDS pending orders + optional status update
  const kdsRes = http.get(`${BASE_URL}/api/stations/kds/orders`, stationHeaders);
  check(kdsRes, { "kds orders 200": (r) => r.status === 200 });
  if (kdsRes.status === 200) {
    const kdsOrders = kdsRes.json();
    const firstOrder = pickRandom(kdsOrders);
    const firstItem = firstOrder && firstOrder.items ? pickRandom(firstOrder.items) : null;
    if (firstItem && firstItem.item_id && Math.random() < 0.3) {
      http.put(
        `${BASE_URL}/api/stations/kds/orders/${firstItem.item_id}/status`,
        JSON.stringify({ status: "ready" }),
        stationHeaders
      );
    }
  }

  // KDS history (read)
  check(
    http.get(
      `${BASE_URL}/api/stations/kds/orders/history?date=${today}`,
      stationHeaders
    ),
    { "kds history 200": (r) => r.status === 200 }
  );

  sleep(Math.random() * 0.4 + 0.1);
}
