import { motion } from 'motion/react';

interface Props {
  id: string;
  children: React.ReactNode;
  className?: string;
}

/** Bloco do painel que entra com animação ao aparecer na tela e é alvo da navegação. */
export default function Section({ id, children, className = '' }: Props) {
  return (
    <motion.section
      id={id}
      className={`scroll-mt-20 present-slide ${className}`}
      initial={{ opacity: 0, y: 32 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.08 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.section>
  );
}
