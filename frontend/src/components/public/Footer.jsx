const HOURS = [
  ["Monday", "10am–10pm"],
  ["Tuesday", "10am–10pm"],
  ["Wednesday", "10am–10pm"],
  ["Thursday", "10am–10pm"],
  ["Friday", "10am–10pm"],
  ["Saturday", "10am–10pm"],
  ["Sunday", "10am–10pm"],
];

export default function Footer() {
  return (
    <footer className="bg-brand-dark text-white px-4 py-8 mt-auto">
      <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <h3 className="font-semibold mb-2">Visit Us</h3>
          <p>No:75/A, Velachery Main Rd, Green Court, Pallikaranai, Chennai, Greater Chennai, Tamil Nadu 600100</p>
          <p className="mt-2">Phone: 097898 27973</p>
        </div>
        <div>
          <h3 className="font-semibold mb-2">Hours</h3>
          <ul>
            {HOURS.map(([day, time]) => (
              <li key={day} className="flex justify-between max-w-xs">
                <span>{day}</span>
                <span>{time}</span>
              </li>
            ))}
          </ul>
          <p className="text-yellow-400 text-sm mt-1">Hours may differ on public holidays.</p>
        </div>
        <div>
          <h3 className="font-semibold mb-2">FNB Aquatic Studio</h3>
          <p>Custom aquariums, aquascaping, and aquatic livestock.</p>
        </div>
      </div>
    </footer>
  );
}
