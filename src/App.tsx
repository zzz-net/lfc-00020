import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Layout from "@/components/Layout";
import Dashboard from "@/pages/Dashboard";
import TicketDetail from "@/pages/TicketDetail";
import NewTicket from "@/pages/NewTicket";
import Technicians from "@/pages/Technicians";
import ExportCenter from "@/pages/Export";
import ExportBatchDetail from "@/pages/ExportBatchDetail";
import AuditLog from "@/pages/AuditLog";
import DevWorkbench from "@/pages/DevWorkbench";
import TakeoverReceiptCenter from "@/pages/TakeoverReceiptCenter";

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="/tickets/new" element={<NewTicket />} />
          <Route path="/tickets/:id" element={<TicketDetail />} />
          <Route path="/technicians" element={<Technicians />} />
          <Route path="/export" element={<ExportCenter />} />
          <Route path="/export/batches/:id" element={<ExportBatchDetail />} />
          <Route path="/audit" element={<AuditLog />} />
          <Route path="/devworkbench" element={<DevWorkbench />} />
          <Route path="/takeover" element={<TakeoverReceiptCenter />} />
        </Route>
      </Routes>
    </Router>
  );
}
