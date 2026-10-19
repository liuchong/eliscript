;;; eliscript-source-map.el --- Source Map v3 support for Eliscript -*- lexical-binding: t; -*-

;;; Commentary:

;; The direct IR emitter temporarily marks generated string positions with
;; source spans.  This module turns those marks into a standard Source Map v3
;; document and strips the Emacs-only text properties from the final module.

;;; Code:

(require 'cl-lib)
(require 'json)
(require 'eliscript-form)
(require 'eliscript-emitter)

(cl-defstruct (eliscript-emission
               (:constructor eliscript-emission-create))
  javascript
  source-map)

(defconst eliscript-source-map--base64
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
  "Base64 alphabet used by Source Map VLQ fields.")

(defconst eliscript-source-map--span-property 'eliscript-source-span
  "Text property used to mark generated positions with source spans.")

(defun eliscript-source-map-mark (text span)
  "Mark the first character of TEXT with source SPAN.

An existing, more deeply nested marker at the same position takes precedence."
  (if (and span (> (length text) 0))
      (let ((marked (copy-sequence text)))
        (when (null (get-text-property
                     0 eliscript-source-map--span-property marked))
          (put-text-property
           0 1 eliscript-source-map--span-property span marked))
        marked)
    text))

(defun eliscript-source-map--utf16-width (character)
  "Return the UTF-16 code-unit width of CHARACTER."
  (if (> character #xffff) 2 1))

(defun eliscript-source-map--collect-marks (generated)
  "Collect source-span marks from GENERATED in generated order."
  (let ((position 0)
        (line 0)
        (column 0)
        marks)
    (while (< position (length generated))
      (let ((span (get-text-property
                   position eliscript-source-map--span-property generated))
            (character (aref generated position)))
        (when span
          (push (list line column span) marks))
        (if (= character ?\n)
            (setq line (1+ line)
                  column 0)
          (setq column
                (+ column
                   (eliscript-source-map--utf16-width character))))
        (setq position (1+ position))))
    (nreverse marks)))

(defun eliscript-source-map--source-locations (source marks)
  "Return source-map locations for source positions referenced by MARKS.

SOURCE is scanned once so tabs and non-BMP characters use Source Map's UTF-16
column convention rather than display columns."
  (let ((wanted (make-hash-table :test #'eql))
        (locations (make-hash-table :test #'eql)))
    (dolist (mark marks)
      (let ((start (eliscript-source-span-start (nth 2 mark))))
        (when start (puthash start t wanted))))
    (let ((offset 0)
          (line 0)
          (column 0)
          (length (length source)))
      (while (<= offset length)
        (when (gethash offset wanted)
          (puthash offset (cons line column) locations))
        (when (< offset length)
          (let ((character (aref source offset)))
            (if (= character ?\n)
                (setq line (1+ line)
                      column 0)
              (setq column
                    (+ column
                       (eliscript-source-map--utf16-width character))))))
        (setq offset (1+ offset))))
    locations))

(defun eliscript-source-map--signed-vlq (value)
  "Convert signed VALUE to its unsigned VLQ representation."
  (if (< value 0)
      (logior (ash (- value) 1) 1)
    (ash value 1)))

(defun eliscript-source-map--encode-vlq (value)
  "Encode signed integer VALUE as a Base64 VLQ string."
  (let ((remaining (eliscript-source-map--signed-vlq value))
        characters)
    (while (>= remaining 32)
      (push (aref eliscript-source-map--base64
                  (logior (logand remaining 31) 32))
            characters)
      (setq remaining (ash remaining -5)))
    (push (aref eliscript-source-map--base64 remaining) characters)
    (apply #'string (nreverse characters))))

(defun eliscript-source-map--original-location (span source-locations)
  "Return zero-based source location for SPAN using SOURCE-LOCATIONS."
  (or (and (eliscript-source-span-start span)
           (gethash (eliscript-source-span-start span) source-locations))
      (cons (1- (eliscript-source-span-line span))
            (1- (eliscript-source-span-column span)))))

(defun eliscript-source-map--group-marks (marks source-locations)
  "Group MARKS by generated line using SOURCE-LOCATIONS."
  (let ((current-line 0)
        current-segments
        lines)
    (dolist (mark marks)
      (let ((generated-line (nth 0 mark)))
        (while (< current-line generated-line)
          (push (nreverse current-segments) lines)
          (setq current-segments nil
                current-line (1+ current-line)))
        (pcase-let ((`(,original-line . ,original-column)
                     (eliscript-source-map--original-location
                      (nth 2 mark) source-locations)))
          (push (list (nth 1 mark) 0 original-line original-column)
                current-segments))))
    (push (nreverse current-segments) lines)
    (nreverse lines)))

(defun eliscript-source-map--encode-mappings (lines)
  "Encode source-map segment LINES into a mappings string."
  (let ((previous-source 0)
        (previous-original-line 0)
        (previous-original-column 0))
    (mapconcat
     (lambda (segments)
       (let ((previous-generated-column 0))
         (mapconcat
          (lambda (segment)
            (pcase-let ((`(,generated-column ,source
                           ,original-line ,original-column)
                         segment))
              (prog1
                  (concat
                   (eliscript-source-map--encode-vlq
                    (- generated-column previous-generated-column))
                   (eliscript-source-map--encode-vlq
                    (- source previous-source))
                   (eliscript-source-map--encode-vlq
                    (- original-line previous-original-line))
                   (eliscript-source-map--encode-vlq
                    (- original-column previous-original-column)))
                (setq previous-generated-column generated-column
                      previous-source source
                      previous-original-line original-line
                      previous-original-column original-column))))
          segments ",")))
     lines ";")))

(defun eliscript-source-map--json-value (value)
  "Encode one source-map VALUE as UTF-8-writable JSON text.
Keep the native serializer's ordinary bytes.  Source text and names can also
contain lone UTF16 code units, which use the emitter's standard JSON escapes."
  (if (and (stringp value)
           (cl-find-if (lambda (unit) (<= #xd800 unit #xdfff)) value))
      (eliscript-emitter--json-string value)
    (let ((encoded (json-serialize value :null-object nil :false-object :json-false)))
      ;; Emacs 30 returns UTF8 bytes here. Inserting those bytes directly into
      ;; the file writer's multibyte buffer creates raw byte characters and an
      ;; interactive coding-system prompt, even though the JSON is valid UTF8.
      (if (multibyte-string-p encoded) encoded
        (decode-coding-string encoded 'utf-8-unix)))))

(defun eliscript-source-map-create (generated source source-name generated-name)
  "Create a Source Map v3 JSON document for GENERATED and SOURCE.

SOURCE-NAME identifies the original source.  GENERATED-NAME identifies the
generated module and may be nil."
  (let* ((marks (eliscript-source-map--collect-marks generated))
         (locations (eliscript-source-map--source-locations source marks))
         (mappings
          (eliscript-source-map--encode-mappings
           (eliscript-source-map--group-marks marks locations))))
    ;; Keep the same field order and wire representation. Encoding the string
    ;; fields individually also preserves lone surrogates as JSON \uXXXX,
    ;; without asking native json-serialize to accept non-scalar characters.
    (concat "{\"version\":3"
            (and generated-name
                 (concat ",\"file\":"
                         (eliscript-source-map--json-value generated-name)))
            ",\"sources\":[" (eliscript-source-map--json-value source-name) "]"
            ",\"sourcesContent\":[" (eliscript-source-map--json-value source) "]"
            ",\"names\":[],\"mappings\":"
            (eliscript-source-map--json-value mappings) "}\n")))

(provide 'eliscript-source-map)

;;; eliscript-source-map.el ends here
