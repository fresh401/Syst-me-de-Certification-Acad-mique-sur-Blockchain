import { useState } from "react";
import Admin from "./Admin";
import Public from "./Public";

export default function App() {
  const [tab, setTab] = useState("public");
  return (
    <>
      <header className="top">
        <div className="wrap top-in">
          <h1>Registre des certificats</h1>
          <nav>
            <button className={tab === "public" ? "on" : ""} onClick={() => setTab("public")}>Vérifier un certificat</button>
            <button className={tab === "admin" ? "on" : ""} onClick={() => setTab("admin")}>Administration</button>
          </nav>
        </div>
      </header>
      <main className="wrap">{tab === "public" ? <Public /> : <Admin />}</main>
    </>
  );
}
