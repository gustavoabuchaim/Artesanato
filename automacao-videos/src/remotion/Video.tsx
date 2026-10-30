import { loadFont as carregarArchivo } from "@remotion/google-fonts/Archivo";
import { loadFont as carregarBodoni } from "@remotion/google-fonts/LibreBodoni";
import type { CSSProperties, ReactNode } from "react";
import {
  AbsoluteFill,
  Audio,
  Easing,
  Img,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { contagem, palavrasComEnfase, simboloParaFundo } from "../lib/cenas";
import type { Cena, Logo, VideoProps } from "../lib/tipos";

// Identidade: design system "Fernanda Sklovsky" (tokens e regras copiados de project/tokens.json e
// README.md; imagens em public/marca). Fundos chapados, blocos retos, sem sombra, gradiente ou borda.
const { fontFamily: ARCHIVO } = carregarArchivo("normal", { weights: ["400", "600", "700", "800"], subsets: ["latin", "latin-ext"] });
const { fontFamily: BODONI } = carregarBodoni("italic", { weights: ["400"], subsets: ["latin", "latin-ext"] });

export const FPS = 30;
export const LARGURA = 1080;
export const ALTURA = 1920;

const TINTA = "#231f20";
const FUNDOS: Record<Cena["fundo"], { cor: string; escuro: boolean }> = {
  "azul-noite": { cor: "#092839", escuro: true },
  "verde-noite": { cor: "#122726", escuro: true },
  creme: { cor: "#e2dbc8", escuro: false },
  "rosa-papel": { cor: "#f2e5db", escuro: false },
  branco: { cor: "#ffffff", escuro: false },
};
// Todos aceitam texto em tinta por cima; o coral (4:1) só recebe texto grande e em negrito.
const ACENTOS: Record<Cena["acento"], string> = {
  coral: "#d45933",
  "amarelo-sol": "#ffa638",
  laranja: "#ff5e1f",
  rosa: "#e4b3a2",
  menta: "#acd8b7",
  "verde-agua": "#69b099",
  areia: "#b19367",
};
const ORDEM_ACENTOS = Object.keys(ACENTOS) as Cena["acento"][];
const SIMBOLOS: Record<Exclude<Cena["simbolo"], "nenhum">, { arquivo: string; acento: Cena["acento"] }> = {
  "folha-coral": { arquivo: "simbolo-coral.png", acento: "coral" },
  "folha-laranja": { arquivo: "simbolo-laranja.png", acento: "amarelo-sol" },
  sol: { arquivo: "simbolo-sol.png", acento: "amarelo-sol" },
  passaro: { arquivo: "simbolo-rosa.png", acento: "rosa" },
  vaso: { arquivo: "simbolo-verde.png", acento: "menta" },
};

const MARGEM = 80;
const arquivo = (base: string, nome: string) => (base ? `${base}${nome}` : staticFile(nome));
const marca = (base: string, nome: string) => (base ? `/marca/${nome}` : staticFile(`marca/${nome}`));
const limitar = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const legendaEstilo: CSSProperties = { fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" };

/** Escolhe o tamanho da fonte pelo comprimento do texto: [[até N caracteres, tamanho], ...]. */
function tamanho(texto: string, faixas: [number, number][], menor: number) {
  return faixas.find(([limite]) => texto.length <= limite)?.[1] ?? menor;
}

function useEntrada(atraso = 0) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - atraso, fps, config: { damping: 200 } });
}

export function Video({ cenas, duracao, audio, logo, base }: VideoProps) {
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill style={{ backgroundColor: FUNDOS["azul-noite"].cor, fontFamily: ARCHIVO }}>
      {cenas.map((cena, i) => {
        const de = Math.round(cena.inicio * fps);
        const duracaoCena = Math.max(1, Math.round(cena.fim * fps) - de);
        return (
          <Sequence key={i} from={de} durationInFrames={duracaoCena} premountFor={fps}>
            <Moldura cena={cena} duracao={duracaoCena} base={base} indice={i} logo={logo} />
          </Sequence>
        );
      })}
      <BarraProgresso total={Math.max(1, Math.ceil(duracao * fps))} />
      {audio && <Audio src={arquivo(base, audio)} />}
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
        width: Math.min(frame / total, 1) * LARGURA,
        background: ACENTOS["amarelo-sol"],
      }}
    />
  );
}

type PropsMoldura = { cena: Cena; duracao: number; base: string; indice: number; logo: Logo };
type Tema = { fundo: string; ink: string; suave: string; logo: string };
type PropsCena = PropsMoldura & {
  tema: Tema;
  acento: string;
  /** Cor de bloco n-ésima a partir do acento da cena. */
  bloco: (n: number) => string;
  simbolo: Cena["simbolo"];
};

/** Partes comuns: fundo, cortina de papel entre cenas, rótulo, logo pequeno, símbolo e frase de apoio. */
function Moldura(props: PropsMoldura) {
  const { cena, indice, logo, base } = props;
  const frame = useCurrentFrame();
  const apoio = useEntrada(10);

  // Cenas salvas antes do design system não têm estes campos.
  const dadosFundo = FUNDOS[cena.fundo] ?? FUNDOS["azul-noite"];
  const simbolo = simboloParaFundo(cena.simbolo ?? "nenhum", cena.fundo ?? "azul-noite");
  // Símbolo e bloco da mesma cor se confundiriam: o acento avança uma posição.
  let nomeAcento: Cena["acento"] = ACENTOS[cena.acento] ? cena.acento : "coral";
  if (simbolo !== "nenhum" && SIMBOLOS[simbolo].acento === nomeAcento) {
    nomeAcento = ORDEM_ACENTOS[(ORDEM_ACENTOS.indexOf(nomeAcento) + 1) % ORDEM_ACENTOS.length];
  }
  const acento = ACENTOS[nomeAcento];
  const bloco = (n: number) => ACENTOS[ORDEM_ACENTOS[(ORDEM_ACENTOS.indexOf(nomeAcento) + n) % ORDEM_ACENTOS.length]];
  const tema: Tema = dadosFundo.escuro
    ? { fundo: dadosFundo.cor, ink: "#ffffff", suave: "#b19367", logo: "branca" }
    : { fundo: dadosFundo.cor, ink: TINTA, suave: "#68663c", logo: "preta" };

  const cenaProps: PropsCena = { ...props, tema, acento, bloco, simbolo };
  const corpo: Record<Cena["tipo"], ReactNode> = {
    titulo: <Titulo {...cenaProps} />,
    foto: <Foto {...cenaProps} />,
    topicos: <Topicos {...cenaProps} />,
    passos: <Passos {...cenaProps} />,
    comparacao: <Comparacao {...cenaProps} />,
    destaque: <Destaque {...cenaProps} />,
    citacao: <Citacao {...cenaProps} />,
    encerramento: <Encerramento {...cenaProps} />,
  };

  const temImagem = cena.tipo === "foto" && Boolean(cena.imagem);
  const simboloNoCanto = simbolo !== "nenhum" && cena.tipo !== "titulo" && !temImagem;
  const cortina = indice === 0 ? 1 : interpolate(frame, [0, 13], [0, 1], { ...limitar, easing: Easing.inOut(Easing.cubic) });
  const entradaSimbolo = useEntrada(6);

  return (
    <AbsoluteFill style={{ backgroundColor: tema.fundo, color: tema.ink, overflow: "hidden" }}>
      {simboloNoCanto && (
        <Img
          src={marca(base, SIMBOLOS[simbolo].arquivo)}
          style={{
            position: "absolute",
            right: -90,
            bottom: 130,
            width: 460,
            height: 560,
            objectFit: "contain",
            transform: `translateX(${(1 - entradaSimbolo) * 400}px) rotate(${interpolate(frame, [0, props.duracao], [-4, 4], limitar)}deg)`,
          }}
        />
      )}
      {!temImagem && (
        <div style={{ position: "absolute", top: 150, left: MARGEM, right: MARGEM, height: 76, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 40 }}>
          <span style={{ ...legendaEstilo, fontSize: 30, lineHeight: 1.25, color: tema.suave }}>{cena.rotulo}</span>
          {cena.tipo !== "encerramento" && (
            <Img src={marca(base, `logo-${logo}-${tema.logo}.png`)} style={{ width: 290, flexShrink: 0 }} />
          )}
        </div>
      )}
      {corpo[cena.tipo]}
      {cena.tipo !== "titulo" && cena.texto && (
        <div
          style={{
            position: "absolute",
            top: 1420,
            left: MARGEM,
            width: simboloNoCanto ? 600 : LARGURA - MARGEM * 2,
            fontSize: 44,
            lineHeight: 1.28,
            fontWeight: 400,
            textWrap: "balance",
            opacity: apoio,
            transform: `translateY(${(1 - apoio) * 30}px)`,
          }}
        >
          {cena.texto}
        </div>
      )}
      {/* Bloco de papel que atravessa a tela na troca de cena, no lugar de um fade. */}
      {cortina < 1 && <AbsoluteFill style={{ backgroundColor: acento, transform: `translateX(${cortina * 100}%)` }} />}
    </AbsoluteFill>
  );
}

/** Título em grotesco pesado; a ênfase vira um recorte colorido com a palavra em serifa itálica. */
function Manchete({ cena, acento, estilo, atraso = 0, intervalo = 3 }: { cena: Cena; acento: string; estilo: CSSProperties; atraso?: number; intervalo?: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <div style={{ fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1.06, textWrap: "balance", ...estilo }}>
      {palavrasComEnfase(cena.titulo, cena.enfase).map(({ palavra, enfase }, i) => {
        const p = spring({ frame: frame - atraso - i * intervalo, fps, config: { damping: 200 } });
        return (
          <span key={i}>
            <span
              style={{
                display: "inline-block",
                opacity: p,
                transform: `translateY(${(1 - p) * 36}px)`,
                ...(enfase
                  ? { background: acento, color: TINTA, fontFamily: BODONI, fontStyle: "italic", fontWeight: 400, letterSpacing: 0, padding: "0 0.14em" }
                  : {}),
              }}
            >
              {palavra}
            </span>{" "}
          </span>
        );
      })}
    </div>
  );
}

function Titulo({ cena, tema, acento, bloco, simbolo, base }: PropsCena) {
  const a = useEntrada(4);
  const b = useEntrada(10);
  const c = useEntrada(16);
  const sub = useEntrada(14);
  return (
    <AbsoluteFill>
      <Manchete
        cena={cena}
        acento={acento}
        estilo={{ position: "absolute", top: 290, left: MARGEM, right: MARGEM, fontSize: tamanho(cena.titulo, [[26, 128], [44, 108]], 92) }}
      />
      {cena.texto && (
        <div
          style={{
            position: "absolute",
            top: 950,
            left: MARGEM,
            right: MARGEM,
            fontFamily: BODONI,
            fontStyle: "italic",
            fontSize: 58,
            lineHeight: 1.2,
            color: tema.suave,
            textWrap: "balance",
            opacity: sub,
          }}
        >
          {cena.texto}
        </div>
      )}
      {/* Um bloco dominante e dois menores, encostados, como as páginas de paleta do manual. */}
      <div style={{ position: "absolute", left: 0, top: 1260, width: 640, height: 660, background: acento, transform: `translateY(${(1 - a) * 700}px)` }} />
      <div style={{ position: "absolute", left: 640, top: 1260, width: 440, height: 330, background: bloco(2), transform: `translateY(${(1 - b) * 700}px)` }} />
      <div style={{ position: "absolute", left: 640, top: 1590, width: 440, height: 330, background: bloco(4), transform: `translateY(${(1 - c) * 400}px)` }} />
      {simbolo !== "nenhum" && (
        <Img
          src={marca(base, SIMBOLOS[simbolo].arquivo)}
          style={{
            position: "absolute",
            left: -60,
            top: 1200,
            width: 690,
            height: 780,
            objectFit: "contain",
            opacity: b,
            transform: `translateY(${(1 - b) * 300}px)`,
          }}
        />
      )}
    </AbsoluteFill>
  );
}

function Foto(props: PropsCena) {
  const { cena, tema, acento, base, duracao } = props;
  const frame = useCurrentFrame();
  const entrada = useEntrada(0);
  if (!cena.imagem) return <Titulo {...props} simbolo={props.simbolo} />;
  const zoom = interpolate(frame, [0, duracao], [1.02, 1.12], limitar);
  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1040, overflow: "hidden", opacity: entrada }}>
        <Img src={arquivo(base, cena.imagem)} style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${zoom})` }} />
        {cena.credito && (
          <span style={{ position: "absolute", right: MARGEM, bottom: 28, padding: "8px 22px", borderRadius: 999, background: TINTA, color: "#ffffff", fontSize: 24, fontWeight: 600 }}>
            {cena.credito}
          </span>
        )}
      </div>
      <div style={{ position: "absolute", top: 1040, left: 0, width: LARGURA * entrada, height: 24, background: acento }} />
      <div style={{ ...legendaEstilo, position: "absolute", top: 1100, left: MARGEM, right: MARGEM, fontSize: 30, color: tema.suave }}>{cena.rotulo}</div>
      <Manchete
        cena={cena}
        acento={acento}
        atraso={6}
        estilo={{ position: "absolute", top: 1160, left: MARGEM, right: MARGEM, fontSize: tamanho(cena.titulo, [[30, 84], [50, 72]], 62) }}
      />
    </AbsoluteFill>
  );
}

/** Título do alto das cenas com lista, passos e comparação. */
function TituloDeLista({ cena, acento }: Pick<PropsCena, "cena" | "acento">) {
  return (
    <Manchete
      cena={cena}
      acento={acento}
      estilo={{ position: "absolute", top: 270, left: MARGEM, right: MARGEM, fontSize: tamanho(cena.titulo, [[24, 92], [44, 78]], 66) }}
    />
  );
}

function Topicos({ cena, acento, bloco, duracao }: PropsCena) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const itens = cena.itens.slice(0, 4);
  // Os itens entram espalhados pelos primeiros 60% da cena, no ritmo da fala.
  const intervalo = Math.max(6, Math.floor((duracao * 0.6) / Math.max(itens.length, 1)));
  return (
    <AbsoluteFill>
      <TituloDeLista cena={cena} acento={acento} />
      <div style={{ position: "absolute", top: 590, left: 0, display: "flex", flexDirection: "column", gap: 16 }}>
        {itens.map((item, i) => {
          const p = spring({ frame: frame - 8 - i * intervalo, fps, config: { damping: 200 } });
          return (
            <div
              key={i}
              style={{
                width: 960,
                minHeight: 160,
                boxSizing: "border-box",
                padding: `28px 48px 28px ${MARGEM}px`,
                display: "flex",
                alignItems: "center",
                background: bloco(i),
                color: TINTA,
                fontSize: 58,
                fontWeight: 700,
                lineHeight: 1.1,
                letterSpacing: "-0.01em",
                transform: `translateX(${(1 - p) * -1000}px)`,
              }}
            >
              {item}
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
}

function Passos({ cena, acento, bloco, duracao }: PropsCena) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const itens = cena.itens.slice(0, 4);
  const intervalo = Math.max(6, Math.floor((duracao * 0.6) / Math.max(itens.length, 1)));
  return (
    <AbsoluteFill>
      <TituloDeLista cena={cena} acento={acento} />
      <div style={{ position: "absolute", top: 590, left: MARGEM, right: MARGEM, display: "flex", flexDirection: "column" }}>
        {itens.map((item, i) => {
          const p = spring({ frame: frame - 8 - i * intervalo, fps, config: { damping: 200 } });
          return (
            <div
              key={i}
              style={{
                marginTop: i ? -14 : 0,
                minHeight: 200,
                boxSizing: "border-box",
                padding: "28px 44px 62px",
                display: "flex",
                alignItems: "center",
                gap: 36,
                background: bloco(i),
                color: TINTA,
                // Seta para baixo, a mesma ideia das setas encadeadas do diagrama do método.
                clipPath: i < itens.length - 1 ? "polygon(0 0, 100% 0, 100% calc(100% - 40px), 50% 100%, 0 calc(100% - 40px))" : undefined,
                zIndex: itens.length - i,
                opacity: p,
                transform: `translateY(${(1 - p) * -60}px)`,
              }}
            >
              <span style={{ fontSize: 96, fontWeight: 800, lineHeight: 1 }}>{i + 1}</span>
              <span style={{ fontSize: 50, fontWeight: 700, lineHeight: 1.12 }}>{item}</span>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
}

function Comparacao({ cena, acento, duracao }: PropsCena) {
  const a = useEntrada(6);
  const b = useEntrada(Math.floor(duracao * 0.35));
  const [rotuloA = "", textoA = "", rotuloB = "", textoB = ""] = cena.itens;
  const lado = (rotulo: string, texto: string, cor: string, top: number, deslocamento: number) => (
    <div
      style={{
        position: "absolute",
        top,
        left: 0,
        right: 0,
        height: 390,
        boxSizing: "border-box",
        padding: `40px ${MARGEM}px`,
        background: cor,
        color: TINTA,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        gap: 18,
        transform: `translateX(${deslocamento}px)`,
      }}
    >
      <span style={{ ...legendaEstilo, fontSize: 32 }}>{rotulo}</span>
      <span style={{ fontSize: tamanho(texto, [[28, 78], [50, 64]], 52), fontWeight: 800, lineHeight: 1.08, letterSpacing: "-0.015em" }}>{texto}</span>
    </div>
  );
  return (
    <AbsoluteFill>
      <TituloDeLista cena={cena} acento={acento} />
      {lado(rotuloA, textoA, acento === ACENTOS.areia ? ACENTOS.menta : ACENTOS.areia, 560, (1 - a) * -1080)}
      {lado(rotuloB, textoB, acento, 950, (1 - b) * 1080)}
    </AbsoluteFill>
  );
}

function Destaque({ cena, acento, tema, duracao }: PropsCena) {
  const frame = useCurrentFrame();
  const blocoEntrada = useEntrada(0);
  const valor = cena.destaque || cena.titulo;
  // A contagem termina antes do meio da cena, para o número final ficar um tempo parado.
  const progresso = interpolate(frame, [4, Math.min(45, duracao * 0.45)], [0, 1], { ...limitar, easing: Easing.out(Easing.cubic) });
  return (
    <AbsoluteFill>
      <div
        style={{
          position: "absolute",
          top: 280,
          left: 0,
          width: LARGURA * blocoEntrada,
          height: 680,
          background: acento,
          overflow: "hidden",
          display: "flex",
          alignItems: "center",
        }}
      >
        <span
          style={{
            flexShrink: 0,
            width: LARGURA,
            boxSizing: "border-box",
            padding: `0 ${MARGEM}px`,
            color: TINTA,
            // Valor curto ocupa a largura toda; frase longa (sem número) quebra em linhas grandes.
            fontSize: valor.length <= 12 ? Math.min(370, Math.floor(1700 / Math.max(valor.length, 3))) : tamanho(valor, [[30, 128]], 100),
            fontWeight: 800,
            letterSpacing: "-0.03em",
            lineHeight: 1.02,
          }}
        >
          {contagem(valor, progresso)}
        </span>
      </div>
      {cena.destaque && (
        <Manchete
          cena={{ ...cena, enfase: "" }}
          acento={acento}
          atraso={12}
          estilo={{ position: "absolute", top: 1020, left: MARGEM, right: MARGEM, color: tema.ink, fontSize: tamanho(cena.titulo, [[34, 84], [60, 68]], 58) }}
        />
      )}
    </AbsoluteFill>
  );
}

function Citacao({ cena, acento, tema, duracao }: PropsCena) {
  const bloco = useEntrada(0);
  const autor = useEntrada(Math.floor(duracao * 0.55));
  const palavras = cena.titulo.split(/\s+/).length;
  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", top: 280, left: 0, width: (MARGEM + 200) * bloco, height: 200, background: acento, overflow: "hidden" }}>
        <span style={{ position: "absolute", left: MARGEM, top: 10, fontFamily: BODONI, fontStyle: "italic", fontSize: 300, lineHeight: 1, color: TINTA }}>“</span>
      </div>
      <Manchete
        cena={{ ...cena, enfase: "" }}
        acento={acento}
        atraso={8}
        intervalo={Math.max(1, Math.floor((duracao * 0.45) / palavras))}
        estilo={{
          position: "absolute",
          top: 540,
          left: MARGEM,
          right: MARGEM,
          fontFamily: BODONI,
          fontStyle: "italic",
          fontWeight: 400,
          letterSpacing: 0,
          lineHeight: 1.18,
          fontSize: tamanho(cena.titulo, [[50, 100], [100, 84]], 68),
        }}
      />
      {cena.destaque && (
        <div style={{ ...legendaEstilo, position: "absolute", top: 1270, left: MARGEM, right: MARGEM, fontSize: 32, color: tema.suave, opacity: autor }}>{cena.destaque}</div>
      )}
    </AbsoluteFill>
  );
}

function Encerramento({ cena, acento, bloco, tema, base, logo, duracao }: PropsCena) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const etiquetas = cena.itens.slice(0, 3);
  const entradaLogo = useEntrada(Math.floor(duracao * 0.3));
  return (
    <AbsoluteFill>
      <Manchete
        cena={cena}
        acento={acento}
        estilo={{ position: "absolute", top: 270, left: MARGEM, right: MARGEM, fontSize: tamanho(cena.titulo, [[30, 104], [54, 88]], 72) }}
      />
      <div style={{ position: "absolute", top: 730, left: MARGEM, right: MARGEM, display: "flex", flexWrap: "wrap", gap: 18 }}>
        {etiquetas.map((etiqueta, i) => {
          const p = spring({ frame: frame - 12 - i * 6, fps, config: { damping: 200 } });
          return (
            <span key={i} style={{ padding: "16px 38px", borderRadius: 999, background: bloco(i), color: TINTA, fontSize: 42, fontWeight: 700, opacity: p, transform: `translateY(${(1 - p) * 30}px)` }}>
              {etiqueta}
            </span>
          );
        })}
      </div>
      <Img
        src={marca(base, `logo-${logo}-${tema.logo}.png`)}
        style={{ position: "absolute", top: 1010, left: (LARGURA - 800) / 2, width: 800, opacity: entradaLogo, transform: `translateY(${(1 - entradaLogo) * 24}px)` }}
      />
    </AbsoluteFill>
  );
}
