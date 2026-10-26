import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const COOKIE_SESSAO = "sessao";
const VALIDADE_MS = 12 * 60 * 60 * 1000;

function configuracao() {
  const senha = process.env.APP_PASSWORD;
  const segredo = process.env.SESSION_SECRET;
  if (!senha || !segredo) throw new Error("Defina APP_PASSWORD e SESSION_SECRET no .env.local.");
  return { senha, segredo };
}

function iguais(a: string, b: string) {
  // Compara os hashes para ter o mesmo tamanho e tempo constante.
  return timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest());
}

function assinar(emitidoEm: string) {
  const { senha, segredo } = configuracao();
  // A senha entra na assinatura: trocar a senha derruba as sessões abertas.
  return createHmac("sha256", segredo).update(`${emitidoEm}.${senha}`).digest("hex");
}

export function senhaCorreta(tentativa: string) {
  return iguais(tentativa, configuracao().senha);
}

export function novaSessao() {
  const emitidoEm = String(Date.now());
  return `${emitidoEm}.${assinar(emitidoEm)}`;
}

export function sessaoValida(token: string | undefined) {
  if (!token) return false;
  const [emitidoEm, assinatura] = token.split(".");
  if (!emitidoEm || !assinatura) return false;
  const idade = Date.now() - Number(emitidoEm);
  if (!(idade >= 0 && idade < VALIDADE_MS)) return false;
  return iguais(assinatura, assinar(emitidoEm));
}
