/* @refresh reload */
import { render } from "solid-js/web";

import "./index.css";
import { App } from "./App";
import { Button } from "./components/ui/button";

const root = document.getElementById("root");

if (import.meta.env.DEV && !(root instanceof HTMLElement))
  throw new Error("Root element not found.");

render(() => <App />, root!);
