import { spawn } from "node:child_process";
import path from "node:path";
import { downloadWhisperModel, installWhisperCpp, transcribe } from "@remotion/install-whisper-cpp";
import { agruparFrases } from "./cenas";
import type { Segmento } from "./tipos";

const CLI = path.join(process.cwd(), "node_modules", "@remotion", "cli", "remotion-cli.js");
const ENTRADA_VIDEO = path.join(process.cwd(), "src", "remotion", "index.ts");

/** Roda o CLI do Remotion (que traz ffmpeg e ffprobe próprios) e devolve a saída. */
export function remotion(args: string[], aoLer?: (trecho: string) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const processo = spawn(process.execPath, [CLI, ...args], { cwd: process.cwd() });
    let saida = "";
    const ler = (dados: Buffer) => {
      const trecho = dados.toString();
      saida = (saida + trecho).slice(-8000);
      aoLer?.(trecho);
    };
    processo.stdout.on("data", ler);
    processo.stderr.on("data", ler);
    processo.on("error", reject);
    processo.on("close", (codigo) =>
      codigo === 0 ? resolve(saida) : reject(new Error(`Falha no remotion ${args[0]} (código ${codigo}): ${saida.slice(-600)}`)),
    );
  });
}

/** Gera a voz do vídeo (AAC) e a versão 16 kHz que o whisper exige. */
export async function converterAudio(original: string, pasta: string) {
  // Nome novo a cada envio: o navegador guarda o áudio em cache pelo nome.
  const voz = path.join(pasta, `voz-${Date.now()}.m4a`);
  const wav = path.join(pasta, "voz.wav");
  // "-f mp4": o ffmpeg do Remotion não deduz o formato pela extensão .m4a.
  await remotion(["ffmpeg", "-y", "-i", original, "-vn", "-ac", "2", "-ar", "44100", "-c:a", "aac", "-b:a", "160k", "-f", "mp4", voz]);
  await remotion(["ffmpeg", "-y", "-i", original, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", wav]);
  return { voz, wav };
}

export async function duracaoAudio(arquivo: string) {
  const saida = await remotion(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", arquivo]);
  const segundos = Number(saida.trim().split(/\s+/).at(-1));
  if (!(segundos > 0)) throw new Error("Não consegui ler a duração do áudio. O arquivo está inteiro?");
  return segundos;
}

const PASTA_WHISPER = path.join(process.cwd(), ".whisper");
// 1.5.5: última versão com binário pronto para Windows; no Linux o Remotion compila do código-fonte.
const VERSAO_WHISPER = "1.5.5";
// shortcut: modelo "small" (rápido em CPU de VPS); trocar por "medium" se a transcrição errar muito.
const MODELO_WHISPER = "small";

/** Instala o whisper.cpp e baixa o modelo na primeira vez (cerca de 500 MB). */
export async function prepararWhisper() {
  await installWhisperCpp({ to: PASTA_WHISPER, version: VERSAO_WHISPER, printOutput: false });
  await downloadWhisperModel({ model: MODELO_WHISPER, folder: PASTA_WHISPER, printOutput: false });
}

export async function transcrever(wav: string, aoProgredir: (fracao: number) => void): Promise<Segmento[]> {
  await prepararWhisper();
  const { transcription } = await transcribe({
    inputPath: wav,
    whisperPath: PASTA_WHISPER,
    whisperCppVersion: VERSAO_WHISPER,
    model: MODELO_WHISPER,
    modelFolder: PASTA_WHISPER,
    tokenLevelTimestamps: false,
    language: "pt",
    printOutput: false,
    onProgress: (fracao) => aoProgredir(Math.min(fracao, 1)),
  });
  // O whisper devolve pedaços de palavra; o texto cru mantém o espaço que marca palavra nova.
  return agruparFrases(transcription.map((t) => ({ inicio: t.offsets.from / 1000, fim: t.offsets.to / 1000, texto: t.text })));
}

/** Renderiza o vídeo com os arquivos de `pastaArquivos` servidos como staticFile(). */
export async function renderizarVideo(arquivoProps: string, pastaArquivos: string, saida: string, aoProgredir: (fracao: number) => void) {
  await remotion(
    ["render", ENTRADA_VIDEO, "Video", saida, `--props=${arquivoProps}`, `--public-dir=${pastaArquivos}`],
    (trecho) => {
      // O CLI imprime "123/1800" ao renderizar e ao codificar os quadros.
      const ultimo = [...trecho.matchAll(/(\d+)\/(\d+)/g)].at(-1);
      if (ultimo && Number(ultimo[2]) > 0) aoProgredir(Number(ultimo[1]) / Number(ultimo[2]));
    },
  );
}
