import React, { useState } from "react";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import StoreStock from "./stock/StoreStock";
import StationStock from "./stock/StationStock";
import OverallStock from "./stock/OverallStock";

export default function StockManagement() {
  const [activeTab, setActiveTab] = useState("store");

  return (
    <Card className="p-6 w-full space-y-4">
      <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val)}>
        <TabsList>
          <TabsTrigger value="store">Store</TabsTrigger>
          <TabsTrigger value="station">Stations</TabsTrigger>
          <TabsTrigger value="overall">Total</TabsTrigger>
        </TabsList>

        <TabsContent value="store">
          <StoreStock />
        </TabsContent>

        <TabsContent value="station">
          <StationStock />
        </TabsContent>

        <TabsContent value="overall">
          <OverallStock />
        </TabsContent>
      </Tabs>
    </Card>
  );
}
