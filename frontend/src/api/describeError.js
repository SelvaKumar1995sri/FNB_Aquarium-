export function describeError(error, fallback) {
  const data = error.response?.data;
  if (data && typeof data === "object") {
    if (typeof data.detail === "string") return data.detail;
    const detail = Object.values(data).flat().filter(Boolean).join(" ");
    if (detail) return detail;
  }
  return fallback;
}
