import { Composition } from "remotion";
import type { VideoProps } from "../lib/tipos";
import { ALTURA, FPS, LARGURA, Video } from "./Video";

// Exemplo para o Remotion Studio (npm run studio); no app, as cenas vêm do Claude.
const exemplo: VideoProps = {
  duracao: 36,
  audio: "",
  base: "",
  cenas: [
    { tipo: "titulo", inicio: 0, fim: 6, rotulo: "1 · A NOTÍCIA", titulo: "Feira reúne 300 artesãos em Minas", texto: "Encontro valoriza o trabalho feito à mão", itens: [], destaque: "", imagem: "", credito: "" },
    { tipo: "destaque", inicio: 6, fim: 12, rotulo: "2 · OS NÚMEROS", titulo: "artesãos de 40 cidades expõem peças", texto: "Cerâmica, bordado e tecelagem estão entre as técnicas", itens: [], destaque: "300", imagem: "", credito: "" },
    { tipo: "topicos", inicio: 12, fim: 20, rotulo: "3 · O QUE TEM LÁ", titulo: "O que você encontra na feira", texto: "Programação gratuita durante todo o fim de semana", itens: ["Cerâmica do Jequitinhonha", "Oficinas de bordado", "Rodas de conversa"], destaque: "", imagem: "", credito: "" },
    { tipo: "citacao", inicio: 20, fim: 28, rotulo: "4 · QUEM FAZ", titulo: "Cada peça carrega a história de quem fez", texto: "", itens: [], destaque: "Artesã expositora", imagem: "", credito: "" },
    { tipo: "encerramento", inicio: 28, fim: 36, rotulo: "5 · PARA LEVAR", titulo: "Valorize quem faz à mão", texto: "Siga para mais notícias do artesanato", itens: ["Tradição", "Renda", "Cultura"], destaque: "", imagem: "", credito: "" },
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
