import { createRoot } from "react-dom/client"
import Workbench from "./rally-workbench.jsx"
import "../app/globals.css"

createRoot(document.getElementById("root")).render(
  <Workbench />,
)
