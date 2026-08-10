import InquiryForm from "../../components/public/InquiryForm";

export default function Contact() {
  return (
    <div className="px-4 py-8 grid gap-8 md:grid-cols-2 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold mb-4">Contact Us</h1>
        <p>No:75/A, Velachery Main Rd, Green Court, Pallikaranai, Chennai, Greater Chennai, Tamil Nadu 600100</p>
        <p className="mt-2">Phone: 097898 27973</p>
        <p className="mt-2 text-sm text-gray-600">Open daily from 10am to 10pm. Hours may differ on public holidays.</p>
      </div>
      <div>
        <h2 className="text-xl font-semibold mb-3">Send us a message</h2>
        <InquiryForm type="general" />
      </div>
    </div>
  );
}
