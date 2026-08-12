import { Link } from "react-router-dom";

export default function CategoryGrid({ categories }) {
  return (
    <div className="grid gap-4 grid-cols-4 sm:grid-cols-5 lg:grid-cols-6">
      {categories.map((category) => (
        <Link
          key={category.id}
          to={`/category/${category.slug}`}
          className="border rounded-lg p-2 sm:p-4 text-center hover:shadow-md transition"
        >
          {category.image && (
            <div className="w-full aspect-square overflow-hidden rounded mb-1 sm:mb-2">
              <img src={category.image} alt={category.name} className="w-full h-full object-cover" />
            </div>
          )}
          <span className="text-xs sm:text-base font-medium break-words">{category.name}</span>
        </Link>
      ))}
    </div>
  );
}
