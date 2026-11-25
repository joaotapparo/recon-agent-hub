import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Globe, { type GlobeMethods } from 'react-globe.gl';
import { motion } from 'motion/react';
import { Globe2, MapPin, Pause, Play } from 'lucide-react';
import { api, type ApiGeoResponse } from '../lib/api';
import type { Finding, Subdomain } from '../types';
import { RISK_COLOR, findingsForHost, riskFor, type HostRisk } from '../lib/hosts';

interface Props {
  scanId: number;
  subdomains: Subdomain[];
  findings: Finding[];
  onOpenHost: (host: string) => void;
  /** card: bloco com lista; stage: ocupa o container; mini: miniatura sem interação */
  variant?: 'card' | 'stage' | 'mini';
  /** host para a câmera voar até (diretor automático) */
  focusHost?: string | null;
}

interface Place {
  key: string;
  lat: number;
  lng: number;
  city: string | null;
  country: string | null;
  org: string | null;
  hosts: string[];
  risk: HostRisk;
  issues: number;
}

const RISK_ORDER: HostRisk[] = ['offline', 'ok', 'warning', 'critical'];

let countriesCache: object[] | null = null;

// Acessores fora do componente: a biblioteca refaz a camada inteira quando
// recebe uma função nova, e isso fazia o globo piscar a cada render.
const hexColor = () => 'rgba(148,163,184,0.35)';
const pointColor = (d: object) => RISK_COLOR[(d as Place).risk];
const pointAltitude = (d: object) => 0.03 + Math.min(0.25, (d as Place).issues * 0.03);
const ringColor = (d: object) => (t: number) => {
  const c = RISK_COLOR[(d as Place).risk];
  return `${c}${Math.round((1 - t) * 255).toString(16).padStart(2, '0')}`;
};
const arcColor = (d: object) => ['#38bdf8', (d as { color: string }).color];
const labelColor = () => '#38bdf8';
const pointLabel = (d: object) => {
  const p = d as Place;
  return `<div style="font-family:'Share Tech Mono',monospace;background:#18181bee;border:1px solid #2e2e33;border-radius:8px;padding:6px 10px;font-size:11px;color:#fafafa">
    <div style="color:${RISK_COLOR[p.risk]}">${p.city ?? ''}${p.city && p.country ? ', ' : ''}${p.country ?? ''}</div>
    <div>${p.hosts.slice(0, 4).join('<br/>')}${p.hosts.length > 4 ? `<br/>+${p.hosts.length - 4}` : ''}</div>
    <div style="color:#a1a1aa">${p.org ?? ''}</div></div>`;
};

/** Devolve o mesmo valor enquanto a assinatura não muda (evita refazer a camada). */
function useStable<T>(value: T, signature: string): T {
  const ref = useRef<{ sig: string; value: T } | null>(null);
  if (!ref.current || ref.current.sig !== signature) ref.current = { sig: signature, value };
  return ref.current.value;
}

/** Globo 3D com onde ficam os servidores e de onde a análise partiu. */
export default function ServerGlobe({ scanId, subdomains, findings, onOpenHost, variant = 'card', focusHost }: Props) {
  const compact = variant !== 'card';
  const globeRef = useRef<GlobeMethods | undefined>(undefined);
  const boxRef = useRef<HTMLDivElement>(null);
  const [geo, setGeo] = useState<ApiGeoResponse | null>(null);
  const [error, setError] = useState(false);
  const [countries, setCountries] = useState<object[]>(countriesCache ?? []);
  const [size, setSize] = useState({ w: 600, h: 420 });
  const width = size.w;
  const [rotate, setRotate] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);

  // só busca de novo quando o conjunto de IPs muda (no replay os hosts vão aparecendo)
  const ipsKey = [...new Set(subdomains.map((s) => s.ip).filter(Boolean))].sort().join(',');
  useEffect(() => {
    let cancelled = false;
    setError(false);
    api
      .getGeo(scanId)
      .then((g) => {
        if (cancelled) return;
        setGeo((prev) => (prev && JSON.stringify(prev) === JSON.stringify(g) ? prev : g));
      })
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
  }, [scanId, ipsKey]);

  useEffect(() => {
    if (countriesCache) return;
    fetch('/globe/countries.geojson')
      .then((r) => r.json())
      .then((d) => {
        countriesCache = d.features;
        setCountries(d.features);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    // espera o tamanho assentar: durante a troca palco ⇄ miniatura o container
    // muda a cada quadro, e redimensionar o WebGL a cada quadro pisca
    let t: ReturnType<typeof setTimeout> | undefined;
    const ro = new ResizeObserver(([e]) => {
      clearTimeout(t);
      const w = Math.round(e.contentRect.width);
      const h = Math.round(e.contentRect.height);
      t = setTimeout(() => setSize((prev) => (prev.w === w && prev.h === h ? prev : { w, h })), 160);
    });
    ro.observe(el);
    return () => {
      clearTimeout(t);
      ro.disconnect();
    };
  }, []);

  // agrupa hosts que caem no mesmo lugar (mesma cidade/IP)
  const computed = useMemo<Place[]>(() => {
    if (!geo) return [];
    const map = new Map<string, Place>();
    for (const p of geo.points) {
      const key = `${p.lat.toFixed(2)},${p.lon.toFixed(2)}`;
      const sub = subdomains.find((s) => s.host === p.hostname);
      const risk = sub ? riskFor(sub, findings) : 'ok';
      const issues = findingsForHost(p.hostname, findings).length;
      const place = map.get(key);
      if (place) {
        if (!place.hosts.includes(p.hostname)) place.hosts.push(p.hostname);
        place.issues += issues;
        if (RISK_ORDER.indexOf(risk) > RISK_ORDER.indexOf(place.risk)) place.risk = risk;
      } else {
        map.set(key, { key, lat: p.lat, lng: p.lon, city: p.city, country: p.country, org: p.org, hosts: [p.hostname], risk, issues });
      }
    }
    return [...map.values()].sort((a, b) => RISK_ORDER.indexOf(b.risk) - RISK_ORDER.indexOf(a.risk) || b.hosts.length - a.hosts.length);
  }, [geo, subdomains, findings]);
  const places = useStable(computed, JSON.stringify(computed.map((p) => [p.key, p.risk, p.issues, p.hosts])));

  const origin = useStable(geo?.origin ?? null, JSON.stringify(geo?.origin ?? null));
  const arcs = useMemo(
    () =>
      origin
        ? places.map((p) => ({ startLat: origin.lat, startLng: origin.lon, endLat: p.lat, endLng: p.lng, color: RISK_COLOR[p.risk], key: p.key }))
        : [],
    [origin, places],
  );
  const rings = useMemo(() => places.filter((p) => p.risk === 'critical' || p.risk === 'warning'), [places]);
  const labels = useMemo(() => (origin ? [{ lat: origin.lat, lng: origin.lon, text: 'análise' }] : []), [origin]);
  const pointRadius = useCallback((d: object) => (selected === (d as Place).key ? 0.9 : 0.55), [selected]);

  const flyTo = (p: { lat: number; lng: number }, alt = 1.6) => {
    setRotate(false);
    globeRef.current?.pointOfView({ lat: p.lat, lng: p.lng, altitude: alt }, 1400);
  };

  // enquadra o primeiro servidor uma vez, quando os dados chegam (reenquadrar a
  // cada atualização fazia a câmera pular)
  const framed = useRef<number | null>(null);
  useEffect(() => {
    const first = places[0];
    if (!first || framed.current === scanId) return;
    framed.current = scanId;
    // com origem conhecida, enquadra o meio do caminho para o arco aparecer inteiro
    const lat = origin ? (origin.lat + first.lat) / 2 : first.lat - 10;
    const lng = origin ? (origin.lon + first.lng) / 2 : first.lng - 30;
    globeRef.current?.pointOfView({ lat, lng, altitude: variant === 'mini' ? 1.7 : 2.4 }, 2000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [places, origin, scanId]);

  // diretor: voa até o servidor do host em foco
  useEffect(() => {
    if (!focusHost) return;
    const p = places.find((pl) => pl.hosts.includes(focusHost)) ?? places[0];
    if (p) flyTo(p, 1.5);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusHost, places]);

  useEffect(() => {
    const c = globeRef.current?.controls() as { autoRotate: boolean; autoRotateSpeed: number; enableZoom: boolean } | undefined;
    if (!c) return;
    c.autoRotate = rotate;
    c.autoRotateSpeed = 0.6;
    c.enableZoom = variant !== 'mini';
  }, [rotate, width, countries, variant]);

  return (
    <section
      className={`relative overflow-hidden flex flex-col h-full ${compact ? 'w-full' : 'bg-surface border border-border rounded-xl'}`}
    >
      <div className={`flex items-center justify-between px-5 pt-4 pb-3 border-b border-border ${compact ? 'hidden' : ''}`}>
        <div>
          <h2 className="font-display font-600 text-base text-foreground tracking-wide flex items-center gap-2">
            <Globe2 size={16} /> Onde estão os servidores
          </h2>
          <p className="text-xs text-muted">Localização aproximada pelo IP. Os arcos saem do servidor que fez a análise.</p>
        </div>
        <button
          onClick={() => setRotate((r) => !r)}
          className="p-1.5 rounded text-muted hover:text-foreground hover:bg-surface-2 cursor-pointer"
          title={rotate ? 'Parar rotação' : 'Girar'}
        >
          {rotate ? <Pause size={14} /> : <Play size={14} />}
        </button>
      </div>

      <div
        className={`grid flex-1 min-h-0 ${
          compact ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-[minmax(0,1fr)_240px] min-h-[420px]'
        }`}
      >
        <div
          ref={boxRef}
          className={`relative min-w-0 overflow-hidden ${
            compact ? 'h-full' : 'h-[clamp(420px,calc(100vh-260px),820px)]'
          } ${variant === 'mini' ? 'pointer-events-none' : ''} ${
            compact ? '' : 'bg-[radial-gradient(circle_at_center,#0c1220_0%,#09090b_65%)]'
          }`}
        >
          <Globe
            ref={globeRef}
            width={width}
            height={size.h}
            backgroundColor="rgba(0,0,0,0)"
            globeImageUrl="/globe/earth-night.jpg"
            showAtmosphere
            atmosphereColor="#38bdf8"
            atmosphereAltitude={0.18}
            hexPolygonsData={countries}
            hexPolygonResolution={3}
            hexPolygonMargin={0.62}
            hexPolygonUseDots
            hexPolygonColor={hexColor}
            pointsData={places}
            pointLat="lat"
            pointLng="lng"
            pointColor={pointColor}
            pointAltitude={pointAltitude}
            pointRadius={pointRadius}
            pointsMerge={false}
            pointLabel={pointLabel}
            onPointClick={(d) => {
              const p = d as Place;
              setSelected(p.key);
              flyTo(p, 1.2);
              if (p.hosts.length === 1) setTimeout(() => onOpenHost(p.hosts[0]), 900);
            }}
            ringsData={rings}
            ringLat="lat"
            ringLng="lng"
            ringColor={ringColor}
            ringMaxRadius={5}
            ringPropagationSpeed={2.5}
            ringRepeatPeriod={1100}
            arcsData={arcs}
            arcColor={arcColor}
            arcStroke={0.5}
            arcAltitudeAutoScale={0.45}
            arcDashLength={0.35}
            arcDashGap={0.15}
            arcDashAnimateTime={2200}
            labelsData={labels}
            labelLat="lat"
            labelLng="lng"
            labelText="text"
            labelSize={1.1}
            labelDotRadius={0.5}
            labelColor={labelColor}
            labelResolution={2}
          />
          {!geo && !error && (
            <div className="absolute inset-0 flex items-center justify-center text-xs font-mono text-muted pointer-events-none animate-pulse">
              Localizando servidores…
            </div>
          )}
          {error && (
            <div className="absolute inset-0 flex items-center justify-center text-xs font-mono text-muted pointer-events-none">
              Não foi possível localizar os servidores agora.
            </div>
          )}
        </div>

        <ul
          className={`border-t md:border-t-0 md:border-l border-border p-3 space-y-1.5 overflow-y-auto max-h-[clamp(420px,calc(100vh-260px),820px)] ${
            compact ? 'hidden' : ''
          }`}
        >
          {origin && (
            <li className="text-[10px] font-mono text-sky-300 px-2 py-1.5 rounded bg-sky-400/10 border border-sky-400/20 mb-2">
              Análise partiu de {origin.city ?? '?'}{origin.country ? `, ${origin.country}` : ''}
            </li>
          )}
          {geo && places.length === 0 && <li className="text-xs text-muted font-mono p-2">Nenhum IP público para localizar.</li>}
          {places.map((p, i) => (
            <motion.li key={p.key} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.06 }}>
              <button
                onClick={() => {
                  setSelected(p.key);
                  flyTo(p);
                }}
                className={`w-full text-left rounded-lg border px-2.5 py-2 cursor-pointer transition-colors ${
                  selected === p.key ? 'border-subtle/50 bg-surface-3' : 'border-border-2 bg-surface-2 hover:bg-surface-3'
                }`}
              >
                <p className="text-xs text-foreground flex items-center gap-1.5">
                  <MapPin size={11} style={{ color: RISK_COLOR[p.risk] }} />
                  {p.city ?? '—'}{p.country ? `, ${p.country}` : ''}
                </p>
                <p className="text-[10px] font-mono text-muted truncate">
                  {p.hosts.length} endereço(s){p.org ? ` · ${p.org}` : ''}
                </p>
                {selected === p.key && (
                  <div className="mt-1.5 space-y-0.5">
                    {p.hosts.map((h) => (
                      <span
                        key={h}
                        role="link"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenHost(h);
                        }}
                        className="block text-[10px] font-mono text-subtle hover:text-foreground underline-offset-2 hover:underline truncate"
                      >
                        {h}
                      </span>
                    ))}
                  </div>
                )}
              </button>
            </motion.li>
          ))}
        </ul>
      </div>
    </section>
  );
}
