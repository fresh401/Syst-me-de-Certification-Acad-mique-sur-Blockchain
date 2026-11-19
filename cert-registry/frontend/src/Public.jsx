import { useEffect, useState } from "react";
import { usePublicClient } from "wagmi";
import { zeroAddress } from "viem";
import { hardhat, sepolia } from "wagmi/chains";
import { abi, contractAddress } from "./contract";

const NETWORKS = [hardhat, sepolia];

export default function Public() {
  const initialId = new URLSearchParams(window.location.search).get("id") || "";
  const [chainId, setChainId] = useState(hardhat.id);
  const [certId, setCertId] = useState(initialId);
  const [state, setState] = useState({ status: "idle" });
  const client = usePublicClient({ chainId });
  const address = contractAddress(chainId);

  async function search(id = certId) {
    if (!/^\d+$/.test(id)) return setState({ status: "error", message: "Saisissez un identifiant numérique, par exemple 1." });
    if (!address) return setState({ status: "error", message: "Aucun contrat déployé sur ce réseau." });
    setState({ status: "loading" });
    try {
      const cert = await client.readContract({ address, abi, functionName: "getCertificate", args: [BigInt(id)] });
      setState({ status: "found", cert, id });
    } catch (e) {
      const msg = String(e.shortMessage || e.message);
      setState({
        status: "error",
        message: msg.includes("Unknown certificate")
          ? `Aucun certificat n’existe avec l’identifiant ${id}.`
          : `Lecture impossible : ${msg}`,
      });
    }
  }

  useEffect(() => { if (initialId) search(initialId); /* eslint-disable-next-line */ }, []);

  return (
    <section className="stack">
      <h2>Vérifier un certificat</h2>
      <p className="muted">La lecture se fait directement sur la blockchain : aucun wallet ni compte n’est nécessaire.</p>
      <form className="row" onSubmit={(e) => { e.preventDefault(); search(); }}>
        <label className="grow">Identifiant du certificat
          <input value={certId} onChange={(e) => setCertId(e.target.value.trim())} placeholder="1" inputMode="numeric" />
        </label>
        <label>Réseau
          <select value={chainId} onChange={(e) => setChainId(Number(e.target.value))}>
            {NETWORKS.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
          </select>
        </label>
        <button className="primary" disabled={state.status === "loading"}>Vérifier</button>
      </form>

      {state.status === "error" && <p className="msg err" role="alert">{state.message}</p>}

      {state.status === "found" && (
        <article className={`diploma ${state.cert.revoked ? "revoked" : ""}`}>
          <div className="seal">{state.cert.revoked ? "Révoqué" : "Valide"}</div>
          <p className="muted">Certificat n° {state.id}</p>
          <h3>{state.cert.studentName}</h3>
          <p className="title">{state.cert.diplomaTitle}</p>
          <dl>
            <div><dt>Date d’émission</dt><dd>{state.cert.issueDate}</dd></div>
            <div><dt>Mention</dt><dd>{state.cert.grade || "—"}</dd></div>
            <div><dt>Identifiant étudiant</dt><dd>{state.cert.studentId}</dd></div>
            <div><dt>Wallet du titulaire</dt><dd className="mono">{state.cert.recipient === zeroAddress ? "non renseigné" : state.cert.recipient}</dd></div>
          </dl>
          {state.cert.revoked && <p className="msg err">Ce certificat a été révoqué par l’établissement et n’est plus valable.</p>}
        </article>
      )}
    </section>
  );
}
