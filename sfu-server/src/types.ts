import {
  DtlsParameters,
  Router,
  RouterOptions,
  WebRtcTransport,
  WebRtcTransportOptions,
  WorkerSettings,
} from "mediasoup/node/lib/types.js";
import { Participant, ParticipantAppData } from "./participant.js";

export type Room<K extends ParticipantAppData> = {
  router: Router;
  participants: Record<string, Participant<K>>;
};

export type Transports = {
  send: WebRtcTransport;
  recv: WebRtcTransport;
};

export type TransportDirection = "send" | "recv";

export type TrackSource =
  | "microphone"
  | "screenshare-audio"
  | "screenshare-video"
  | "camera";

export type ConnectTransportOptions = {
  direction: TransportDirection;
  dtlsParameters: DtlsParameters;
};

export type ConsumeOptions = {
  sourceFilter: string;
  otherParticipantID: string;
};

export type InitOptions = {
  workerSettings: WorkerSettings;
  routerOptions: RouterOptions;
  transportOptions: WebRtcTransportOptions;
};
