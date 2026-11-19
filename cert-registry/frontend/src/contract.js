import { parseAbi } from "viem";
import deployments from "./deployments.json";

export const abi = parseAbi([
  "function owner() view returns (address)",
  "function admins(address) view returns (bool)",
  "function nextCertId() view returns (uint256)",
  "function isIssued(string studentId, string diplomaTitle) view returns (bool)",
  "function getCertificate(uint256 certId) view returns ((string studentName, string studentId, string diplomaTitle, string issueDate, string grade, address recipient, bool revoked))",
  "function mintCertificate(address to, string studentName, string studentId, string diplomaTitle, string issueDate, string grade) returns (uint256)",
  "function batchMint(address[] recipients, string[] studentNames, string[] studentIds, string[] diplomaTitles, string[] issueDates, string[] grades)",
  "function revoke(uint256 certId)",
  "event CertificateMinted(uint256 indexed certId, address indexed recipient, string studentId, string diplomaTitle)",
  "event CertificateRevoked(uint256 indexed certId)",
]);

/** Adresse du contrat pour un réseau : deployments.json (écrit par le script de déploiement)
 *  ou, à défaut, VITE_CONTRACT_ADDRESS. */
export function contractAddress(chainId) {
  return deployments[String(chainId)] || import.meta.env.VITE_CONTRACT_ADDRESS || undefined;
}
