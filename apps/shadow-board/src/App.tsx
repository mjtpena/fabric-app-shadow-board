import { Route, Routes } from 'react-router-dom';

import { AboutPage } from './pages/AboutPage';
import { AuditPage } from './pages/AuditPage';
import { DeskPage } from './pages/DeskPage';
import { HomePage } from './pages/HomePage';
import { ReimagePage } from './pages/ReimagePage';
import { ReservePage } from './pages/ReservePage';

export function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/reserve" element={<ReservePage />} />
      <Route path="/desk" element={<DeskPage />} />
      <Route path="/reimage" element={<ReimagePage />} />
      <Route path="/audit" element={<AuditPage />} />
      <Route path="/about" element={<AboutPage />} />
    </Routes>
  );
}
