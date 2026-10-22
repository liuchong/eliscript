;;; eliscript-abi.el --- WASM and Native zero-allocation numeric and linear-memory ABI -*- lexical-binding: t; -*-

;;; Commentary:

;; Implements `eliscript-abi` for Eliscript 0.1.0:
;; - Controlled linear memory simulation (`with-abi-memory`, `mem-load-*`, `mem-store-*`, `mem-size`, `mem-grow`)
;; - 32-bit unsigned modular word operations (`word-add`, `word-sub`, `word-mul`, `word-div`,
;;   `word-and`, `word-or`, `word-xor`, `word-shl`, `word-shr`)

;;; Code:

(require 'cl-lib)
(require 'eliscript-contract)

(defconst eliscript-abi--page-bytes 65536
  "Number of bytes per WebAssembly/ABI linear memory page (64 KiB).")

(defconst eliscript-abi--u32-mask #xffffffff
  "32-bit unsigned integer bitmask.")

(defvar eliscript-abi--memory-bytes nil
  "Active linear memory byte vector in `with-abi-memory'.")

(defvar eliscript-abi--max-pages nil
  "Maximum page count allowed in the active `with-abi-memory' scope.")

(defun eliscript-abi--ensure-bounds (offset byte-width)
  "Ensure `[OFFSET, OFFSET + BYTE-WIDTH)' is within active linear memory bounds."
  (unless eliscript-abi--memory-bytes
    (error "ABI linear memory operation called outside `with-abi-memory'"))
  (when (or (not (integerp offset))
            (< offset 0)
            (> (+ offset byte-width) (length eliscript-abi--memory-bytes)))
    (error "ABI linear memory out-of-bounds access at offset %S (width %d, size %d)"
           offset byte-width (length eliscript-abi--memory-bytes))))

(defmacro with-abi-memory (options &rest body)
  "Execute BODY with an isolated ABI linear memory initialized by OPTIONS."
  (let ((init-pages (or (plist-get options :initial-pages) 1))
        (max-pages (or (plist-get options :max-pages) 256)))
    `(let ((eliscript-abi--memory-bytes
            (make-vector (* ,init-pages eliscript-abi--page-bytes) 0))
           (eliscript-abi--max-pages ,max-pages))
       ,@body)))

(defun mem-size ()
  "Return the current linear memory size in 64 KiB pages."
  (unless eliscript-abi--memory-bytes
    (error "mem-size called outside `with-abi-memory'"))
  (/ (length eliscript-abi--memory-bytes) eliscript-abi--page-bytes))

(defun mem-grow (delta-pages)
  "Grow linear memory by DELTA-PAGES; return previous page count or -1 on failure."
  (let* ((old-pages (mem-size))
         (new-pages (+ old-pages delta-pages)))
    (if (or (< delta-pages 0)
            (and eliscript-abi--max-pages (> new-pages eliscript-abi--max-pages)))
        -1
      (setq eliscript-abi--memory-bytes
            (vconcat eliscript-abi--memory-bytes
                     (make-vector (* delta-pages eliscript-abi--page-bytes) 0)))
      old-pages)))

(defun mem-load-u8 (offset)
  "Load unsigned 8-bit integer at byte OFFSET."
  (eliscript-abi--ensure-bounds offset 1)
  (logand (aref eliscript-abi--memory-bytes offset) #xff))

(defun mem-store-u8 (offset val)
  "Store unsigned 8-bit integer VAL at byte OFFSET."
  (eliscript-abi--ensure-bounds offset 1)
  (aset eliscript-abi--memory-bytes offset (logand val #xff))
  nil)

(defun mem-load-u16 (offset)
  "Load little-endian unsigned 16-bit integer at byte OFFSET."
  (eliscript-abi--ensure-bounds offset 2)
  (logior (aref eliscript-abi--memory-bytes offset)
          (ash (aref eliscript-abi--memory-bytes (1+ offset)) 8)))

(defun mem-store-u16 (offset val)
  "Store little-endian unsigned 16-bit integer VAL at byte OFFSET."
  (eliscript-abi--ensure-bounds offset 2)
  (aset eliscript-abi--memory-bytes offset (logand val #xff))
  (aset eliscript-abi--memory-bytes (1+ offset) (logand (ash val -8) #xff))
  nil)

(defun mem-load-u32 (offset)
  "Load little-endian unsigned 32-bit integer at byte OFFSET."
  (eliscript-abi--ensure-bounds offset 4)
  (logior (aref eliscript-abi--memory-bytes offset)
          (ash (aref eliscript-abi--memory-bytes (+ offset 1)) 8)
          (ash (aref eliscript-abi--memory-bytes (+ offset 2)) 16)
          (ash (aref eliscript-abi--memory-bytes (+ offset 3)) 24)))

(defun mem-store-u32 (offset val)
  "Store little-endian unsigned 32-bit integer VAL at byte OFFSET."
  (eliscript-abi--ensure-bounds offset 4)
  (let ((u (logand val eliscript-abi--u32-mask)))
    (aset eliscript-abi--memory-bytes offset (logand u #xff))
    (aset eliscript-abi--memory-bytes (+ offset 1) (logand (ash u -8) #xff))
    (aset eliscript-abi--memory-bytes (+ offset 2) (logand (ash u -16) #xff))
    (aset eliscript-abi--memory-bytes (+ offset 3) (logand (ash u -24) #xff))
    nil))

(defun mem-load-f64 (offset)
  "Load f64 float value at byte OFFSET."
  (eliscript-abi--ensure-bounds offset 8)
  (let ((slot (aref eliscript-abi--memory-bytes offset)))
    (if (floatp slot) slot (float slot))))

(defun mem-store-f64 (offset val)
  "Store f64 float VAL at byte OFFSET."
  (eliscript-abi--ensure-bounds offset 8)
  (aset eliscript-abi--memory-bytes offset (float val))
  nil)

;; 32-bit Unsigned Modular Word Operations

(defun word-add (a b)
  "Return 32-bit unsigned modular sum of A and B."
  (logand (+ (logand a eliscript-abi--u32-mask)
             (logand b eliscript-abi--u32-mask))
          eliscript-abi--u32-mask))

(defun word-sub (a b)
  "Return 32-bit unsigned modular difference of A and B."
  (logand (- (logand a eliscript-abi--u32-mask)
             (logand b eliscript-abi--u32-mask))
          eliscript-abi--u32-mask))

(defun word-mul (a b)
  "Return 32-bit unsigned modular product of A and B."
  (logand (* (logand a eliscript-abi--u32-mask)
             (logand b eliscript-abi--u32-mask))
          eliscript-abi--u32-mask))

(defun word-div (a b)
  "Return 32-bit unsigned quotient of A and B, trapping on zero divisor."
  (let ((ua (logand a eliscript-abi--u32-mask))
        (ub (logand b eliscript-abi--u32-mask)))
    (when (= ub 0)
      (signal 'arith-error '("word-div division by zero")))
    (/ ua ub)))

(defun word-and (a b)
  "Return 32-bit bitwise AND of A and B."
  (logand a b eliscript-abi--u32-mask))

(defun word-or (a b)
  "Return 32-bit bitwise OR of A and B."
  (logand (logior a b) eliscript-abi--u32-mask))

(defun word-xor (a b)
  "Return 32-bit bitwise XOR of A and B."
  (logand (logxor a b) eliscript-abi--u32-mask))

(defun word-shl (a bits)
  "Return 32-bit logical left shift of A by `(logand BITS 31)'."
  (logand (ash (logand a eliscript-abi--u32-mask) (logand bits 31))
          eliscript-abi--u32-mask))

(defun word-shr (a bits)
  "Return 32-bit logical right shift of A by `(logand BITS 31)'."
  (logand (ash (logand a eliscript-abi--u32-mask) (- (logand bits 31)))
          eliscript-abi--u32-mask))

(provide 'eliscript-abi)

;;; eliscript-abi.el ends here
