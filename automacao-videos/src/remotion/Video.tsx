import { loadFont } from "@remotion/google-fonts/Inter";
import type { CSSProperties, ReactNode } from "react";
import {
  AbsoluteFill,
  Audio,
  Img,
  Sequence,
  interpolate,
  random,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type { Cena, VideoProps } from "../lib/tipos";

const { fontFamily } = loadFont("normal", { weights: ["400", "600", "700", "800"], subsets: ["latin", "latin-ext"] });

export const FPS = 30;
export const LARGURA = 1080;
export const ALTURA = 1920;

const COR = { fundo: "#0a0f1e", painel: "#111a2e", borda: "#26314d", texto: "#e8ecf4", suave: "#8b95ad" };
const DESTAQUES = ["#2dd4bf", "#fb923c", "#f472b6", "#facc15", "#a78bfa", "#60a5fa"];
const MARGEM = 80;

const arquivo = (base: string, nome: string) => (base ? `${base}${nome}` : staticFile(nome));
const limitar = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** Escolhe o tamanho da fonte pelo comprimento do texto: [[até N caracteres, tamanho], ...]. */
function tamanho(texto: string, faixas: [number, number][], menor: number) {
  return faixas.find(([limite]) => texto.length <= limite)?.[1] ?? menor;
}

function useEntrada(atraso = 0) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - atraso, fps, config: { damping: 200 } });
}

export function Video({ cenas, duracao, audio, base }: VideoProps) {
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill style={{ backgroundColor: COR.fundo, fontFamily, color: COR.texto }}>
      <Fundo />
      {cenas.map((cena, i) => {
        const de = Math.round(cena.inicio * fps);
        const duracaoCena = Math.max(1, Math.round(cena.fim * fps) - de);
        return (
          <Sequence key={i} from={de} durationInFrames={duracaoCena} premountFor={fps}>
            <Moldura cena={cena} duracao={duracaoCena} cor={DESTAQUES[i % DESTAQUES.length]} base={base} indice={i} />
          </Sequence>
        );
      })}
      <BarraProgresso total={Math.max(1, Math.ceil(duracao * fps))} />
      {audio && <Audio src={arquivo(base, audio)} />}
    </AbsoluteFill>
  );
}

function Fundo() {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill
      style={{
        backgroundImage:
          "linear-gradient(rgba(255,255,255,0.035) 2px, transparent 2px), linear-gradient(90deg, rgba(255,255,255,0.035) 2px, transparent 2px)",
        backgroundSize: "120px 120px",
      }}
    >
      {Array.from({ length: 28 }, (_, i) => {
        const x = random(`x${i}`) * LARGURA;
        const y = random(`y${i}`) * ALTURA;
        const deriva = Math.sin(frame / 60 + i) * 18;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x,
              top: y + deriva,
              width: 8,
              height: 8,
              borderRadius: 8,
              background: DESTAQUES[i % DESTAQUES.length],
              opacity: 0.18 + random(`o${i}`) * 0.3,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
}

function BarraProgresso({ total }: { total: number }) {
  const frame = useCurrentFrame();
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        bottom: 0,
        height: 12,
        width: (Math.min(frame / total, 1) * LARGURA),
        background: DESTAQUES[0],
        boxShadow: `0 0 24px ${DESTAQUES[0]}`,
      }}
    />
  );
}

type PropsCena = { cena: Cena; duracao: number; cor: string; base: string; indice: number };

/** Partes comuns a toda cena: entrada/saída suave, rótulo do capítulo e legenda embaixo. */
function Moldura(props: PropsCena) {
  const { cena, duracao, cor } = props;
  const frame = useCurrentFrame();
  const opacidade = interpolate(frame, [0, 8, duracao - 6, duracao], [0, 1, 1, 0], limitar);
  const legenda = useEntrada(10);
  const corpo: Record<Cena["tipo"], ReactNode> = {
    titulo: <Titulo {...props} />,
    foto: <Foto {...props} />,
    topicos: <Topicos {...props} />,
    destaque: <Destaque {...props} />,
    citacao: <Citacao {...props} />,
    encerramento: <Encerramento {...props} />,
  };
  return (
    <AbsoluteFill style={{ opacity: opacidade }}>
      {cena.rotulo && (
        <div style={{ position: "absolute", top: 170, left: MARGEM, display: "flex", alignItems: "center", gap: 18 }}>
          <div style={{ width: 8, height: 40, borderRadius: 4, background: cor }} />
          <span style={{ fontSize: 34, fontWeight: 700, letterSpacing: 4, color: COR.suave }}>{cena.rotulo}</span>
        </div>
      )}
      {corpo[cena.tipo]}
      {cena.tipo !== "titulo" && cena.texto && (
        <div
          style={{
            position: "absolute",
            top: 1420,
            left: MARGEM,
            right: MARGEM,
            textAlign: "center",
            fontSize: 44,
            lineHeight: 1.3,
            color: "#cfd6e4",
            textWrap: "balance",
            opacity: legenda,
            transform: `translateY(${(1 - legenda) * 30}px)`,
          }}
        >
          {cena.texto}
        </div>
      )}
    </AbsoluteFill>
  );
}

function Palavras({ texto, estilo, atraso = 0, intervalo = 3 }: { texto: string; estilo: CSSProperties; atraso?: number; intervalo?: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <div style={{ ...estilo, textWrap: "balance" }}>
      {texto.split(/\s+/).map((palavra, i) => {
        const p = spring({ frame: frame - atraso - i * intervalo, fps, config: { damping: 14, mass: 0.6 } });
        return (
          <span key={i} style={{ display: "inline-block", opacity: Math.min(p, 1), transform: `translateY(${(1 - p) * 40}px)` }}>
            {palavra}&nbsp;
          </span>
        );
      })}
    </div>
  );
}

function Titulo({ cena, cor }: PropsCena) {
  const linha = useEntrada(14);
  const sub = useEntrada(22);
  return (
    <AbsoluteFill style={{ justifyContent: "center", padding: `0 ${MARGEM}px`, gap: 48 }}>
      <Palavras
        texto={cena.titulo}
        estilo={{ fontSize: tamanho(cena.titulo, [[28, 112], [48, 96]], 80), fontWeight: 800, lineHeight: 1.08 }}
      />
      <div style={{ height: 10, width: 260 * linha, borderRadius: 5, background: cor }} />
      {cena.texto && (
        <div style={{ fontSize: 48, lineHeight: 1.3, color: COR.suave, opacity: sub, textWrap: "balance" }}>{cena.texto}</div>
      )}
    </AbsoluteFill>
  );
}

function Foto(props: PropsCena) {
  const { cena, cor, base, duracao } = props;
  const frame = useCurrentFrame();
  const entrada = useEntrada(0);
  const titulo = useEntrada(12);
  if (!cena.imagem) return <Titulo {...props} />;
  const zoom = interpolate(frame, [0, duracao], [1.04, 1.16], limitar);
  return (
    <AbsoluteFill>
      <div
        style={{
          position: "absolute",
          top: 290,
          left: MARGEM,
          right: MARGEM,
          height: 860,
          borderRadius: 40,
          overflow: "hidden",
          border: `4px solid ${cor}`,
          boxShadow: `0 30px 80px rgba(0,0,0,0.5)`,
          opacity: entrada,
          transform: `scale(${0.92 + entrada * 0.08})`,
        }}
      >
        <Img
          src={arquivo(base, cena.imagem)}
          style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${zoom})` }}
        />
        {cena.credito && (
          <span
            style={{
              position: "absolute",
              right: 20,
              bottom: 20,
              padding: "8px 18px",
              borderRadius: 30,
              background: "rgba(0,0,0,0.6)",
              fontSize: 24,
              color: "#dfe4ee",
            }}
          >
            {cena.credito}
          </span>
        )}
      </div>
      <div
        style={{
          position: "absolute",
          top: 1200,
          left: MARGEM,
          right: MARGEM,
          fontSize: tamanho(cena.titulo, [[30, 68], [50, 58]], 50),
          fontWeight: 800,
          lineHeight: 1.12,
          textWrap: "balance",
          opacity: titulo,
          transform: `translateY(${(1 - titulo) * 40}px)`,
        }}
      >
        {cena.titulo}
      </div>
    </AbsoluteFill>
  );
}

function Topicos({ cena, cor, duracao, indice }: PropsCena) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const titulo = useEntrada(0);
  const itens = cena.itens.slice(0, 4);
  // Os itens entram espalhados pelos primeiros 60% da cena, no ritmo da fala.
  const intervalo = Math.max(6, Math.floor((duracao * 0.6) / Math.max(itens.length, 1)));
  return (
    <AbsoluteFill>
      <div
        style={{
          position: "absolute",
          top: 300,
          left: MARGEM,
          right: MARGEM,
          fontSize: tamanho(cena.titulo, [[30, 76], [50, 64]], 54),
          fontWeight: 800,
          lineHeight: 1.1,
          textWrap: "balance",
          opacity: titulo,
        }}
      >
        {cena.titulo}
      </div>
      <div style={{ position: "absolute", top: 590, left: MARGEM, right: MARGEM, display: "flex", flexDirection: "column", gap: 34 }}>
        {itens.map((item, i) => {
          const p = spring({ frame: frame - 10 - i * intervalo, fps, config: { damping: 200 } });
          const corItem = DESTAQUES[(indice + i) % DESTAQUES.length];
          return (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 32,
                padding: "34px 40px",
                borderRadius: 28,
                background: COR.painel,
                border: `2px solid ${COR.borda}`,
                borderLeft: `10px solid ${corItem}`,
                opacity: p,
                transform: `translateX(${(1 - p) * -80}px)`,
              }}
            >
              <span
                style={{
                  flexShrink: 0,
                  width: 72,
                  height: 72,
                  borderRadius: 36,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: i === 0 ? cor : corItem,
                  color: COR.fundo,
                  fontSize: 38,
                  fontWeight: 800,
                }}
              >
                {i + 1}
              </span>
              <span style={{ fontSize: 50, fontWeight: 600, lineHeight: 1.15 }}>{item}</span>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
}

function Destaque({ cena, cor }: PropsCena) {
  const frame = useCurrentFrame();
  const numero = useEntrada(4);
  const titulo = useEntrada(16);
  const anel = interpolate(frame, [0, 40], [0.6, 1.25], limitar);
  const valor = cena.destaque || cena.titulo;
  return (
    <AbsoluteFill style={{ alignItems: "center" }}>
      <div
        style={{
          position: "absolute",
          top: 360,
          width: 640,
          height: 640,
          borderRadius: 320,
          border: `4px solid ${cor}`,
          opacity: interpolate(frame, [0, 40], [0.5, 0.12], limitar),
          transform: `scale(${anel})`,
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 520,
          left: MARGEM,
          right: MARGEM,
          textAlign: "center",
          fontSize: Math.min(250, Math.floor(1500 / Math.max(valor.length, 3))),
          fontWeight: 800,
          color: cor,
          textShadow: `0 0 60px ${cor}66`,
          transform: `scale(${0.6 + numero * 0.4})`,
          opacity: numero,
        }}
      >
        {valor}
      </div>
      {cena.destaque && (
        <div
          style={{
            position: "absolute",
            top: 1060,
            left: MARGEM,
            right: MARGEM,
            textAlign: "center",
            fontSize: tamanho(cena.titulo, [[40, 64]], 54),
            fontWeight: 700,
            lineHeight: 1.15,
            textWrap: "balance",
            opacity: titulo,
            transform: `translateY(${(1 - titulo) * 30}px)`,
          }}
        >
          {cena.titulo}
        </div>
      )}
    </AbsoluteFill>
  );
}

function Citacao({ cena, cor, duracao }: PropsCena) {
  const aspas = useEntrada(0);
  const autor = useEntrada(Math.floor(duracao * 0.5));
  const palavras = cena.titulo.split(/\s+/).length;
  return (
    <AbsoluteFill style={{ padding: `0 ${MARGEM}px` }}>
      <div style={{ position: "absolute", top: 250, left: MARGEM, fontSize: 340, lineHeight: 1, fontWeight: 800, color: cor, opacity: aspas }}>
        “
      </div>
      <Palavras
        texto={cena.titulo}
        atraso={8}
        intervalo={Math.max(1, Math.floor((duracao * 0.45) / palavras))}
        estilo={{
          position: "absolute",
          top: 560,
          left: MARGEM,
          right: MARGEM,
          fontSize: tamanho(cena.titulo, [[60, 70], [110, 60]], 52),
          fontWeight: 600,
          fontStyle: "italic",
          lineHeight: 1.25,
        }}
      />
      {cena.destaque && (
        <div style={{ position: "absolute", top: 1180, left: MARGEM, right: MARGEM, fontSize: 42, color: COR.suave, opacity: autor }}>
          — {cena.destaque}
        </div>
      )}
    </AbsoluteFill>
  );
}

function Encerramento({ cena, cor, duracao }: PropsCena) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const selos = cena.itens.slice(0, 3);
  const intervalo = Math.max(6, Math.floor((duracao * 0.4) / Math.max(selos.length, 1)));
  const titulo = useEntrada(10 + selos.length * intervalo);
  return (
    <AbsoluteFill style={{ alignItems: "center" }}>
      <div style={{ position: "absolute", top: 380, display: "flex", flexDirection: "column", alignItems: "center", gap: 22 }}>
        {selos.map((selo, i) => {
          const p = spring({ frame: frame - 6 - i * intervalo, fps, config: { damping: 14, mass: 0.6 } });
          const ultimo = i === selos.length - 1;
          const corSelo = ultimo ? cor : DESTAQUES[(i + 1) % DESTAQUES.length];
          return (
            <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 22, opacity: Math.min(p, 1) }}>
              {i > 0 && <span style={{ fontSize: 56, color: COR.suave }}>{ultimo && selos.length > 2 ? "=" : "+"}</span>}
              <span
                style={{
                  padding: "22px 52px",
                  borderRadius: 60,
                  fontSize: 56,
                  fontWeight: 700,
                  border: `4px solid ${corSelo}`,
                  background: ultimo ? corSelo : `${corSelo}22`,
                  color: ultimo ? COR.fundo : COR.texto,
                  transform: `scale(${0.7 + Math.min(p, 1) * 0.3})`,
                }}
              >
                {selo}
              </span>
            </div>
          );
        })}
      </div>
      <div
        style={{
          position: "absolute",
          top: selos.length ? 1120 : 700,
          left: MARGEM,
          right: MARGEM,
          textAlign: "center",
          fontSize: tamanho(cena.titulo, [[40, 66]], 56),
          fontWeight: 800,
          lineHeight: 1.12,
          textWrap: "balance",
          opacity: titulo,
          transform: `translateY(${(1 - titulo) * 30}px)`,
        }}
      >
        {cena.titulo}
      </div>
    </AbsoluteFill>
  );
}
