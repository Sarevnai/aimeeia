/**
 * useReveal — Hook leve pra scroll-reveal sem libs externas.
 *
 * Usa IntersectionObserver e seta data-visible="true" no elemento
 * quando 15% dele entra no viewport. O CSS em index.css faz a
 * transicao de opacity + translateY via [data-reveal][data-visible="true"].
 *
 * Elementos alvo devem ter o atributo `data-reveal` no JSX.
 * Respeita prefers-reduced-motion via CSS (nao via JS).
 *
 * Uso:
 *   const ref = useReveal<HTMLElement>();
 *   return <section ref={ref} data-reveal>…</section>;
 */
import { useEffect, useRef } from "react";

export function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Se reduced motion, marcar visivel imediatamente (CSS ja neutraliza via @media)
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.setAttribute("data-visible", "true");
          obs.disconnect();
        }
      },
      { threshold: 0.15 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return ref;
}
