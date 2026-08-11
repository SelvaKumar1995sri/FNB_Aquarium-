import { useParams } from "react-router-dom";

import Breadcrumbs from "../../components/public/Breadcrumbs";
import { POLICIES } from "../../content/policies";

export default function StaticPage() {
  const { slug } = useParams();
  const policy = POLICIES[slug];

  if (!policy) return <div className="p-8">Page not found.</div>;

  return (
    <div className="max-w-2xl">
      <Breadcrumbs items={[{ label: policy.title }]} />
      <div className="px-4 py-8">
        <h1 className="text-2xl font-semibold mb-4">{policy.title}</h1>
        <p>{policy.body}</p>
      </div>
    </div>
  );
}
