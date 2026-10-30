"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function Login() {
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  const router = useRouter();

  async function entrar(evento: React.FormEvent) {
    evento.preventDefault();
    setEnviando(true);
    setErro("");
    const resposta = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ senha }),
    });
    if (resposta.ok) {
      router.replace("/");
      return;
    }
    setErro((await resposta.json().catch(() => ({}))).erro ?? "Não foi possível entrar.");
    setEnviando(false);
  }

  return (
    // Fundo escuro oficial da marca, com a versão branca do logo; o foco usa a cor do tema escuro.
    <main className="relative flex flex-1 items-center overflow-hidden bg-acao p-6 text-on-acao [--color-foco:#ffa638] sm:px-16">
      <Image
        src="/marca/simbolo-coral.png"
        alt=""
        width={692}
        height={848}
        unoptimized
        className="pointer-events-none absolute -bottom-24 -right-24 w-80 max-w-none sm:w-[34rem]"
      />
      <form onSubmit={entrar} className="relative w-full max-w-sm space-y-6">
        <Image
          src="/marca/logo-coral-branca.png"
          alt="Fernanda Sklovsky, Artesanato Inteligente"
          width={1484}
          height={384}
          unoptimized
          priority
          className="h-auto w-72"
        />
        <h1 className="text-4xl font-extrabold leading-none tracking-tight">Artesanato em 1 minuto</h1>
        <label className="block space-y-2">
          <span className="text-xs font-semibold uppercase tracking-[0.06em]">Senha</span>
          <input
            type="password"
            autoFocus
            required
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            className="w-full rounded-sm bg-white px-3 py-2 text-ink"
          />
        </label>
        {erro && <p className="text-sm text-amarelo">{erro}</p>}
        <button
          disabled={enviando}
          className="w-full rounded-sm bg-menta px-4 py-2 font-bold text-verde-noite hover:bg-white disabled:opacity-60"
        >
          {enviando ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </main>
  );
}
