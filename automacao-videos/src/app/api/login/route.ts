import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_SESSAO, novaSessao, senhaCorreta } from "@/lib/sessao";

const MAX_ERROS = 5;
const JANELA_MS = 15 * 60 * 1000;
const g = globalThis as typeof globalThis & { __errosLogin?: Map<string, number[]> };
const erros = (g.__errosLogin ??= new Map<string, number[]>());

export async function POST(request: NextRequest) {
  // O último IP é o que o nginx acrescenta; os anteriores podem ser forjados pelo cliente.
  const ip = request.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim() || "local";
  const agora = Date.now();
  const recentes = (erros.get(ip) ?? []).filter((t) => agora - t < JANELA_MS);
  if (recentes.length >= MAX_ERROS) {
    return NextResponse.json({ erro: "Muitas tentativas. Espere 15 minutos." }, { status: 429 });
  }

  const corpo = await request.json().catch(() => ({}));
  if (typeof corpo.senha !== "string" || !senhaCorreta(corpo.senha)) {
    erros.set(ip, [...recentes, agora]);
    return NextResponse.json({ erro: "Senha incorreta." }, { status: 401 });
  }

  erros.delete(ip);
  const protocolo = request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol.replace(":", "");
  const resposta = NextResponse.json({ ok: true });
  // Sem maxAge: o cookie some ao fechar o navegador, e a sessão expira em 12h de qualquer jeito.
  resposta.cookies.set(COOKIE_SESSAO, novaSessao(), {
    httpOnly: true,
    sameSite: "lax",
    secure: protocolo === "https",
    path: "/",
  });
  return resposta;
}
