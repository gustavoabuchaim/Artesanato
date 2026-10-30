# Estúdio de Notícias · Artesanato

App de uma usuária que transforma notícias de artesanato em vídeos verticais (9:16) de cerca de 1 minuto, no estilo "explicado em um minuto".

## Fluxo

1. **Toda semana** (na primeira verificação de cada semana, de hora em hora), o Claude pesquisa na web 3 notícias recentes de artesanato: título, link, fonte, data e resumo.
2. A dona escolhe uma e o Claude lê a matéria e sugere um **roteiro** de cerca de 150 palavras.
3. Ela grava o roteiro com a própria voz e **envia o áudio**. Pode ser do celular ou do WhatsApp, com até 3 minutos.
4. O áudio é transcrito no próprio servidor (whisper.cpp). O Claude divide a fala em cenas: abertura, foto, tópicos, número em destaque, citação e encerramento.
5. A tela mostra o **preview** do vídeo. Ela pode trocar fotos, refazer as cenas e **exportar o MP4**.

## Peças

| Parte | Ferramenta |
|---|---|
| Interface e API | Next.js 16 (`src/app`) |
| Senha | `src/proxy.ts` + `src/lib/sessao.ts`, sessão assinada de até 12 h |
| Notícias, roteiro e cenas | API do Claude (`src/lib/claude.ts`), modelo `claude-sonnet-5-5` com esforço médio, com busca e leitura na web |
| Transcrição | whisper.cpp local via `@remotion/install-whisper-cpp` (`src/lib/midia.ts`) |
| Fotos | foto da matéria (og:image) e, opcionalmente, Pexels (`src/lib/imagens.ts`) |
| Vídeo | Remotion: composição em `src/remotion/`, preview no navegador com `@remotion/player`, render pelo CLI |
| Identidade visual | design system Fernanda Sklovsky: cores, fontes e regras em `src/remotion/Video.tsx`, logos e símbolos em `public/marca/` |
| Dados | arquivos em `data/<semana>/` (estado.json, áudio, fotos, MP4), sem banco de dados |

## Rodar localmente

Requisitos: Node 20 ou mais novo (testado no 24).

```bash
npm install
cp .env.example .env.local   # preencha a chave do Claude, a senha e o SESSION_SECRET
npm run dev                  # http://localhost:3000
```

- Na **primeira transcrição**, o app baixa o whisper.cpp e o modelo `small` (~500 MB) para `.whisper/`.
- No **primeiro render**, o Remotion baixa o Chrome Headless Shell.
- `npm test` roda os testes da linha do tempo das cenas e da semana ISO.
- `npm run studio` abre o Remotion Studio com um vídeo de exemplo, para ajustar o visual das cenas.

## Identidade visual

Os vídeos e a tela do app seguem o design system "Fernanda Sklovsky" (https://claude.ai/artifact/YABHqRPPVZJ3D6K6H3ezS1). Na tela, os tokens ficam em `src/app/globals.css`. Nos vídeos, a identidade fica no código, não no prompt: o Claude só escolhe `fundo`, `acento` e `simbolo` entre valores permitidos, e o layout, as fontes e o contraste vêm de `src/remotion/Video.tsx`. O logo muda a cada semana (`logoDaSemana`).

É uma cópia: se o design system mudar, atualize os tokens em `globals.css` e `Video.tsx` e as imagens em `public/marca/`. As fontes são as substitutas indicadas por ele (Archivo e Libre Bodoni).

## Produção (VPS com Docker e Caddy)

Roda em https://artesanato.dalefatto.com, na VPS `187.127.21.16`, ao lado dos outros apps:

- **Código:** fica em `/opt/artesanato`. O `compose.production.yaml` sobe o container `artesanato-web` na rede `docker_default`, a mesma do Caddy.
- **Segredos:** ficam só em `/opt/artesanato/.env.production` (permissão 600), com as mesmas chaves do `.env.example`.
- **Dados:** `data/` e o whisper ficam nos volumes `artesanato_data` e `artesanato_whisper`. O whisper é compilado e baixado na primeira vez que o container sobe, o que leva alguns minutos.
- **Caddy:** o bloco do site é `deploy/artesanato.caddy`, copiado para `/opt/caddy-sites/`.

Para publicar uma nova versão, a partir desta pasta:

```bash
tar --exclude=./node_modules --exclude=./.next --exclude=./data --exclude=./.whisper --exclude='./.env*' -czf - . | ssh root@187.127.21.16 'tar -xzf - -C /opt/artesanato'
ssh root@187.127.21.16 'cd /opt/artesanato && docker compose -f compose.production.yaml up -d --build'
```

A VPS tem 1 vCPU: o container fica limitado a 1,5 GB de RAM, e o render de 1 minuto de vídeo leva alguns minutos.

Faça backup do volume `artesanato_data`: ele guarda todo o histórico.

## Custos e licenças

- **Claude:** cerca de US$ 0,35 por semana (Sonnet 5.5, esforço médio). Medido em 30/10/2026: roteiro, US$ 0,05; cenas, US$ 0,03. A busca de notícias é estimativa, cerca de US$ 0,26, com 5 buscas na web a US$ 0,01 cada. O log do servidor mostra os tokens e as buscas de cada chamada (`[claude] ...`).
- **Whisper e Pexels:** gratuitos.
- **Remotion:** a licença é gratuita para pessoas físicas e empresas com até 3 pessoas. Ela deve ficar no nome do negócio da cliente. Confira os termos em https://www.remotion.dev/docs/license.
- **Fotos das matérias:** os direitos são do veículo. O vídeo mostra o crédito, mas crédito não é autorização. Antes de publicar, confirme o uso ou troque pela foto da própria artesã (botão "Trocar foto").
