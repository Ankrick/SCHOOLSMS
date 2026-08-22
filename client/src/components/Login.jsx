import { useState } from "react";
import { login } from "../api";

const BRAND = {
  crimson: "#8B1A1A",
  gold: "#C9A961",
  cream: "#FAF6F0",
  charcoal: "#1A1A1A",
  white: "#FFFFFF",
  red: "#C62828",
  redLight: "#FFEBEE",
  border: "#E8E0D4",
  grey: "#9E9E9E",
};

const inputStyle = {
  width: "100%",
  padding: "10px 12px",
  border: `1px solid ${BRAND.border}`,
  borderRadius: 6,
  fontSize: 14,
  boxSizing: "border-box",
  fontFamily: "inherit",
};

export default function Login({ onSuccess }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(username, password);
      onSuccess();
    } catch (err) {
      setError(err.message || "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: BRAND.cream,
        fontFamily: "'Crimson Pro', 'Georgia', serif",
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          background: BRAND.white,
          border: `1px solid ${BRAND.border}`,
          borderRadius: 10,
          padding: "36px 32px",
          width: 340,
          boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
        }}
      >
        <div style={{ fontSize: 22, fontWeight: 700, color: BRAND.crimson, marginBottom: 4 }}>TITAN</div>
        <div style={{ fontSize: 12, color: BRAND.grey, marginBottom: 24, letterSpacing: "1px", textTransform: "uppercase" }}>
          Learning Center — Admin Login
        </div>

        {error && (
          <div style={{ background: BRAND.redLight, color: BRAND.red, padding: "10px 12px", borderRadius: 6, fontSize: 13, marginBottom: 16 }}>
            {error}
          </div>
        )}

        <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 6, color: BRAND.charcoal }}>Username</label>
        <input
          autoFocus
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          style={{ ...inputStyle, marginBottom: 16 }}
        />

        <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 6, color: BRAND.charcoal }}>Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{ ...inputStyle, marginBottom: 24 }}
        />

        <button
          type="submit"
          disabled={loading}
          style={{
            width: "100%",
            padding: "12px",
            background: BRAND.crimson,
            color: BRAND.white,
            border: "none",
            borderRadius: 6,
            fontSize: 14,
            fontWeight: 600,
            cursor: loading ? "default" : "pointer",
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? "Signing in…" : "Sign In"}
        </button>
      </form>
    </div>
  );
}
