import { useEffect, useState } from "react";

import { apiClient } from "../../api/client";
import Breadcrumbs from "../../components/public/Breadcrumbs";

export default function Portfolio() {
  const [items, setItems] = useState([]);
  const [itemsError, setItemsError] = useState(false);

  useEffect(() => {
    apiClient
      .get("/portfolio/")
      .then((response) => setItems(response.data.results))
      .catch(() => setItemsError(true));
  }, []);

  return (
    <div>
      <Breadcrumbs items={[{ label: "Portfolio" }]} />
      <div className="px-4 py-8">
        <h1 className="text-2xl font-semibold mb-6">Portfolio</h1>
        {itemsError && (
          <p className="text-red-600">Couldn't load portfolio items — please try again later.</p>
        )}
        <div className="grid gap-6 sm:grid-cols-2 md:grid-cols-3">
          {items.map((item) => (
            <div key={item.id} className="border rounded-lg overflow-hidden">
              {item.image && <img src={item.image} alt={item.title} className="w-full h-48 object-cover" />}
              <div className="p-4">
                <h2 className="font-semibold">{item.title}</h2>
                <p className="text-gray-600 text-sm">{item.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
