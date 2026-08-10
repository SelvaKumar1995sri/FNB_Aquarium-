import { useParams } from "react-router-dom";

import { POLICIES } from "../../content/policies";

export default function StaticPage() {
  const { slug } = useParams();
  const policy = POLICIES[slug];

  if (!policy) return <div className="p-8">Page not found.</div>;

  return (
    <div className="px-4 py-8 max-w-2xl">
      <h1 className="text-2xl font-semibold mb-4">{policy.title}</h1>
      <p>{policy.body}</p>
    </div>
  );
}
