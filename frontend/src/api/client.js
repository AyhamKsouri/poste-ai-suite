const BASE = "/api";

function getToken() {
  return localStorage.getItem("token");
}

export function setToken(token) {
  if (token) localStorage.setItem("token", token);
  else localStorage.removeItem("token");
}

async function request(path, { method = "GET", body, isForm = false } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (!isForm && body !== undefined) headers["Content-Type"] = "application/json";

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
  });

  if (res.status === 401) {
    setToken(null);
    window.location.href = "/login";
    throw new Error("Unauthorized");
  }

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const data = await res.json();
      detail = data.detail || JSON.stringify(data);
    } catch {
      // ignore
    }
    throw new Error(detail);
  }

  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  login: (email, password) => request("/auth/login", { method: "POST", body: { email, password } }),
  me: () => request("/auth/me"),
  register: (payload) => request("/auth/register", { method: "POST", body: payload }),

  // RAG
  listDocuments: () => request("/rag/documents"),
  uploadDocument: (file) => {
    const form = new FormData();
    form.append("file", file);
    return request("/rag/documents", { method: "POST", body: form, isForm: true });
  },
  deleteDocument: (id) => request(`/rag/documents/${id}`, { method: "DELETE" }),
  ask: (question, history = []) => request("/rag/ask", { method: "POST", body: { question, history } }),
  sendFeedback: (questionId, feedback) =>
    request(`/rag/questions/${questionId}/feedback`, { method: "POST", body: { feedback } }),
  listQuestions: () => request("/rag/questions"),
  ragStats: () => request("/rag/stats"),

  // Complaints
  submitComplaint: (payload) => request("/complaints", { method: "POST", body: payload }),
  listComplaints: (filters = {}) => {
    const qs = new URLSearchParams(filters).toString();
    return request(`/complaints${qs ? `?${qs}` : ""}`);
  },
  getComplaint: (id) => request(`/complaints/${id}`),
  replyComplaint: (id, final_reply) =>
    request(`/complaints/${id}/reply`, { method: "PATCH", body: { final_reply } }),
  updateComplaintStatus: (id, status) =>
    request(`/complaints/${id}/status`, { method: "PATCH", body: { status } }),
  complaintStats: () => request("/complaints/stats"),
};
