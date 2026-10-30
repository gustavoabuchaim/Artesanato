import assert from "node:assert/strict";
import { test } from "node:test";
import { chaveSemana } from "./armazenamento.ts";
import { agruparFrases, contagem, logoDaSemana, normalizarCenas, palavrasComEnfase, simboloParaFundo } from "./cenas.ts";

test("ênfase marca as palavras certas e é ignorada se não estiver no título", () => {
  const marcadas = (titulo: string, enfase?: string) =>
    palavrasComEnfase(titulo, enfase).flatMap((p) => (p.enfase ? [p.palavra] : []));
  assert.deepEqual(marcadas("MEI pode dispensar nota fiscal", "nota fiscal"), ["nota", "fiscal"]);
  assert.deepEqual(marcadas("Nota fiscal muda", "NOTA"), ["Nota"]);
  assert.deepEqual(marcadas("MEI pode dispensar", "imposto"), []);
  assert.deepEqual(marcadas("MEI pode dispensar", ""), []);
  assert.deepEqual(marcadas("MEI pode dispensar"), []);
});

test("contagem anima inteiros e mantém o resto do texto", () => {
  assert.equal(contagem("130", 0.5), "65");
  assert.equal(contagem("17ª", 1), "17ª");
  assert.equal(contagem("R$ 1.300", 0.5), "R$ 650");
  assert.equal(contagem("R$ 1.300", 1), "R$ 1.300");
  assert.equal(contagem("40%", 2), "40%");
  assert.equal(contagem("2,5 mi", 0.5), "2,5 mi");
  assert.equal(contagem("Metade", 0.5), "Metade");
});

test("símbolo claro demais troca em fundo claro e fica em fundo escuro", () => {
  assert.equal(simboloParaFundo("passaro", "creme"), "folha-coral");
  assert.equal(simboloParaFundo("vaso", "branco"), "folha-coral");
  assert.equal(simboloParaFundo("vaso", "azul-noite"), "vaso");
  assert.equal(simboloParaFundo("sol", "rosa-papel"), "sol");
});

test("logo varia de semana para semana", () => {
  assert.equal(logoDaSemana("2026-S44"), "verde");
  assert.equal(logoDaSemana("2026-S45"), "coral");
});

test("junta pedaços do whisper em frases e tira marcações", () => {
  const p = (inicio: number, texto: string) => ({ inicio, fim: inicio + 0.3, texto });
  const frases = agruparFrases([
    p(0.5, " Como"), p(0.9, " funcion"), p(1.5, "am"), p(1.8, "?"),
    p(2.0, " Vamos"), p(2.4, " ver"), p(2.8, "."),
    p(3.0, " ["), p(3.1, "M"), p(3.2, "ÚS"), p(3.3, "ICA"), p(3.4, "]"),
  ]);
  assert.deepEqual(frases.map((f) => [f.inicio, f.texto]), [[0.5, "Como funcionam?"], [2.0, "Vamos ver."]]);
});

test("fala longa sem pontuação é quebrada na troca de palavra", () => {
  const pedacos = Array.from({ length: 20 }, (_, i) => ({ inicio: i, fim: i + 0.9, texto: ` p${i}` }));
  const frases = agruparFrases(pedacos);
  assert.equal(frases.length, 3);
  assert.equal(frases[1].inicio, 9);
});

const tempos = (cenas: { inicio: number; fim: number }[]) => cenas.map((c) => [c.inicio, c.fim]);

test("fecha a linha do tempo de 0 até a duração, sem buracos", () => {
  const cenas = normalizarCenas([{ inicio: 9 }, { inicio: 1.2 }, { inicio: 20 }], 30);
  assert.deepEqual(tempos(cenas), [[0, 9], [9, 20], [20, 30]]);
});

test("limita inícios fora do áudio e descarta cenas coladas ou sem tempo", () => {
  const cenas = normalizarCenas([{ inicio: -3 }, { inicio: 0.2 }, { inicio: 12 }, { inicio: Number.NaN }, { inicio: 99 }], 30);
  assert.deepEqual(tempos(cenas), [[0, 12], [12, 30]]);
});

test("última cena curta demais é absorvida pela anterior", () => {
  const cenas = normalizarCenas([{ inicio: 0 }, { inicio: 10 }, { inicio: 29.8 }], 30);
  assert.deepEqual(tempos(cenas), [[0, 10], [10, 30]]);
});

test("sem cenas válidas é erro", () => {
  assert.throws(() => normalizarCenas([{ inicio: Number.NaN }], 30));
});

test("semana ISO no fuso de São Paulo", () => {
  assert.equal(chaveSemana(new Date("2026-10-25T12:00:00Z")), "2026-S43");
  // 03:30Z de segunda = 00:30 em São Paulo (semana nova); 02:30Z = 23:30 de domingo.
  assert.equal(chaveSemana(new Date("2026-10-26T03:30:00Z")), "2026-S44");
  assert.equal(chaveSemana(new Date("2026-10-26T02:30:00Z")), "2026-S43");
  assert.equal(chaveSemana(new Date("2027-01-01T15:00:00Z")), "2026-S53");
});
