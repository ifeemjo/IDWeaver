;; credential-issuer.clar
;; Clarity v2

(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-INVALID-HASH u101)
(define-constant ERR-NOT-WHITELISTED u102)
(define-constant ERR-ALREADY-ISSUED u103)
(define-constant ERR-NOT-ISSUED u104)
(define-constant ERR-ZERO-ADDRESS u105)
(define-constant ERR-INVALID-TIMESTAMP u106)
(define-constant ERR-PAUSED u107)
(define-constant ERR-ALREADY-WHITELISTED u108)
(define-constant ERR-NOT-WHITELISTED_ISSUER u109)
(define-constant MAX-HASH-LENGTH u64)

(define-data-var contract-admin principal tx-sender)
(define-data-var is-paused bool false)
(define-data-var credential-count uint u0)
(define-data-var last-event-id uint u0)

(define-map issuer-whitelist
  { issuer: principal }
  { is-whitelisted: bool })

(define-map credentials
  { credential-hash: (string-ascii 64) }
  {
    issuer: principal,
    issued-to: principal,
    issued-at: uint,
    expires-at: (optional uint),
    is-revoked: bool
  })

(define-map events
  { event-id: uint }
  {
    issuer: principal,
    credential-hash: (string-ascii 64),
    event-type: (string-ascii 32),
    timestamp: uint
  })

;; ---------- Helpers ----------

(define-private (is-admin)
  (is-eq tx-sender (var-get contract-admin)))

(define-private (is-valid-hash (hash (string-ascii 64)))
  (and (> (len hash) u0) (<= (len hash) MAX-HASH-LENGTH)))

(define-private (is-whitelisted (issuer principal))
  (default-to false (get is-whitelisted (map-get? issuer-whitelist { issuer: issuer }))))


(define-private (emit-event (issuer principal) (credential-hash (string-ascii 64)) (event-type (string-ascii 32)))
  (let ((event-id (+ (var-get last-event-id) u1)))
    (begin
      (map-set events
        { event-id: event-id }
        {
          issuer: issuer,
          credential-hash: credential-hash,
          event-type: event-type,
          timestamp: block-height
        })
      (var-set last-event-id event-id)
      (print { event: event-type, issuer: issuer, credential-hash: credential-hash, event-id: event-id, block-height: block-height })
      (ok event-id))))

;; ---------- Admin ----------

(define-public (transfer-admin (new-admin principal))
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (asserts! (not (is-eq new-admin 'SP000000000000000000002Q6VF78)) (err ERR-ZERO-ADDRESS))
    (var-set contract-admin new-admin)
    (ok true)))

(define-public (set-paused (pause bool))
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (var-set is-paused pause)
    (ok pause)))

;; ---------- Issuer Whitelist ----------

(define-public (add-issuer (issuer principal))
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (asserts! (not (is-eq issuer 'SP000000000000000000002Q6VF78)) (err ERR-ZERO-ADDRESS))
    (asserts! (not (is-whitelisted issuer)) (err ERR-ALREADY-WHITELISTED))
    (map-set issuer-whitelist { issuer: issuer } { is-whitelisted: true })
    (ok true)))

(define-public (remove-issuer (issuer principal))
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (asserts! (is-whitelisted issuer) (err ERR-NOT-WHITELISTED_ISSUER))
    (map-delete issuer-whitelist { issuer: issuer })
    (ok true)))

;; ---------- Credential Lifecycle ----------

(define-public (issue-credential (credential-hash (string-ascii 64)) (issued-to principal) (expires-at (optional uint)))
  (begin
    (asserts! (not (var-get is-paused)) (err ERR-PAUSED))
    (asserts! (is-whitelisted tx-sender) (err ERR-NOT-WHITELISTED))
    (asserts! (is-valid-hash credential-hash) (err ERR-INVALID-HASH))
    (asserts! (not (is-eq issued-to 'SP000000000000000000002Q6VF78)) (err ERR-ZERO-ADDRESS))
    (asserts! (is-none (map-get? credentials { credential-hash: credential-hash })) (err ERR-ALREADY-ISSUED))
    (asserts! (> block-height u0) (err ERR-INVALID-TIMESTAMP))
    (map-set credentials
      { credential-hash: credential-hash }
      {
        issuer: tx-sender,
        issued-to: issued-to,
        issued-at: block-height,
        expires-at: expires-at,
        is-revoked: false
      })
    (var-set credential-count (+ (var-get credential-count) u1))
    (try! (emit-event tx-sender credential-hash "issue"))
    (ok true)))

(define-public (revoke-credential (credential-hash (string-ascii 64)))
  (let ((maybe-credential (map-get? credentials { credential-hash: credential-hash })))
    (begin
      (asserts! (not (var-get is-paused)) (err ERR-PAUSED))
      (asserts! (is-whitelisted tx-sender) (err ERR-NOT-WHITELISTED))
      (asserts! (is-some maybe-credential) (err ERR-NOT-ISSUED))
      (let ((credential (unwrap! maybe-credential (err ERR-NOT-ISSUED))))
        (asserts! (is-eq (get issuer credential) tx-sender) (err ERR-NOT-AUTHORIZED))
        (asserts! (not (get is-revoked credential)) (err ERR-NOT-ISSUED))
        (map-set credentials
          { credential-hash: credential-hash }
          {
            issuer: (get issuer credential),
            issued-to: (get issued-to credential),
            issued-at: (get issued-at credential),
            expires-at: (get expires-at credential),
            is-revoked: true
          })
        (try! (emit-event tx-sender credential-hash "revoke"))
        (ok true)))))

;; ---------- Read-only ----------

(define-read-only (is-credential-valid (credential-hash (string-ascii 64)))
  (match (map-get? credentials { credential-hash: credential-hash })
    credential
      (ok (and
            (not (get is-revoked credential))
            (match (get expires-at credential)
              expiry (<= block-height expiry)
              true)))
    (err ERR-NOT-ISSUED)))

(define-read-only (get-credential-details (credential-hash (string-ascii 64)))
  (match (map-get? credentials { credential-hash: credential-hash })
    credential (ok credential)
    (err ERR-NOT-ISSUED)))

(define-read-only (get-issuer-status (issuer principal))
  (ok (is-whitelisted issuer)))

(define-read-only (get-credential-count)
  (ok (var-get credential-count)))

(define-read-only (get-admin)
  (ok (var-get contract-admin)))

(define-read-only (get-event (event-id uint))
  (match (map-get? events { event-id: event-id })
    event (ok event)
    (err u404)))

(define-read-only (get-issuer-events (issuer principal) (limit uint) (offset uint))
  (let ((ids (range offset (+ offset limit))))
    (ok (fold
          (lambda (id acc)
            (match (map-get? events { event-id: id })
              event
                (if (is-eq (get issuer event) issuer)
                    (cons event acc)
                    acc)
              acc))
          ids
          (list)))))
