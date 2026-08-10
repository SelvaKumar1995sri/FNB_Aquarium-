import { BrowserRouter, Route, Routes } from "react-router-dom";

import PublicLayout from "./layouts/PublicLayout";

function Placeholder({ label }) {
  return <div className="p-8 text-brand-dark">{label}</div>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<PublicLayout />}>
          <Route path="/" element={<Placeholder label="Home" />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
