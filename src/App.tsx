import { Navigate, Route, Routes } from "react-router-dom";
import Kiosk from "./pages/Kiosk";
import Admin from "./pages/Admin";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Kiosk />} />
      <Route path="/kassa" element={<Navigate to="/" replace />} />
      <Route path="/admin" element={<Admin />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
