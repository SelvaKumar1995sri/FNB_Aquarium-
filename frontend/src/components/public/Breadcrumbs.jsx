import { Link } from "react-router-dom";

export default function Breadcrumbs({ items = [] }) {
  return (
    <nav aria-label="Breadcrumb" className="px-4 pt-4 text-sm text-gray-600">
      <ol className="flex flex-wrap items-center gap-1">
        <li>
          <Link to="/" className="hover:text-brand-aqua">Home</Link>
        </li>
        {items.map((item, index) => {
          const isCurrent = index === items.length - 1;
          return (
            <li key={item.label} className="flex items-center gap-1">
              <span className="text-gray-400">/</span>
              {isCurrent || !item.to ? (
                <span aria-current={isCurrent ? "page" : undefined} className="text-gray-800 font-medium">
                  {item.label}
                </span>
              ) : (
                <Link to={item.to} className="hover:text-brand-aqua">{item.label}</Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
