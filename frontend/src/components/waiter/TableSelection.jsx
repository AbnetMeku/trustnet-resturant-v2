// src/components/waiter/TableSelection.jsx
import React, { useState, useEffect } from "react";
import { getTables } from "@/api/tables";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "../../context/AuthContext";

export default function TableSelection({ setSelectedTable, onNext, onBack }) {
  const { user } = useAuth();
  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchTables = async () => {
      try {
        const allTables = await getTables();
        const waiterTables = allTables.filter((t) =>
          t.waiters.some((w) => w.id === user.id)
        );
        setTables(waiterTables);
      } catch (err) {
        console.error("Failed to fetch tables:", err);
        setError("Failed to load tables. Please try again.");
      } finally {
        setLoading(false);
      }
    };
    fetchTables();
  }, [user]);

  const handleSelect = (table) => {
    // Set table in NewOrder state
    setSelectedTable(table);

    // Move to next step (MenuSelection)
    onNext();
  };

  if (loading) return <p>Loading tables...</p>;
  if (error) return <p className="text-red-500">{error}</p>;
  if (!tables || tables.length === 0)
    return <p>No tables assigned to you yet.</p>;

  return (
    <div className="p-4">
      {/* Back Button */}
      <Button variant="outline" className="mb-4" onClick={onBack}>
        &larr; Back
      </Button>

      {/* Table Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {tables.map((table) => (
          <Card
            key={table.id}
            className="p-4 flex flex-col items-center justify-center cursor-pointer hover:shadow-lg transition"
          >
            <h3 className="text-xl font-bold mb-2">Table {table.number}</h3>
            <p>Status: {table.status}</p>
            {table.is_vip && (
              <p className="text-yellow-500 font-semibold">VIP</p>
            )}
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => handleSelect(table)}
            >
              Select Table
            </Button>
          </Card>
        ))}
      </div>
    </div>
  );
}
