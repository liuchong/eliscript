;;; t13.el --- T13 industrial Emacs Lisp syntax and standard library parity -*- lexical-binding: t; no-byte-compile: t; -*-

;; Cases marked "oracle" are also evaluated by native Emacs and must produce
;; the same normalized value; that is the authority for Emacs semantics.

;;;; case T13-01
;;;; oracle
;;;; expect [[97, 32, 10, 9, 34, 92], 30, 32, true, "branch", "leaf", 10, 0, "head", [6, 99, 30], "z", 65, 42, 11, 222, 3, 6, ["key", 16], [[":a", 10], [":b", 20], [":c", 30]], [true, null], [["alpha", 10], ["beta", 25]], 7, "λ-test", 64]
(progn
  (cl-defstruct (sample-node (:constructor sample-node-create)
                             (:copier nil))
    (kind 'leaf)
    (count 0)
    (table (make-hash-table :test 'equal)))
  (cl-defun compute-opt (a &optional (b 10) &key (scale 2) (bonus 0))
    (+ (* (+ a b) scale) bonus))
  (let* ((n1 (sample-node-create :kind 'branch))
         (n2 (sample-node-create))
         (lst (list 10 20 30))
         (vec (vector 'a 'b 'c))
         (bytes (make-string 4 0))
         (al (list (cons 'k1 1) (cons 'k2 2)))
         (pl (list :p1 100 :p2 200))
         (ht (sample-node-table n1))
         (dotted `((alpha . ,(+ 1 2)) (beta . ,(* 2 3)))))
    (puthash "init" 1 ht)
    (setf (sample-node-count n1) 7
          (nth 1 lst) 99
          (aref vec 2) 'z
          (aref bytes 1) 65
          (gethash "k" ht) 42
          (alist-get 'k1 al) 11
          (plist-get pl :p2) 222)
    (cl-incf (sample-node-count n1) 3)
    (cl-decf (nth 0 lst) 4)
    (push 'head lst)
    (let ((popped (pop lst))
          (matched
           (pcase (cons "key" 15)
             (`(,(and (pred stringp) k) . ,(and (pred integerp) (app 1+ v)))
              (list k v))
             (_ 'miss)))
          (looped
           (cl-loop for (k v) on '(:a 1 :b 2 :c 3) by #'cddr
                    collect (cons (symbol-name k) (* v 10))))
          (mut-rec
           (cl-labels ((even-lp (n) (if (= n 0) t (odd-lp (1- n))))
                       (odd-lp (n) (if (= n 0) nil (even-lp (1- n)))))
             (list (even-lp 6) (odd-lp 6))))
          (buf-out
           (with-temp-buffer
             (insert "alpha=10\nbeta=25\n")
             (goto-char (point-min))
             (let ((found nil))
               (while (re-search-forward "\\([a-z]+\\)=\\([0-9]+\\)" nil t)
                 (push (cons (match-string 1) (string-to-number (match-string 2))) found))
               (nreverse found))))
          (w-cjk (string-width "中文abc"))
          (utf8-rt (decode-coding-string (encode-coding-string "λ-test" 'utf-8-unix) 'utf-8-unix))
          (sha (secure-hash 'sha256 "eliscript-dual-host")))
      (list (list ?a ?\s ?\n ?\t ?\" ?\\)
            (compute-opt 5)
            (compute-opt 5 3 :scale 4)
            (sample-node-p n1)
            (sample-node-kind n1)
            (sample-node-kind n2)
            (sample-node-count n1)
            (hash-table-count (sample-node-table n2))
            popped
            lst
            (aref vec 2)
            (aref bytes 1)
            (gethash "k" ht)
            (alist-get 'k1 al)
            (plist-get pl :p2)
            (alist-get 'alpha dotted)
            (alist-get 'beta dotted)
            matched
            looped
            mut-rec
            buf-out
            w-cjk
            utf8-rt
            (length sha)))))

;;;; case T13-02-reader
;;;; oracle
(list ?A ?\C-a ?\^b ?\x41 ?\u00e9 ?\101 ?\( ?\] ?\e ?\d
      "tab\there" "nul\0x" "hex\x41\ B" "uni\u4e2d" "oct\101" "line\
continued" "esc\e"
      #x1F #o17 #b1011 #24r1k 1. .5 1e3 -0.0 1.5e-3
      'sym\ with\ space '\, (quote quoted) '(a . b) '(a b . c) [1 (2 3) "x"])

;;;; case T13-03-numbers
;;;; oracle
(list (/ 7.0 2) (/ 50 (float 100)) (float 3) (floor 7 2) (floor -7 2) (ceiling 7 2)
      (round 2.5) (round 3.5) (round -2.5) (truncate -7.8) (mod 5.5 2) (abs -4)
      (expt 2 10) (expt 2.0 3) (max 1 2.0) (min 3 1) (1+ 1.5) (sqrt 16)
      (ash 1 10) (ash 1024 -3) (ash -8 -1) (logand 255 #xf0f) (logior 1 2 4) (logxor 7 2)
      (logand (+ (expt 2 40) 77) 255) (ash (+ (expt 2 40) 512) -8)
      (< 1 2 3) (< 1 3 2) (<= 0 0 5 7) (= 1 1.0) (eql 1 1.0) (equal 1.0 1.0) (/= 1 2)
      (integerp 3.0) (floatp 3.0) (numberp 1) (zerop 0.0) (natnump 3) (cl-plusp -1)
      (< (expt 2 53) (ash 1 4096)) (integerp (ash 1 4096)))

;;;; case T13-04-format
;;;; oracle
(list (format "%02x|%-6s|%5.1f%%|%S|%s" 10 "ab" 12.345 "q\"x" 'sym)
      (format "%d %c %o %X %e" 42.9 ?A 8 255 1234.5)
      (format "%s %s %s %s" 1.0 0.15 -2.5 100)
      (format "%S" '(1 "two" three [4 5] (a . b) 2.0))
      (prin1-to-string "a\nb") (number-to-string 1.5) (number-to-string 7)
      (format-message "x=%s" nil) (format "%-4d|%4d|" 7 7))

;;;; case T13-05-strings
;;;; oracle
(list (split-string "a,b,,c" ",") (split-string "  x  y z " ) (split-string "a| b |c" "|" t "[ \t]+")
      (string-trim "  pad\n") (string-trim-left "xxab" "x+") (string-join '("a" "b" "c") "-")
      (string-prefix-p "ab" "abc") (string-suffix-p "bc" "abc") (string-empty-p "")
      (substring "hello" -3) (substring "hello" 1 -1) (concat "a" '(98 99) [100])
      (string-to-list "aé") (string-to-number "12.5") (string-to-number "ff" 16) (string-to-number "x")
      (upcase "abc") (downcase "ABC") (string= "a" "a") (string< "abc" "abd")
      (compare-strings "abcd" 1 3 "xbcx" 1 3) (compare-strings "ab" nil nil "ac" nil nil)
      (string-search "lo" "hello") (string-replace "l" "L" "hello") (regexp-quote "a.b*c")
      (char-to-string 20013) (make-string 3 ?z) (string ?a ?b) (truncate-string-to-width "中文表格" 5)
      (string-width "中文…x") (char-width ?中) (string-bytes "中a") (multibyte-string-p "abc")
      (multibyte-string-p "中") (length (encode-coding-string "中" 'utf-8)) (mapconcat #'identity '("x" "y") ", ")
      (mapconcat (lambda (c) (format "%02x" c)) "AZ" ""))

;;;; case T13-06-regex
;;;; oracle
(list (string-match "\\`\\(?:0\\|[1-9][0-9]*\\)\\'" "120") (string-match "\\`-?[0-9]+\\'" "12a")
      (let ((s "key: value")) (and (string-match "\\([^:]+\\): \\(.*\\)" s) (list (match-string 1 s) (match-string 2 s) (match-beginning 2) (match-end 0))))
      (string-match "[][{},\"]" "ab}c") (string-match "x\\{2,3\\}" "axxxx") (string-match "[[:digit:]]+" "ab42")
      (string-match-p "[[:space:]]" "a b") (let ((case-fold-search nil)) (string-match-p "A" "a"))
      (let ((case-fold-search t)) (string-match-p "A" "a")) (string-match "o" "foo bar boo" 3)
      (replace-regexp-in-string "[aeiou]" "_" "education") (replace-regexp-in-string "\\(a\\)\\(b\\)" "\\2\\1" "abab")
      (replace-regexp-in-string "[0-9]+" (lambda (m) (number-to-string (* 2 (string-to-number m)))) "a1b22")
      (replace-regexp-in-string (rx (in ?\" ?\\ cntrl)) (lambda (m) (format "\\u%04x" (aref m 0))) "a\"b\tc" t t)
      (rx (or "ab" "cd") (+ digit) (opt "x") bol eol (group (any "a-z")) (not (any space)))
      (save-match-data (string-match "b" "abc") (match-beginning 0)))

;;;; case T13-07-lists
;;;; oracle
(let ((l (list 3 1 2)) (al '((a . 1) (b . 2))) (pl '(:x 1 :y 2)))
  (list (sort (copy-sequence l) #'<) (nreverse (list 1 2 3)) (reverse [1 2 3]) (append '(1) '(2) nil '(3 . 4))
        (nthcdr 2 '(a b c d)) (last '(1 2 3)) (butlast '(1 2 3)) (number-sequence 1 10 3) (number-sequence 5 1 -2)
        (delete-dups (list 1 2 1 3 2)) (member "b" '("a" "b" "c")) (memq 'c '(a b c)) (assoc "k" '(("k" . 1)))
        (assq 'b al) (rassq 2 al) (alist-get 'b al) (alist-get 'z al 'none) (plist-get pl :y) (plist-put (list :a 1) :b 2)
        (plist-member pl :y) (car-safe 'x) (cdr-safe '(1 . 2)) (cadr '(1 2 3)) (cddr '(1 2 3)) (caar '((9)))
        (proper-list-p '(1 2)) (proper-list-p '(1 . 2)) (length '(1 2 3)) (elt [5 6 7] 1) (copy-tree '((1 2) 3))
        (mapcar #'1+ [1 2]) (mapcan (lambda (x) (list x x)) '(1 2)) (delq nil (list 1 nil 2)) (remove 2 '(1 2 3))
        (cl-remove-if-not #'cl-evenp '(1 2 3 4)) (cl-find 3 '(1 2 3 4)) (cl-position "b" '("a" "b") :test #'equal)
        (cl-every #'numberp '(1 2)) (cl-some #'stringp '(1 "s")) (cl-mapcar #'+ '(1 2) '(10 20)) (cl-map 'vector #'1+ '(1 2))
        (seq-count #'cl-oddp '(1 2 3)) (seq-drop-while #'cl-oddp '(1 3 4 5)) (seq-find #'cl-evenp '(1 4 6)) (seq-remove #'cl-evenp '(1 2 3))
        (seq-some #'cl-evenp '(1 2)) (seq-uniq '(1 2 2 1)) (seq-every-p #'integerp [1 2]) (seq-reduce #'+ '(1 2 3) 10)
        (seq-take '(1 2 3) 2) (seq-filter #'cl-evenp [1 2 4]) (vconcat '(1 2) [3]) (make-list 2 'x)
        (let ((acc nil)) (seq-doseq (x [1 2]) (push x acc)) acc) (let ((acc nil)) (dotimes (i 3) (push i acc)) acc)
        (let ((acc 0)) (dolist (x '(1 2 3) acc) (setq acc (+ acc x))))))

;;;; case T13-08-hash-records
;;;; oracle
(progn
  (cl-defstruct (base-rec (:constructor base-rec-create)) (id 0) (tags nil))
  (cl-defstruct (pos-rec (:include base-rec) (:constructor pos-rec--make (id left right &optional (weight 1))))
    left right weight)
  (let* ((h (make-hash-table :test 'equal)) (p (pos-rec--make 7 "l" "r")) (c (copy-pos-rec p)) (keys nil))
    (puthash "a" 1 h) (puthash '(k 1) 2 h) (puthash "b" 3 h) (remhash "b" h)
    (maphash (lambda (k v) (push (list k v) keys)) h)
    (setf (pos-rec-left c) "L2")
    (push 'new (base-rec-tags p))
    (list (nreverse keys) (gethash '(k 1) h) (gethash "zz" h 'dflt) (hash-table-count h)
          (pos-rec-id p) (pos-rec-left p) (pos-rec-left c) (pos-rec-weight p) (base-rec-p p) (pos-rec-p (base-rec-create))
          (base-rec-tags p) (recordp p) (vectorp p) (consp p) (eq (type-of p) 'pos-rec) (length p) (aref p 0)
          (equal (copy-sequence p) p) (eq (copy-sequence p) p))))

;;;; case T13-09-control
;;;; oracle
(progn
  (define-error 'my-root-error "Root failure")
  (define-error 'my-leaf-error "Leaf failure" 'my-root-error)
  (defvar t13-dyn 1)
  (defmacro t13-twice (form) `(progn ,form ,form))
  (cl-defun t13-keys (&key (a 1) (b (+ a 1)) &allow-other-keys) (list a b))
  (let ((n 0) (out nil))
    (t13-twice (setq n (1+ n)))
    (list n
          (condition-case err (signal 'my-leaf-error '("x" 2)) (my-root-error (list 'root (car err) (cdr err))))
          (condition-case err (error "Bad %s %d" "thing" 3) (error (error-message-string err)))
          (condition-case nil (car 1) (wrong-type-argument 'wta))
          (ignore-errors (/ 1 0)) (catch 'k (dolist (x '(1 2 3)) (when (= x 2) (throw 'k (* x 10)))))
          (let ((t13-dyn 5)) (symbol-value 't13-dyn)) (boundp 't13-dyn) (fboundp 't13-keys) (functionp #'car)
          (t13-keys) (t13-keys :b 9) (t13-keys :a 3 :z 0)
          (when-let ((a 1) (b (+ a 1))) (* a b)) (when-let* ((a nil)) 'no) (if-let ((x 5)) (* x 2) 'none)
          (if-let* ((x nil)) 'yes 'else) (and-let* ((x 3) ((> x 2))) x)
          (pcase 'b ('a 1) ((or 'b 'c) 2)) (pcase 5 ((pred (< 3)) 'big) (_ 'small)) (pcase "s" ((and s (guard (stringp s))) s))
          (pcase-let ((`(,x ,y) '(1 2))) (+ x y)) (pcase-let* ((`(,a . ,b) '(1 . 2)) (c (+ a b))) c)
          (pcase [1 2] (`[,a ,b] (+ a b)))
          (cl-case 3 (1 'one) ((2 3) 'two-three) (t 'other)) (cl-case 'z (a 1) (otherwise 'fallback))
          (cl-loop for i from 1 to 5 sum i) (cl-loop for x across [1 2 3] collect (* x x))
          (cl-loop for x in '(1 2 3 4) when (cl-evenp x) collect x into evens finally return evens)
          (cl-loop repeat 3 count t) (cl-loop for x in '(3 9 2) maximize x) (cl-loop for i below 3 append (list i i))
          (cl-loop for x in '(1 2) for y in '(a b) collect (cons x y)) (cl-loop for x in '(2 4) always (cl-evenp x))
          (cl-loop for (a . b) in '((1 . 2) (3 . 4)) collect (+ a b)) (cl-loop for x in '(1 2 3) thereis (and (> x 1) x))
          (cl-flet ((sq (x) (* x x))) (sq 4)) (funcall (cl-labels ((f (x) (if (> x 0) (f (1- x)) 'done))) #'f) 3)
          (cl-destructuring-bind (a (b c) &rest d) '(1 (2 3) 4 5) (list a b c d))
          (prog1 'first 'second) (prog2 'a 'b 'c) (let* ((x 1) (y (+ x 1))) y)
          (funcall (let ((k 10)) (lambda (&optional a &rest r) (list k a r))) 1 2 3)
          (apply #'+ 1 2 '(3 4)) (macroexpand '(t13-twice x)))))

;;;; case T13-10-buffers-json-hash
;;;; oracle
(list (with-temp-buffer (insert "abc") (goto-char 2) (insert "X") (list (buffer-string) (point) (point-min) (point-max) (buffer-size)))
      (with-temp-buffer (insert "one two") (goto-char (point-min)) (list (search-forward "two" nil t) (point) (looking-at "$") (char-before) (bobp) (eobp)))
      (with-temp-buffer (insert "hello world") (delete-region 1 7) (buffer-substring-no-properties 1 3))
      (with-temp-buffer (insert "a\nbb\n") (goto-char (point-min)) (forward-line 1) (list (point) (line-end-position) (buffer-substring (line-beginning-position) (line-end-position))))
      (let ((h (json-parse-string "{\"a\":1,\"b\":[true,false,null],\"c\":{\"d\":\"é\"}}")))
        (list (gethash "a" h) (gethash "b" h) (hash-table-p (gethash "c" h)) (gethash "d" (gethash "c" h))))
      (json-parse-string "{\"k\":[1,2],\"n\":null}" :object-type 'alist :array-type 'list :null-object nil)
      (json-parse-string "{\"k\":false}" :object-type 'plist :false-object :json-false)
      (json-encode (vector "a\"b\n" 1 1.5 nil t :json-false)) (json-encode '((a . 1) (b . "x")))
      (json-serialize (vector 1 "x" (make-hash-table))) (json-serialize '((k . [1 2])) :null-object nil)
      (secure-hash 'sha256 "") (secure-hash 'sha256 "abc") (secure-hash 'sha256 "中文")
      (length (secure-hash 'sha256 "abc" nil nil t)) (aref (secure-hash 'sha256 "abc" nil nil t) 0)
      (decode-coding-string (encode-coding-string "中文é😀" 'utf-8-unix) 'utf-8) (string-bytes (encode-coding-string "😀" 'utf-8)))
