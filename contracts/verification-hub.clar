(define-data-var is-paused bool false)

(define-map verifications
  { proof-hash: (string-ascii 64) }
  { verifier: principal,
    user: principal,
    credential-hash: (string-ascii 64),
    submitted-at: uint,
    is-verified: bool })

(define-map trusted-issuers
  principal
  bool)

(define-constant ERR-PAUSED u100)
(define-constant ERR-NOT-AUTHORIZED u101)
(define-constant ERR-ALREADY-SUBMITTED u102)
(define-constant ERR-INVALID-CREDENTIAL u103)
(define-constant ERR-NOT-FOUND u104)
(define-constant ERR-NOT-TRUSTED_ISSUER u105)

(define-event submit-proof (verifier principal) (user principal) (proof-hash (string-ascii 64)) (credential-hash (string-ascii 64)) (action (string-ascii 32)))
(define-event verify-proof (verifier principal) (user principal) (proof-hash (string-ascii 64)) (credential-hash (string-ascii 64)) (action (string-ascii 32)))

(define-public (set-paused (pause bool))
  (begin
    (asserts! (is-eq tx-sender (as-contract tx-sender)) (err ERR-NOT-AUTHORIZED))
    (var-set is-paused pause)
    (ok true)))

(define-public (add-trusted-issuer (issuer principal))
  (begin
    (asserts! (is-eq tx-sender (as-contract tx-sender)) (err ERR-NOT-AUTHORIZED))
    (map-set trusted-issuers issuer true)
    (ok true)))

(define-public (remove-trusted-issuer (issuer principal))
  (begin
    (asserts! (is-eq tx-sender (as-contract tx-sender)) (err ERR-NOT-AUTHORIZED))
    (map-delete trusted-issuers issuer)
    (ok true)))

(define-public (submit-proof (proof-hash (string-ascii 64)) (credential-hash (string-ascii 64)) (verifier principal))
  (begin
    (asserts! (not (var-get is-paused)) (err ERR-PAUSED))
    (match (map-get verifications { proof-hash: proof-hash })
      some-proof (err ERR-ALREADY-SUBMITTED)
      none (ok true))
    (match (contract-call? verifier get-issuer) ;; expects `get-issuer` to return principal
      issuer
        (begin
          (match (map-get trusted-issuers issuer)
            some true
              (begin
                (match (contract-call? issuer is-credential-valid credential-hash)
                  is-valid (if is-valid
                    (begin
                      (map-set verifications { proof-hash: proof-hash }
                        { verifier: verifier,
                          user: tx-sender,
                          credential-hash: credential-hash,
                          submitted-at: block-height,
                          is-verified: false })
                      (try! (emit-event verifier tx-sender proof-hash credential-hash "submit"))
                      (ok true))
                    (err ERR-INVALID-CREDENTIAL))
                  result (err ERR-INVALID-CREDENTIAL)))
            none (err ERR-NOT-TRUSTED_ISSUER)))
      result (err ERR-NOT-FOUND))))

(define-public (mark-proof-verified (proof-hash (string-ascii 64)))
  (begin
    (asserts! (not (var-get is-paused)) (err ERR-PAUSED))
    (match (map-get verifications { proof-hash: proof-hash })
      some proof-data
        (if (is-eq (get verifier proof-data) tx-sender)
          (let ((user (get user proof-data))
                (cred-hash (get credential-hash proof-data)))
            (map-set verifications { proof-hash: proof-hash }
              (merge proof-data { is-verified: true }))
            (try! (emit-event tx-sender user proof-hash cred-hash "verify"))
            (ok true))
          (err ERR-NOT-AUTHORIZED))
      none (err ERR-NOT-FOUND))))

(define-read-only (get-verification (proof-hash (string-ascii 64)))
  (match (map-get verifications { proof-hash: proof-hash })
    some proof-data (ok proof-data)
    none (err ERR-NOT-FOUND)))
