"use client";

import { Player } from "@remotion/player";
import { useMemo } from "react";
import type { Estado, VideoProps } from "@/lib/tipos";
import { ALTURA, FPS, LARGURA, Video } from "@/remotion/Video";

export default function Preview({ estado }: { estado: Estado }) {
  const { cenas, duracao, audio } = estado;
  const props = useMemo<VideoProps>(
    () => ({ cenas, duracao, audio: audio ?? "", base: "/api/arquivos/" }),
    [cenas, duracao, audio],
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
      style={{ width: "100%", aspectRatio: "9 / 16", borderRadius: 16, overflow: "hidden" }}
    />
  );
}
