import type { Segmento } from "./tipos";

const MINIMO_S = 0.5;
const FRASE_MAXIMA_S = 8;

/**
 * Junta os pedaços de palavra do whisper em frases: fecha em . ? ! ou, numa fala sem pausa,
 * a cada ~8 s na troca de palavra. Remove marcações como [MÚSICA DE FUNDO].
 */
export function agruparFrases(pedacos: Segmento[]): Segmento[] {
  const frases: Segmento[] = [];
  let atual: Segmento | null = null;
  for (const pedaco of pedacos) {
    const palavraNova = /^\s/.test(pedaco.texto);
    if (atual && palavraNova && pedaco.inicio - atual.inicio > FRASE_MAXIMA_S) {
      frases.push(atual);
      atual = null;
    }
    atual ??= { inicio: pedaco.inicio, fim: pedaco.fim, texto: "" };
    atual.texto += pedaco.texto;
    atual.fim = pedaco.fim;
    if (/[.?!]\s*$/.test(pedaco.texto)) {
      frases.push(atual);
      atual = null;
    }
  }
  if (atual) frases.push(atual);
  return frases
    .map((f) => ({
      ...f,
      // �: o whisper corta caracteres como "º" entre dois pedaços e cada metade vira lixo.
      texto: f.texto.replace(/\[[^\]]*\]?|\([^)]*\)|�/g, "").replace(/\s+/g, " ").trim(),
    }))
    .filter((f) => /[\p{L}\p{N}]/u.test(f.texto));
}

/**
 * Fecha a linha do tempo: ordena por início, tira cenas com menos de meio segundo e faz
 * cada cena durar até a próxima, com a primeira em 0 e a última no fim do áudio.
 */
export function normalizarCenas<T extends { inicio: number }>(cenas: T[], duracao: number): (T & { fim: number })[] {
  const ordenadas = cenas
    .filter((c) => Number.isFinite(c.inicio))
    .map((c) => ({ ...c, inicio: Math.min(Math.max(c.inicio, 0), duracao) }))
    .sort((a, b) => a.inicio - b.inicio);
  if (ordenadas.length === 0) throw new Error("Nenhuma cena válida para montar o vídeo.");
  ordenadas[0].inicio = 0;

  const mantidas: T[] = [];
  for (const cena of ordenadas) {
    const anterior = mantidas.at(-1);
    if (anterior && cena.inicio - anterior.inicio < MINIMO_S) continue;
    mantidas.push(cena);
  }
  // A última cena precisa de tempo na tela; se ficou curta demais, a penúltima cobre o final.
  if (mantidas.length > 1 && duracao - mantidas.at(-1)!.inicio < MINIMO_S) mantidas.pop();

  return mantidas.map((c, i) => ({ ...c, fim: i < mantidas.length - 1 ? mantidas[i + 1].inicio : duracao }));
}
