import type {
  Transport,
  RtpCapabilities,
  ProducerOptions,
  Producer,
  RtpCodecCapability,
  Consumer,
} from "mediasoup-client/lib/types";
import { Device } from "mediasoup-client";
import {
  Transports,
  ProduceTransport,
  ConnectTransport,
  ProduceEventCallback,
  TransportDirection,
  InitOptions,
  ConsumeOptions,
  TrackSource,
} from "./types";
import { TypedEventTarget } from "./TypedEventTarget";

export type SFUAppData = {
  source: TrackSource;
};

export class SFU<K extends SFUAppData> extends TypedEventTarget {
  device: Device | null = null;
  transports: Transports = {};

  producers: Record<string, Producer<K>> = {};
  consumers: Record<string, Consumer<K>> = {};

  produceEventCallbacks: Record<string, ProduceEventCallback> = {};

  // maps track source to codecs
  codecMap: Record<string, string> = {};

  public async init(options: InitOptions): Promise<RtpCapabilities> {
    if (options.codecMap) {
      this.codecMap = options.codecMap;
    }

    this.device = new Device();
    await this.device.load({
      routerRtpCapabilities: options.routerRtpCapabilities,
    });

    if (options.sendTransportOptions) {
      this.transports.send = this.device.createSendTransport(
        options.sendTransportOptions,
      );
      this.onConnect("send", this.transports.send);
      this.onProduce(this.transports.send);
    }

    if (options.recvTransportOptions) {
      this.transports.recv = this.device.createRecvTransport(
        options.recvTransportOptions,
      );
      this.onConnect("recv", this.transports.recv);
    }

    return this.device.rtpCapabilities;
  }

  public async produce(
    track: MediaStreamTrack,
    appData: K,
  ): Promise<Producer<K>> {
    if (!this.transports?.send) {
      throw new Error("send transport must be setup to produce");
    }

    const producerOptions: ProducerOptions<K> = {
      track,
      appData,
    };

    let codec: RtpCodecCapability | undefined;
    if (this.codecMap) {
      codec = this.device!.rtpCapabilities.codecs?.find((codec) => {
        return codec.mimeType.toLowerCase() === this.codecMap[appData.source];
      });
    }
    console.log("--codec--", codec);
    if (codec) {
      producerOptions.codec = codec;
    }

    const producer = await this.transports.send.produce(producerOptions);
    this.producers[producer.id] = producer;

    return producer;
  }

  public async consume(
    options: ConsumeOptions,
    appData: K,
  ): Promise<Consumer<K>> {
    if (!this.transports?.recv) {
      throw new Error("receive transport must be setup to consume");
    }

    const consumer = await this.transports.recv.consume({
      id: options.id,
      rtpParameters: options.rtpParameters,
      producerId: options.producerID,
      kind: options.kind,
      appData,
    });
    this.consumers[consumer.id] = consumer;

    return consumer;
  }

  public async close() {
    for (const consumer of Object.values(this.consumers)) {
      consumer.close();
    }

    for (const producer of Object.values(this.producers)) {
      producer.close();
    }

    if (this.transports.send) {
      this.transports.send.close();
    }

    if (this.transports.recv) {
      this.transports.recv.close();
    }

    this.device = null;
    this.produceEventCallbacks = {};
  }

  resolveProduceEvent(produceKey: string, producerID: string) {
    const produceEvent = this.produceEventCallbacks[produceKey];
    if (!produceEvent) {
      throw new Error(`no callback found for produce key '${produceKey}'`);
    }
    try {
      produceEvent.callback({ id: producerID });
      delete this.produceEventCallbacks[produceKey];
    } catch (err) {
      if (err instanceof Error) {
        produceEvent.errback(err);
      }
    }
  }

  closeProducers(callback: (producer: Producer<K>) => boolean): string[] {
    const producersToDelete = [];
    for (const producer of Object.values(this.producers)) {
      if (!callback(producer)) {
        continue;
      }
      producer.close();
      producersToDelete.push(producer.id);
    }
    for (const producerID of producersToDelete) {
      delete this.producers[producerID];
    }
    return producersToDelete;
  }

  closeConsumers(callback: (consumer: Consumer<K>) => boolean): string[] {
    const consumersToDelete = [];
    for (const consumer of Object.values(this.consumers)) {
      if (!callback(consumer)) {
        continue;
      }
      consumer.close();
      consumersToDelete.push(consumer.id);
    }
    for (const consumerID of consumersToDelete) {
      delete this.consumers[consumerID];
    }
    return consumersToDelete;
  }

  private onConnect(direction: TransportDirection, transport: Transport) {
    transport.on("connect", (data, callback, errback) => {
      const event = new CustomEvent<ConnectTransport>("connect", {
        detail: {
          dtlsParameters: data.dtlsParameters,
          direction,
        },
      });
      this.dispatchEvent(event);
      try {
        callback();
      } catch (err) {
        if (err instanceof Error) {
          errback(err);
        }
      }
    });
  }

  private onProduce(transport: Transport) {
    transport.on("produce", (data, callback, errback) => {
      const producerKey = crypto.randomUUID();

      this.produceEventCallbacks[producerKey] = {
        callback,
        errback,
      };

      const event = new CustomEvent<ProduceTransport>("produce", {
        detail: {
          rtpParameters: data.rtpParameters,
          producerKey,
          source: data.appData.source as TrackSource,
        },
      });
      this.dispatchEvent(event);
    });
  }
}
