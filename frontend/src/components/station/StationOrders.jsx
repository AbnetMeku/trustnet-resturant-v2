import React, { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { fetchKDSOrders, updateOrderItemStatus } from "@/api/kds";
import { formatEatTime } from "@/lib/timezone";

export default function StationOrders() {
  const { stationToken } = useAuth();
  const [orders, setOrders] = useState([]);

  // Fetch orders
  const fetchOrders = async () => {
    if (!stationToken) return;
    try {
      const res = await fetchKDSOrders(stationToken);
      res.sort(
        (a, b) =>
          new Date(a.order_created_at).getTime() -
          new Date(b.order_created_at).getTime()
      );

      // Always trust server status to avoid stale local state across devices.
      setOrders(res);
    } catch (err) {
      console.error("Failed to fetch KDS orders:", err);
    }
  };

  // Update item status ("ready" or "void")
  const updateStatus = async (itemId, status) => {
    if (!stationToken) return;
    try {
      await updateOrderItemStatus(stationToken, itemId, status);
      setOrders((prev) =>
        prev.map((order) => ({
          ...order,
          items: order.items.map((item) =>
            item.item_id === itemId ? { ...item, status } : item
          ),
        }))
      );
    } catch (err) {
      console.error(`Failed to mark item ${itemId} as ${status}:`, err);
    }
  };

  useEffect(() => {
    fetchOrders();
    const interval = setInterval(fetchOrders, 6000);
    return () => clearInterval(interval);
  }, [stationToken]);

  // Pending orders: exclude ready and void items
  const pendingOrders = orders
    .map((order) => ({
      ...order,
      items: order.items.filter((item) => item.status === "pending"),
    }))
    .filter((order) => order.items.length > 0);

  if (!pendingOrders.length)
    return (
      <p className="text-center mt-10 text-gray-400 dark:text-gray-500">
        ምንም ትዕዛዝ የለም በአሁን ጊዜ
      </p>
    );

  return (
    <div className="overflow-y-auto h-screen p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">
      {pendingOrders.map((order) => (
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
                {formatEatTime(order.order_created_at, {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </div>
            <span className="px-3 py-1 rounded-full text-slate-900 font-semibold bg-gray-100 text-sm">
              {order.items.length} ትዕዛዝ
            </span>
          </div>

          <ul className="flex flex-col space-y-3">
            {order.items.map((item) => (
              <li
                key={item.item_id}
                className={`flex justify-between items-center p-4 rounded-lg shadow-sm ${
                  item.status === "void"
                    ? "bg-gray-300 dark:bg-gray-600 line-through"
                    : "bg-gray-100 dark:bg-gray-700"
                }`}
              >
                <div>
                  <span className="font-medium text-lg">{item.name}</span> x{item.quantity}
                  {item.notes && (
                    <em className="text-xs ml-1 text-gray-400 dark:text-gray-500">
                      ({item.notes})
                    </em>
                  )}
                </div>

                <div className="flex space-x-2">
                  {item.status === "pending" && (
                    <>
                      <button
                        onClick={() => updateStatus(item.item_id, "ready")}
                        className="px-4 py-2 rounded-full font-semibold text-white bg-rose-900 hover:bg-rose-600"
                      >
                        ወቷል
                      </button>
                      {/* <button
                        onClick={() => updateStatus(item.item_id, "void")}
                        className="px-4 py-2 rounded-full font-semibold text-white bg-gray-500 hover:bg-gray-400"
                      >
                        የለም
                      </button> */}
                    </>
                  )}
                  {item.status === "ready" && (
                    <span className="px-3 py-1 rounded-full bg-green-500 text-white text-sm font-semibold">
                      Ready
                    </span>
                  )}
                  {item.status === "void" && (
                    <span className="px-3 py-1 rounded-full bg-gray-500 text-white text-sm font-semibold">
                      Voided
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

