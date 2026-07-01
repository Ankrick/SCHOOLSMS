import axios from "axios";

// In dev, requests hit the Vite proxy (see vite.config.js) so "/api" is enough.
// In production the frontend and backend are usually on different hosts,
// so set VITE_API_URL to the deployed backend's full API URL (e.g. https://api.example.com/api).
const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || "/api" });

const handle = (res) => res.data;
const err = (e) => {
  throw new Error(e.response?.data?.message || e.message);
};

// Students
export const getStudents = () => api.get("/students").then(handle).catch(err);
export const createStudent = (data) => api.post("/students", data).then(handle).catch(err);
export const updateStudent = (id, data) => api.put(`/students/${id}`, data).then(handle).catch(err);
export const deleteStudent = (id) => api.delete(`/students/${id}`).then(handle).catch(err);
export const addStrike = (id) => api.patch(`/students/${id}/strikes/add`).then(handle).catch(err);
export const removeStrike = (id) =>
  api.patch(`/students/${id}/strikes/remove`).then(handle).catch(err);

// Teachers
export const getTeachers = () => api.get("/teachers").then(handle).catch(err);
export const createTeacher = (data) => api.post("/teachers", data).then(handle).catch(err);
export const updateTeacher = (id, data) => api.put(`/teachers/${id}`, data).then(handle).catch(err);
export const deleteTeacher = (id) => api.delete(`/teachers/${id}`).then(handle).catch(err);

// Batches
export const getBatches = () => api.get("/batches").then(handle).catch(err);
export const createBatch = (data) => api.post("/batches", data).then(handle).catch(err);
export const updateBatch = (id, data) => api.put(`/batches/${id}`, data).then(handle).catch(err);
export const deleteBatch = (id) => api.delete(`/batches/${id}`).then(handle).catch(err);

// Invoices
export const getInvoices = () => api.get("/invoices").then(handle).catch(err);
export const createInvoice = (data) => api.post("/invoices", data).then(handle).catch(err);
export const updateInvoice = (id, data) => api.put(`/invoices/${id}`, data).then(handle).catch(err);
export const deleteInvoice = (id) => api.delete(`/invoices/${id}`).then(handle).catch(err);
export const markInvoicePaid = (id) => api.patch(`/invoices/${id}/pay`).then(handle).catch(err);
export const generateMonthlyInvoices = () =>
  api.post("/invoices/generate").then(handle).catch(err);
export const markInvoicesOverdue = () =>
  api.patch("/invoices/mark-overdue").then(handle).catch(err);

// Leads
export const getLeads = () => api.get("/leads").then(handle).catch(err);
export const createLead = (data) => api.post("/leads", data).then(handle).catch(err);
export const updateLead = (id, data) => api.put(`/leads/${id}`, data).then(handle).catch(err);
export const deleteLead = (id) => api.delete(`/leads/${id}`).then(handle).catch(err);
export const convertLeadToStudent = (id) =>
  api.post(`/leads/${id}/convert`).then(handle).catch(err);

// Settings
export const getSettings = () => api.get("/settings").then(handle).catch(err);
export const updateSettings = (data) => api.put("/settings", data).then(handle).catch(err);

// Payment History
export const getPaymentHistory = () => api.get("/payment-history").then(handle).catch(err);
export const updatePaymentHistory = (id, data) => api.patch(`/payment-history/${id}`, data).then(handle).catch(err);
export const deletePaymentHistory = (id) => api.delete(`/payment-history/${id}`).then(handle).catch(err);

// Data management
export const resetData = () => api.delete("/data/reset").then(handle).catch(err);
export const importData = (data) => api.post("/data/import", data).then(handle).catch(err);
