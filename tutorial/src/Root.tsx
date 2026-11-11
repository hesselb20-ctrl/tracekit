import React from "react";
import { Composition, Sequence } from "remotion";
import { Background } from "./ui";
import { Title } from "./scenes/Title";
import { Record } from "./scenes/Record";
import { Redact } from "./scenes/Redact";
import { Cluster } from "./scenes/Cluster";
import { Schema } from "./scenes/Schema";
import { Files } from "./scenes/Files";
import { Terminal } from "./scenes/Terminal";
import { Install } from "./scenes/Install";
import { Clustering, Hero } from "./Stills";

const FPS = 30;

// Scene order and length in frames. Total: 2280 frames = 76 s.
const scenes: { id: string; frames: number; Scene: React.FC<{ duration: number }> }[] = [
  { id: "title", frames: 150, Scene: Title },
  { id: "record", frames: 360, Scene: Record },
  { id: "redact", frames: 300, Scene: Redact },
  { id: "cluster", frames: 360, Scene: Cluster },
  { id: "schema", frames: 330, Scene: Schema },
  { id: "files", frames: 270, Scene: Files },
  { id: "terminal", frames: 330, Scene: Terminal },
  { id: "install", frames: 180, Scene: Install },
];

const total = scenes.reduce((n, s) => n + s.frames, 0);

const Tutorial: React.FC = () => {
  let from = 0;
  return (
    <Background>
      {scenes.map(({ id, frames, Scene }) => {
        const start = from;
        from += frames;
        return (
          <Sequence key={id} name={id} from={start} durationInFrames={frames}>
            <Scene duration={frames} />
          </Sequence>
        );
      })}
    </Background>
  );
};

export const Root: React.FC = () => (
  <>
    <Composition id="Tutorial" component={Tutorial} width={1920} height={1080} fps={FPS} durationInFrames={total} />
    <Composition id="Hero" component={Hero} width={1600} height={800} fps={FPS} durationInFrames={1} />
    <Composition id="Clustering" component={Clustering} width={1600} height={900} fps={FPS} durationInFrames={1} />
  </>
);
