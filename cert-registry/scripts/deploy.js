const fs = require("fs");
const path = require("path");
const { ethers, network } = require("hardhat");

async function main() {
  const registry = await ethers.deployContract("CertificateRegistry");
  await registry.waitForDeployment();
  const address = await registry.getAddress();
  const { chainId } = await ethers.provider.getNetwork();

  console.log(`CertificateRegistry déployé sur ${network.name} (chainId ${chainId}) : ${address}`);

  // Met à jour le frontend automatiquement
  const file = path.join(__dirname, "..", "frontend", "src", "deployments.json");
  const current = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
  current[String(chainId)] = address;
  fs.writeFileSync(file, JSON.stringify(current, null, 2));
  console.log("frontend/src/deployments.json mis à jour.");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
