import React, { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { getStoreStock, getStationStock } from "@/api/inventory";
import { useAuth } from "@/context/AuthContext";
import { toast } from "react-hot-toast";

const PAGE_SIZE = 10;

export default function StockManagement() {
  const { token } = useAuth();

  const [activeTab, setActiveTab] = useState("store");
  const [storeStock, setStoreStock] = useState([]);
  const [stationStock, setStationStock] = useState([]);
  const [overallStock, setOverallStock] = useState([]);
  const [page, setPage] = useState(1);

  const loadStoreStock = async () => {
    try {
      const data = await getStoreStock(token);
      setStoreStock(data);
    } catch (err) {
      toast.error(err.message || "Failed to load store stock");
    }
  };

  const loadStationStock = async () => {
    try {
      const data = await getStationStock(token);
      setStationStock(data);
    } catch (err) {
      toast.error(err.message || "Failed to load station stock");
    }
  };

  // For now, overall stock = store + station merged
  const buildOverallStock = () => {
    const all = [...storeStock, ...stationStock];
    setOverallStock(all);
  };

  useEffect(() => {
    loadStoreStock();
    loadStationStock();
  }, [token]);

  useEffect(() => {
    buildOverallStock();
  }, [storeStock, stationStock]);

  const paginate = (data) => data.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const renderTable = (data) => (
    <div className="overflow-x-auto">
      <table className="w-full border rounded-lg shadow-sm">
        <thead>
          <tr className="bg-gray-100 dark:bg-gray-700">
            <th className="p-2 border">#</th>
            <th className="p-2 border">Item</th>
            <th className="p-2 border">Quantity</th>
            <th className="p-2 border">Location</th>
          </tr>
        </thead>
        <tbody>
          {paginate(data).map((row, i) => (
            <tr key={i}>
              <td className="p-2 border">{(page - 1) * PAGE_SIZE + i + 1}</td>
              <td className="p-2 border">{row.menu_item || row.item_name}</td>
              <td className="p-2 border">{row.quantity}</td>
              <td className="p-2 border">
                {row.station ? row.station : "Store"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex justify-between mt-3">
        <Button disabled={page === 1} onClick={() => setPage(page - 1)}>
          Prev
        </Button>
        <span>
          Page {page} of {Math.ceil(data.length / PAGE_SIZE) || 1}
        </span>
        <Button
          disabled={page * PAGE_SIZE >= data.length}
          onClick={() => setPage(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );

  return (
    <Card className="p-6 w-full">
      <h2 className="text-xl font-bold mb-4">Stock Management</h2>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="store">Store Stock</TabsTrigger>
          <TabsTrigger value="station">Station Stock</TabsTrigger>
          <TabsTrigger value="overall">Overall Stock</TabsTrigger>
        </TabsList>

        <TabsContent value="store">{renderTable(storeStock)}</TabsContent>
        <TabsContent value="station">{renderTable(stationStock)}</TabsContent>
        <TabsContent value="overall">{renderTable(overallStock)}</TabsContent>
      </Tabs>
    </Card>
  );
}
