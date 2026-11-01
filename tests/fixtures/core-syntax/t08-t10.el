;;; t08-t10.el --- T08 async, T09 JS interop, T10 ABI kernels -*- lexical-binding: t; no-byte-compile: t; -*-

;;;; case T08-01a
;;;; expect [42, true, true, true]
(require 'eliscript)
(defun-async compute-step (x)
  (+ x 10))
(defun-async pipeline-demo ()
  (let ((ch (make-async-channel 2))
        (cleaned nil))
    (await (channel-put! ch (await (compute-step 5))))
    (await (channel-put! ch 27))
    (channel-close! ch)
    (let ((v1 (option-value (await (channel-take! ch))))
          (v2 (option-value (await (channel-take! ch))))
          (v3 (await (channel-take! ch))))
      (let ((stale-handle nil))
        (with-async-scope (scope)
          (setq stale-handle (engine-bind (lambda (n) (* n 2)) scope))
          (unwind-protect
              (+ v1 v2)
            (setq cleaned t)))
        (list (+ v1 v2) (option-none-p v3) cleaned (engine-handle-p stale-handle))))))
(eliscript-async-wait (pipeline-demo))

;;;; case T08-01b
;;;; error await|async|eliscript-compile-error
(require 'eliscript)
(defun sync-caller (f)
  (await f))

;;;; case T08-01c
;;;; error eliscript-engine-handle-error|revoked
(require 'eliscript)
(let ((h (engine-bind (lambda (x) x))))
  (engine-revoke! h)
  (eliscript-async-wait (engine-call 'local h 10)))

;;;; case T09-01
;;;; expect [null, null, 42, true, true, true, true, null, 2, 2.5, 1, 2, "123", true]
(require 'eliscript)
(require 'eliscript-js)
(let ((obj (js-object :flag js-false :empty js-undefined :num 42)))
  (string-match "\\([a-z]+\\)" "hello123")
  (let ((before-match (match-string 1 "hello123"))
        (rx-res (js-regexp-find (js-regexp "([0-9]+)") "hello123"))
        (after-match (match-string 1 "hello123")))
    (list
     (js-get obj :flag)
     (js-get obj :empty)
     (js-get obj :num)
     (js-false-p (js-get-raw obj :flag))
     (js-undefined-p (js-get-raw obj :empty))
     (js-nullish-p js-null)
     (js-nullish-p js-undefined)
     (js-nullish-p js-false)
     (/ 5 2)
     (js-divide 5 2)
     (length "😀")
     (js-length "😀")
     (value-get rx-res :match)
     (equal before-match after-match))))

;;;; case T10-01a
;;;; expect [25.0, 305419897, 0]
(require 'eliscript)
(require 'eliscript-abi)
(defun hyp-sq (a b)
  (declare (eliscript :abi :numeric-f64
                      :export "hyp_sq"
                      :params ((a :f64) (b :f64))
                      :returns :f64))
  (+ (* a a) (* b b)))
(defun mem-checksum (offset)
  (declare (eliscript :abi :memory-u32
                      :export "mem_checksum"
                      :params ((offset :u32))
                      :returns :u32))
  (mem-store-u32 offset 305419896)
  (word-add (mem-load-u32 offset) 1))
(with-abi-memory (:initial-pages 1 :max-pages 4)
  (list (hyp-sq 3.0 4.0)
        (mem-checksum 64)
        (word-add #xffffffff 1)))

;;;; case T10-01b
;;;; error ELI-B0001|numeric-f64|eliscript-compile-error
(require 'eliscript)
(require 'eliscript-abi)
(defun bad-abi (x)
  (declare (eliscript :abi :numeric-f64))
  (list x))
