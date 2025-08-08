(define-data-var admin principal tx-sender)
(define-data-var paused bool false)

(define-map access-policies
  { policy-id: (string-ascii 64) }
  {
    verifier: principal,
    credential-type: (string-ascii 64),
    user: (optional principal),
    is-allowed: bool
  }
)

(define-map verifier-events
  { verifier: principal, credential-type: (string-ascii 64) }
  (list 100 (string-ascii 64))
)

(define-constant ERR-NOT-AUTHORIZED (err u100))
(define-constant ERR-PAUSED (err u101))

(define-private (check-admin)
  (if (is-eq tx-sender (var-get admin))
      true
      (err ERR-NOT-AUTHORIZED))
)

(define-read-only (is-paused) (var-get paused))

(define-public (set-paused (p bool))
  (begin
    (try! (check-admin))
    (var-set paused p)
    (ok true)
  )
)

(define-read-only (get-policy (policy-id (string-ascii 64)))
  (map-get access-policies { policy-id: policy-id })
)

(define-public (set-access-policy
  (policy-id (string-ascii 64))
  (verifier principal)
  (credential-type (string-ascii 64))
  (user (optional principal))
  (is-allowed bool)
)
  (begin
    ;; Inline check-not-paused
    (if (var-get paused)
        (err ERR-PAUSED)
        (ok true)
    )

    ;; Only verifier or admin can set policy
    (if (or (is-eq tx-sender verifier) (is-eq tx-sender (var-get admin)))
        (ok true)
        (err ERR-NOT-AUTHORIZED)
    )

    ;; Save policy
    (map-set access-policies
      { policy-id: policy-id }
      {
        verifier: verifier,
        credential-type: credential-type,
        user: user,
        is-allowed: is-allowed
      }
    )

    ;; Update verifier-events
    (let (
      (events (default-to (list) (map-get verifier-events { verifier: verifier, credential-type: credential-type })))
      (updated-events (append events (list policy-id)))
    )
      (map-set verifier-events
        { verifier: verifier, credential-type: credential-type }
        (take 100 updated-events)
      )
    )

    (try! (emit-event policy-id verifier credential-type user "set-policy"))
    (ok true)
  )
)

(define-read-only (check-access
  (verifier principal)
  (credential-type (string-ascii 64))
  (user principal)
)
  (let (
    (entries (filter
      (lambda (item)
        (let ((u (get user item)))
          (and
            (is-eq (get verifier item) verifier)
            (is-eq (get credential-type item) credential-type)
            (or (is-none u) (is-eq (unwrap! u (err u110)) user))
          )
        )
      )
      (map-to-list access-policies)
    ))
  )
    (if (is-eq (len entries) u0)
        (ok false)
        (ok (get is-allowed (nth 0 entries)))
    )
  )
)

(define-read-only (generate-policy-ids)
  (map-to-list access-policies)
)

(define-read-only (get-verifier-events (verifier principal) (credential-type (string-ascii 64)))
  (default-to (list) (map-get verifier-events { verifier: verifier, credential-type: credential-type }))
)
