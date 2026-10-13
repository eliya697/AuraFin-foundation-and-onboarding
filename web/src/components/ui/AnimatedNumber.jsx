import { useEffect, useRef, useState } from 'react';
import { useSpring } from 'framer-motion';

export default function AnimatedNumber({ value, format, className = '' }) {
  const formatRef = useRef(format);
  formatRef.current = format;

  const spring = useSpring(value, { stiffness: 140, damping: 22, mass: 0.6 });
  const [display, setDisplay] = useState(() => format(value));

  useEffect(() => {
    spring.set(value);
  }, [spring, value]);

  useEffect(() => spring.on('change', (latest) => setDisplay(formatRef.current(latest))), [spring]);

  return <span className={`tabular-nums ${className}`}>{display}</span>;
}
