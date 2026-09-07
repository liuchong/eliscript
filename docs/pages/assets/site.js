const examples = {
  factorial: {
    source: `(defun factorial (n)
  (if (<= n 1)
      1
    (* n (factorial (1- n)))))`,
    output: `function factorial(n) {
  return (__eliscript_truthy(n <= 1)
    ? 1
    : n * factorial(n - 1));
}`,
  },
  data: {
    source: `(defvar result
  (object
    :message "hello"
    :values [1 2 3]
    :active t))`,
    output: `let result = {
  "message": "hello",
  "values": [1, 2, 3],
  "active": true
};`,
  },
  interop: {
    source: `(js-call [1 2 3]
  :map
  (lambda (value)
    (* value 2)))`,
    output: `[1, 2, 3]["map"](
  (value) => {
    return value * 2;
  }
);`,
  },
};

const sourceCode = document.querySelector("[data-source-code]");
const outputCode = document.querySelector("[data-output-code]");

document.querySelectorAll("[data-example]").forEach((button) => {
  button.addEventListener("click", () => {
    const example = examples[button.dataset.example];
    if (!example || !sourceCode || !outputCode) return;

    document.querySelectorAll("[data-example]").forEach((candidate) => {
      candidate.setAttribute("aria-selected", String(candidate === button));
    });
    sourceCode.textContent = example.source;
    outputCode.textContent = example.output;
  });
});

document.querySelectorAll("[data-language-tab]").forEach((button) => {
  button.addEventListener("click", () => {
    const target = button.dataset.languageTab;
    document.querySelectorAll("[data-language-tab]").forEach((candidate) => {
      candidate.setAttribute("aria-selected", String(candidate === button));
    });
    document.querySelectorAll("[data-language-panel]").forEach((panel) => {
      panel.hidden = panel.dataset.languagePanel !== target;
    });
  });
});

const apiSearch = document.querySelector("[data-api-search]");
if (apiSearch) {
  const modules = [...document.querySelectorAll("[data-api-module]")];
  const sections = [...document.querySelectorAll("[data-api-section]")];
  const count = document.querySelector("[data-api-count]");
  const empty = document.querySelector("[data-api-empty]");
  const updateApiFilter = () => {
    const query = apiSearch.value.trim().toLowerCase();
    let visible = 0;
    for (const module of modules) {
      const matches = module.dataset.apiSearchable.includes(query);
      module.hidden = !matches;
      if (matches) visible += 1;
    }
    for (const section of sections) {
      section.hidden = !section.querySelector("[data-api-module]:not([hidden])");
    }
    count.textContent = `${visible} ${visible === 1 ? "module" : "modules"}`;
    empty.hidden = visible !== 0;
  };
  apiSearch.addEventListener("input", updateApiFilter);
}

document.querySelectorAll("[data-year]").forEach((element) => {
  element.textContent = new Date().getFullYear();
});
