import React, { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { fetchOrders } from "@/api/orders";
import { Card } from "@/components/ui/card";

export default function OrderHistory() {
  const { authToken } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authToken) return;

    const loadOrders = async () => {
      setLoading(true);
      try {
        const data = await fetchOrders(authToken, { status: "paid" });
        setOrders(data);
      } catch {
        // handle error if needed
      } finally {
        setLoading(false);
      }
    };

    loadOrders();
  }, [authToken]);

  return (
    <div>
      <h2 className="text-xl font-bold mb-4">Order History (Paid)</h2>
      {loading ? (
        <p>Loading...</p>
      ) : orders.length === 0 ? (
        <p>No fully paid orders found.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {orders.map((order) => (
            <Card key={order.id} className="p-4">
              <h3 className="font-semibold">Table {order.table.number}</h3>
              <p>Total: ${order.total_amount.toFixed(2)}</p>
              <p>Items: {order.items.length}</p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
