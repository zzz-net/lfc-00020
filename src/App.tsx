import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Layout from '@/components/Layout';
import Dashboard from '@/pages/Dashboard';
import TicketDetail from '@/pages/TicketDetail';
import NewTicket from '@/pages/NewTicket';
import Technicians from '@/pages/Technicians';
import Export from '@/pages/Export';
import AuditLog from '@/pages/AuditLog';

export default function App() {
  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/tickets/new" element={<NewTicket />} />
          <Route path="/tickets/:id" element={<TicketDetail />} />
          <Route path="/technicians" element={<Technicians />} />
          <Route path="/export" element={<Export />} />
          <Route path="/audit" element={<AuditLog />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </Router>
  );
}
