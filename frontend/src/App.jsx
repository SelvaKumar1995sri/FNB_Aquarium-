import { BrowserRouter, Route, Routes } from "react-router-dom";

function Placeholder({ label }) {
  return <div className="p-8 text-brand-dark">{label}</div>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Placeholder label="Home" />} />
      </Routes>
    </BrowserRouter>
  );
}
