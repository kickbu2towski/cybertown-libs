import {
  Consumer,
  Producer,
  RtpCapabilities,
  RtpParameters,
} from "mediasoup/node/lib/types.js";
import {
  DtlsParameters,
  WebRtcTransport,
} from "mediasoup/node/lib/WebRtcTransportTypes.js";
import {
  Room,
  TransportDirection,
  Transports,
  SFUAppDataConstraint,
  TrackSource,
  ProducerCloseResult,
} from "./types.js";

export class Participant<K extends SFUAppDataConstraint, V> {
  id: string;
  transports: {
    send: WebRtcTransport;
    recv: WebRtcTransport;
  };
  room: Room<K, V>;
  consumers: Record<string, Consumer<K>> = {};
  producers: Record<string, Producer<K>> = {};
  rtpCapabilities: RtpCapabilities | null = null;
  appData: V;

  constructor(
    id: string,
    transports: Transports,
    room: Room<K, V>,
    appData: V,
  ) {
    this.id = id;
    this.transports = transports;
    this.room = room;
    this.appData = appData;
  }

  connectTransport(
    direction: TransportDirection,
    dtlsParameters: DtlsParameters,
  ) {
    const transport = this.transports[direction];
    transport.connect({ dtlsParameters });
  }

  async produce(rtpParameters: RtpParameters, appData: K) {
    const transport = this.transports.send;
    const producer = await transport.produce({
      rtpParameters,
      appData,
      kind:
        appData.source === "microphone" ||
        appData.source === "screenshare-audio"
          ? "audio"
          : "video",
    });
    this.producers[producer.id] = producer;
    return producer;
  }

  async consume(
    sourceFilter: string,
    participant: Participant<K, V>,
    appData: K,
  ) {
    const transport = this.transports.recv;

    const producers = Object.values(participant.producers).filter(
      (producer) => {
        return producer.appData.source.includes(sourceFilter);
      },
    );

    const consumers: Consumer<K>[] = [];

    for (const producer of producers) {
      const canConsume = this.room.router.canConsume({
        producerId: producer.id,
        rtpCapabilities: this.rtpCapabilities!,
      });
      if (!canConsume) {
        console.log(
          `sfu: producer ${producer.id} cannot be consumed by participant ${participant.id}`,
        );
        continue;
      }

      const consumer = await transport.consume({
        paused: true,
        producerId: producer.id,
        rtpCapabilities: this.rtpCapabilities!,
        appData: { ...appData, source: producer.appData.source },
      });
      this.consumers[consumer.id] = consumer;
      consumers.push(consumer);
    }

    return consumers;
  }

  async resumeConsumer(consumerID: string) {
    const consumer = this.consumers[consumerID];
    if (!consumer) {
      return;
    }
    consumer.resume();
  }

  closeProducers(producerIDs: string[]): ProducerCloseResult[] {
    const closedProducers: ProducerCloseResult[] = [];
    for (const producerID of producerIDs) {
      const producer = this.producers[producerID];
      if (!producer) {
        continue;
      }
      this.closeProducer(producer);
      closedProducers.push({ id: producerID, source: producer.appData.source });
    }
    for (const p of closedProducers) {
      delete this.producers[p.id];
    }
    return closedProducers;
  }

  closeConsumers(consumerIDs: string[]): string[] {
    const closedConsumers: string[] = [];
    for (const consumerID of consumerIDs) {
      const consumer = this.consumers[consumerID];
      if (!consumer) {
        continue;
      }
      consumer.close();
      closedConsumers.push(consumerID);
    }
    for (const consumerID of closedConsumers) {
      delete this.consumers[consumerID];
    }
    return closedConsumers;
  }

  close() {
    for (const producer of Object.values(this.producers)) {
      this.closeProducer(producer);
    }

    for (const consumer of Object.values(this.consumers)) {
      consumer.close();
    }

    for (const transport of Object.values(this.transports)) {
      transport.close();
    }
  }

  private closeProducer(producer: Producer<K>) {
    producer.close();

    for (const participant of Object.values(this.room.participants)) {
      const closedConsumers: string[] = [];
      for (const consumer of Object.values(participant.consumers)) {
        if (producer.id !== consumer.producerId) {
          continue;
        }
        consumer.close();
        closedConsumers.push(consumer.id);
      }
      for (const consumerID of closedConsumers) {
        delete participant.consumers[consumerID];
      }
    }
  }
}
