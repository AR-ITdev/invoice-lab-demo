import { useEffect, useState } from "react";
import { parseRoute, routePath } from "./routing.js";

const currentRoute = () => parseRoute(window.location.pathname, window.location.search);

export default function useRoute() {
  const [route, setRoute] = useState(currentRoute);
  useEffect(() => {
    const update = () => setRoute(currentRoute());
    window.addEventListener("popstate", update);
    return () => window.removeEventListener("popstate", update);
  }, []);

  function navigate(next, replace = false) {
    const path = routePath(next);
    if (`${window.location.pathname}${window.location.search}` !== path) {
      window.history[replace ? "replaceState" : "pushState"](null, "", path);
    }
    setRoute(currentRoute());
  }
  return [route, navigate];
}
