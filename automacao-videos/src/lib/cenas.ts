import type { Cena, Logo, Segmento } from "./tipos";

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

const LOGOS: Logo[] = ["coral", "laranja", "amarelo", "rosa", "verde"];

/** O design system pede uma versão do logo por peça e variação entre peças: troca a cada semana. */
export function logoDaSemana(semana: string): Logo {
  return LOGOS[(Number(semana.slice(-2)) || 0) % LOGOS.length];
}

/** Pássaro (rosa) e vaso (menta) somem em fundo claro; nesses casos entra a folha coral. */
export function simboloParaFundo(simbolo: Cena["simbolo"], fundo: Cena["fundo"]): Cena["simbolo"] {
  const claro = fundo === "creme" || fundo === "rosa-papel" || fundo === "branco";
  return claro && (simbolo === "passaro" || simbolo === "vaso") ? "folha-coral" : simbolo;
}

/** Separa o título em palavras e marca as que fazem parte da ênfase; ênfase que não está no título é ignorada. */
export function palavrasComEnfase(titulo: string, enfase: string | undefined) {
  const alvo = enfase?.trim().toLowerCase() ?? "";
  const de = alvo ? titulo.toLowerCase().indexOf(alvo) : -1;
  const ate = de + alvo.length;
  let posicao = 0;
  return titulo.split(/\s+/).filter(Boolean).map((palavra) => {
    const inicio = titulo.indexOf(palavra, posicao);
    posicao = inicio + palavra.length;
    return { palavra, enfase: de >= 0 && inicio < ate && posicao > de };
  });
}

/** Número durante a contagem: "R$ 1.300" em 50% vira "R$ 650". Só inteiros contam; o resto fica como está. */
export function contagem(valor: string, fracao: number) {
  const partes = valor.match(/^(\D*)(\d{1,3}(?:\.\d{3})+|\d+)(?![\d,])(.*)$/);
  if (!partes) return valor;
  const [, antes, numero, depois] = partes;
  const atual = Math.round(Number(numero.replace(/\./g, "")) * Math.min(Math.max(fracao, 0), 1));
  return `${antes}${numero.includes(".") ? atual.toLocaleString("pt-BR") : atual}${depois}`;
}
