import { Link } from "react-router-dom";

export default function CategoryGrid({ categories }) {
  return (
    <div className="grid gap-4 grid-cols-3 lg:grid-cols-4">
      {categories.map((category) => (
        <Link
          key={category.id}
          to={`/category/${category.slug}`}
          className="border rounded-lg p-4 text-center hover:shadow-md transition"
        >
          {category.image && (
            <div className="w-full aspect-square overflow-hidden rounded mb-2">
              <img src={category.image} alt={category.name} className="w-full h-full object-cover" />
            </div>
          )}
          <span className="font-medium">{category.name}</span>
        </Link>
      ))}
    </div>
  );
}
