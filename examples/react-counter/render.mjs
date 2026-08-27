import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Counter from "../../dist/react-counter.mjs";

const markup = renderToStaticMarkup(
  React.createElement(
    Counter,
    { title: "Eliscript counter" },
    React.createElement("span", { className: "status" }, "Ready"),
  ),
);

console.log(markup);
