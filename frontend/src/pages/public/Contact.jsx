import Breadcrumbs from "../../components/public/Breadcrumbs";
import InquiryForm from "../../components/public/InquiryForm";
import { SHOP_INFO } from "../../content/shopInfo";

export default function Contact() {
  return (
    <div className="max-w-4xl">
      <Breadcrumbs items={[{ label: "Contact Us" }]} />
      <div className="px-4 py-8 grid gap-8 md:grid-cols-2">
        <div>
          <h1 className="text-2xl font-semibold mb-4">Contact Us</h1>
          <p>{SHOP_INFO.address}</p>
          <p className="mt-2">Phone: {SHOP_INFO.phone}</p>
          <p className="mt-2 text-sm text-gray-600">{SHOP_INFO.hoursSummary}. {SHOP_INFO.holidayNote}</p>
        </div>
        <div>
          <h2 className="text-xl font-semibold mb-3">Send us a message</h2>
          <InquiryForm type="general" />
        </div>
      </div>
    </div>
  );
}
