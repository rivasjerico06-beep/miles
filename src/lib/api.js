// Browser client for the CampusPulse API (same origin, session cookie).

export class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

async function request(method, path, body) {
  let response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      credentials: "same-origin",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError("Can't reach the server. Check your internet connection.", 0);
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(data?.error || `Request failed (${response.status}).`, response.status, data);
  return data;
}

const query = (params) =>
  new URLSearchParams(Object.entries(params).filter(([, value]) => value !== undefined && value !== "")).toString();

export const api = {
  session: () => request("GET", "/auth/session"),
  login: (body) => request("POST", "/auth/login", body),
  register: (body) => request("POST", "/auth/register", body),
  logout: () => request("POST", "/auth/logout", {}),
  changePassword: (body) => request("POST", "/auth/password", body),

  studentDashboard: () => request("GET", "/student/dashboard"),
  saveHome: (body) => request("POST", "/student/home", body),
  createLinkCode: () => request("POST", "/student/link-code", {}),
  startTrip: (body) => request("POST", "/student/trip/start", body),
  sendPosition: (body) => request("POST", "/student/trip/position", body),
  stopTrip: () => request("POST", "/student/trip/stop", {}),
  sos: (body) => request("POST", "/student/sos", body),

  parentDashboard: () => request("GET", "/parent/dashboard"),
  markNoticesRead: () => request("POST", "/parent/notifications/read", {}),
  resolveSos: (id) => request("POST", `/parent/sos/${id}/resolve`, {}),

  teacherDashboard: (scope) => request("GET", `/teacher/dashboard?${query({ scope })}`),
  saveSettings: (body) => request("POST", "/teacher/settings", body),
  saveAdvisory: (gradeSection) => request("POST", "/teacher/advisory", { gradeSection }),
  teacherScan: (text) => request("POST", "/teacher/scan", { text }),
  research: (range) => request("GET", `/teacher/research?${query(range)}`),
  cameraView: (device) => request("GET", `/teacher/camera?${query({ device })}`),

  pushKey: () => request("GET", "/push/key"),
  pushSubscribe: (subscription) => request("POST", "/push/subscribe", subscription),
  pushUnsubscribe: (endpoint) => request("POST", "/push/unsubscribe", { endpoint }),
};

export function researchExportUrl(type, range) {
  return `/api/teacher/research/export?${query({ type, ...range })}`;
}
