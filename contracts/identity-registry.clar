;; identity-registry.clar
;; Clarity v2
;; Manages decentralized identifier (DID) registration for IDWeaver SSI system

;; Constants for error codes
(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-INVALID-DID u101)
(define-constant ERR-ALREADY-REGISTERED u102)
(define-constant ERR-NOT-REGISTERED u103)
(define-constant ERR-ZERO-ADDRESS u104)
(define-constant ERR-INVALID-TIMESTAMP u105)
(define-constant ERR-DID-TOO-LONG u106)
(define-constant ERR-PAUSED u107)
(define-constant MAX-DID-LENGTH u256)

;; Admin and contract state
(define-data-var contract-admin principal tx-sender)
(define-data-var is-paused bool false)
(define-data-var registration-count uint u0)

;; DID registry: principal -> DID data
(define-map did-registry
  { user: principal }
  { did: (string-ascii 256), registered-at: uint, last-updated: uint })

;; Reverse lookup: DID -> principal
(define-map did-to-principal
  { did: (string-ascii 256) }
  { user: principal })

;; Event logs
(define-data-var last-event-id uint u0)
(define-map events
  { event-id: uint }
  { user: principal, did: (string-ascii 256), event-type: (string-ascii 32), timestamp: uint })

;; Private: check admin
(define-private (is-admin)
  (is-eq tx-sender (var-get contract-admin)))

;; Private: validate DID format
(define-private (is-valid-did (did (string-ascii 256)))
  (and
    (> (len did) u0)
    (<= (len did) MAX-DID-LENGTH)
    (is-some (index-of did ":"))
    (not (is-eq did ""))))

;; Private: emit event
(define-private (emit-event (user principal) (did (string-ascii 256)) (event-type (string-ascii 32)))
  (let ((event-id (+ (var-get last-event-id) u1)))
    (map-set events
      { event-id: event-id }
      { user: user, did: did, event-type: event-type, timestamp: block-height })
    (var-set last-event-id event-id)
    (print { event: event-type, user: user, did: did, event-id: event-id, block-height: block-height })
    (ok event-id)))

;; Admin: transfer ownership
(define-public (transfer-admin (new-admin principal))
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (asserts! (not (is-eq new-admin 'SP000000000000000000002Q6VF78)) (err ERR-ZERO-ADDRESS))
    (var-set contract-admin new-admin)
    (ok true)))

;; Admin: pause/unpause
(define-public (set-paused (pause bool))
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (var-set is-paused pause)
    (ok pause)))

;; Public: register DID
(define-public (register-did (did (string-ascii 256)))
  (begin
    (asserts! (not (var-get is-paused)) (err ERR-PAUSED))
    (asserts! (is-valid-did did) (err ERR-INVALID-DID))
    (asserts! (is-none (map-get? did-registry { user: tx-sender })) (err ERR-ALREADY-REGISTERED))
    (asserts! (is-none (map-get? did-to-principal { did: did })) (err ERR-ALREADY-REGISTERED))
    (asserts! (> block-height u0) (err ERR-INVALID-TIMESTAMP))
    (map-set did-registry
      { user: tx-sender }
      { did: did, registered-at: block-height, last-updated: block-height })
    (map-set did-to-principal
      { did: did }
      { user: tx-sender })
    (var-set registration-count (+ (var-get registration-count) u1))
    (try! (emit-event tx-sender did "register"))
    (ok true)))

;; Public: update DID
(define-public (update-did (new-did (string-ascii 256)))
  (begin
    (asserts! (not (var-get is-paused)) (err ERR-PAUSED))
    (asserts! (is-valid-did new-did) (err ERR-INVALID-DID))
    (let ((current-entry (map-get? did-registry { user: tx-sender })))
      (asserts! (is-some current-entry) (err ERR-NOT-REGISTERED))
      (asserts! (is-none (map-get? did-to-principal { did: new-did })) (err ERR-ALREADY-REGISTERED))
      (let ((old-did (get did (unwrap! current-entry (err ERR-NOT-REGISTERED)))))
        (map-delete did-to-principal { did: old-did })
        (map-set did-registry
          { user: tx-sender }
          { did: new-did, registered-at: (get registered-at (unwrap! current-entry (err ERR-NOT-REGISTERED))), last-updated: block-height })
        (map-set did-to-principal
          { did: new-did }
          { user: tx-sender })
        (try! (emit-event tx-sender new-did "update"))
        (ok true)))))

;; Public: deactivate DID
(define-public (deactivate-did)
  (begin
    (asserts! (not (var-get is-paused)) (err ERR-PAUSED))
    (let ((current-entry (map-get? did-registry { user: tx-sender })))
      (asserts! (is-some current-entry) (err ERR-NOT-REGISTERED))
      (let ((did (get did (unwrap! current-entry (err ERR-NOT-REGISTERED)))))
        (map-delete did-registry { user: tx-sender })
        (map-delete did-to-principal { did: did })
        (var-set registration-count (- (var-get registration-count) u1))
        (try! (emit-event tx-sender did "deactivate"))
        (ok true)))))

;; Read-only: DID for a principal
(define-read-only (get-did (user principal))
  (match (map-get? did-registry { user: user })
    entry (ok (get did entry))
    (err ERR-NOT-REGISTERED)))

;; Read-only: Principal for a DID
(define-read-only (get-principal (did (string-ascii 256)))
  (match (map-get? did-to-principal { did: did })
    entry (ok (get user entry))
    (err ERR-NOT-REGISTERED)))

;; Read-only: Full registration
(define-read-only (get-registration-details (user principal))
  (match (map-get? did-registry { user: user })
    entry (ok entry)
    (err ERR-NOT-REGISTERED)))

;; Read-only: Count
(define-read-only (get-registration-count)
  (ok (var-get registration-count)))

;; Read-only: Admin
(define-read-only (get-admin)
  (ok (var-get contract-admin)))

;; Read-only: Event by ID
(define-read-only (get-event (event-id uint))
  (match (map-get? events { event-id: event-id })
    event (ok event)
    (err u404)))
