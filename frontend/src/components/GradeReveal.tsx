import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { GRADES, type Grade } from '../lib/score';
import { sfx } from '../lib/sound';
import { Gauge } from './RiskScore';

interface Props {
  domain: string;
  score: number;
  grade: Grade;
  findings: number;
  onDone: () => void;
}

const DURATION_MS = 4600;

/** Fim da análise: a tela escurece, o medidor enche e a letra é revelada. */
export default function GradeReveal({ domain, score, grade, findings, onDone }: Props) {
  const g = GRADES[grade];
  // o medidor começa em 0 e enche depois que a tela abre
  const [shown, setShown] = useState(0);

  useEffect(() => {
    sfx.done();
    const fill = setTimeout(() => setShown(score), 500);
    const end = setTimeout(onDone, DURATION_MS);
    return () => {
      clearTimeout(fill);
      clearTimeout(end);
    };
  }, [score, onDone]);

  return (
    <motion.div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-bg/92 backdrop-blur-md cursor-pointer"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.04 }}
      transition={{ duration: 0.45 }}
      onClick={onDone}
    >
      <motion.div
        className="pointer-events-none absolute w-[900px] h-[900px] rounded-full blur-3xl"
        style={{ background: g.color }}
        initial={{ opacity: 0, scale: 0.4 }}
        animate={{ opacity: 0.18, scale: 1 }}
        transition={{ duration: 2.2, delay: 0.6 }}
      />
      <div className="relative flex flex-col items-center text-center px-6">
        <motion.p
          initial={{ opacity: 0, y: -20, letterSpacing: '0.6em' }}
          animate={{ opacity: 1, y: 0, letterSpacing: '0.3em' }}
          transition={{ duration: 0.8 }}
          className="text-xs md:text-sm font-mono uppercase text-ok"
        >
          análise concluída
        </motion.p>
        <motion.h2
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="font-display font-bold text-3xl md:text-4xl text-foreground mt-2 mb-6"
        >
          {domain}
        </motion.h2>
        <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 120, damping: 14, delay: 0.2 }} className="w-[min(80vw,480px)]">
          <Gauge score={shown} grade={shown ? grade : '·'} color={shown ? g.color : '#3f3f46'} className="max-w-none" letterClass="text-[7rem] md:text-[9rem]" numberClass="text-xl" />
        </motion.div>
        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.6 }}
          className="font-display font-bold text-2xl mt-6"
          style={{ color: g.color }}
        >
          {g.title}
        </motion.p>
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.9 }} className="text-sm text-subtle max-w-md mt-1">
          {g.text} {findings} achado(s) relevante(s).
        </motion.p>
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 2.6 }} className="text-[10px] font-mono text-muted mt-8">
          clique para ver o resultado
        </motion.p>
      </div>
    </motion.div>
  );
}
