import { useState, useEffect } from "react";
import TitanSMS from "./components/TitanSMS";
import OwnerSMS from "./components/OwnerSMS";
import Login from "./components/Login";
import { getToken, getRole, logout } from "./api";

export default function App() {
  const [authed, setAuthed] = useState(!!getToken());

  useEffect(() => {
    const handleLogout = () => setAuthed(false);
    window.addEventListener("auth:logout", handleLogout);
    return () => window.removeEventListener("auth:logout", handleLogout);
  }, []);

  if (!authed) {
    return <Login onSuccess={() => setAuthed(true)} />;
  }

  const handleLogout = () => { logout(); setAuthed(false); };

  // The owner gets the full console; admin and students_admin get the role-scoped one.
  if (getRole() === "owner") return <OwnerSMS onLogout={handleLogout} />;

  return <TitanSMS onLogout={handleLogout} />;
}
