# Système de certification académique sur blockchain

Smart contract `CertificateRegistry` (Hardhat) + frontend React/Vite (wagmi, viem, SheetJS).

```
cert-registry/
├── contracts/CertificateRegistry.sol
├── test/CertificateRegistry.test.js
├── scripts/deploy.js            # déploie et met à jour frontend/src/deployments.json
├── sample/etudiants.xlsx        # 12 étudiants valides
├── sample/etudiants_avec_erreurs.xlsx   # pour tester la validation côté client
└── frontend/                    # zone administrateur + zone publique
```

## Prérequis
Node.js 18+ et le wallet MetaMask (ou tout wallet injecté dans le navigateur).

## 1. Installation et tests
```bash
npm install
npx hardhat test
```

## 2. Déploiement local (Hardhat)
```bash
# terminal 1 : blockchain locale (affiche 20 comptes de test avec leurs clés)
npx hardhat node

# terminal 2 : déploiement
npm run deploy:local
```
Le script écrit l'adresse du contrat dans `frontend/src/deployments.json` (clé 31337).
Le compte qui déploie (compte #0) est l'**owner** : il peut émettre des certificats.

Dans MetaMask : ajouter le réseau `http://127.0.0.1:8545`, chain ID `31337`, puis importer la
clé privée du compte #0 affichée par `hardhat node` (**compte de test uniquement**).

## 3. Frontend
```bash
cd frontend
npm install
npm run dev        # http://localhost:5173
```
- **Vérifier un certificat** : saisir un identifiant (1, 2…). Aucun wallet requis. Un lien partageable : `/?id=1`.
- **Administration** : connecter le wallet, puis
  - *Émettre un certificat* : formulaire unitaire ;
  - *Importer un fichier Excel* : choisir `sample/etudiants.xlsx`, vérifier l'aperçu, cocher les lignes, choisir
    la taille des lots (5 à 20) et émettre. Le hash de chaque transaction et les erreurs s'affichent.
    Avec `etudiants_avec_erreurs.xlsx`, les lignes invalides sont signalées et non sélectionnables.

## 4. Déploiement sur Sepolia
```bash
cp .env.example .env     # renseigner SEPOLIA_RPC_URL et DEPLOYER_PRIVATE_KEY (compte de test avec des ETH Sepolia)
npm run deploy:sepolia
```
`deployments.json` reçoit l'adresse sous la clé 11155111. Dans le frontend, choisir le réseau Sepolia.
Optionnel : `VITE_SEPOLIA_RPC_URL` dans `frontend/.env` pour utiliser votre propre RPC.

## Choix techniques
- **Autorisations** : `owner` + mapping `admins` (`setAdmin`, réservé à l'owner).
- **Anti-doublon** : un même `studentId` ne peut pas recevoir deux fois le même diplôme
  (clé `keccak256(studentId, diplomaTitle)`). Pour un seul certificat par étudiant, hasher `studentId` seul.
- **Batch** : limité à 20 certificats par transaction (coût en gas) ; atomique (un doublon annule le lot).
  Le frontend découpe l'import en lots et écarte les lignes déjà émises (`isIssued`) avant d'envoyer.
- **Validation client** : colonnes obligatoires, date ISO, adresse valide, doublons dans le fichier.
- **Sécurité** : aucune clé privée dans le frontend ; `.env` ignoré par Git.
- **Lecture** : `getCertificate`, `isIssued` sont des fonctions `view` (gratuites, sans transaction).

## Livrables à compléter
- Adresse du contrat déployé : `0x…` (réseau : …)
- Capture d'écran d'un mint réussi : à ajouter dans `docs/`
