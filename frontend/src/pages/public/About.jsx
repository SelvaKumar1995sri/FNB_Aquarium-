import Breadcrumbs from "../../components/public/Breadcrumbs";
import { SHOP_INFO } from "../../content/shopInfo";

const lowerFirst = (text) => text.charAt(0).toLowerCase() + text.slice(1);

export default function About() {
  return (
    <div>
      <Breadcrumbs items={[{ label: "About Us" }]} />
      <div className="px-4 py-8 max-w-2xl">
        <h1 className="text-2xl font-semibold mb-4">About FNB Aquatic Studio</h1>
        <p className="mb-4">
          FNB Aquatic Studio designs, builds, and maintains custom aquariums for homes and
          businesses in Chennai, and stocks a curated range of exotic fish, aquatic plants, and
          aquascaping equipment.
        </p>
        <p>
          Visit our studio at {SHOP_INFO.address}, {lowerFirst(SHOP_INFO.hoursSummary)}.
        </p>
      </div>
    </div>
  );
}
