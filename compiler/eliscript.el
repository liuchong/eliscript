;;; eliscript.el --- Eliscript seed compiler -*- lexical-binding: t; -*-

;;; Commentary:

;; Public entry points for compiling Eliscript source with Emacs.

;;; Code:

(require 'eliscript-reader)
(require 'eliscript-expander)
(require 'eliscript-analyzer)
(require 'eliscript-lower)
(require 'eliscript-emitter)
(require 'eliscript-ir-emitter)
(require 'eliscript-portable)

(defun eliscript--analyzed-string (source filename)
  "Read, expand, and analyze SOURCE from FILENAME."
  (eliscript-analyze-module
   (eliscript-expand-module
    (eliscript-read-located-string source filename)
    filename)
   filename))

(defun eliscript-compile-ir-string (source &optional filename)
  "Compile Eliscript SOURCE from FILENAME into an IR program."
  (eliscript-lower-module
   (eliscript--analyzed-string source filename)
   filename))

(defun eliscript-compile-portable-ir-string (source entries &optional filename)
  "Compile portable ENTRIES from Eliscript SOURCE into an IR program."
  (let ((forms (eliscript--analyzed-string source filename)))
    (eliscript-lower-module
     (eliscript-portable-select-module forms entries filename)
     filename)))

(defun eliscript-compile-portable-string (source entries &optional filename)
  "Compile portable ENTRIES and their dependencies from SOURCE to ESM."
  (eliscript-emit-ir-module
   (eliscript-compile-portable-ir-string source entries filename)))

(defun eliscript-compile-portable-string-with-source-map
    (source entries &optional filename generated-name source-name)
  "Compile portable ENTRIES from SOURCE with a Source Map v3 document."
  (eliscript-emit-ir-module-with-source-map
   (eliscript-compile-portable-ir-string source entries filename)
   source
   generated-name
   (or source-name filename "<string>")))

(defun eliscript-compile-string (source &optional filename)
  "Compile Eliscript SOURCE to an ECMAScript module.

FILENAME is used for compiler diagnostics."
  (eliscript-emit-ir-module
   (eliscript-compile-ir-string source filename)))

(defun eliscript-compile-string-with-source-map
    (source &optional filename generated-name source-name)
  "Compile SOURCE and return JavaScript plus a Source Map v3 document.

FILENAME is used for diagnostics.  GENERATED-NAME and SOURCE-NAME identify the
files recorded in the source map.  The return value is an `eliscript-emission'."
  (eliscript-emit-ir-module-with-source-map
   (eliscript-compile-ir-string source filename)
   source
   generated-name
   (or source-name filename "<string>")))

(defun eliscript-compile-ir-file (input-file)
  "Compile INPUT-FILE into an IR program."
  (eliscript-lower-module
   (eliscript-analyze-module
    (eliscript-expand-module
     (eliscript-read-located-file input-file)
     input-file)
    input-file)
   input-file))

(defun eliscript-compile-portable-file (input-file entries &optional output-file)
  "Compile portable ENTRIES from INPUT-FILE, optionally to OUTPUT-FILE."
  (let* ((input-path (expand-file-name input-file))
         (source
          (with-temp-buffer
            (insert-file-contents input-path)
            (buffer-string)))
         (output
          (eliscript-compile-portable-string source entries input-path)))
    (when output-file
      (make-directory (file-name-directory (expand-file-name output-file)) t)
      (with-temp-file output-file
        (insert output)))
    output))

(defun eliscript-compile-portable-file-with-source-map
    (input-file entries output-file &optional source-map-file)
  "Compile portable ENTRIES from INPUT-FILE with an external source map."
  (unless output-file
    (error "portable source-map compilation requires OUTPUT-FILE"))
  (let* ((input-path (expand-file-name input-file))
         (output-path (expand-file-name output-file))
         (map-path
          (expand-file-name (or source-map-file (concat output-path ".map"))))
         (map-directory (file-name-directory map-path))
         (source
          (with-temp-buffer
            (insert-file-contents input-path)
            (buffer-string)))
         (generated-name (file-relative-name output-path map-directory))
         (source-name (file-relative-name input-path map-directory))
         (emission
          (eliscript-compile-portable-string-with-source-map
           source entries input-path generated-name source-name))
         (map-url
          (file-relative-name map-path (file-name-directory output-path)))
         (javascript
          (concat (eliscript-emission-javascript emission)
                  "//# sourceMappingURL=" map-url "\n")))
    (when (string-equal output-path map-path)
      (error "source map path must differ from output path"))
    (setq emission
          (eliscript-emission-create
           :javascript javascript
           :source-map (eliscript-emission-source-map emission)))
    (make-directory map-directory t)
    (with-temp-file map-path
      (insert (eliscript-emission-source-map emission)))
    (make-directory (file-name-directory output-path) t)
    (with-temp-file output-path
      (insert javascript))
    emission))

(defun eliscript-compile-file (input-file &optional output-file)
  "Compile INPUT-FILE and optionally write it to OUTPUT-FILE.

Return the generated ECMAScript source."
  (let ((output (eliscript-emit-ir-module
                 (eliscript-compile-ir-file input-file))))
    (when output-file
      (make-directory (file-name-directory (expand-file-name output-file)) t)
      (with-temp-file output-file
        (insert output)))
    output))

(defun eliscript-compile-file-with-source-map
    (input-file &optional output-file source-map-file)
  "Compile INPUT-FILE with a Source Map v3 document.

When OUTPUT-FILE is non-nil, write JavaScript there and write the map to
SOURCE-MAP-FILE or OUTPUT-FILE with `.map' appended.  The JavaScript receives
an external `sourceMappingURL' comment.  Return an `eliscript-emission'."
  (when (and source-map-file (null output-file))
    (error "SOURCE-MAP-FILE requires OUTPUT-FILE"))
  (let* ((input-path (expand-file-name input-file))
         (output-path (and output-file (expand-file-name output-file)))
         (map-path
          (and output-path
               (expand-file-name (or source-map-file
                                     (concat output-path ".map")))))
         (source
          (with-temp-buffer
            (insert-file-contents input-path)
            (buffer-string)))
         (map-directory
          (and map-path (file-name-directory map-path)))
         (generated-name
          (and output-path
               (file-relative-name output-path map-directory)))
         (source-name
          (if map-directory
              (file-relative-name input-path map-directory)
            input-file))
         (emission
          (eliscript-compile-string-with-source-map
           source input-path generated-name source-name)))
    (when (and output-path (string-equal output-path map-path))
      (error "source map path must differ from output path"))
    (when output-path
      (let* ((map-url
              (file-relative-name
               map-path (file-name-directory output-path)))
             (javascript
              (concat (eliscript-emission-javascript emission)
                      "//# sourceMappingURL=" map-url "\n")))
        (setq emission
              (eliscript-emission-create
               :javascript javascript
               :source-map (eliscript-emission-source-map emission)))
        (make-directory map-directory t)
        (with-temp-file map-path
          (insert (eliscript-emission-source-map emission)))
        (make-directory (file-name-directory output-path) t)
        (with-temp-file output-path
          (insert javascript))))
    emission))

(require 'eliscript-evaluation)

(provide 'eliscript)

;;; eliscript.el ends here
