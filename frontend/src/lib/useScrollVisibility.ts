import { useState, useEffect, useRef } from 'react';

export function useScrollVisibility() {
  const [isVisible, setIsVisible] = useState(true);
  const lastScrollY = useRef(0);
  const containerRef = useRef(null);

  useEffect(() => {
    const handleScroll = () => {
      const container = containerRef.current || document.documentElement;
      const currentScrollY = container.scrollTop || document.documentElement.scrollTop;

      // If user scrolls down more than 50px, hide the sidebar
      if (currentScrollY > lastScrollY.current + 50) {
        setIsVisible(false);
      }
      // If user scrolls up, show the sidebar
      else if (currentScrollY < lastScrollY.current - 20) {
        setIsVisible(true);
      }

      // Always show sidebar at the top
      if (currentScrollY < 100) {
        setIsVisible(true);
      }

      lastScrollY.current = currentScrollY;
    };

    const container = containerRef.current || document.documentElement;
    container.addEventListener('scroll', handleScroll, { passive: true });

    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  return { isVisible, containerRef };
}
