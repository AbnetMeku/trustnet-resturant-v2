import React, { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { fetchKDSOrders, updateOrderItemStatus } from "@/api/kds";

export default function StationOrders() {
  const { stationToken } = useAuth();
  const [orders, setOrders] = useState([]);

  // Silent fetch: merge new data without clearing old UI
  const fetchOrders = async () => {
    if (!stationToken) return;
    try {
      const res = await fetchKDSOrders(stationToken);
      res.sort(
        (a, b) =>
          new Date(a.order_created_at).getTime() -
          new Date(b.order_created_at).getTime()
      );
      setOrders((prevOrders) => {
        // Merge and preserve ready status if already clicked
        return res.map((order) => {
          const existing = prevOrders.find((o) => o.order_id === order.order_id);
          if (!existing) return order;
          return {
            ...order,
            items: order.items.map((item) => {
              const oldItem = existing.items.find((i) => i.item_id === item.item_id);
              return oldItem ? { ...item, status: oldItem.status } : item;
            }),
          };
        });
      });
    } catch (err) {
      console.error("Failed to fetch KDS orders:", err);
    }
  };

  const markReady = async (itemId) => {
    if (!stationToken) return;
    try {
      await updateOrderItemStatus(stationToken, itemId);
      setOrders((prev) =>
        prev.map((order) => ({
          ...order,
          items: order.items.map((item) =>
            item.item_id === itemId ? { ...item, status: "ready" } : item
          ),
        }))
      );
    } catch (err) {
      console.error("Failed to mark item ready:", err);
    }
  };

  useEffect(() => {
    fetchOrders();
    const interval = setInterval(fetchOrders, 6000); // 10 seconds
    return () => clearInterval(interval);
  }, [stationToken]);

  if (!orders.length)
    return (
      <p className="text-center mt-10 text-gray-400 dark:text-gray-500">
        ምንም ትዕዛዝ የለም በአሁን ጊዜ
      </p>
    );

  return (
    <div className="overflow-y-auto h-screen p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">
      {orders.map((order) => (
        <div
          key={order.order_id}
          className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 flex flex-col space-y-4 transform hover:scale-[1.02] transition-transform duration-200"
        >
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-bold">ትዕዛዝ #{order.order_id}</h2>
              <p className="text-sm text-gray-500 dark:text-gray-300">
                ጠረጴዛ ቁጥር: {order.table_number || "N/A"} | አስተናጋጅ:{" "}
                {order.waiter_name || "N/A"}
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500">
                ትዕዛዝ ሰዐት:{" "}
                {new Date(order.order_created_at).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </div>
            <span
              className="px-3 py-1 rounded-full text-slate-900 font-semibold bg-gray-100 text-sm"
            >
              {order.items.length} ትዕዛዝ
            </span>
          </div>

          <ul className="flex flex-col space-y-3">
            {order.items.map((item) => (
              <li
                key={item.item_id}
                className="flex justify-between items-center bg-gray-100 dark:bg-gray-700 p-4 rounded-lg shadow-sm"
              >
                <div>
                  <span className="font-medium text-lg">{item.name}</span>{" "}
                  x{item.quantity}{" "}
                  {/* {item.price && (
                    <span className="text-sm text-gray-500 dark:text-gray-400 ml-2">
                      ${item.price.toFixed(2)}
                    </span>
                  )} */}
                  {item.notes && (
                    <em className="text-xs ml-1 text-gray-400 dark:text-gray-500">
                      ({item.notes})
                    </em>
                  )}
                </div>
                <button
                  onClick={() => markReady(item.item_id)}
                  disabled={item.status === "ready"}
                  className={`px-4 py-2 rounded-full font-semibold text-white ${
                    item.status === "ready"
                      ? "bg-green-500 cursor-not-allowed"
                      : "bg-rose-900 hover:bg-rose-600"
                  }`}
                >
                  {item.status === "ready" ? "ደርሷል" : "ደርሷል"}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
