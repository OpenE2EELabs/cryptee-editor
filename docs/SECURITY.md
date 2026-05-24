# Security

## Protected Against

- Storage providers reading document content.
- Relay operators reading document edits.
- Network attackers modifying encrypted files without detection.
- Static hosting receiving file keys through HTTP requests.

## Not Protected Against

- Malicious browser extensions.
- Compromised devices.
- A malicious or compromised integrating application, which is inside the trust boundary.
- Traffic analysis at the relay.
- A compromised CDN or static host serving malicious editor code.

## Cryptography

Files use AES-256-GCM with a fresh 12-byte nonce per encryption. The serialized format is `nonce || ciphertext || tag`. After first import, the encrypted plaintext should be a `cryptee-office-session-v1` checkpoint rather than the original OOXML file. Collaboration derives a session key from `fileKey` and `sessionId` using HKDF-SHA-256 and encrypts ONLYOFFICE change patches before relay transport.

## Recommendations For Integrators

- Self-host and pin editor versions for production.
- Use SRI where your deployment model supports it.
- Keep signed URLs short-lived.
- Avoid logging fragments, keys, and full editor URLs.
- Audit the exact upstream artifacts you deploy.

## Vulnerability Disclosure

Report security issues privately through GitHub security advisories when enabled. Until a public contact is configured, do not file public issues for suspected vulnerabilities.
