const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

async function deploy() {
  const [owner, admin, stranger, student] = await ethers.getSigners();
  const registry = await ethers.deployContract("CertificateRegistry");
  return { registry, owner, admin, stranger, student };
}

const sample = (id = "2023-INF-042", diploma = "Licence Informatique") => [
  "Amina Benali", id, diploma, "2026-06-15", "Mention Bien",
];

describe("CertificateRegistry", () => {
  it("l'owner peut émettre et lire un certificat", async () => {
    const { registry, student } = await loadFixture(deploy);
    await expect(registry.mintCertificate(student.address, ...sample()))
      .to.emit(registry, "CertificateMinted")
      .withArgs(1n, student.address, "2023-INF-042", "Licence Informatique");

    const c = await registry.getCertificate(1);
    expect(c.studentName).to.equal("Amina Benali");
    expect(c.recipient).to.equal(student.address);
    expect(c.revoked).to.equal(false);
  });

  it("refuse un compte non autorisé", async () => {
    const { registry, stranger, student } = await loadFixture(deploy);
    await expect(
      registry.connect(stranger).mintCertificate(student.address, ...sample())
    ).to.be.revertedWith("Not authorized");
  });

  it("un admin ajouté par l'owner peut émettre", async () => {
    const { registry, admin, student } = await loadFixture(deploy);
    await registry.setAdmin(admin.address, true);
    await expect(registry.connect(admin).mintCertificate(student.address, ...sample())).to.not.be.reverted;
  });

  it("seul l'owner peut gérer les admins", async () => {
    const { registry, stranger } = await loadFixture(deploy);
    await expect(registry.connect(stranger).setAdmin(stranger.address, true)).to.be.revertedWith("Only owner");
  });

  it("empêche le double enregistrement (même studentId + diplôme)", async () => {
    const { registry, student } = await loadFixture(deploy);
    await registry.mintCertificate(student.address, ...sample());
    await expect(registry.mintCertificate(student.address, ...sample())).to.be.revertedWith(
      "Certificate already issued"
    );
    expect(await registry.isIssued("2023-INF-042", "Licence Informatique")).to.equal(true);
    // autre diplôme pour le même étudiant : accepté
    await expect(registry.mintCertificate(student.address, ...sample("2023-INF-042", "Master IA"))).to.not.be.reverted;
  });

  it("refuse un studentId vide", async () => {
    const { registry, student } = await loadFixture(deploy);
    await expect(registry.mintCertificate(student.address, "A", "", "D", "2026-01-01", "")).to.be.revertedWith(
      "Empty studentId"
    );
  });

  it("batchMint émet plusieurs certificats", async () => {
    const { registry, student } = await loadFixture(deploy);
    const rows = [1, 2, 3].map((i) => sample(`ID-${i}`));
    await registry.batchMint(
      rows.map(() => student.address),
      rows.map((r) => r[0]), rows.map((r) => r[1]), rows.map((r) => r[2]),
      rows.map((r) => r[3]), rows.map((r) => r[4])
    );
    expect(await registry.nextCertId()).to.equal(4n);
    expect((await registry.getCertificate(3)).studentId).to.equal("ID-3");
  });

  it("batchMint vérifie les tailles et la limite", async () => {
    const { registry, student } = await loadFixture(deploy);
    await expect(
      registry.batchMint([student.address], ["A", "B"], ["1"], ["D"], ["d"], ["g"])
    ).to.be.revertedWith("Length mismatch");
    await expect(registry.batchMint([], [], [], [], [], [])).to.be.revertedWith("Batch size must be 1-20");
  });

  it("batchMint est atomique : un doublon annule tout le lot", async () => {
    const { registry, student } = await loadFixture(deploy);
    await registry.mintCertificate(student.address, ...sample("ID-2"));
    await expect(
      registry.batchMint(
        [student.address, student.address], ["A", "B"], ["ID-1", "ID-2"],
        ["Licence Informatique", "Licence Informatique"], ["d", "d"], ["g", "g"]
      )
    ).to.be.revertedWith("Certificate already issued");
    expect(await registry.nextCertId()).to.equal(2n);
  });

  it("révocation : met le statut à jour et émet l'event", async () => {
    const { registry, student, stranger } = await loadFixture(deploy);
    await registry.mintCertificate(student.address, ...sample());
    await expect(registry.connect(stranger).revoke(1)).to.be.revertedWith("Not authorized");
    await expect(registry.revoke(1)).to.emit(registry, "CertificateRevoked").withArgs(1n);
    expect((await registry.getCertificate(1)).revoked).to.equal(true);
    await expect(registry.revoke(1)).to.be.revertedWith("Already revoked");
  });

  it("getCertificate échoue pour un id inconnu", async () => {
    const { registry } = await loadFixture(deploy);
    await expect(registry.getCertificate(99)).to.be.revertedWith("Unknown certificate");
    await expect(registry.getCertificate(0)).to.be.revertedWith("Unknown certificate");
  });
});
