import { useEffect } from "react";

export function usePageTitle(title: string, suffix = "GHVAC") {
  useEffect(() => {
    const fullTitle = suffix ? `${title} | ${suffix}` : title;
    document.title = fullTitle;
    
    return () => {
      document.title = "GHVAC Tools";
    };
  }, [title, suffix]);
}
