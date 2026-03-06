import React, { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import StoreStock from "./stock/StoreStock";
import OverallStock from "./stock/OverallStock";
import StationStockHistory from "./stock/StationStockHistory"
import ExcelStockSheet from "./stock/ExcelStockSheet";
import { useEffect } from "react";

export default function StockManagement({ showSheetTab = true }) {
  const [activeTab, setActiveTab] = useState(showSheetTab ? "sheet" : "station-history");

  useEffect(() => {
    if (!showSheetTab && activeTab === "sheet") {
      setActiveTab("station-history");
    }
  }, [showSheetTab, activeTab]);

  return (
    <div className="w-full space-y-4">
      <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val)}>
        <TabsList className="h-auto flex-wrap justify-start gap-2 rounded-md bg-transparent p-0">
          {showSheetTab && <TabsTrigger value="sheet">Sheet</TabsTrigger>}
          <TabsTrigger value="station-history">Stations</TabsTrigger>
          <TabsTrigger value="store">Store</TabsTrigger>
          <TabsTrigger value="overall">Total</TabsTrigger>
        </TabsList>

        {showSheetTab && (
          <TabsContent value="sheet" className="mt-4">
            <ExcelStockSheet />
          </TabsContent>
        )}

        <TabsContent value="station-history" className="mt-4">
          <StationStockHistory />
        </TabsContent>

        <TabsContent value="store" className="mt-4">
          <StoreStock />
        </TabsContent>

        <TabsContent value="overall" className="mt-4">
          <OverallStock />
        </TabsContent>
      </Tabs>
    </div>
  );
}
