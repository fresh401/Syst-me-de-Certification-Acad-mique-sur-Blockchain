import * as XLSX from "xlsx";
import { isAddress, zeroAddress } from "viem";

export const REQUIRED = ["studentName", "studentId", "diplomaTitle", "issueDate"];
export const COLUMNS = ["studentName", "studentId", "diplomaTitle", "issueDate", "recipientAddress", "grade"];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function validIsoDate(s) {
  if (!ISO_DATE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** Valide une ligne ; retourne la liste des erreurs (vide = OK). */
export function validateRow(r) {
  const errors = [];
  for (const k of REQUIRED) if (!r[k]) errors.push(`${k} manquant`);
  if (r.issueDate && !validIsoDate(r.issueDate)) errors.push("issueDate doit être AAAA-MM-JJ");
  if (r.recipientAddress && !isAddress(r.recipientAddress)) errors.push("recipientAddress invalide");
  return errors;
}

/** Lit un .xlsx / .csv, vérifie les colonnes, valide chaque ligne. */
export async function parseFile(file) {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json(ws, { defval: "", raw: false, dateNF: "yyyy-mm-dd" });
  if (raw.length === 0) throw new Error("Le fichier est vide.");

  const headers = Object.keys(raw[0]);
  const missing = REQUIRED.filter((c) => !headers.includes(c));
  if (missing.length) throw new Error(`Colonnes manquantes : ${missing.join(", ")}`);

  const seen = new Set();
  return raw.map((line, i) => {
    const row = {};
    for (const c of COLUMNS) row[c] = String(line[c] ?? "").trim();
    const errors = validateRow(row);
    const key = `${row.studentId}|${row.diplomaTitle}`;
    if (row.studentId && seen.has(key)) errors.push("doublon dans le fichier (studentId + diplôme)");
    seen.add(key);
    return { line: i + 2, row, errors }; // line = numéro de ligne Excel (en-tête = 1)
  });
}

export const toRecipient = (r) => r.recipientAddress || zeroAddress;
