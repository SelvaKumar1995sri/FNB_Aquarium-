import Breadcrumbs from "../../components/public/Breadcrumbs";
import InquiryForm from "../../components/public/InquiryForm";

const TANK_BUILD_FIELDS = [
  { name: "tank_size", label: "Tank size (e.g. 4ft x 2ft x 2ft)" },
  { name: "tank_shape", label: "Tank shape (e.g. rectangular, bow-front)" },
  { name: "budget_notes", label: "Budget (optional)", required: false },
];

export default function CustomTankBuild() {
  return (
    <div className="max-w-2xl">
      <Breadcrumbs items={[{ label: "Custom Tank Build" }]} />
      <div className="px-4 py-8">
        <h1 className="text-2xl font-semibold mb-2">Build Your Tank</h1>
        <p className="mb-6 text-gray-700">
          Tell us the size and shape of the aquarium you want, and we'll get back to you with a
          customized quote.
        </p>
        <InquiryForm type="build_tank" extraFields={TANK_BUILD_FIELDS} />
      </div>
    </div>
  );
}
