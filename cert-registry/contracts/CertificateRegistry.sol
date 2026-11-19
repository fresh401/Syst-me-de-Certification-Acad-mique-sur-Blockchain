// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title CertificateRegistry - registre de certificats académiques on-chain
/// @notice Seuls le owner et les admins peuvent émettre ; la lecture est publique.
contract CertificateRegistry {
    struct Certificate {
        string studentName;
        string studentId;
        string diplomaTitle;
        string issueDate;
        string grade;
        address recipient;
        bool revoked;
    }

    uint256 public constant MAX_BATCH = 20;

    address public owner;
    mapping(address => bool) public admins;

    uint256 public nextCertId = 1;
    mapping(uint256 => Certificate) private certificates;
    // hash(studentId, diplomaTitle) => déjà émis ?
    mapping(bytes32 => bool) private issued;

    event CertificateMinted(
        uint256 indexed certId,
        address indexed recipient,
        string studentId,
        string diplomaTitle
    );
    event CertificateRevoked(uint256 indexed certId);
    event AdminUpdated(address indexed admin, bool allowed);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    modifier onlyAdmin() {
        require(msg.sender == owner || admins[msg.sender], "Not authorized");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function setAdmin(address admin, bool allowed) external onlyOwner {
        admins[admin] = allowed;
        emit AdminUpdated(admin, allowed);
    }

    function mintCertificate(
        address to,
        string calldata studentName,
        string calldata studentId,
        string calldata diplomaTitle,
        string calldata issueDate,
        string calldata grade
    ) external onlyAdmin returns (uint256 certId) {
        certId = _mint(to, studentName, studentId, diplomaTitle, issueDate, grade);
    }

    function batchMint(
        address[] calldata recipients,
        string[] calldata studentNames,
        string[] calldata studentIds,
        string[] calldata diplomaTitles,
        string[] calldata issueDates,
        string[] calldata grades
    ) external onlyAdmin {
        uint256 n = studentIds.length;
        require(n > 0 && n <= MAX_BATCH, "Batch size must be 1-20");
        require(
            recipients.length == n &&
                studentNames.length == n &&
                diplomaTitles.length == n &&
                issueDates.length == n &&
                grades.length == n,
            "Length mismatch"
        );
        for (uint256 i = 0; i < n; i++) {
            _mint(recipients[i], studentNames[i], studentIds[i], diplomaTitles[i], issueDates[i], grades[i]);
        }
    }

    function revoke(uint256 certId) external onlyAdmin {
        require(_exists(certId), "Unknown certificate");
        require(!certificates[certId].revoked, "Already revoked");
        certificates[certId].revoked = true;
        emit CertificateRevoked(certId);
    }

    function getCertificate(uint256 certId) external view returns (Certificate memory) {
        require(_exists(certId), "Unknown certificate");
        return certificates[certId];
    }

    /// @notice Vrai si ce diplôme a déjà été émis pour ce studentId.
    function isIssued(string calldata studentId, string calldata diplomaTitle) external view returns (bool) {
        return issued[keccak256(abi.encode(studentId, diplomaTitle))];
    }

    function _exists(uint256 certId) internal view returns (bool) {
        return certId > 0 && certId < nextCertId;
    }

    function _mint(
        address to,
        string calldata studentName,
        string calldata studentId,
        string calldata diplomaTitle,
        string calldata issueDate,
        string calldata grade
    ) internal returns (uint256 certId) {
        require(bytes(studentId).length > 0, "Empty studentId");
        require(bytes(studentName).length > 0, "Empty studentName");
        bytes32 key = keccak256(abi.encode(studentId, diplomaTitle));
        require(!issued[key], "Certificate already issued");
        issued[key] = true;

        certId = nextCertId++;
        certificates[certId] = Certificate(studentName, studentId, diplomaTitle, issueDate, grade, to, false);
        emit CertificateMinted(certId, to, studentId, diplomaTitle);
    }
}
