import React, { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import toast from "react-hot-toast";
import { fetchReadyOrdersHistory, fetchKDSOrders } from "@/api/kds"; // ✅ fetchKDSOrders for pending

export default function StationReportTable() {
  const { stationToken } = useAuth();
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState([]);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    if (!stationToken) return;

    const fetchData = async () => {
      setLoading(true);
      try {
        const readyOrders = await fetchReadyOrdersHistory(stationToken);
        setOrders(readyOrders || []);

        // Fetch pending orders for the card
        const pendingOrders = await fetchKDSOrders(stationToken);
        let count = 0;
        pendingOrders.forEach(order => {
          count += order.items.length;
        });
        setPendingCount(count);
      } catch (err) {
        toast.error(err.message || "Failed to load orders");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [stationToken]);

  // Aggregate items for ready orders
  const itemSummary = {};
  let totalRevenue = 0;
  let totalItems = 0;

  orders.forEach(order => {
    order.items.forEach(item => {
      if (!itemSummary[item.name]) {
        itemSummary[item.name] = { name: item.name, quantity: 0, subtotal: 0 };
      }
      itemSummary[item.name].quantity += item.quantity;
      const subtotal = item.quantity * item.price;
      itemSummary[item.name].subtotal += subtotal;

      totalItems += item.quantity;
      totalRevenue += subtotal;
    });
  });

  const items = Object.values(itemSummary);

  return (
    <div className="p-4 dark:bg-gray-900 min-h-screen text-gray-900 dark:text-gray-100">
      <h1 className="text-3xl font-bold mb-6">የተዘጋጀ ትዕዛዞች - ዛሬ (Station Report)</h1>

      {/* Summary Cards */}
      <div className="flex flex-wrap gap-4 mb-6">
        <div className="bg-blue-800 dark:bg-blue-800 p-4 rounded-lg shadow flex-1 min-w-[150px]">
          <p className="text-sm font-semibold">አጠቃላይ ትዕዛዞች</p>
          <p className="text-xl font-bold">{orders.length}</p>
        </div>
                <div className="bg-red-800 dark:bg-red-800 p-4 rounded-lg shadow flex-1 min-w-[150px]">
          <p className="text-sm font-semibold">አጠቃላይ ትዕዛዞች ቀጥ ላይ</p>
          <p className="text-xl font-bold">{pendingCount}</p>
        </div>
        <div className="bg-yellow-800 dark:bg-yellow-800 p-4 rounded-lg shadow flex-1 min-w-[150px]">
          <p className="text-sm font-semibold">አጠቃላይ የተሸጡ አይነቶች</p>
          <p className="text-xl font-bold">{totalItems}</p>
        </div>
        <div className="bg-green-800 dark:bg-green-800 p-4 rounded-lg shadow flex-1 min-w-[150px]">
          <p className="text-sm font-semibold">አጠቃላይ ሽያጭ</p>
          <p className="text-xl font-bold">${totalRevenue.toFixed(2)}</p>
        </div>

      </div>

      {/* Table */}
      {loading ? (
        <p>Loading ready items...</p>
      ) : items.length === 0 ? (
        <p>የተዘጋጀ እቃ የለም</p>
      ) : (
        <div className="overflow-x-auto bg-white dark:bg-gray-800 rounded-lg shadow-lg">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-100 dark:bg-gray-700 sticky top-0">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-900 dark:text-gray-100 uppercase tracking-wider">
                  Item
                </th>
                <th className="px-6 py-3 text-right text-sm font-medium text-gray-900 dark:text-gray-100 uppercase tracking-wider">
                  Quantity Sold
                </th>
                <th className="px-6 py-3 text-right text-sm font-medium text-gray-900 dark:text-gray-100 uppercase tracking-wider">
                  Price per Item
                </th>
                <th className="px-6 py-3 text-right text-sm font-medium text-gray-900 dark:text-gray-100 uppercase tracking-wider">
                  Subtotal
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {items.map((item, index) => (
                <tr
                  key={item.name}
                  className={index % 2 === 0 ? "bg-white dark:bg-gray-800" : "bg-gray-50 dark:bg-gray-900"}
                >
                  <td className="px-6 py-4 whitespace-nowrap">{item.name}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">{item.quantity}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">${(item.subtotal / item.quantity).toFixed(2)}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">${item.subtotal.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-100 dark:bg-gray-700 font-bold">
              <tr>
                <td className="px-6 py-3 text-left">Totals</td>
                <td className="px-6 py-3 text-right">{totalItems}</td>
                <td className="px-6 py-3 text-right">—</td>
                <td className="px-6 py-3 text-right">${totalRevenue.toFixed(2)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
