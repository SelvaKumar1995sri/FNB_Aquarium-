import { Link } from "react-router-dom";

import { SHOP_INFO } from "../../content/shopInfo";

export default function Footer() {
  return (
    <footer className="bg-brand-dark text-white px-4 py-8 mt-auto">
      <img src="/logo.svg" alt="FNB Aquatic Studio" className="h-12 w-auto mb-3" />
      <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <h3 className="font-semibold mb-2">Visit Us</h3>
          <p>{SHOP_INFO.address}</p>
          <p className="mt-2">Phone: {SHOP_INFO.phone}</p>
        </div>
        <div>
          <h3 className="font-semibold mb-2">Hours</h3>
          <ul>
            {SHOP_INFO.hoursByDay.map(([day, time]) => (
              <li key={day} className="flex justify-between max-w-xs">
                <span>{day}</span>
                <span>{time}</span>
              </li>
            ))}
          </ul>
          <p className="text-yellow-400 text-sm mt-1">{SHOP_INFO.holidayNote}</p>
        </div>
        <div>
          <h3 className="font-semibold mb-2">FNB Aquatic Studio</h3>
          <p>Custom aquariums, aquascaping, and aquatic livestock.</p>
        </div>
        <div>
          <h3 className="font-semibold mb-2">Policies</h3>
          <ul className="grid gap-1">
            <li><Link to="/policies/privacy-policy">Privacy Policy</Link></li>
            <li><Link to="/policies/shipping-policy">Shipping Policy</Link></li>
            <li><Link to="/policies/terms-conditions">Terms & Conditions</Link></li>
            <li><Link to="/policies/return-policy">Return Policy</Link></li>
          </ul>
        </div>
      </div>
    </footer>
  );
}
