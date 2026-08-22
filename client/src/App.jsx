import { useState, useEffect } from "react";
import TitanSMS from "./components/TitanSMS";
import Login from "./components/Login";
import { getToken, logout } from "./api";

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

  return <TitanSMS onLogout={() => { logout(); setAuthed(false); }} />;
}
