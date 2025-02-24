import os from "os";
import mediasoup from "mediasoup";
import {
  Worker,
  Router,
  RtpParameters,
  Consumer,
} from "mediasoup/node/lib/types.js";
import {
  ConnectTransportOptions,
  ConsumeOptions,
  InitOptions,
  Room,
  SFUAppDataConstraint,
} from "./types.js";
import { Participant } from "./participant.js";

export class SFU<K extends SFUAppDataConstraint, V> {
  private workerIdx = 0;
  private workers: Worker[] = [];

  // maps worker pid to router
  private routers: Record<string, Router> = {};

  private rooms: Record<number, Room<K, V>> = {};

  private options: InitOptions;

  constructor(options: InitOptions) {
    this.options = options;
  }

  async createWorkers() {
    const numOfCPUs = os.cpus().length;
    const workers: Worker[] = [];

    for (let i = 0; i < numOfCPUs; i++) {
      const worker = await mediasoup.createWorker(this.options.workerSettings);
      const router = await worker.createRouter(this.options.routerOptions);
      this.routers[worker.pid] = router;
      workers.push(worker);
    }

    this.workers = workers;
  }

  createRoom(roomID: number) {
    if (this.rooms[roomID]) {
      return;
    }

    const worker = this.workers[this.workerIdx];
    this.workerIdx = (this.workerIdx + 1) % this.workers.length;

    const router = this.routers[worker.pid];
    this.rooms[roomID] = {
      router,
      participants: {},
    };
  }

  async addParticipant(id: string, roomID: number, appData: V) {
    const room = this.rooms[roomID];
    if (!room) {
      return;
    }

    const sendTransport = await this.createTransport(room);
    const recvTransport = await this.createTransport(room);

    const participant = new Participant<K, V>(
      id,
      {
        recv: recvTransport,
        send: sendTransport,
      },
      room,
      appData,
    );

    room.participants[id] = participant;

    return participant;
  }

  removeParticipant(id: string, roomID: number) {
    const room = this.rooms[roomID];
    if (!room) {
      return;
    }

    const participant = room.participants[id];
    if (!participant) {
      return;
    }

    participant.close();

    delete room.participants[id];
  }

  connectTransport(
    participantID: string,
    roomID: number,
    options: ConnectTransportOptions,
  ) {
    const room = this.rooms[roomID];
    if (!room) {
      return;
    }

    const participant = room.participants[participantID];
    if (!participant) {
      return;
    }

    participant.connectTransport(options.direction, options.dtlsParameters);
  }

  async produceTransport(
    participantID: string,
    roomID: number,
    rtpParameters: RtpParameters,
    appData: K,
  ) {
    const room = this.rooms[roomID];
    if (!room) {
      return;
    }
    const participant = room.participants[participantID];
    if (!participant) {
      return;
    }
    const producer = await participant.produce(rtpParameters, appData);
    return producer;
  }

  async consume(
    participantID: string,
    roomID: number,
    options: ConsumeOptions,
    appData: K,
  ) {
    const room = this.rooms[roomID];
    if (!room) {
      return;
    }

    const participant = room.participants[participantID];
    if (!participant) {
      return;
    }

    const otherParticipant = room.participants[options.otherParticipantID];
    if (!otherParticipant) {
      return;
    }

    const consumers = await participant.consume(
      options.sourceFilter,
      otherParticipant,
      appData,
    );
    return consumers;
  }

  closeProducers(participantID: string, roomID: number, producerIDs: string[]) {
    const room = this.rooms[roomID];
    if (!room) {
      return;
    }
    const participant = room.participants[participantID];
    if (!participant) {
      return;
    }
    participant.closeProducers(producerIDs);
  }

  closeConsumers(participantID: string, roomID: number, consumerIDs: string[]) {
    const room = this.rooms[roomID];
    if (!room) {
      return;
    }
    const participant = room.participants[participantID];
    if (!participant) {
      return;
    }
    participant.closeConsumers(consumerIDs);
  }

  closeConsumersByCallback(
    roomID: number,
    cb: (consumer: Consumer<K>) => boolean,
  ) {
    const participants = this.getParticipants(roomID);
    if (!participants) {
      return;
    }
    for (const participant of participants) {
      const consumerIDs: string[] = [];
      for (const consumer of Object.values(participant.consumers)) {
        if (!cb(consumer)) {
          continue;
        }
        consumerIDs.push(consumer.id);
        consumer.close();
      }
      for (const id of consumerIDs) {
        delete participant.consumers[id];
      }
    }
  }

  resumeConsumer(participantID: string, roomID: number, consumerID: string) {
    const room = this.rooms[roomID];
    if (!room) {
      return;
    }
    const participant = room.participants[participantID];
    if (!participant) {
      return;
    }
    participant.resumeConsumer(consumerID);
  }

  deleteRooms(roomIDs: number[]) {
    for (const roomID of roomIDs) {
      const room = this.rooms[roomID];
      if (!room) {
        continue;
      }
      for (const participant of Object.values(room.participants)) {
        participant.close();
      }
      delete this.rooms[roomID];
    }
  }

  getParticipant(participantID: string, roomID: number) {
    const room = this.rooms[roomID];
    if (!room) {
      return;
    }
    return room.participants[participantID];
  }

  getRTPCapabilities(roomID: number) {
    const room = this.rooms[roomID];
    if (!room) {
      return;
    }
    return room.router.rtpCapabilities;
  }

  getParticipants(roomID: number) {
    const room = this.rooms[roomID];
    if (!room) {
      return;
    }
    return Object.values(room.participants);
  }

  getParticipantsByAppData(roomID: number, cb: (appData: V) => boolean) {
    const room = this.rooms[roomID];
    if (!room) {
      return;
    }
    return Object.values(room.participants).filter((participant) =>
      cb(participant.appData),
    );
  }

  private async createTransport(room: Room<K, V>) {
    return room.router.createWebRtcTransport(this.options.transportOptions);
  }
}
