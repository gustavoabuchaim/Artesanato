import { Composition } from "remotion";
import type { VideoProps } from "../lib/tipos";
import { ALTURA, FPS, LARGURA, Video } from "./Video";

// Exemplo para o Remotion Studio (npm run studio); no app, as cenas vêm do Claude.
const base = { texto: "", enfase: "", itens: [] as string[], destaque: "", imagem: "", credito: "", simbolo: "nenhum" as const };
const exemplo: VideoProps = {
  duracao: 48,
  audio: "",
  logo: "coral",
  base: "",
  cenas: [
    { ...base, tipo: "titulo", inicio: 0, fim: 6, rotulo: "1 · A NOTÍCIA", titulo: "Sua nota fiscal vai mudar", enfase: "nota fiscal", texto: "O que a nova regra muda nas suas vendas", fundo: "azul-noite", acento: "coral", simbolo: "sol" },
    { ...base, tipo: "destaque", inicio: 6, fim: 12, rotulo: "2 · OS NÚMEROS", titulo: "é o novo limite de faturamento do MEI", destaque: "R$ 1.300", fundo: "creme", acento: "amarelo-sol" },
    { ...base, tipo: "comparacao", inicio: 12, fim: 20, rotulo: "2 · OS NÚMEROS", titulo: "O que muda na venda", enfase: "muda", itens: ["Hoje", "Nota para toda venda", "A partir de 2027", "Dispensa para pessoa física"], fundo: "verde-noite", acento: "menta" },
    { ...base, tipo: "topicos", inicio: 20, fim: 28, rotulo: "3 · NA PRÁTICA", titulo: "Quem ganha com a regra", enfase: "ganha", texto: "Vale para artesãs e artesãos formalizados", itens: ["Quem vende em feiras", "Quem vende pelas redes", "Quem vende direto"], fundo: "rosa-papel", acento: "laranja", simbolo: "folha-coral" },
    { ...base, tipo: "passos", inicio: 28, fim: 35, rotulo: "3 · NA PRÁTICA", titulo: "Como se preparar", enfase: "preparar", itens: ["Confira seu cadastro", "Registre suas vendas", "Fale com a contabilidade"], fundo: "azul-noite", acento: "areia" },
    { ...base, tipo: "citacao", inicio: 35, fim: 41, rotulo: "4 · O QUE FICA", titulo: "Cada peça carrega a história de quem fez", destaque: "Artesã expositora", fundo: "branco", acento: "rosa", simbolo: "folha-laranja" },
    { ...base, tipo: "encerramento", inicio: 41, fim: 48, rotulo: "5 · PARA LEVAR", titulo: "Valorize quem faz à mão", enfase: "à mão", texto: "Conta nos comentários como isso muda o seu trabalho", itens: ["Trajetória", "Território", "Técnica"], fundo: "rosa-papel", acento: "coral", simbolo: "sol" },
  ],
};

export function Root() {
  return (
    <Composition
      id="Video"
      component={Video}
      width={LARGURA}
      height={ALTURA}
      fps={FPS}
      durationInFrames={exemplo.duracao * FPS}
      defaultProps={exemplo}
      calculateMetadata={({ props }) => ({ durationInFrames: Math.max(1, Math.ceil(props.duracao * FPS)) })}
    />
  );
}
