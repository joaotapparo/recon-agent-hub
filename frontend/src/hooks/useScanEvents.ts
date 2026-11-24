import { useEffect, useRef, useState } from 'react';
import { api, type ApiScanEvent } from '../lib/api';

const POLL_MS = 1200;

/**
 * Feed ao vivo do scan. Busca só os eventos novos (after_id) enquanto o scan
 * roda; parado, faz uma última leitura e para.
 */
export function useScanEvents(scanId: number | null, running: boolean): ApiScanEvent[] {
  const [events, setEvents] = useState<ApiScanEvent[]>([]);
  const lastId = useRef(0);

  // troca de scan: começa do zero
  useEffect(() => {
    setEvents([]);
    lastId.current = 0;
  }, [scanId]);

  useEffect(() => {
    if (scanId == null) return;
    let cancelled = false;

    const load = async () => {
      try {
        const fresh = await api.getEvents(scanId, lastId.current);
        if (cancelled || fresh.length === 0) return;
        lastId.current = fresh[fresh.length - 1].id;
        setEvents((prev) => [...prev, ...fresh]);
      } catch {
        /* o feed é só narração: falha aqui não deve esconder o resto do painel */
      }
    };

    load();
    const timer = running ? setInterval(load, POLL_MS) : undefined;
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [scanId, running]);

  return events;
}
