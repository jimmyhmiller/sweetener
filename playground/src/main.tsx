import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Home } from "./home";
import { Playground } from "./playground";
import "./site.css";

/**
 * Two views, addressed by the fragment so a link can point at either.
 *
 * `#/play/<example>` opens the playground on one example, which is what makes
 * an example worth linking to from anywhere else.
 */
function route(hash: string): { view: "home" | "play"; exampleId: string } {
  const parts = hash.replace(/^#\/?/u, "").split("/").filter(Boolean);
  return parts[0] === "play"
    ? { view: "play", exampleId: parts[1] ?? "" }
    : { view: "home", exampleId: "" };
}

function App() {
  const [location, setLocation] = useState(() => route(window.location.hash));

  useEffect(() => {
    const onChange = () => setLocation(route(window.location.hash));
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);

  const go = (hash: string) => {
    window.location.hash = hash;
    setLocation(route(hash));
    window.scrollTo(0, 0);
  };

  return location.view === "play" ? (
    <Playground
      exampleId={location.exampleId}
      onExample={(id) => {
        window.history.replaceState(null, "", `#/play/${id}`);
      }}
      onHome={() => go("#/")}
    />
  ) : (
    <Home onOpen={(id) => go(id === undefined ? "#/play" : `#/play/${id}`)} />
  );
}

createRoot(document.getElementById("root")!).render(<App />);
