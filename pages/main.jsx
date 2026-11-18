import { createRoot } from "react-dom/client"
import Workbench from "../app/workbench.jsx"
import "../app/globals.css"
import { routineStore } from "./routine-store.mjs"

createRoot(document.getElementById("root")).render(
  <Workbench routineStore={routineStore} localOnly brandIcon="./favicon.svg" />,
)
