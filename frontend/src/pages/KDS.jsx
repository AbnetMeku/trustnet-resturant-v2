import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

export default function KDS() {
  const [orders, setOrders] = useState([]);
  const navigate = useNavigate();
  const station_name = localStorage.getItem('station_name');
  const token = localStorage.getItem('station_token');

  useEffect(() => {
    if (!token) {
      navigate('/station-login');
      return;
    }

    const fetchOrders = async () => {
      try {
        const res = await axios.get('http://localhost:5000/stations-login/orders', {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (Array.isArray(res.data)) {
          setOrders(res.data);
        } else {
          console.warn("Unexpected orders response:", res.data);
          setOrders([]);
        }
      } catch (err) {
        console.error(err);
        if (err.response?.status === 401) {
          localStorage.clear();
          navigate('/station-login');
        }
      }
    };

    fetchOrders();
    const interval = setInterval(fetchOrders, 5000); // refresh every 5 sec
    return () => clearInterval(interval);
  }, [navigate, token]);

  return (
    <div className="min-h-screen bg-gray-900 p-6">
      <header className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-white">{station_name} KDS</h1>
        <button
          className="bg-red-600 hover:bg-red-700 text-white font-bold px-4 py-2 rounded-lg"
          onClick={() => {
            localStorage.clear();
            navigate('/station-login');
          }}
        >
          Logout
        </button>
      </header>

      {orders.length === 0 ? (
        <p className="text-white text-xl">No pending orders</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {orders.map((order) => (
            <div
              key={order.id}
              className="bg-gray-800 text-white rounded-xl p-6 shadow-lg transform transition hover:scale-105"
            >
              <h2 className="text-xl font-bold mb-2">{order.item_name}</h2>
              <p className="text-lg">Quantity: {order.quantity}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
