import { Link } from "react-router-dom";

export default function CategoryGrid({ categories }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
      {categories.map((category) => (
        <Link
          key={category.id}
          to={`/category/${category.slug}`}
          className="border rounded-lg p-4 text-center hover:shadow-md transition"
        >
          {category.image && <img src={category.image} alt={category.name} className="w-full h-28 object-cover rounded mb-2" />}
          <span className="font-medium">{category.name}</span>
        </Link>
      ))}
    </div>
  );
}
