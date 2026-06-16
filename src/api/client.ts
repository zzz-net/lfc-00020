import type {
  AuditLog,
  Note,
  OperationSnapshot,
  Technician,
  TechnicianAvailability,
  Ticket,
  TicketStatus,
  Urgency,
  Vacation,
} from '@shared/types';

const API_BASE = '/api';

async function _request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${url}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || '请求失败');
  }
  return data.data ?? data;
}

export const api = {
  tickets: {
    list: (status?: TicketStatus) =>
      _request<Ticket[]>(`/tickets${status ? `?status=${status}` : ''}`),

    get: (id: number) =>
      _request<{
        ticket: Ticket;
        notes: Note[];
        auditLogs: AuditLog[];
        undoSnapshot: OperationSnapshot | null;
      }>(`/tickets/${id}`),

    create: (data: {
      title: string;
      location: string;
      description: string;
      contactName: string;
      contactPhone: string;
      urgency: Urgency;
      expectedDate: string;
      operator: string;
    }) =>
      _request<Ticket>('/tickets', {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    assign: (id: number, technicianId: number, operator: string) =>
      _request<Ticket>(`/tickets/${id}/assign`, {
        method: 'POST',
        body: JSON.stringify({ technicianId, operator }),
      }),

    changeStatus: (id: number, status: TicketStatus, operator: string) =>
      _request<Ticket>(`/tickets/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status, operator }),
      }),

    undo: (id: number, operator: string) =>
      _request<Ticket>(`/tickets/${id}/undo`, {
        method: 'POST',
        body: JSON.stringify({ operator }),
      }),

    addNote: (id: number, content: string, operator: string) =>
      _request<Note>(`/tickets/${id}/notes`, {
        method: 'POST',
        body: JSON.stringify({ content, operator }),
      }),

    availableTechnicians: (id: number) =>
      _request<TechnicianAvailability[]>(`/tickets/${id}/available-technicians`),
  },

  technicians: {
    list: () => _request<Technician[]>('/technicians'),

    get: (id: number) =>
      _request<{ technician: Technician; vacations: Vacation[] }>(`/technicians/${id}`),

    create: (data: {
      name: string;
      employeeId: string;
      skills: string[];
      dailyLimit: number;
      operator: string;
    }) =>
      _request<Technician>('/technicians', {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    update: (id: number, data: { name?: string; skills?: string[]; dailyLimit?: number; operator: string }) =>
      _request<Technician>(`/technicians/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),

    remove: (id: number, operator: string) =>
      _request<{ ok: boolean }>(`/technicians/${id}?operator=${encodeURIComponent(operator)}`, {
        method: 'DELETE',
      }),

    createVacation: (id: number, data: { startDate: string; endDate: string; reason?: string; operator: string }) =>
      _request<Vacation>(`/technicians/${id}/vacations`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    getVacations: (id: number) => _request<Vacation[]>(`/technicians/${id}/vacations`),
  },

  audit: {
    list: () => _request<AuditLog[]>('/audit'),
  },

  export: {
    csv: (params: { startDate?: string; endDate?: string; technicianId?: number } = {}) => {
      const qs = new URLSearchParams();
      if (params.startDate) qs.set('startDate', params.startDate);
      if (params.endDate) qs.set('endDate', params.endDate);
      if (params.technicianId !== undefined) qs.set('technicianId', String(params.technicianId));
      const url = `/export/csv${qs.toString() ? `?${qs.toString()}` : ''}`;
      return fetch(`${API_BASE}${url}`).then(async (res) => {
        if (!res.ok) throw new Error('导出失败');
        const blob = await res.blob();
        const disposition = res.headers.get('Content-Disposition') || '';
        const match = disposition.match(/filename="?([^"]+)"?/);
        const filename = match ? match[1] : `work-orders-${new Date().toISOString().slice(0, 10)}.csv`;
        return { blob, filename };
      });
    },
  },
};
