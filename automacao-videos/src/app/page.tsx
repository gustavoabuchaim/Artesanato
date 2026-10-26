"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { Estado } from "@/lib/tipos";

const Preview = dynamic(() => import("./Preview"), {
  ssr: false,
  loading: () => <div className="aspect-[9/16] w-full animate-pulse rounded-2xl bg-painel" />,
});

const NOMES_TIPO = {
  titulo: "Abertura",
  foto: "Foto",
  topicos: "Tópicos",
  destaque: "Número",
  citacao: "Citação",
  encerramento: "Encerramento",
};

const botao = "rounded-lg px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50";
const principal = `${botao} bg-teal-400 text-slate-950 hover:bg-teal-300`;
const secundario = `${botao} border border-borda hover:border-teal-300`;

function Secao({ numero, titulo, children }: { numero: number; titulo: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4 rounded-2xl border border-borda bg-painel/60 p-5 sm:p-6">
      <h2 className="flex items-center gap-3 text-lg font-bold">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-teal-400 text-sm text-slate-950">{numero}</span>
        {titulo}
      </h2>
      {children}
    </section>
  );
}

export default function Estudio() {
  const [estado, setEstado] = useState<Estado | null>(null);
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [audio, setAudio] = useState<File | null>(null);
  const [copiado, setCopiado] = useState(false);
  const fotoRef = useRef<HTMLInputElement>(null);
  const [cenaFoto, setCenaFoto] = useState<number | null>(null);

  const router = useRouter();

  const rodando = Boolean(estado?.tarefa && !estado.tarefa.erro);
  // Carrega o estado ao abrir e, enquanto houver tarefa rodando, a cada 2 s.
  useEffect(() => {
    let ativo = true;
    const buscar = async () => {
      const resposta = await fetch("/api/estado", { cache: "no-store" });
      if (resposta.status === 401) return router.replace("/login");
      const novo = await resposta.json();
      if (ativo) setEstado(novo);
    };
    void buscar();
    const id = rodando ? setInterval(buscar, 2000) : undefined;
    return () => {
      ativo = false;
      clearInterval(id);
    };
  }, [rodando, router]);

  async function acao(nome: string, extras: Record<string, string | Blob> = {}) {
    setErro("");
    setEnviando(true);
    const dados = new FormData();
    dados.set("acao", nome);
    for (const [chave, valor] of Object.entries(extras)) dados.set(chave, valor);
    const resposta = await fetch("/api/acao", { method: "POST", body: dados });
    if (resposta.status === 401) return router.replace("/login");
    const corpo = await resposta.json().catch(() => ({}));
    if (resposta.ok) setEstado(corpo);
    else setErro(corpo.erro ?? "Algo deu errado.");
    setEnviando(false);
  }

  if (!estado) return <main className="p-8 text-suave">Carregando…</main>;

  const ocupado = rodando || enviando;
  const noticia = estado.escolhida === null ? null : estado.noticias[estado.escolhida];
  const palavras = estado.roteiro.split(/\s+/).filter(Boolean).length;

  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 p-4 sm:p-8">
      <header>
        <p className="text-xs font-semibold tracking-widest text-teal-300">ESTÚDIO DE NOTÍCIAS · {estado.semana}</p>
        <h1 className="mt-1 text-3xl font-extrabold">Artesanato em 1 minuto</h1>
      </header>

      {estado.tarefa && (
        <div
          className={`sticky top-2 z-10 rounded-xl border p-4 text-sm ${estado.tarefa.erro ? "border-rose-400/50 bg-rose-950/80" : "border-teal-300/40 bg-fundo/95"}`}
        >
          {estado.tarefa.erro ? (
            <p>
              <strong>{estado.tarefa.nome}:</strong> {estado.tarefa.erro}
            </p>
          ) : (
            <div className="space-y-2">
              <p className="flex items-center gap-2">
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-teal-300 border-t-transparent" />
                {estado.tarefa.nome}…
              </p>
              {estado.tarefa.progresso !== undefined && (
                <div className="h-1.5 overflow-hidden rounded bg-borda">
                  <div className="h-full bg-teal-400 transition-all" style={{ width: `${estado.tarefa.progresso * 100}%` }} />
                </div>
              )}
            </div>
          )}
        </div>
      )}
      {erro && <p className="rounded-xl border border-rose-400/50 bg-rose-950/80 p-4 text-sm">{erro}</p>}

      <Secao numero={1} titulo="Notícias da semana">
        {estado.noticias.length === 0 ? (
          <p className="text-sm text-suave">As notícias são buscadas automaticamente no começo de cada semana.</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-3">
            {estado.noticias.map((n, i) => (
              <article
                key={n.link}
                className={`flex flex-col gap-3 rounded-xl border p-4 ${estado.escolhida === i ? "border-teal-300 bg-teal-400/10" : "border-borda bg-fundo"}`}
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-suave">
                  {n.fonte}
                  {n.data && ` · ${n.data.split("-").reverse().join("/")}`}
                </p>
                <a href={n.link} target="_blank" rel="noreferrer" className="font-bold leading-snug hover:text-teal-300">
                  {n.titulo} ↗
                </a>
                <p className="flex-1 text-sm leading-relaxed text-suave">{n.resumo}</p>
                <button
                  className={estado.escolhida === i ? secundario : principal}
                  disabled={ocupado}
                  onClick={() => {
                    if (estado.audio && !confirm("Um novo roteiro apaga o áudio e o vídeo atuais. Continuar?")) return;
                    void acao("roteiro", { indice: String(i) });
                  }}
                >
                  {estado.escolhida === i ? "Gerar outro roteiro" : "Usar esta notícia"}
                </button>
              </article>
            ))}
          </div>
        )}
        <button
          className={secundario}
          disabled={ocupado}
          onClick={() => {
            if (estado.roteiro && !confirm("Buscar outras notícias apaga o roteiro e o vídeo desta semana. Continuar?")) return;
            void acao("buscar");
          }}
        >
          {estado.noticias.length ? "Buscar outras notícias" : "Buscar agora"}
        </button>
      </Secao>

      {noticia && estado.roteiro && (
        <Secao numero={2} titulo="Roteiro sugerido e áudio">
          <div className="rounded-xl border border-borda bg-fundo p-4">
            <p className="whitespace-pre-wrap leading-relaxed">{estado.roteiro}</p>
            <p className="mt-3 text-xs text-suave">
              {palavras} palavras · cerca de {Math.round(palavras / 2.5)} s lendo com calma
            </p>
          </div>
          <button
            className={secundario}
            onClick={async () => {
              await navigator.clipboard.writeText(estado.roteiro);
              setCopiado(true);
              setTimeout(() => setCopiado(false), 2000);
            }}
          >
            {copiado ? "Copiado!" : "Copiar roteiro"}
          </button>
          <div className="space-y-3 border-t border-borda pt-4">
            <p className="text-sm text-suave">
              Grave o roteiro com a sua voz (pode ser no celular ou áudio do WhatsApp) e envie aqui. Até 3 minutos.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <input
                type="file"
                accept="audio/*,video/*,.ogg,.opus,.m4a"
                onChange={(e) => setAudio(e.target.files?.[0] ?? null)}
                className="text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-borda file:px-3 file:py-2 file:text-sm file:text-white"
              />
              <button className={principal} disabled={!audio || ocupado} onClick={() => audio && acao("audio", { arquivo: audio })}>
                {estado.audio ? "Enviar novo áudio" : "Enviar áudio"}
              </button>
            </div>
          </div>
        </Secao>
      )}

      {estado.cenas.length > 0 && (
        <Secao numero={3} titulo="Preview do vídeo">
          <div className="grid gap-6 md:grid-cols-[minmax(0,360px)_1fr]">
            <Preview estado={estado} />
            <div className="space-y-4">
              <ol className="space-y-2">
                {estado.cenas.map((cena, i) => (
                  <li key={i} className="flex items-center gap-3 rounded-lg border border-borda bg-fundo p-3 text-sm">
                    <span className="w-20 shrink-0 font-mono text-xs text-suave">
                      {cena.inicio.toFixed(1)}–{cena.fim.toFixed(1)}s
                    </span>
                    <span className="flex-1">
                      <span className="text-xs text-teal-300">{NOMES_TIPO[cena.tipo]}</span>
                      <br />
                      {cena.titulo}
                    </span>
                    {cena.tipo === "foto" && (
                      <button
                        className={secundario}
                        disabled={ocupado}
                        onClick={() => {
                          setCenaFoto(i);
                          fotoRef.current?.click();
                        }}
                      >
                        Trocar foto
                      </button>
                    )}
                  </li>
                ))}
              </ol>
              <input
                ref={fotoRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  const foto = e.target.files?.[0];
                  e.target.value = "";
                  if (foto && cenaFoto !== null) void acao("foto", { indice: String(cenaFoto), arquivo: foto });
                }}
              />
              <div className="flex flex-wrap gap-3">
                <button className={secundario} disabled={ocupado} onClick={() => acao("cenas")}>
                  Refazer cenas
                </button>
                <button className={principal} disabled={ocupado} onClick={() => acao("exportar")}>
                  {estado.video ? "Exportar de novo" : "Exportar MP4"}
                </button>
                {estado.video && (
                  <a className={principal} href={`/api/arquivos/${estado.video}?baixar`}>
                    Baixar vídeo
                  </a>
                )}
              </div>
              {estado.cenas.some((c) => c.credito) && (
                <p className="text-xs text-suave">
                  Fotos da notícia têm direitos do veículo. Antes de publicar, confirme que pode usá-las ou troque por uma foto sua.
                </p>
              )}
            </div>
          </div>
        </Secao>
      )}
    </main>
  );
}
