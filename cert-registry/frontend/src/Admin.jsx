import { useMemo, useState } from "react";
import {
  useAccount, useConnect, useDisconnect, useChainId, useSwitchChain,
  useReadContract, useWriteContract, usePublicClient,
} from "wagmi";
import { parseEventLogs } from "viem";
import { abi, contractAddress } from "./contract";
import { parseFile, validateRow, toRecipient } from "./excel";

const EMPTY = { studentName: "", studentId: "", diplomaTitle: "", issueDate: "", recipientAddress: "", grade: "" };
const explorer = (chainId, hash) => (chainId === 11155111 ? `https://sepolia.etherscan.io/tx/${hash}` : null);
const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "");
const errText = (e) => e?.shortMessage || e?.message || String(e);

export default function Admin() {
  const { address: account, isConnected } = useAccount();
  const { connectors, connect, isPending: connecting } = useConnect();
  const { disconnect } = useDisconnect();
  const { chains, switchChain } = useSwitchChain();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const contract = contractAddress(chainId);

  const { data: owner } = useReadContract({ address: contract, abi, functionName: "owner", query: { enabled: !!contract } });
  const { data: isAdmin } = useReadContract({
    address: contract, abi, functionName: "admins", args: [account],
    query: { enabled: !!contract && !!account },
  });
  const authorized = !!account && (owner?.toLowerCase() === account.toLowerCase() || isAdmin === true);
  const ready = isConnected && !!contract && authorized;

  async function send(functionName, args) {
    const hash = await writeContractAsync({ address: contract, abi, functionName, args });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`Transaction échouée (${hash})`);
    const certIds = parseEventLogs({ abi, logs: receipt.logs, eventName: "CertificateMinted" }).map((l) => l.args.certId.toString());
    return { hash, certIds };
  }

  /* ---------- Mint unitaire ---------- */
  const [form, setForm] = useState(EMPTY);
  const [unit, setUnit] = useState({ status: "idle" });
  const formErrors = useMemo(() => validateRow(form), [form]);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function mintOne(e) {
    e.preventDefault();
    if (formErrors.length) return setUnit({ status: "error", message: formErrors.join(" · ") });
    setUnit({ status: "pending" });
    try {
      const f = { ...form };
      const { hash, certIds } = await send("mintCertificate", [toRecipient(f), f.studentName, f.studentId, f.diplomaTitle, f.issueDate, f.grade]);
      setUnit({ status: "ok", hash, certId: certIds[0] });
      setForm(EMPTY);
    } catch (err) {
      setUnit({ status: "error", message: errText(err) });
    }
  }

  /* ---------- Import Excel ---------- */
  const [rows, setRows] = useState([]);
  const [fileError, setFileError] = useState("");
  const [selected, setSelected] = useState(new Set());
  const [chunkSize, setChunkSize] = useState(10);
  const [log, setLog] = useState([]);
  const [issued, setIssued] = useState({}); // ligne Excel -> certId
  const [busy, setBusy] = useState(false);

  async function onFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileError(""); setLog([]); setIssued({});
    try {
      const parsed = await parseFile(file);
      setRows(parsed);
      setSelected(new Set(parsed.filter((r) => !r.errors.length).map((r) => r.line)));
    } catch (err) {
      setRows([]); setSelected(new Set()); setFileError(errText(err));
    }
    e.target.value = "";
  }

  const toggle = (line) => {
    const s = new Set(selected);
    s.has(line) ? s.delete(line) : s.add(line);
    setSelected(s);
  };
  const validPending = rows.filter((r) => !r.errors.length && !issued[r.line]);
  const chosen = validPending.filter((r) => selected.has(r.line));

  async function sendBatch() {
    setBusy(true);
    const entries = [];
    const push = (e) => { entries.push(e); setLog([...entries]); return entries.length - 1; };
    const patch = (i, p) => { entries[i] = { ...entries[i], ...p }; setLog([...entries]); };
    try {
      // Évite de gaspiller du gas : on écarte ce qui est déjà émis on-chain.
      const flags = await Promise.all(chosen.map((r) =>
        publicClient.readContract({ address: contract, abi, functionName: "isIssued", args: [r.row.studentId, r.row.diplomaTitle] })));
      const todo = chosen.filter((_, i) => !flags[i]);
      const skipped = chosen.filter((_, i) => flags[i]);
      if (skipped.length) push({ label: `${skipped.length} ligne(s) ignorée(s)`, status: "error", error: `Déjà émises sur la blockchain : lignes ${skipped.map((r) => r.line).join(", ")}` });

      for (let i = 0; i < todo.length; i += chunkSize) {
        const part = todo.slice(i, i + chunkSize);
        const idx = push({ label: `Lot ${i / chunkSize + 1} (${part.length} certificats)`, status: "pending" });
        try {
          const col = (k) => part.map((r) => r.row[k]);
          const { hash, certIds } = await send("batchMint", [
            part.map((r) => toRecipient(r.row)), col("studentName"), col("studentId"), col("diplomaTitle"), col("issueDate"), col("grade"),
          ]);
          patch(idx, { status: "ok", hash, certIds });
          setIssued((prev) => ({ ...prev, ...Object.fromEntries(part.map((r, k) => [r.line, certIds[k]])) }));
        } catch (err) {
          patch(idx, { status: "error", error: errText(err) });
          break; // on s'arrête au premier lot en échec
        }
      }
    } catch (err) {
      push({ label: "Vérification préalable", status: "error", error: errText(err) });
    }
    setBusy(false);
  }

  return (
    <div className="stack">
      <h2>Administration</h2>

      <section className="panel">
        {!isConnected ? (
          <div className="row">
            <p className="grow">Connectez un wallet autorisé à émettre des certificats.</p>
            {connectors.map((c) => (
              <button key={c.uid} className="primary" disabled={connecting} onClick={() => connect({ connector: c })}>Connecter {c.name}</button>
            ))}
          </div>
        ) : (
          <div className="row">
            <p className="grow">
              <span className="mono">{short(account)}</span> · {authorized ? "compte autorisé" : "compte non autorisé"}
            </p>
            <label>Réseau
              <select value={chainId} onChange={(e) => switchChain({ chainId: Number(e.target.value) })}>
                {chains.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <button onClick={() => disconnect()}>Déconnecter</button>
          </div>
        )}
        {isConnected && !contract && <p className="msg err">Aucun contrat déployé sur ce réseau. Lancez le déploiement, puis rechargez la page.</p>}
        {isConnected && contract && owner && !authorized && <p className="msg err">Ce compte n’est ni owner ni admin du contrat : l’émission est désactivée.</p>}
        {contract && <p className="muted mono small">Contrat : {contract}</p>}
      </section>

      <section className="panel">
        <h3>Émettre un certificat</h3>
        <form className="grid" onSubmit={mintOne}>
          <label>Nom complet<input value={form.studentName} onChange={set("studentName")} /></label>
          <label>Identifiant étudiant (CNE)<input value={form.studentId} onChange={set("studentId")} /></label>
          <label>Diplôme<input value={form.diplomaTitle} onChange={set("diplomaTitle")} /></label>
          <label>Date d’émission<input type="date" value={form.issueDate} onChange={set("issueDate")} /></label>
          <label>Adresse wallet (facultatif)<input value={form.recipientAddress} onChange={set("recipientAddress")} placeholder="0x…" /></label>
          <label>Mention<input value={form.grade} onChange={set("grade")} /></label>
          <div className="full row">
            <button className="primary" disabled={!ready || unit.status === "pending"}>
              {unit.status === "pending" ? "Émission en cours…" : "Émettre le certificat"}
            </button>
            {formErrors.length > 0 && form.studentId && <span className="muted small">{formErrors.join(" · ")}</span>}
          </div>
        </form>
        {unit.status === "ok" && (
          <p className="msg ok">Certificat n° <b>{unit.certId}</b> émis. Transaction : <TxLink chainId={chainId} hash={unit.hash} /></p>
        )}
        {unit.status === "error" && <p className="msg err" role="alert">{unit.message}</p>}
      </section>

      <section className="panel">
        <h3>Importer un fichier Excel</h3>
        <p className="muted">Colonnes : studentName, studentId, diplomaTitle, issueDate (AAAA-MM-JJ), recipientAddress (facultatif), grade. Formats .xlsx, .xls ou .csv.</p>
        <input type="file" accept=".xlsx,.xls,.csv" onChange={onFile} />
        {fileError && <p className="msg err" role="alert">{fileError}</p>}

        {rows.length > 0 && (
          <>
            <div className="row bar">
              <span>{rows.length} lignes · {rows.filter((r) => r.errors.length).length} en erreur · {chosen.length} sélectionnée(s)</span>
              <span className="grow" />
              <button onClick={() => setSelected(new Set(validPending.map((r) => r.line)))}>Tout sélectionner</button>
              <button onClick={() => setSelected(new Set())}>Tout désélectionner</button>
            </div>
            <div className="scroll">
              <table>
                <thead><tr><th></th><th>Ligne</th><th>Nom</th><th>Identifiant</th><th>Diplôme</th><th>Date</th><th>Wallet</th><th>Mention</th><th>Statut</th></tr></thead>
                <tbody>
                  {rows.map(({ line, row, errors }) => (
                    <tr key={line} className={errors.length ? "bad" : issued[line] ? "done" : ""}>
                      <td><input type="checkbox" aria-label={`Sélectionner la ligne ${line}`} checked={selected.has(line)} disabled={errors.length > 0 || !!issued[line]} onChange={() => toggle(line)} /></td>
                      <td>{line}</td><td>{row.studentName}</td><td>{row.studentId}</td><td>{row.diplomaTitle}</td>
                      <td>{row.issueDate}</td><td className="mono">{short(row.recipientAddress) || "—"}</td><td>{row.grade}</td>
                      <td>{errors.length ? errors.join(" ; ") : issued[line] ? `Émis · n° ${issued[line]}` : "Prêt"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="row">
              <label>Certificats par transaction
                <select value={chunkSize} onChange={(e) => setChunkSize(Number(e.target.value))}>
                  {[5, 10, 15, 20].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
              <button className="primary" disabled={!ready || busy || chosen.length === 0} onClick={sendBatch}>
                {busy ? "Émission en cours…" : `Émettre ${chosen.length} certificat(s)`}
              </button>
            </div>
          </>
        )}

        {log.length > 0 && (
          <ul className="log">
            {log.map((l, i) => (
              <li key={i} className={l.status}>
                <b>{l.label}</b>
                {l.status === "pending" && " — en attente de confirmation…"}
                {l.status === "ok" && <> — émis (n° {l.certIds.join(", ")}) · <TxLink chainId={chainId} hash={l.hash} /></>}
                {l.status === "error" && <> — {l.error}</>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function TxLink({ chainId, hash }) {
  const url = explorer(chainId, hash);
  return url
    ? <a href={url} target="_blank" rel="noreferrer" className="mono">{hash}</a>
    : <span className="mono">{hash}</span>;
}
