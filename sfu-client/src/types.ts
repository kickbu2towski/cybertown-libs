import {
  type Transport,
  type DtlsParameters,
  type TransportOptions,
  type RtpParameters,
  type RtpCapabilities,
  MediaKind,
} from "mediasoup-client/lib/types";

export type Transports = {
  send?: Transport;
  recv?: Transport;
};

export type InitOptions = {
  routerRtpCapabilities: RtpCapabilities;
  sendTransportOptions?: TransportOptions;
  recvTransportOptions?: TransportOptions;
  codecMap?: Record<string, string>;
};

export type ConnectTransport = {
  dtlsParameters: DtlsParameters;
  direction: TransportDirection;
};

export type ProduceTransport = {
  rtpParameters: RtpParameters;
  producerKey: string;
  source: TrackSource;
};

export type ProduceEventCallback = {
  callback: (data: { id: string }) => void;
  errback: (err: Error) => void;
};

export type TrackSource =
  | "microphone"
  | "camera"
  | "screenshare-audio"
  | "screenshare-video";

export type TransportDirection = "send" | "recv";

export type ConsumeOptions = {
  id: string;
  rtpParameters: RtpParameters;
  producerID: string;
  kind: MediaKind;
};
