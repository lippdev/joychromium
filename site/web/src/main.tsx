import "@fontsource/instrument-serif/400.css";
import "@fontsource-variable/schibsted-grotesk";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
