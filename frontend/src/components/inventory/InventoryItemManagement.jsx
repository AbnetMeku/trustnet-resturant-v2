import React, { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import InventoryItemsTab from "./InventoryItems/InventoryItemsTab";
import InventoryLinksTab from "./InventoryItems/InventoryLinksTab";

export default function InventoryItemManagement() {
  const [activeTab, setActiveTab] = useState("inventory");

  return (
    <div className="space-y-5">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="inventory">Inventory Items</TabsTrigger>
          <TabsTrigger value="links">Serving Rules</TabsTrigger>
        </TabsList>

        <TabsContent value="inventory">
          <InventoryItemsTab />
        </TabsContent>

        <TabsContent value="links">
          <InventoryLinksTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
