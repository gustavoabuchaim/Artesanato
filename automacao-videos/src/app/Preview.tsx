"use client";

import { Player } from "@remotion/player";
import { useMemo } from "react";
import { logoDaSemana } from "@/lib/cenas";
import type { Estado, VideoProps } from "@/lib/tipos";
import { ALTURA, FPS, LARGURA, Video } from "@/remotion/Video";

export default function Preview({ estado }: { estado: Estado }) {
  const { cenas, duracao, audio, semana } = estado;
  const props = useMemo<VideoProps>(
    () => ({ cenas, duracao, audio: audio ?? "", logo: logoDaSemana(semana), base: "/api/arquivos/" }),
    [cenas, duracao, audio, semana],
  );
  return (
    <Player
      component={Video}
      inputProps={props}
      durationInFrames={Math.max(1, Math.ceil(duracao * FPS))}
      fps={FPS}
      compositionWidth={LARGURA}
      compositionHeight={ALTURA}
      controls
      style={{ width: "100%", aspectRatio: "9 / 16", overflow: "hidden" }}
    />
  );
}
