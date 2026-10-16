import { useEffect } from 'react';

function setMeta(attr: 'name' | 'property', key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.content = content;
}

/** Título y metadatos básicos de la página (SEO y vista previa al compartir). */
export function useDocumentMeta(
  title: string | undefined,
  description?: string | null,
  image?: string | null,
) {
  useEffect(() => {
    if (!title) return;
    const previous = document.title;
    document.title = title;
    setMeta('property', 'og:title', title);
    if (description) {
      setMeta('name', 'description', description);
      setMeta('property', 'og:description', description);
    }
    if (image) setMeta('property', 'og:image', image);
    return () => {
      document.title = previous;
    };
  }, [title, description, image]);
}
