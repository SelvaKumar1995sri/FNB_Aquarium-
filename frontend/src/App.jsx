import { BrowserRouter, Route, Routes } from "react-router-dom";

import PublicLayout from "./layouts/PublicLayout";
import Home from "./pages/public/Home";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<PublicLayout />}>
          <Route path="/" element={<Home />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
