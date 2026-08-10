const SERVICES = [
  { title: "Custom Aquarium Design & Build", description: "Bespoke tanks designed and installed for homes and businesses." },
  { title: "Aquascaping", description: "Planted and hardscape aquascaping for freshwater and marine setups." },
  { title: "Maintenance Contracts", description: "Scheduled cleaning, water testing, and livestock health checks." },
  { title: "Livestock Sourcing", description: "Sourcing of exotic fish and plants on request." },
];

export default function Services() {
  return (
    <div className="px-4 py-8">
      <h1 className="text-2xl font-semibold mb-6">Services</h1>
      <div className="grid gap-6 sm:grid-cols-2">
        {SERVICES.map((service) => (
          <div key={service.title} className="border rounded-lg p-4">
            <h2 className="font-semibold mb-1">{service.title}</h2>
            <p className="text-gray-700">{service.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
