// src/components/waiter/MenuSelection.jsx
import React, { useEffect, useState } from "react";
// import { getMenuItems, getCategories } from "@/api/menu_item";
import { Button } from "@/components/ui/button";

export default function MenuSelection({ selectedTable, orderItems, addItem, removeItem, onNext, onBack }) {
  const [categories, setCategories] = useState([]);
  const [subcategories, setSubcategories] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [filteredItems, setFilteredItems] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [selectedSubcategory, setSelectedSubcategory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchMenu = async () => {
      try {
        const cats = await getCategories(); // [{id, name, subcategories: [{id,name}]}]
        const items = await getMenuItems(); // [{id, name, category_id, subcategory_id, normal_price, vip_price}]
        setCategories(cats);
        setMenuItems(items);
        setSelectedCategory(cats[0]?.id || null);
        setLoading(false);
      } catch (err) {
        console.error(err);
        setError("Failed to load menu.");
        setLoading(false);
      }
    };
    fetchMenu();
  }, []);

  // Update subcategories when category changes
  useEffect(() => {
    const cat = categories.find(c => c.id === selectedCategory);
    setSubcategories(cat?.subcategories || []);
    setSelectedSubcategory(cat?.subcategories?.[0]?.id || null);
  }, [selectedCategory, categories]);

  // Filter items by category & subcategory
  useEffect(() => {
    let items = menuItems.filter(item => item.category_id === selectedCategory);
    if (selectedSubcategory) items = items.filter(item => item.subcategory_id === selectedSubcategory);
    setFilteredItems(items);
  }, [selectedCategory, selectedSubcategory, menuItems]);

  if (loading) return <p>Loading menu...</p>;
  if (error) return <p className="text-red-500">{error}</p>;

  const getPrice = (item) => selectedTable.is_vip ? item.vip_price : item.normal_price;

  return (
    <div className="flex p-4 space-x-4">
      {/* Category Navbar */}
      <div className="flex flex-col space-y-2 w-1/5">
        {categories.map(cat => (
          <Button
            key={cat.id}
            variant={selectedCategory === cat.id ? "default" : "outline"}
            onClick={() => setSelectedCategory(cat.id)}
          >
            {cat.name}
          </Button>
        ))}
      </div>

      {/* Sidebar Subcategories */}
      <div className="flex flex-col space-y-2 w-1/5">
        {subcategories.map(sub => (
          <Button
            key={sub.id}
            variant={selectedSubcategory === sub.id ? "default" : "outline"}
            onClick={() => setSelectedSubcategory(sub.id)}
          >
            {sub.name}
          </Button>
        ))}
      </div>

      {/* Menu Items */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 flex-1">
        {filteredItems.map(item => (
          <div key={item.id} className="p-4 border rounded-lg flex flex-col items-center">
            <h3 className="font-bold text-lg">{item.name}</h3>
            <p className="text-gray-700 font-semibold">Price: ${getPrice(item)}</p>
            <Button className="mt-2" onClick={() => addItem({...item, price: getPrice(item)})}>
              Add
            </Button>
          </div>
        ))}
      </div>

      {/* Navigation Buttons */}
      <div className="absolute bottom-4 right-4 flex space-x-2">
        <Button variant="outline" onClick={onBack}>&larr; Back</Button>
        <Button onClick={onNext}>Next &rarr;</Button>
      </div>
    </div>
  );
}
