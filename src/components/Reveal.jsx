import { useEffect, useRef } from 'react';

/** Wraps children in a scroll-reveal div (fades/rises in when visible). */
export default function Reveal({ children, className = '', as: Tag = 'div', ...rest }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => entries.forEach((en) => {
        if (en.isIntersecting) { en.target.classList.add('in'); io.disconnect(); }
      }),
      { rootMargin: '0px 0px -8% 0px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return <Tag ref={ref} className={`reveal ${className}`} {...rest}>{children}</Tag>;
}
