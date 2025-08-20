import React, { useEffect, useState } from "react";
import { getCategories } from "@/api/categories";
import { getSubcategories } from "@/api/subcategories";
import { getMenuItems } from "@/api/menu_item";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function MenuSelection({
  selectedTable,
  orderItems,
  addItem,
  removeItem,
  updateQuantity,
  onBack,
  onNext,
}) {
  const [categories, setCategories] = useState([]);
  const [subcategories, setSubcategories] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [selectedSubcategory, setSelectedSubcategory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [cartOpenMobile, setCartOpenMobile] = useState(false);

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const cats = await getCategories();
        setCategories(cats);
      } catch (err) {
        console.error("Failed to load categories:", err);
      }
    };
    fetchCategories();
  }, []);

  useEffect(() => {
    const fetchSubcategories = async () => {
      try {
        const subs = await getSubcategories();
        if (selectedCategory) {
          const filteredSubs = subs.filter(
            (sub) => sub.category_id === selectedCategory
          );
          setSubcategories(filteredSubs);
        } else {
          setSubcategories(subs);
        }
      } catch (err) {
        console.error("Failed to load subcategories:", err);
        setSubcategories([]);
      }
    };
    fetchSubcategories();
    setSelectedSubcategory(null);
  }, [selectedCategory]);

  useEffect(() => {
    const fetchMenuItems = async () => {
      try {
        setLoading(true);
        const items = await getMenuItems({});
        const updatedItems = items.map((item) => {
          const category = categories.find((c) => c.id === item.category_id);
          const subcategory = subcategories.find(
            (sub) => sub.id === item.subcategory_id
          );

          // Determine increment: 0.5 for Alcohol + Butchery, 1 otherwise
          let increment = 1;
          if (
            category?.name?.toLowerCase() === "alcohols" &&
            subcategory?.name?.toLowerCase() === "butchery"
          ) {
            increment = 0.5;
          }

          return {
            ...item,
            price:
              selectedTable?.is_vip && item.vip_price != null
                ? item.vip_price
                : item.price,
            increment, // attach increment here
          };
        });
        setMenuItems(updatedItems);
      } catch (err) {
        console.error("Failed to load menu items:", err);
        setMenuItems([]);
      } finally {
        setLoading(false);
      }
    };
    fetchMenuItems();
  }, [selectedTable?.id, categories, subcategories]);

  const subtotal = orderItems.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );

  const filteredItems = menuItems.filter((item) => {
    const categoryMatch = !selectedCategory || item.category_id === selectedCategory;
    const subcategoryMatch = !selectedSubcategory || item.subcategory_id === selectedSubcategory;
    const searchMatch =
      !searchTerm ||
      item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.description.toLowerCase().includes(searchTerm.toLowerCase());
    return categoryMatch && subcategoryMatch && searchMatch;
  });

  const handleAddItem = (item) => {
    addItem(item); // quantity increment is now from item.increment
  };

  if (loading) return <p className="p-4">Loading menu...</p>;

  return (
    <div className="flex flex-col md:flex-row h-full bg-white dark:bg-gray-800 rounded-lg shadow-lg overflow-hidden relative">
      {/* Subcategories sidebar */}
      <aside className="w-full md:w-44 border-b md:border-b-0 md:border-r border-gray-200 dark:border-gray-700 p-2 overflow-x-auto md:overflow-y-auto no-scrollbar">
        <h3 className="text-sm font-semibold mb-2">Subcategories</h3>
        <div className="flex flex-row md:flex-col gap-1 md:gap-2">
          {subcategories.map((sub) => (
            <Button
              key={sub.id}
              variant={selectedSubcategory === sub.id ? "default" : "outline"}
              onClick={() =>
                setSelectedSubcategory(
                  selectedSubcategory === sub.id ? null : sub.id
                )
              }
              className="text-xs md:text-sm whitespace-nowrap py-1 px-2"
            >
              {sub.name}
            </Button>
          ))}
        </div>
      </aside>

      {/* Menu section */}
      <main className="flex flex-col flex-1 p-2 md:p-4 overflow-auto">
        {/* Categories + Search bar */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-2 md:mb-4 space-y-2 md:space-y-0">
          <nav className="flex space-x-2 md:space-x-3 overflow-x-auto no-scrollbar">
            {categories.map((cat) => (
              <Button
                key={cat.id}
                variant={selectedCategory === cat.id ? "default" : "outline"}
                onClick={() =>
                  setSelectedCategory(selectedCategory === cat.id ? null : cat.id)
                }
                className="text-xs md:text-sm whitespace-nowrap py-1 px-2"
              >
                {cat.name}
              </Button>
            ))}
          </nav>
          <input
            type="text"
            placeholder="Search items..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="p-1 md:p-2 border rounded text-sm md:text-sm dark:bg-gray-900 dark:text-white w-full md:w-40"
          />
        </div>

        {/* Menu Items Grid */}
        <section className="flex-1 overflow-auto">
          {filteredItems.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
              {filteredItems.map((item) => (
                <Card
                  key={item.id}
                  className="relative h-48 md:h-56 rounded-lg overflow-hidden cursor-pointer hover:shadow-xl transition"
                  onClick={() => handleAddItem(item)}
                >
                  <div
                    className="absolute inset-0 bg-cover bg-center"
                    style={{ backgroundImage: `url(${item.image_url})` }}
                  />
                  <div className="absolute inset-0 bg-black/40 flex flex-col justify-end p-2 md:p-3 text-white text-xs md:text-sm">
                    <h3 className="font-bold truncate">{item.name}</h3>
                    <p className="truncate">{item.description}</p>
                    <p className="font-semibold mt-1">${item.price.toFixed(2)}</p>
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <p className="text-center text-gray-500 mt-10">No menu items found.</p>
          )}
        </section>

        {/* Back button bottom-left */}
        <div className="fixed bottom-4 left-4 md:left-8 z-50">
          <Button variant="outline" onClick={onBack}>
            &larr; Back
          </Button>
        </div>
      </main>

      {/* Cart sidebar (desktop/tablet) */}
      <aside className="hidden md:flex md:flex-col w-72 border-l border-gray-200 dark:border-gray-700 p-4">
        <h3 className="text-lg font-semibold mb-4">Your Order</h3>
        {orderItems.length === 0 ? (
          <p className="text-gray-500">No items added.</p>
        ) : (
          <div className="flex-1 overflow-y-auto">
            {orderItems.map((item, index) => (
              <div
                key={item.id}
                className="flex items-center justify-between mb-3 text-xs md:text-sm"
              >
                <div className="flex flex-col max-w-xs truncate">
                  <span className="font-semibold truncate">{item.name}</span>
                  <span className="text-gray-600 truncate">
                    ${item.price.toFixed(2)} × {item.quantity}
                  </span>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <Button
                    size="sm"
                    onClick={() =>
                      updateQuantity(item.id, Math.max(item.increment, item.quantity - item.increment))
                    }
                  >
                    -
                  </Button>
                  <span className="w-5 text-center">{item.quantity}</span>
                  <Button
                    size="sm"
                    onClick={() => updateQuantity(item.id, item.quantity + item.increment)}
                  >
                    +
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => removeItem(index)}
                  >
                    ×
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="mt-4 border-t pt-3">
          <p className="text-lg font-semibold">
            Subtotal: ${subtotal.toFixed(2)}
          </p>
          <Button
            className="w-full mt-2 text-sm"
            disabled={orderItems.length === 0}
            onClick={onNext}
          >
            Review Order →
          </Button>
        </div>
      </aside>

      {/* Mobile cart icon */}
      <div className="fixed bottom-4 right-4 md:hidden z-50">
        <button
          onClick={() => setCartOpenMobile(!cartOpenMobile)}
          className="bg-blue-600 text-white p-3 rounded-full shadow-lg relative"
        >
          <span>🛒</span>
          {orderItems.length > 0 && (
            <span className="absolute top-0 right-0 bg-red-500 rounded-full text-xs w-4 h-4 flex items-center justify-center">
              {orderItems.length}
            </span>
          )}
        </button>
        {cartOpenMobile && (
          <div className="mt-2 w-64 max-h-96 bg-gray-100 dark:bg-gray-800 rounded-lg p-3 shadow-lg overflow-y-auto">
            <h3 className="text-lg font-semibold mb-2">Your Order</h3>
            {orderItems.length === 0 ? (
              <p className="text-gray-500 text-sm">No items added.</p>
            ) : (
              orderItems.map((item, index) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between mb-2 text-xs"
                >
                  <div className="flex flex-col max-w-xs truncate">
                    <span className="font-semibold truncate">{item.name}</span>
                    <span className="text-gray-600 truncate">
                      ${item.price.toFixed(2)} × {item.quantity}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Button
                      size="sm"
                      onClick={() =>
                        updateQuantity(item.id, Math.max(item.increment, item.quantity - item.increment))
                      }
                    >
                      -
                    </Button>
                    <span className="w-5 text-center">{item.quantity}</span>
                    <Button
                      size="sm"
                      onClick={() => updateQuantity(item.id, item.quantity + item.increment)}
                    >
                      +
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => removeItem(index)}
                    >
                      ×
                    </Button>
                  </div>
                </div>
              ))
            )}
            <div className="mt-2 border-t pt-2">
              <p className="text-lg font-semibold">
                Subtotal: ${subtotal.toFixed(2)}
              </p>
              <Button
                className="w-full mt-2 text-sm"
                disabled={orderItems.length === 0}
                onClick={onNext}
              >
                Review Order →
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
